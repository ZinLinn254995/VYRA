import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';

const BUCKET = 'vyral-assets';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const TILE = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wasm = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));
await initializeImageMagick(wasm);

const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sha256 = async (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const { data: ctx, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !ctx) return reply({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof ctx.userClaims?.id === 'string' ? ctx.userClaims.id : '';
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: 'Request body must be valid JSON.' }, 400); }
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  const versionId = typeof body.versionId === 'string' ? body.versionId : '';
  if (!userId || !UUID.test(assetId) || !UUID.test(versionId)) return reply({ error: 'Valid session, Asset ID and Version ID are required.' }, 400);

  const [a, v, existing] = await Promise.all([
    ctx.supabase.from('vyral_assets').select('id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type').eq('id', versionId).eq('asset_id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_dna_records').select('id').eq('asset_id', assetId).eq('schema_version', 3).limit(1),
  ]);
  if (a.error || v.error || existing.error) return reply({ error: 'Could not validate Asset ownership and extraction state.' }, 500);
  const asset = a.data, version = v.data;
  if (!asset || !version) return reply({ error: 'Asset or source Version was not found for this account.' }, 404);
  if (existing.data?.length) return reply({ error: 'A DNA v3 record already exists. Existing DNA records are immutable.' }, 409);
  const mime = String(version.mime_type ?? '').toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return reply({ error: 'DNA v3 currently supports PNG, JPEG and WebP raster images.' }, 415);
  if (asset.vyral_id !== version.vyral_id || asset.storage_path !== version.storage_path ||
      asset.sha256 !== version.sha256 || Number(asset.size_bytes) !== Number(version.size_bytes) ||
      String(asset.mime_type ?? '').toLowerCase() !== mime || !['uploading', 'ready'].includes(String(asset.processing_status))) {
    return reply({ error: 'Asset and source Version metadata do not match.' }, 409);
  }
  const prefix = userId + '/' + asset.vyral_id + '/' + assetId + '/';
  if (typeof version.storage_path !== 'string' || !version.storage_path.startsWith(prefix)) return reply({ error: 'Private Storage path failed owner-prefix validation.' }, 409);
  const size = Number(version.size_bytes);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return reply({ error: 'Image exceeds the 20 MB extraction limit.' }, 413);

  const { data: blob, error: downloadError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !blob) return reply({ error: 'Could not retrieve the original from private Storage.' }, 502);
  if (blob.size !== size) return reply({ error: 'Downloaded byte size does not match the source Version.' }, 409);
  const original = new Uint8Array(await blob.arrayBuffer());
  const sourceHash = await sha256(original);
  if (sourceHash !== String(version.sha256 ?? '').toLowerCase()) return reply({ error: 'Source SHA-256 mismatch. No DNA was written.' }, 409);

  let width = 0, height = 0;
  let samples: Uint8Array;
  try {
    samples = await ImageMagick.read(original, (image) => {
      width = image.width; height = image.height;
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 || pixels > MAX_PIXELS) throw new Error('Image exceeds the 8-megapixel DNA v3 limit.');
      const rgba = image.getPixels((collection) => collection.toByteArray(0, 0, width, height, 'rgba')?.slice() ?? null);
      if (!rgba || rgba.byteLength !== pixels * 4) throw new Error('Pinned decoder did not return a complete RGBA8 sample stream.');
      return rgba;
    });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Pinned raster decode failed.' }, 422);
  }

  const recordId = crypto.randomUUID();
  const storagePrefix = userId + '/' + asset.vyral_id + '/' + assetId + '/dna/v3/' + recordId + '/tiles/';
  const tileMetadata: Record<string, unknown>[] = [];
  const uploaded: string[] = [];
  const rowBytes = width * 4;
  const pending: Array<{ x: number; y: number; width: number; height: number; bytes: Uint8Array; path: string }> = [];
  const persistBatch = async () => {
    const batch = pending.splice(0, pending.length);
    const outcomes = await Promise.allSettled(batch.map(async (tile) => {
      const { error } = await ctx.supabaseAdmin.storage.from(BUCKET).upload(
        tile.path, new Blob([tile.bytes], { type: 'application/octet-stream' }),
        { contentType: 'application/octet-stream', upsert: false, cacheControl: 'private, max-age=0' },
      );
      if (error) throw new Error(error.message);
      return tile;
    }));
    let failure = '';
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        const tile = outcome.value;
        uploaded.push(tile.path);
        tileMetadata.push({
          x: tile.x, y: tile.y, width: tile.width, height: tile.height,
          byte_length: tile.bytes.byteLength, sha256: await sha256(tile.bytes),
          package_path: 'dna/v3/' + recordId + '/tiles/' + tile.x + '_' + tile.y + '.raw',
          storage_path: tile.path,
        });
      } else if (!failure) failure = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown Storage upload error.';
    }
    if (failure) throw new Error('DNA tile batch failed: ' + failure);
  };
  try {
    for (let y = 0; y < height; y += TILE) {
      for (let x = 0; x < width; x += TILE) {
        const tileWidth = Math.min(TILE, width - x), tileHeight = Math.min(TILE, height - y);
        const bytes = new Uint8Array(tileWidth * tileHeight * 4);
        for (let row = 0; row < tileHeight; row++) {
          const offset = (y + row) * rowBytes + x * 4;
          bytes.set(samples.subarray(offset, offset + tileWidth * 4), row * tileWidth * 4);
        }
        pending.push({ x, y, width: tileWidth, height: tileHeight, bytes, path: storagePrefix + x + '_' + y + '.raw' });
        if (pending.length >= 4) await persistBatch();
      }
    }
    if (pending.length) await persistBatch();
  } catch (error) {
    if (uploaded.length) await ctx.supabaseAdmin.storage.from(BUCKET).remove(uploaded);
    return reply({ error: 'DNA tile upload failed; uploaded tiles were rolled back.', detail: error instanceof Error ? error.message : 'Unknown tile error.' }, 500);
  }

  const decodedHash = await sha256(samples);
  const record = {
    schema_id: 'vyra.asset-dna', schema_version: 3, record_id: recordId,
    source: { asset_id: assetId, asset_version_id: versionId, sha256: sourceHash, size_bytes: original.byteLength, mime_type: mime },
    extractor: { name: 'VYRA pinned server-side raster extractor', version: '1.0.0' },
    decoded_image: {
      width, height, sample_format: 'uint8', channel_layout: 'RGBA', color_space: 'decoder-normalized',
      icc_profile_sha256: null, alpha_mode: 'unknown',
      decoder_contract: { name: 'ImageMagick WASM', version: '0.0.30',
        color_management: 'Pinned ImageMagick WASM 0.0.30 to row-major interleaved RGBA8 samples; equality is defined under this decoder contract.' },
      decoded_samples_sha256: decodedHash,
    },
    lossless_payload: { encoding: 'raw-tiled-v1', tile_width: TILE, tile_height: TILE,
      tiles: tileMetadata.map(({ storage_path: _path, ...tile }) => tile) },
  };
  const { data: row, error: insertError } = await ctx.supabaseAdmin.from('vyral_dna_records').insert({
    id: recordId, vyral_id: asset.vyral_id, user_id: userId, asset_id: assetId, scope: 'asset',
    schema_version: 3, dna_status: 'evolving', source_kind: 'system', verification_status: 'observed',
    payload: { record_kind: 'lossless_decoded_samples_v3', dna_schema_id: 'vyra.asset-dna',
      dna_schema_version: 3, dna_record: record, storage_bucket: BUCKET, storage_prefix: storagePrefix,
      tile_storage_paths: uploaded },
    reconstruction_data: { encoding: 'raw-tiled-v1', decoded_samples_sha256: decodedHash,
      tile_count: tileMetadata.length, extraction_status: 'extracted_not_yet_reconstructed',
      source_preservation: 'original_binary_retained', reconstruction_ready: true,
      recovery_level: 'decoded-samples-exact', encoded_source_bytes_recoverable: false },
  }).select('id').single();
  if (insertError || !row) {
    await ctx.supabaseAdmin.storage.from(BUCKET).remove(uploaded);
    return reply({ error: 'DNA record insert failed; uploaded tiles were rolled back.', detail: insertError?.message ?? 'No row returned.' }, 500);
  }
  return reply({ status: 'extracted', assetId, versionId, dnaRecordId: row.id, recordId,
    sourceSha256: sourceHash, decodedSamplesSha256: decodedHash, width, height, channelLayout: 'RGBA',
    tileCount: tileMetadata.length, decoder: 'ImageMagick WASM 0.0.30', originalAssetMutated: false });
});
