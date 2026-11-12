import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';
import { isCanonicalOwnedStoragePath } from '../_shared/canonical-storage-path.ts';
import { computeVyralDHash64, VYRAL_DHASH_ALGORITHM } from '../../../src/services/vyralPerceptualFingerprint.ts';

const BUCKET = 'vyral-assets';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 10_000_000;
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sha256 = async (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const wasm = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));
await initializeImageMagick(wasm);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const { data: ctx, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !ctx) return reply({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof ctx.userClaims?.id === 'string' ? ctx.userClaims.id : '';
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON body.' }, 400); }
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  const versionId = typeof body.versionId === 'string' ? body.versionId : '';
  if (!userId || !assetId || !versionId) return reply({ error: 'Asset and version IDs are required.' }, 400);

  const [assetResult, versionResult] = await Promise.all([
    ctx.supabase.from('vyral_assets').select('id,vyral_id,user_id').eq('id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,version_number').eq('id', versionId).eq('asset_id', assetId).eq('user_id', userId).maybeSingle(),
  ]);
  if (assetResult.error || versionResult.error) return reply({ error: 'Could not validate Asset and source-version ownership.' }, 500);
  const asset = assetResult.data, version = versionResult.data;
  if (!asset || !version || asset.vyral_id !== version.vyral_id) return reply({ error: 'Asset or source version was not found.' }, 404);
  const mime = String(version.mime_type ?? '').toLowerCase().split(';')[0].trim();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return reply({ error: 'Visual fingerprints currently support PNG, JPEG and WebP images.' }, 415);
  const prefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/';
  if (!isCanonicalOwnedStoragePath(version.storage_path, prefix)) return reply({ error: 'Private source path failed ownership validation.' }, 409);
  const expectedSize = Number(version.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_BYTES ||
      typeof version.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(version.sha256)) {
    return reply({ error: 'A valid source SHA-256 and a file size up to 20 MB are required.' }, 413);
  }
  const { data: blob, error: downloadError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !blob) return reply({ error: 'Could not retrieve the protected original image.' }, 502);
  if (blob.size !== expectedSize || blob.size > MAX_BYTES) return reply({ error: 'Stored image size differs from the immutable source-version record.' }, 409);
  const original = new Uint8Array(await blob.arrayBuffer());
  const sourceSha256 = await sha256(original);
  if (sourceSha256 !== version.sha256.toLowerCase()) return reply({ error: 'Original image SHA-256 does not match its source-version record.' }, 409);

  let width = 0, height = 0;
  let perceptualHash = '';
  try {
    const samples = await ImageMagick.read(original, (image) => {
      width = image.width; height = image.height;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
        throw new Error('Image exceeds the 10-megapixel visual fingerprint limit.');
      }
      const rgba = image.getPixels((collection) => collection.toByteArray(0, 0, width, height, 'rgba')?.slice() ?? null);
      if (!rgba || rgba.byteLength !== width * height * 4) throw new Error('Pinned decoder returned an incomplete RGBA sample stream.');
      return rgba;
    });
    perceptualHash = computeVyralDHash64(samples, width, height, 4);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Could not decode the original image for visual fingerprinting.' }, 422);
  }

  const createdAt = new Date().toISOString();
  const metadata = {
    verification_status: 'server_verified',
    computed_by: 'fingerprint-vyral-raster-version',
    source_sha256: sourceSha256,
    source_size_bytes: expectedSize,
    dimensions: { width, height },
    decoder: { name: 'ImageMagick WASM', version: '0.0.30', color_management: 'decoder-normalized' },
    method: '9x8 grayscale horizontal difference hash',
    alpha_handling: 'composited_over_white',
    note: 'Perceptual similarity is an estimate for visual comparison, not proof of semantic identity or exact pixel equality.',
  };
  const { data: existing, error: lookupError } = await ctx.supabaseAdmin.from('vyral_fingerprints')
    .select('id').eq('asset_id', asset.id).eq('asset_version_id', version.id)
    .eq('fingerprint_kind', 'perceptual').eq('algorithm', VYRAL_DHASH_ALGORITHM).limit(1).maybeSingle();
  if (lookupError) return reply({ error: 'Could not inspect the visual fingerprint registry.' }, 500);
  const write = existing
    ? await ctx.supabaseAdmin.from('vyral_fingerprints').update({ value: perceptualHash, metadata }).eq('id', existing.id)
    : await ctx.supabaseAdmin.from('vyral_fingerprints').insert({
        asset_id: asset.id, asset_version_id: version.id, user_id: userId,
        fingerprint_kind: 'perceptual', algorithm: VYRAL_DHASH_ALGORITHM, value: perceptualHash, metadata,
      });
  if (write.error) return reply({ error: 'Could not save the server-generated visual fingerprint.' }, 500);
  return reply({
    status: 'verified', assetId, versionId, versionNumber: version.version_number,
    algorithm: VYRAL_DHASH_ALGORITHM, perceptualHash, sourceSha256,
    dimensions: { width, height }, verifiedAt: createdAt,
  });
});
