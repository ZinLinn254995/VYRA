import { createHash } from 'node:crypto';
import { isCanonicalOwnedStoragePath } from '../_shared/canonical-storage-path.ts';
import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';
import { computeVyralDHash64, VYRAL_DHASH_ALGORITHM } from '../_shared/perceptual-fingerprint.ts';

const BUCKET = 'vyral-assets';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const TILE = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wasm = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));
await initializeImageMagick(wasm);

const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sha256 = async (bytes: Uint8Array) => {
  // Web Crypto accepts the existing byte view; do not duplicate a full image/sample buffer.
  const digestView = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', digestView);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const extractionStartedAt = () => performance.now();
const logExtractionPhase = (phase: string, startedAt: number, details: Record<string, unknown> = {}) => {
  console.info('[vyral-dna-v3]', JSON.stringify({ phase, elapsed_ms: Math.round(performance.now() - startedAt), ...details }));
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

  const startedAt = extractionStartedAt();
  logExtractionPhase('request_validated', startedAt);
  const [a, v, existing, duplicate] = await Promise.all([
    ctx.supabase.from('vyral_assets').select('id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type').eq('id', versionId).eq('asset_id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_dna_records').select('id,revision_number,payload').eq('asset_id', assetId).eq('user_id', userId).eq('scope', 'asset').order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from('vyral_dna_records').select('id,schema_version,payload').eq('asset_id', assetId).eq('user_id', userId).eq('scope', 'asset').eq('payload->dna_record->source->>asset_version_id', versionId).maybeSingle(),
  ]);
  if (a.error || v.error || existing.error || duplicate.error) return reply({ error: 'Could not validate Asset ownership and extraction state.' }, 500);
  const asset = a.data, version = v.data, parentDna = existing.data;
  if (!asset || !version) return reply({ error: 'Asset or source Version was not found for this account.' }, 404);
  if (duplicate.data) {
    const priorPayload = duplicate.data.payload && typeof duplicate.data.payload === 'object' && !Array.isArray(duplicate.data.payload)
      ? duplicate.data.payload as Record<string, unknown> : {};
    const priorRecord = priorPayload.dna_record && typeof priorPayload.dna_record === 'object' && !Array.isArray(priorPayload.dna_record)
      ? priorPayload.dna_record as Record<string, unknown> : {};
    const priorDecoded = priorRecord.decoded_image && typeof priorRecord.decoded_image === 'object' && !Array.isArray(priorRecord.decoded_image)
      ? priorRecord.decoded_image as Record<string, unknown> : {};
    const priorDecoder = priorDecoded.decoder_contract && typeof priorDecoded.decoder_contract === 'object' && !Array.isArray(priorDecoded.decoder_contract)
      ? priorDecoded.decoder_contract as Record<string, unknown> : {};
    const alreadyUsesPinnedDecoder = Number(duplicate.data.schema_version) === 3 &&
      priorPayload.dna_schema_id === 'vyra.asset-dna' &&
      priorDecoder.name === 'ImageMagick WASM' && priorDecoder.version === '0.0.30';
    if (body.reextractLegacy !== true || alreadyUsesPinnedDecoder) {
      return reply({ error: 'This Asset Version already has an immutable DNA record.', dnaRecordId: duplicate.data.id }, 409);
    }
  }
  const mime = String(version.mime_type ?? '').toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return reply({ error: 'DNA v3 currently supports PNG, JPEG and WebP raster images.' }, 415);
  if (asset.vyral_id !== version.vyral_id || asset.storage_path !== version.storage_path ||
      asset.sha256 !== version.sha256 || Number(asset.size_bytes) !== Number(version.size_bytes) ||
      String(asset.mime_type ?? '').toLowerCase() !== mime || !['uploading', 'ready'].includes(String(asset.processing_status))) {
    return reply({ error: 'Asset and source Version metadata do not match.' }, 409);
  }
  const prefix = userId + '/' + asset.vyral_id + '/' + assetId + '/';
  const sourcePath = typeof version.storage_path === 'string' ? version.storage_path : '';
  if (!isCanonicalOwnedStoragePath(sourcePath, prefix)) {
    return reply({ error: 'Private Storage path failed owner-prefix and canonical-path validation.' }, 409);
  }
  const size = Number(version.size_bytes);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return reply({ error: 'Image exceeds the 20 MB extraction limit.' }, 413);

  let { data: sourceBlob, error: downloadError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !sourceBlob) return reply({ error: 'Could not retrieve the original from private Storage.' }, 502);
  if (sourceBlob.size !== size) return reply({ error: 'Downloaded byte size does not match the source Version.' }, 409);
  logExtractionPhase('source_downloaded', startedAt, { source_bytes: sourceBlob.size });
  let original: Uint8Array | null = new Uint8Array(await sourceBlob.arrayBuffer());
  sourceBlob = null;
  const sourceHash = await sha256(original);
  if (sourceHash !== String(version.sha256 ?? '').toLowerCase()) return reply({ error: 'Source SHA-256 mismatch. No DNA was written.' }, 409);
  logExtractionPhase('source_hash_verified', startedAt);

  let width = 0, height = 0;
  let decodedHash = '';
  let visualFingerprint = '';
  const recordId = crypto.randomUUID();
  const storagePrefix = userId + '/' + asset.vyral_id + '/' + assetId + '/dna/v3/' + recordId + '/tiles/';
  const tileMetadata: Record<string, unknown>[] = [];
  const uploaded: string[] = [];
  const pending: Array<{ x: number; y: number; width: number; height: number; bytes: Uint8Array; path: string }> = [];
  const decodedHasher = createHash('sha256');
  const persistBatch = async () => {
    const batch = pending.splice(0, pending.length);
    const outcomes = await Promise.allSettled(batch.map(async (tile) => {
      const { error } = await ctx.supabaseAdmin.storage.from(BUCKET).upload(
        tile.path, new Blob([tile.bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
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
        // The tile is now safely stored and its integrity digest is recorded.
        // Drop the JS copy immediately instead of retaining an entire image row.
        tile.bytes = new Uint8Array(0);
      } else if (!failure) failure = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown Storage upload error.';
    }
    if (failure) throw new Error('DNA tile batch failed: ' + failure);
  };
  let tileUploadStarted = false;
  try {
    // Decode once, but only copy one 512px-high tile row into JS memory at a
    // time. Hash each scanline from left to right so the aggregate digest is
    // byte-for-byte identical to the former full RGBA sample buffer.
    let decodeInput: Uint8Array | null = original;
    original = null;
    await ImageMagick.read(decodeInput!, async (image) => {
      // ImageMagick has consumed the encoded source by the time this callback
      // runs. Release it before allocating any JavaScript tile buffers.
      decodeInput = null;
      width = image.width; height = image.height;
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 || pixels > MAX_PIXELS) {
        throw new Error('Image exceeds the 50-megapixel DNA v3 limit.');
      }
      for (let y = 0; y < height; y += TILE) {
        const tileRow: Array<{ x: number; y: number; width: number; height: number; bytes: Uint8Array; path: string }> = [];
        const tileHeight = Math.min(TILE, height - y);
        for (let x = 0; x < width; x += TILE) {
          const tileWidth = Math.min(TILE, width - x);
          const bytes = image.getPixels((collection) =>
            collection.toByteArray(x, y, tileWidth, tileHeight, 'rgba')?.slice() ?? null
          );
          if (!bytes || bytes.byteLength !== tileWidth * tileHeight * 4) {
            throw new Error('Pinned decoder did not return a complete RGBA8 tile.');
          }
          tileRow.push({ x, y, width: tileWidth, height: tileHeight, bytes,
            path: storagePrefix + x + '_' + y + '.raw' });
        }
        // Tile-major byte order is not image-major byte order. Feed one row
        // from every horizontal tile before advancing to the next scanline.
        for (let row = 0; row < tileHeight; row++) {
          for (const tile of tileRow) {
            const start = row * tile.width * 4;
            decodedHasher.update(tile.bytes.subarray(start, start + tile.width * 4));
          }
        }
        for (const tile of tileRow) {
          pending.push(tile);
          if (pending.length >= 2) {
            tileUploadStarted = true;
            await persistBatch();
          }
        }
      }
      if (pending.length) {
        tileUploadStarted = true;
        await persistBatch();
      }

      // Sample the same 9x8 source coordinates as computeVyralDHash64 without
      // materializing the full decoded image in a second JS buffer.
      const fingerprintSamples = new Uint8Array(9 * 8 * 4);
      for (let row = 0; row < 8; row++) {
        const sourceY = Math.min(height - 1, Math.floor((row + 0.5) * height / 8));
        for (let column = 0; column < 9; column++) {
          const sourceX = Math.min(width - 1, Math.floor((column + 0.5) * width / 9));
          const pixel = image.getPixels((collection) =>
            collection.toByteArray(sourceX, sourceY, 1, 1, 'rgba')?.slice() ?? null
          );
          if (!pixel || pixel.byteLength !== 4) throw new Error('Pinned decoder could not read a fingerprint sample.');
          fingerprintSamples.set(pixel, (row * 9 + column) * 4);
        }
      }
      visualFingerprint = computeVyralDHash64(fingerprintSamples, 9, 8, 4);
    });
    decodeInput = null;
    decodedHash = decodedHasher.digest('hex');
  } catch (error) {
    if (uploaded.length) await ctx.supabaseAdmin.storage.from(BUCKET).remove(uploaded);
    const detail = error instanceof Error ? error.message : 'Unknown raster extraction error.';
    const pixelCount = width > 0 && height > 0 ? width * height : null;
    const pixelLimitExceeded = detail.includes('50-megapixel DNA v3 limit');
    console.error('[vyral-dna-v3] raster extraction failed.', JSON.stringify({
      phase: tileUploadStarted ? 'tile_upload_or_persistence' : 'pinned_decode',
      detail, source_bytes: size, width: width || null, height: height || null,
      pixel_count: pixelCount, max_pixels: MAX_PIXELS,
      elapsed_ms: Math.round(performance.now() - startedAt),
    }));
    return reply({
      error: tileUploadStarted
        ? 'DNA tile upload failed; uploaded tiles were rolled back.'
        : 'Pinned raster decode failed.',
      code: pixelLimitExceeded ? 'IMAGE_PIXEL_LIMIT_EXCEEDED' : (tileUploadStarted ? 'DNA_TILE_UPLOAD_FAILED' : 'RASTER_DECODE_FAILED'),
      detail, width: width || null, height: height || null, pixelCount, maxPixels: MAX_PIXELS,
    }, tileUploadStarted ? 500 : (pixelLimitExceeded ? 413 : 422));
  }

  logExtractionPhase('image_decoded_and_tiled', startedAt, { width, height, pixel_count: width * height });
  logExtractionPhase('tiles_uploaded', startedAt, { tile_count: tileMetadata.length, tile_bytes: tileMetadata.reduce((total, tile) => total + Number(tile.byte_length ?? 0), 0) });
  logExtractionPhase('decoded_streaming_complete', startedAt, { width, height });
  const record = {
    schema_id: 'vyra.asset-dna', schema_version: 3, record_id: recordId,
    source: { asset_id: assetId, asset_version_id: versionId, sha256: sourceHash, size_bytes: size, mime_type: mime },
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
    // Database trigger allocates the authoritative parent and revision under an Asset-row lock.
    schema_version: 3, dna_status: 'evolving', source_kind: 'system', verification_status: 'observed',
    payload: { record_kind: 'lossless_decoded_samples_v3', dna_schema_id: 'vyra.asset-dna',
      dna_schema_version: 3, dna_record: record, storage_bucket: BUCKET, storage_prefix: storagePrefix,
      tile_storage_paths: uploaded },
    reconstruction_data: { encoding: 'raw-tiled-v1', decoded_samples_sha256: decodedHash,
      tile_count: tileMetadata.length, extraction_status: 'extracted_not_yet_reconstructed',
      source_preservation: 'original_binary_retained', reconstruction_ready: true,
      recovery_level: 'decoded-samples-exact', encoded_source_bytes_recoverable: false },
  }).select('id,revision_number,parent_dna_record_id').single();
  if (insertError || !row) {
    await ctx.supabaseAdmin.storage.from(BUCKET).remove(uploaded);
    if (insertError?.code === '23505') return reply({ error: 'This Asset Version already has an immutable DNA record.', code: 'DNA_SOURCE_VERSION_ALREADY_EXISTS' }, 409);
    return reply({ error: 'DNA record insert failed; uploaded tiles were rolled back.', detail: insertError?.message ?? 'No row returned.' }, 500);
  }
  logExtractionPhase('dna_record_saved', startedAt, { tile_count: tileMetadata.length });
  let visualFingerprintStatus: 'recorded' | 'failed' = 'failed';
  try {
    const fingerprintMetadata = {
      verification_status: 'server_verified',
      computed_by: 'extract-vyral-asset-dna-v3',
      source_sha256: sourceHash,
      dimensions: { width, height },
      decoder: { name: 'ImageMagick WASM', version: '0.0.30', color_management: 'decoder-normalized' },
      method: '9x8 grayscale horizontal difference hash',
      alpha_handling: 'composited_over_white',
      note: 'Perceptual similarity is an estimate, not proof of semantic identity or exact pixel equality.',
    };
    const { error: fingerprintWriteError } = await ctx.supabaseAdmin.from('vyral_fingerprints').upsert({
      asset_id: assetId, asset_version_id: versionId, user_id: userId,
      fingerprint_kind: 'perceptual', algorithm: VYRAL_DHASH_ALGORITHM,
      value: visualFingerprint, metadata: fingerprintMetadata,
    }, { onConflict: 'asset_version_id,fingerprint_kind,algorithm' });
    if (fingerprintWriteError) throw fingerprintWriteError;
    visualFingerprintStatus = 'recorded';
  } catch (error) {
    console.warn('[vyral-visual-fingerprint] DNA extraction succeeded, but the perceptual fingerprint could not be saved.', error);
  }
  logExtractionPhase('extraction_complete', startedAt, { width, height, tile_count: tileMetadata.length, visual_fingerprint: visualFingerprintStatus });
  return reply({ status: 'extracted', assetId, versionId, dnaRecordId: row.id, recordId,
    parentDnaRecordId: row.parent_dna_record_id ?? null, revisionNumber: row.revision_number,
    sourceSha256: sourceHash, decodedSamplesSha256: decodedHash, width, height, channelLayout: 'RGBA',
    tileCount: tileMetadata.length, decoder: 'ImageMagick WASM 0.0.30',
    visualFingerprintStatus, visualFingerprint: visualFingerprintStatus === 'recorded' ? visualFingerprint : null,
    originalAssetMutated: false });
});
