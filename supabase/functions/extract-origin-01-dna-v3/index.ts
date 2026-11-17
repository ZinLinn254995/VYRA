import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { isCanonicalOwnedStoragePath } from '../_shared/canonical-storage-path.ts';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';

const BUCKET = 'vyral-assets';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const TILE_SIZE = 128;
const ORIGIN = {
  vyralId: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  assetId: '2c496cd5-84c4-44b1-b02a-fca4265cc592',
  versionId: 'b4376fd9-a577-464e-91b4-e33791559e7f',
  ownerId: 'c9801424-1e4d-4604-99d3-791a8a389b48',
};

const wasmBytes = await Deno.readFile(
  new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')),
);
await initializeImageMagick(wasmBytes);

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const sha256Hex = async (bytes: Uint8Array) => {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', owned);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const inspectPngHeader = (bytes: Uint8Array) => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 33 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error('ORIGIN-01 source is not a valid PNG file.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNG IHDR chunk is missing.');
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error('DNA v3 extraction currently supports only 8-bit truecolor RGB/RGBA PNG sources.');
  }
  let hasIccProfile = false;
  let hasSrgbChunk = false;
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (end > bytes.byteLength) throw new Error('PNG contains a truncated chunk.');
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'iCCP') hasIccProfile = true;
    if (type === 'sRGB') hasSrgbChunk = true;
    offset = end;
    if (type === 'IEND') break;
  }
  if (hasIccProfile) {
    throw new Error('ORIGIN-01 contains an embedded ICC profile. Extraction is paused until profile-aware decoding and ICC preservation are implemented.');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error('ORIGIN-01 dimensions exceed the supported 8-megapixel extraction limit.');
  }
  return { width, height, channelLayout: colorType === 6 ? 'RGBA' as const : 'RGB' as const, hasSrgbChunk };
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (userId !== ORIGIN.ownerId) return json({ error: 'ORIGIN-01 DNA extraction is restricted to its owner.' }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (body.assetId !== ORIGIN.assetId || body.versionId !== ORIGIN.versionId || body.vyralId !== ORIGIN.vyralId) {
    return json({ error: 'The requested source is not the registered protected ORIGIN-01 original.' }, 400);
  }

  const [vyralResult, assetResult, versionResult, existingResult] = await Promise.all([
    context.supabase.from('vyrals').select('id,metadata').eq('id', ORIGIN.vyralId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_assets').select('id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', ORIGIN.assetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,version_number').eq('id', ORIGIN.versionId).eq('asset_id', ORIGIN.assetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_dna_records').select('id').eq('asset_id', ORIGIN.assetId).eq('vyral_id', ORIGIN.vyralId).eq('user_id', userId).eq('scope', 'asset').eq('payload->dna_record->source->>asset_version_id', ORIGIN.versionId).maybeSingle(),
  ]);
  const queryError = [vyralResult, assetResult, versionResult, existingResult].find((result) => result.error)?.error;
  if (queryError) return json({ error: 'Could not validate ORIGIN-01 ownership and extraction state.' }, 500);
  const vyral = vyralResult.data;
  const asset = assetResult.data;
  const version = versionResult.data;
  if (!vyral || vyral.metadata?.protected !== true || !asset || !version) {
    return json({ error: 'Protected ORIGIN-01 asset metadata or source version is missing.' }, 409);
  }
  if (existingResult.data) return json({ error: 'DNA already exists for this exact ORIGIN-01 source version. Existing DNA records are immutable; do not overwrite them.' }, 409);
  if (
    asset.vyral_id !== ORIGIN.vyralId || version.vyral_id !== ORIGIN.vyralId ||
    asset.storage_path !== version.storage_path || asset.sha256 !== version.sha256 ||
    Number(asset.size_bytes) !== Number(version.size_bytes) ||
    asset.processing_status !== 'ready' || version.mime_type !== 'image/png'
  ) return json({ error: 'ORIGIN-01 asset and version metadata do not match the protected source contract.' }, 409);

  const expectedPrefix = userId + '/' + ORIGIN.vyralId + '/' + ORIGIN.assetId + '/';
  if (!isCanonicalOwnedStoragePath(version.storage_path, expectedPrefix) || asset.storage_path !== version.storage_path) {
    return json({ error: 'ORIGIN-01 private storage path failed owner-prefix validation.' }, 409);
  }
  const expectedSize = Number(version.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_SOURCE_BYTES) {
    return json({ error: 'ORIGIN-01 source exceeds the 20 MB extraction limit.' }, 413);
  }

  const { data: originalBlob, error: downloadError } = await context.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !originalBlob) return json({ error: 'Could not retrieve the protected original from private storage.' }, 502);
  if (originalBlob.size !== expectedSize || originalBlob.size > MAX_SOURCE_BYTES) {
    return json({ error: 'Downloaded ORIGIN-01 byte size does not match its protected version record.' }, 409);
  }
  const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
  const sourceSha256 = await sha256Hex(originalBytes);
  if (sourceSha256 !== String(version.sha256 ?? '').toLowerCase()) {
    return json({ error: 'Downloaded ORIGIN-01 SHA-256 does not match its protected version record. No DNA was written.' }, 409);
  }

  let png;
  try { png = inspectPngHeader(originalBytes); }
  catch (cause) { return json({ error: cause instanceof Error ? cause.message : 'PNG source inspection failed.' }, 422); }

  let decodedSamples: Uint8Array;
  try {
    decodedSamples = await ImageMagick.read(originalBytes, (image) => {
      if (image.width !== png.width || image.height !== png.height) throw new Error('Decoded dimensions differ from the PNG IHDR dimensions.');
      const format = png.channelLayout === 'RGBA' ? 'rgba' : 'rgb';
      const pixels = image.getPixels((collection) => collection.toByteArray(0, 0, png.width, png.height, format)?.slice() ?? null);
      const expectedLength = png.width * png.height * (png.channelLayout === 'RGBA' ? 4 : 3);
      if (!pixels || pixels.byteLength !== expectedLength) throw new Error('ImageMagick did not return a complete decoded sample stream.');
      return pixels;
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Could not decode ORIGIN-01 samples.' }, 422);
  }

  const channelCount = png.channelLayout === 'RGBA' ? 4 : 3;
  const rowBytes = png.width * channelCount;
  const recordId = crypto.randomUUID();
  const tileMetadata: Record<string, unknown>[] = [];
  const uploadedPaths: string[] = [];
  const storagePrefix = userId + '/' + ORIGIN.vyralId + '/' + ORIGIN.assetId + '/dna/v3/' + recordId + '/tiles/';
  if (!isCanonicalOwnedStoragePath(storagePrefix + 'tile.bin', expectedPrefix)) {
    return json({ error: 'ORIGIN-01 DNA tile storage prefix failed canonical owner-path validation.' }, 409);
  }

  for (let y = 0; y < png.height; y += TILE_SIZE) {
    for (let x = 0; x < png.width; x += TILE_SIZE) {
      const tileWidth = Math.min(TILE_SIZE, png.width - x);
      const tileHeight = Math.min(TILE_SIZE, png.height - y);
      const tileBytes = new Uint8Array(tileWidth * tileHeight * channelCount);
      for (let row = 0; row < tileHeight; row += 1) {
        const sourceStart = (y + row) * rowBytes + x * channelCount;
        tileBytes.set(decodedSamples.subarray(sourceStart, sourceStart + tileWidth * channelCount), row * tileWidth * channelCount);
      }
      const tileSha256 = await sha256Hex(tileBytes);
      const packagePath = 'dna/v3/' + recordId + '/tiles/' + x + '_' + y + '.raw';
      const storagePath = storagePrefix + x + '_' + y + '.raw';
      const { error: uploadError } = await context.supabaseAdmin.storage.from(BUCKET).upload(
        storagePath,
        new Blob([tileBytes], { type: 'application/octet-stream' }),
        { contentType: 'application/octet-stream', upsert: false, cacheControl: 'private, max-age=0' },
      );
      if (uploadError) {
        if (uploadedPaths.length) await context.supabaseAdmin.storage.from(BUCKET).remove(uploadedPaths);
        return json({ error: 'Could not persist a DNA v3 tile. No DNA record was created.', detail: uploadError.message }, 500);
      }
      uploadedPaths.push(storagePath);
      tileMetadata.push({
        x, y, width: tileWidth, height: tileHeight,
        byte_length: tileBytes.byteLength, sha256: tileSha256, package_path: packagePath,
        storage_path: storagePath,
      });
    }
  }

  const decodedDigest = await sha256Hex(decodedSamples);
  const record = {
    schema_id: 'vyra.asset-dna',
    schema_version: 3,
    record_id: recordId,
    source: {
      asset_id: ORIGIN.assetId,
      asset_version_id: ORIGIN.versionId,
      sha256: sourceSha256,
      size_bytes: originalBytes.byteLength,
      mime_type: 'image/png',
    },
    extractor: { name: 'VYRA ORIGIN-01 trusted edge extractor', version: '1.0.0' },
    decoded_image: {
      width: png.width,
      height: png.height,
      sample_format: 'uint8',
      channel_layout: png.channelLayout,
      color_space: png.hasSrgbChunk ? 'sRGB' : 'unknown',
      icc_profile_sha256: null,
      alpha_mode: png.channelLayout === 'RGBA' ? 'straight' : 'none',
      decoder_contract: {
        name: 'ImageMagick WASM',
        version: '0.0.30',
        color_management: png.hasSrgbChunk
          ? '8-bit PNG sRGB chunk; ImageMagick WASM default decode to row-major ' + png.channelLayout + ' samples; embedded iCCP profiles are rejected.'
          : '8-bit PNG without sRGB or iCCP chunk; color space remains unknown; ImageMagick WASM default decode to row-major ' + png.channelLayout + ' samples.',
      },
      decoded_samples_sha256: decodedDigest,
    },
    lossless_payload: {
      encoding: 'raw-tiled-v1',
      tile_width: TILE_SIZE,
      tile_height: TILE_SIZE,
      tiles: tileMetadata.map(({ storage_path: _storagePath, ...tile }) => tile),
    },
  };

  const { data: dnaRow, error: insertError } = await context.supabaseAdmin.from('vyral_dna_records').insert({
    id: recordId,
    vyral_id: ORIGIN.vyralId,
    user_id: userId,
    asset_id: ORIGIN.assetId,
    scope: 'asset',
    schema_version: 3,
    dna_status: 'evolving',
    payload: {
      record_kind: 'lossless_decoded_samples_v3',
      dna_schema_id: 'vyra.asset-dna',
      dna_schema_version: 3,
      dna_record: record,
      storage_bucket: BUCKET,
      storage_prefix: storagePrefix,
      tile_storage_paths: tileMetadata.map((tile) => tile.storage_path),
    },
    reconstruction_data: {
      encoding: 'raw-tiled-v1',
      decoded_samples_sha256: decodedDigest,
      tile_count: tileMetadata.length,
      extraction_status: 'extracted_not_yet_reconstructed',
    },
    source_kind: 'system',
    verification_status: 'observed',
  }).select('id,revision_number,parent_dna_record_id').single();

  if (insertError || !dnaRow) {
    await context.supabaseAdmin.storage.from(BUCKET).remove(uploadedPaths);
    if (insertError?.code === '23505') return json({ error: 'DNA already exists for this exact ORIGIN-01 source version. Newly uploaded tiles were rolled back.', code: 'DNA_SOURCE_VERSION_ALREADY_EXISTS' }, 409);
    return json({ error: 'DNA tiles were extracted but the DNA registry record could not be saved. Newly uploaded DNA tiles were rolled back.', detail: insertError?.message ?? 'Missing inserted row.' }, 500);
  }

  return json({
    status: 'extracted',
    assetId: ORIGIN.assetId,
    versionId: ORIGIN.versionId,
    dnaRecordId: dnaRow.id,
    revisionNumber: dnaRow.revision_number,
    parentDnaRecordId: dnaRow.parent_dna_record_id,
    recordId,
    sourceSha256,
    sourceSizeBytes: originalBytes.byteLength,
    decodedSamplesSha256: decodedDigest,
    width: png.width,
    height: png.height,
    channelLayout: png.channelLayout,
    colorSpace: png.hasSrgbChunk ? 'sRGB' : 'unknown',
    tileCount: tileMetadata.length,
    tileSize: TILE_SIZE,
    extractionStatus: 'extracted_not_yet_reconstructed',
    originalAssetMutated: false,
  });
});
