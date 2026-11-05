import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const BUCKET = 'vyral-assets';
const FUNCTION_ID = 'verify-vyral-asset';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);

  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'The authenticated user identity is unavailable.' }, 401);

  let body: { assetId?: unknown; versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!isUuid(body.assetId) || !isUuid(body.versionId)) {
    return json({ error: 'A valid assetId and versionId are required.' }, 400);
  }

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets')
    .select('id,vyral_id,user_id,name,storage_path,sha256')
    .eq('id', body.assetId)
    .eq('user_id', userId)
    .maybeSingle();
  if (assetError) return json({ error: 'Could not verify asset ownership.' }, 500);
  if (!asset) return json({ error: 'Asset not found.' }, 404);

  const { data: version, error: versionError } = await context.supabase
    .from('vyral_asset_versions')
    .select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,version_number')
    .eq('id', body.versionId)
    .eq('asset_id', asset.id)
    .eq('vyral_id', asset.vyral_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (versionError) return json({ error: 'Could not verify asset-version ownership.' }, 500);
  if (!version) return json({ error: 'Asset version not found.' }, 404);

  const expectedPrefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/';
  if (typeof version.storage_path !== 'string' || !version.storage_path.startsWith(expectedPrefix)) {
    return json({ error: 'Asset storage ownership path is invalid.' }, 409);
  }
  const expectedSize = Number(version.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_ASSET_BYTES) {
    return json({ error: 'Asset version is outside the supported 100 MB verification limit.' }, 413);
  }

  const { data: media, error: downloadError } = await context.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !media) return json({ error: 'Could not retrieve the protected original media for verification.' }, 502);
  if (media.size > MAX_ASSET_BYTES) return json({ error: 'Stored media exceeds the 100 MB verification limit.' }, 413);

  const bytes = await media.arrayBuffer();
  const actualSize = bytes.byteLength;
  const actualSha256 = await sha256Hex(bytes);
  const currentAssetVersion = asset.storage_path === version.storage_path;
  const expectedSha256 = typeof version.sha256 === 'string'
    ? version.sha256
    : currentAssetVersion && typeof asset.sha256 === 'string' ? asset.sha256 : null;
  const sizeMatches = actualSize === expectedSize;
  const hashMatches = expectedSha256 === null || expectedSha256.toLowerCase() === actualSha256;
  const comparisonStatus = !sizeMatches || !hashMatches ? 'mismatch' : expectedSha256 === null ? 'baseline_created' : 'matched';
  const verifiedAt = new Date().toISOString();

  const fingerprintMetadata = {
    verification_status: 'server_verified',
    comparison_status: comparisonStatus,
    verified_by: FUNCTION_ID,
    verified_at: verifiedAt,
    source: 'private_storage_download',
    expected_sha256: expectedSha256,
    actual_size_bytes: actualSize,
    expected_size_bytes: expectedSize,
  };

  const { data: existingFingerprint, error: lookupError } = await context.supabaseAdmin
    .from('vyral_fingerprints')
    .select('id')
    .eq('asset_id', asset.id)
    .eq('asset_version_id', version.id)
    .eq('fingerprint_kind', 'cryptographic')
    .eq('algorithm', 'SHA-256')
    .eq('value', actualSha256)
    .limit(1)
    .maybeSingle();
  if (lookupError) return json({ error: 'Could not inspect the fingerprint registry.' }, 500);

  const fingerprintWrite = existingFingerprint
    ? await context.supabaseAdmin.from('vyral_fingerprints').update({ metadata: fingerprintMetadata }).eq('id', existingFingerprint.id)
    : await context.supabaseAdmin.from('vyral_fingerprints').insert({
        asset_id: asset.id,
        asset_version_id: version.id,
        user_id: userId,
        fingerprint_kind: 'cryptographic',
        algorithm: 'SHA-256',
        value: actualSha256,
        metadata: fingerprintMetadata,
      });
  if (fingerprintWrite.error) return json({ error: 'Could not save the server verification evidence.' }, 500);

  if (comparisonStatus === 'mismatch') {
    return json({
      status: 'mismatch',
      assetId: asset.id,
      versionId: version.id,
      actualSha256,
      expectedSha256,
      actualSizeBytes: actualSize,
      expectedSizeBytes: expectedSize,
      verifiedAt,
    }, 409);
  }

  if (!expectedSha256) {
    const { error: versionUpdateError } = await context.supabaseAdmin
      .from('vyral_asset_versions')
      .update({ sha256: actualSha256 })
      .eq('id', version.id)
      .eq('user_id', userId);
    if (versionUpdateError) return json({ error: 'Hash was verified but could not be saved to the asset version.' }, 500);
    if (currentAssetVersion) {
      const { error: assetUpdateError } = await context.supabaseAdmin
        .from('vyral_assets')
        .update({ sha256: actualSha256 })
        .eq('id', asset.id)
        .eq('user_id', userId);
      if (assetUpdateError) return json({ error: 'Hash was verified but could not be saved to the asset record.' }, 500);
    }
  }

  return json({
    status: 'verified',
    assetId: asset.id,
    versionId: version.id,
    sha256: actualSha256,
    sizeBytes: actualSize,
    verifiedAt,
  });
});
