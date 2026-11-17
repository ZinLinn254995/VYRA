import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const BUCKET = 'vyral-assets';
const MAX_OBSERVATION_BYTES = 64 * 1024;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const TASK_KINDS = new Set(['identity', 'description', 'consistency', 'generation_context', 'reconstruction', 'safety', 'other']);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

  if (!isUuid(body.assetId) || !isUuid(body.versionId)) return json({ error: 'A valid assetId and versionId are required.' }, 400);
  if (typeof body.taskKind !== 'string' || !TASK_KINDS.has(body.taskKind)) return json({ error: 'Unsupported Vision task kind.' }, 400);
  if (typeof body.modelProvider !== 'string' || body.modelProvider.trim().length < 1 || body.modelProvider.length > 80) return json({ error: 'Model provider/source label is required (max 80 characters).' }, 400);
  if (typeof body.modelId !== 'string' || body.modelId.trim().length < 1 || body.modelId.length > 160) return json({ error: 'Model identifier is required (max 160 characters).' }, 400);
  if (!body.observation || typeof body.observation !== 'object' || Array.isArray(body.observation)) return json({ error: 'Observation must be a JSON object.' }, 400);
  const observationText = JSON.stringify(body.observation);
  if (new TextEncoder().encode(observationText).byteLength > MAX_OBSERVATION_BYTES) return json({ error: 'Observation exceeds the 64 KB limit.' }, 413);
  const confidence = body.confidence === null || body.confidence === undefined || body.confidence === ''
    ? null : Number(body.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) return json({ error: 'Confidence must be between 0 and 1.' }, 400);

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets')
    .select('id,vyral_id,user_id,storage_path,size_bytes,sha256,license_override')
    .eq('id', body.assetId).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify asset ownership.' }, 500);
  if (!asset) return json({ error: 'Asset not found.' }, 404);

  const { data: collection, error: collectionError } = await context.supabase
    .from('vyrals').select('license_policy').eq('id', asset.vyral_id).eq('user_id', userId).maybeSingle();
  if (collectionError) return json({ error: 'Could not verify Vyral permissions.' }, 500);
  if (!collection) return json({ error: 'Vyral collection not found.' }, 404);
  const collectionPolicy = collection.license_policy && typeof collection.license_policy === 'object' ? collection.license_policy : {};
  const assetPolicy = asset.license_override && typeof asset.license_override === 'object' ? asset.license_override : {};
  if (collectionPolicy.allow_ai_analysis === false || assetPolicy.allow_ai_analysis === false) {
    return json({ error: 'AI analysis is disabled by this Vyral or asset license.' }, 403);
  }

  const { data: version, error: versionError } = await context.supabase
    .from('vyral_asset_versions')
    .select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,version_number')
    .eq('id', body.versionId).eq('asset_id', asset.id).eq('vyral_id', asset.vyral_id).eq('user_id', userId).maybeSingle();
  if (versionError) return json({ error: 'Could not verify source version ownership.' }, 500);
  if (!version) return json({ error: 'Asset version not found.' }, 404);

  const expectedPrefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/';
  if (typeof version.storage_path !== 'string' || !version.storage_path.startsWith(expectedPrefix)) {
    return json({ error: 'Source version storage path is invalid.' }, 409);
  }
  const expectedSize = Number(version.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_MEDIA_BYTES) {
    return json({ error: 'Source version is outside the 100 MB analysis verification limit.' }, 413);
  }

  const { data: media, error: downloadError } = await context.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !media) return json({ error: 'Could not retrieve the protected source asset.' }, 502);
  if (media.size > MAX_MEDIA_BYTES) return json({ error: 'Stored source exceeds the 100 MB limit.' }, 413);
  const bytes = await media.arrayBuffer();
  const actualSize = bytes.byteLength;
  const actualSha256 = await sha256Hex(bytes);
  if (actualSize !== expectedSize || typeof version.sha256 !== 'string' || version.sha256.toLowerCase() !== actualSha256) {
    return json({ error: 'Source integrity check failed. No Vision observation was recorded.', status: 'source_integrity_mismatch' }, 409);
  }
  const currentVersion = asset.storage_path === version.storage_path;
  if (currentVersion && (Number(asset.size_bytes) !== actualSize ||
      (typeof asset.sha256 === 'string' && asset.sha256.toLowerCase() !== actualSha256))) {
    return json({ error: 'Current asset metadata does not match its protected source version. No observation was recorded.', status: 'asset_integrity_mismatch' }, 409);
  }

  const recordedAt = new Date().toISOString();
  const evidence = {
    source_asset_id: asset.id,
    source_version_id: version.id,
    source_version_number: version.version_number,
    source_sha256: actualSha256,
    source_size_bytes: actualSize,
    source_integrity: 'server_verified',
    model_provenance: 'user_supplied_claim_not_provider_authenticated',
    model_provider_claim: body.modelProvider.trim(),
    model_id_claim: body.modelId.trim(),
    submitted_at: recordedAt,
    confidence_is_model_reported: confidence !== null,
  };

  const { data: savedObservation, error: observationError } = await context.supabaseAdmin
    .from('vyral_vision_observations')
    .insert({
      asset_id: asset.id,
      asset_version_id: version.id,
      user_id: userId,
      task_kind: body.taskKind,
      model_provider: body.modelProvider.trim(),
      model_id: body.modelId.trim(),
      observation: body.observation,
      confidence,
      verification_status: 'observed',
      evidence,
      source_sha256: actualSha256,
    })
    .select('id')
    .single();
  if (observationError || !savedObservation) return json({ error: 'Could not save Vision observation.' }, 500);

  const { error: dnaError } = await context.supabaseAdmin.from('vyral_dna_records').insert({
    vyral_id: asset.vyral_id,
    user_id: userId,
    asset_id: asset.id,
    scope: 'asset',
    schema_version: 1,
    dna_status: 'evolving',
    source_kind: 'vision',
    verification_status: 'observed',
    payload: {
      vision_observation_id: savedObservation.id,
      source_version_id: version.id,
      source_sha256: actualSha256,
      observation: body.observation,
      evidence_status: 'ai_observed_not_creator_confirmed',
      model_provenance: 'user_supplied_claim_not_provider_authenticated',
    },
    reconstruction_data: { eligible_for_dna_only_reconstruction: false, reason: 'Observation requires review and corroboration before reconstruction use.' },
  });
  if (dnaError) {
    await context.supabaseAdmin.from('vyral_vision_observations').delete().eq('id', savedObservation.id).eq('user_id', userId);
    return json({ error: 'Observation could not be linked to DNA; the partial observation was rolled back.' }, 500);
  }

  return json({
    status: 'recorded',
    observationId: savedObservation.id,
    assetId: asset.id,
    versionId: version.id,
    sourceSha256: actualSha256,
    verificationStatus: 'observed',
    modelProvenance: 'user_supplied_claim_not_provider_authenticated',
    recordedAt,
  }, 201);
});
