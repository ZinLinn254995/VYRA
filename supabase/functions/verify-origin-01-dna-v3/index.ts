import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { isCanonicalOwnedStoragePath } from '../_shared/canonical-storage-path.ts';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';

const BUCKET = 'vyral-assets';
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
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sha256Hex = async (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const inspectPng = (bytes: Uint8Array) => {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !sig.every((v, i) => bytes[i] === v)) throw new Error('Original is not a valid PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNG IHDR missing.');
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (bytes[24] !== 8 || (bytes[25] !== 2 && bytes[25] !== 6)) throw new Error('Unsupported PNG bit depth or color type.');
  let hasIcc = false;
  let hasSrgb = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('Truncated PNG chunk.');
    const kind = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (kind === 'iCCP') hasIcc = true;
    if (kind === 'sRGB') hasSrgb = true;
    offset = end;
    if (kind === 'IEND') break;
  }
  if (hasIcc) throw new Error('Embedded ICC profile is unsupported by the current verifier contract.');
  if (!width || !height || width * height > 8_000_000) throw new Error('PNG dimensions exceed verifier limits.');
  return { width, height, channels: bytes[25] === 6 ? 4 : 3, layout: bytes[25] === 6 ? 'RGBA' : 'RGB', hasSrgb };
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (userId !== ORIGIN.ownerId) return json({ error: 'ORIGIN-01 verification is owner-restricted.' }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  if (body.dnaRecordId !== '761b39c8-be23-4ca7-88c9-16151a0a0c41') {
    return json({ error: 'Only the registered ORIGIN-01 DNA v3 record can be verified.' }, 400);
  }

  const { data: recordRow, error: recordError } = await context.supabaseAdmin
    .from('vyral_dna_records')
    .select('id,vyral_id,user_id,asset_id,schema_version,payload,reconstruction_data')
    .eq('id', body.dnaRecordId).maybeSingle();
  if (recordError || !recordRow) return json({ error: 'Could not read the ORIGIN-01 DNA record.' }, 500);
  if (recordRow.vyral_id !== ORIGIN.vyralId || recordRow.asset_id !== ORIGIN.assetId ||
      recordRow.user_id !== userId || recordRow.schema_version !== 3) {
    return json({ error: 'DNA record ownership or source binding mismatch.' }, 409);
  }

  const dna = recordRow.payload?.dna_record;
  const decoded = dna?.decoded_image;
  const source = dna?.source;
  const tiles = dna?.lossless_payload?.tiles;
  const paths = recordRow.payload?.tile_storage_paths;
  const prefix = recordRow.payload?.storage_prefix;
  const expectedPrefix = ORIGIN.ownerId + '/' + ORIGIN.vyralId + '/' + ORIGIN.assetId + '/dna/v3/' + recordRow.id + '/tiles/';
  if (!decoded || !source || !Array.isArray(tiles) || !Array.isArray(paths) ||
      tiles.length !== 100 || paths.length !== tiles.length || typeof prefix !== 'string') {
    return json({ error: 'DNA record is missing the expected 100-tile manifest or storage mapping.' }, 409);
  }
  if (prefix !== expectedPrefix || dna.record_id !== recordRow.id || dna.schema_id !== 'vyra.asset-dna' ||
      dna.schema_version !== 3 || decoded.sample_format !== 'uint8' || decoded.color_space !== 'unknown' ||
      decoded.decoder_contract?.name !== 'ImageMagick WASM' || decoded.decoder_contract?.version !== '0.0.30' ||
      source.asset_id !== ORIGIN.assetId || source.asset_version_id !== ORIGIN.versionId ||
      source.mime_type !== 'image/png' || Number(source.size_bytes) !== 1046585 ||
      source.sha256 !== '3529e592f9caebff28aca52ef1e5f827e6905fde1519171a18a390a9d347d1b0') {
    return json({ error: 'DNA source identity does not match protected ORIGIN-01.' }, 409);
  }

  const { data: asset, error: assetError } = await context.supabaseAdmin
    .from('vyral_assets').select('id,storage_path,sha256,size_bytes,mime_type,processing_status')
    .eq('id', ORIGIN.assetId).eq('user_id', userId).maybeSingle();
  const { data: version, error: versionError } = await context.supabaseAdmin
    .from('vyral_asset_versions').select('id,storage_path,sha256,size_bytes,mime_type')
    .eq('id', ORIGIN.versionId).eq('asset_id', ORIGIN.assetId).eq('user_id', userId).maybeSingle();
  if (assetError || versionError || !asset || !version) return json({ error: 'Could not validate protected original metadata.' }, 500);
  const sourcePrefix = userId + '/' + ORIGIN.vyralId + '/' + ORIGIN.assetId + '/';
  if (!isCanonicalOwnedStoragePath(version.storage_path, sourcePrefix)) return json({ error: 'Protected source path failed canonical owner-path validation.' }, 409);
  if (!isCanonicalOwnedStoragePath(prefix + 'tile.raw', expectedPrefix)) return json({ error: 'Protected DNA tile prefix failed canonical owner-path validation.' }, 409);
  if (asset.storage_path !== version.storage_path || asset.sha256 !== version.sha256 ||
      Number(asset.size_bytes) !== Number(version.size_bytes) || asset.mime_type !== 'image/png' ||
      asset.processing_status !== 'ready' || version.mime_type !== 'image/png') {
    return json({ error: 'Protected source metadata mismatch.' }, 409);
  }

  const { data: originalBlob, error: originalError } = await context.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (originalError || !originalBlob) return json({ error: 'Could not re-read protected original.' }, 502);
  const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
  const originalSha = await sha256Hex(originalBytes);
  if (originalBytes.length !== Number(version.size_bytes) || originalSha !== String(version.sha256).toLowerCase()) {
    return json({ error: 'Original file byte hash or size changed; verification stopped.' }, 409);
  }

  let png: ReturnType<typeof inspectPng>;
  let independentlyDecoded: Uint8Array;
  try {
    png = inspectPng(originalBytes);
    independentlyDecoded = await ImageMagick.read(originalBytes, (image) => {
      if (image.width !== png.width || image.height !== png.height) throw new Error('Decoded dimensions differ from IHDR.');
      const format = png.layout.toLowerCase();
      const pixels = image.getPixels((collection) =>
        collection.toByteArray(0, 0, png.width, png.height, format)?.slice() ?? null);
      if (!pixels || pixels.length !== png.width * png.height * png.channels) throw new Error('Incomplete decoded sample stream.');
      return pixels;
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Independent decode failed.' }, 422);
  }
  if (png.width !== decoded.width || png.height !== decoded.height ||
      png.layout !== decoded.channel_layout || png.width !== 1254 || png.height !== 1254) {
    return json({ error: 'Fresh decode dimensions or channel layout differ from DNA manifest.' }, 409);
  }

  const expectedPaths = new Set<string>();
  const reconstructed = new Uint8Array(independentlyDecoded.length);
  const rowBytes = png.width * png.channels;
  let totalTileBytes = 0;
  let verifiedTiles = 0;
  for (const tile of tiles) {
    const x = Number(tile.x), y = Number(tile.y);
    const width = Number(tile.width), height = Number(tile.height);
    const expectedWidth = Math.min(128, png.width - x);
    const expectedHeight = Math.min(128, png.height - y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
        x % 128 !== 0 || y % 128 !== 0 || width !== expectedWidth || height !== expectedHeight) {
      return json({ error: 'Tile geometry is invalid or outside the image grid.' }, 409);
    }
    const fileName = x + '_' + y + '.raw';
    const storagePath = prefix + fileName;
    if (!isCanonicalOwnedStoragePath(storagePath, expectedPrefix) || !paths.includes(storagePath) || expectedPaths.has(storagePath)) {
      return json({ error: 'Tile storage mapping is missing or duplicated.' }, 409);
    }
    expectedPaths.add(storagePath);
    const { data: tileBlob, error: tileError } = await context.supabaseAdmin.storage.from(BUCKET).download(storagePath);
    if (tileError || !tileBlob) return json({ error: 'Could not read tile ' + fileName + '.' }, 502);
    const tileBytes = new Uint8Array(await tileBlob.arrayBuffer());
    const expectedLength = width * height * png.channels;
    if (tileBytes.length !== expectedLength || tile.byte_length !== expectedLength) {
      return json({ error: 'Tile byte length mismatch: ' + fileName + '.' }, 409);
    }
    const tileSha = await sha256Hex(tileBytes);
    if (tileSha !== String(tile.sha256).toLowerCase()) {
      return json({ error: 'Tile SHA-256 mismatch: ' + fileName + '.' }, 409);
    }
    for (let row = 0; row < height; row += 1) {
      const sourceStart = row * width * png.channels;
      const targetStart = (y + row) * rowBytes + x * png.channels;
      reconstructed.set(tileBytes.subarray(sourceStart, sourceStart + width * png.channels), targetStart);
    }
    totalTileBytes += tileBytes.length;
    verifiedTiles += 1;
  }
  if (expectedPaths.size !== 100 || paths.some((path: string) => !expectedPaths.has(path))) {
    return json({ error: 'Tile manifest contains missing or undeclared storage paths.' }, 409);
  }

  let byteMismatchAt = -1;
  for (let index = 0; index < reconstructed.length; index += 1) {
    if (reconstructed[index] !== independentlyDecoded[index]) { byteMismatchAt = index; break; }
  }
  const reconstructedSha = await sha256Hex(reconstructed);
  const freshDecodeSha = await sha256Hex(independentlyDecoded);
  const expectedSamplesSha = String(decoded.decoded_samples_sha256).toLowerCase();
  if (byteMismatchAt !== -1 || reconstructedSha !== expectedSamplesSha || freshDecodeSha !== expectedSamplesSha) {
    return json({
      status: 'failed',
      verifiedTiles,
      reconstructedSha256: reconstructedSha,
      freshDecodeSha256: freshDecodeSha,
      expectedSamplesSha256: expectedSamplesSha,
      firstByteMismatchAt: byteMismatchAt === -1 ? null : byteMismatchAt,
      error: 'Reconstructed tiles do not match a fresh decode of the protected original.',
    }, 409);
  }

  const report = {
    protocol: 'ORIGIN-01-DNA-V3-INDEPENDENT-READBACK-1',
    source_sha256: originalSha,
    source_size_bytes: originalBytes.length,
    decoded_samples_sha256: reconstructedSha,
    fresh_decode_sha256: freshDecodeSha,
    dimensions: { width: png.width, height: png.height },
    channel_layout: png.layout,
    tile_count: verifiedTiles,
    tile_bytes_total: totalTileBytes,
    all_tile_hashes_verified: true,
    byte_for_byte_sample_comparison: true,
    original_bytes_unchanged: true,
    comparison_scope: 'decoded_exact',
    decoder: { name: 'ImageMagick WASM', version: '0.0.30' },
    note: 'Second-pass storage readback and fresh decode using the same pinned decoder contract; not an independent decoder implementation and not encoded-PNG byte reconstruction.',
  };
  const { data: testRow, error: testError } = await context.supabaseAdmin
    .from('vyral_reconstruction_tests')
    .insert({
      vyral_id: ORIGIN.vyralId,
      user_id: userId,
      asset_id: ORIGIN.assetId,
      asset_version_id: ORIGIN.versionId,
      dna_record_id: recordRow.id,
      model_provider: 'VYRA',
      model_id: 'ORIGIN-01-readback-verifier',
      protocol_version: '1',
      comparison_mode: 'decoded_exact',
      test_status: 'passed',
      exact_match: true,
      similarity_score: 1,
      verifier: { name: 'VYRA owner-authenticated readback verifier', version: '1.0.0' },
      report,
      tested_at: new Date().toISOString(),
    }).select('id').single();
  if (testError || !testRow) return json({ error: 'Readback passed but the verification report could not be recorded.', detail: testError?.message ?? null }, 500);

  return json({
    status: 'passed',
    verificationTestId: testRow.id,
    dnaRecordId: recordRow.id,
    verifiedTiles,
    reconstructedSha256: reconstructedSha,
    freshDecodeSha256: freshDecodeSha,
    originalSha256: originalSha,
    dimensions: { width: png.width, height: png.height },
    channelLayout: png.layout,
    originalBytesUnchanged: true,
    comparisonMode: 'decoded_exact',
    verificationScope: 'second-pass storage readback + fresh decode using the same pinned decoder; encoded PNG byte reconstruction is not claimed',
  });
});
