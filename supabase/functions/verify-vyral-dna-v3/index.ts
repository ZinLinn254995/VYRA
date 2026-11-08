import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { ImageMagick, initializeImageMagick } from 'npm:@imagemagick/magick-wasm@0.0.30';

const BUCKET = 'vyral-assets';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const sha256 = async (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
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
  const dnaRecordId = typeof body.dnaRecordId === 'string' ? body.dnaRecordId : '';
  if (!userId || !assetId || !versionId || !dnaRecordId) return reply({ error: 'Asset, version and DNA record IDs are required.' }, 400);

  const [assetResult, versionResult, dnaResult] = await Promise.all([
    ctx.supabase.from('vyral_assets').select('id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,mime_type').eq('id', versionId).eq('asset_id', assetId).eq('user_id', userId).maybeSingle(),
    ctx.supabase.from('vyral_dna_records').select('id,asset_id,vyral_id,user_id,schema_version,payload').eq('id', dnaRecordId).eq('asset_id', assetId).eq('user_id', userId).eq('scope', 'asset').maybeSingle(),
  ]);
  if (assetResult.error || versionResult.error || dnaResult.error) return reply({ error: 'Could not validate Asset, version and DNA ownership.' }, 500);
  const asset = assetResult.data, version = versionResult.data, row = dnaResult.data;
  if (!asset || !version || !row) return reply({ error: 'Asset, source version or DNA record was not found.' }, 404);
  if (asset.vyral_id !== version.vyral_id || asset.vyral_id !== row.vyral_id || row.schema_version !== 3 ||
      asset.storage_path !== version.storage_path || asset.sha256 !== version.sha256 ||
      Number(asset.size_bytes) !== Number(version.size_bytes) || asset.processing_status !== 'ready') {
    return reply({ error: 'Asset, version and DNA source bindings do not match the current immutable version.' }, 409);
  }
  const prefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/';
  if (typeof version.storage_path !== 'string' || !version.storage_path.startsWith(prefix)) return reply({ error: 'Private source path failed ownership validation.' }, 409);
  const size = Number(version.size_bytes);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return reply({ error: 'Raster verification supports source files up to 20 MB.' }, 413);
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
  const record = payload.dna_record && typeof payload.dna_record === 'object' ? payload.dna_record as Record<string, unknown> : {};
  const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : {};
  const decoded = record.decoded_image && typeof record.decoded_image === 'object' ? record.decoded_image as Record<string, unknown> : {};
  const lossless = record.lossless_payload && typeof record.lossless_payload === 'object' ? record.lossless_payload as Record<string, unknown> : {};
  const tiles = Array.isArray(lossless.tiles) ? lossless.tiles as Array<Record<string, unknown>> : [];
  const paths = Array.isArray(payload.tile_storage_paths) ? payload.tile_storage_paths as string[] : [];
  const storagePrefix = typeof payload.storage_prefix === 'string' ? payload.storage_prefix : '';
  const decoder = decoded.decoder_contract && typeof decoded.decoder_contract === 'object' ? decoded.decoder_contract as Record<string, unknown> : {};
  if (record.schema_id !== 'vyra.asset-dna' || Number(record.schema_version) !== 3 || record.record_id !== row.id ||
      source.asset_id !== asset.id || source.asset_version_id !== version.id ||
      String(source.sha256 ?? '').toLowerCase() !== String(version.sha256 ?? '').toLowerCase() ||
      Number(source.size_bytes) !== size || String(source.mime_type).toLowerCase() !== String(version.mime_type).toLowerCase() ||
      decoded.sample_format !== 'uint8' || !['RGB', 'RGBA'].includes(String(decoded.channel_layout)) ||
      decoder.name !== 'ImageMagick WASM' || decoder.version !== '0.0.30' ||
      lossless.encoding !== 'raw-tiled-v1' || tiles.length < 1 || paths.length !== tiles.length || !storagePrefix) {
    return reply({ error: 'DNA v3 manifest does not describe this exact source version or supported decoder contract.' }, 409);
  }
  const expectedPrefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/dna/v3/' + row.id + '/tiles/';
  if (storagePrefix !== expectedPrefix) return reply({ error: 'DNA tile storage prefix is invalid.' }, 409);
  const { data: blob, error: downloadError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !blob) return reply({ error: 'Could not re-read the original Asset bytes.' }, 502);
  const original = new Uint8Array(await blob.arrayBuffer());
  const originalSha = await sha256(original);
  if (original.byteLength !== size || originalSha !== String(version.sha256).toLowerCase()) return reply({ error: 'Original source size or SHA-256 mismatch.' }, 409);

  let freshSamples: Uint8Array, width = 0, height = 0;
  const layout = String(decoded.channel_layout);
  const channels = layout === 'RGBA' ? 4 : 3;
  try {
    freshSamples = await ImageMagick.read(original, (image) => {
      width = image.width; height = image.height;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new Error('Decoded image exceeds the 8-megapixel limit.');
      const samples = image.getPixels((collection) => collection.toByteArray(0, 0, width, height, layout.toLowerCase())?.slice() ?? null);
      if (!samples || samples.byteLength !== width * height * channels) throw new Error('Pinned decoder returned an incomplete sample stream.');
      return samples;
    });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Fresh raster decode failed.' }, 422); }
  if (width !== Number(decoded.width) || height !== Number(decoded.height) ||
      await sha256(freshSamples) !== String(decoded.decoded_samples_sha256).toLowerCase()) {
    return reply({ error: 'Fresh decode does not match the DNA v3 dimensions or decoded-sample digest.' }, 409);
  }

  const rebuilt = new Uint8Array(freshSamples.byteLength);
  const rowBytes = width * channels;
  const seen = new Set<string>();
  let tileBytesTotal = 0;
  for (const tile of tiles) {
    const x = Number(tile.x), y = Number(tile.y), w = Number(tile.width), h = Number(tile.height);
    const tw = Number(lossless.tile_width), th = Number(lossless.tile_height);
    if (![x,y,w,h,tw,th].every(Number.isSafeInteger) || tw < 1 || th < 1 || x < 0 || y < 0 ||
        x % tw !== 0 || y % th !== 0 || w !== Math.min(tw, width-x) || h !== Math.min(th, height-y) ||
        w < 1 || h < 1 || tile.package_path !== 'dna/v3/' + row.id + '/tiles/' + x + '_' + y + '.raw') {
      return reply({ error: 'DNA tile geometry or package path is invalid.' }, 409);
    }
    const storagePath = storagePrefix + x + '_' + y + '.raw';
    if (seen.has(storagePath) || !paths.includes(storagePath)) return reply({ error: 'DNA tile storage map contains a missing or duplicate path.' }, 409);
    seen.add(storagePath);
    const { data: tileBlob, error: tileError } = await ctx.supabaseAdmin.storage.from(BUCKET).download(storagePath);
    if (tileError || !tileBlob) return reply({ error: 'Could not read a persisted DNA tile.' }, 502);
    const bytes = new Uint8Array(await tileBlob.arrayBuffer());
    const expectedLength = w * h * channels;
    if (bytes.byteLength !== expectedLength || Number(tile.byte_length) !== expectedLength ||
        await sha256(bytes) !== String(tile.sha256).toLowerCase()) return reply({ error: 'A persisted DNA tile failed byte-length or SHA-256 verification.' }, 409);
    for (let y0 = 0; y0 < h; y0++) rebuilt.set(bytes.subarray(y0*w*channels,(y0+1)*w*channels),(y+y0)*rowBytes+x*channels);
    tileBytesTotal += bytes.byteLength;
  }
  if (seen.size !== tiles.length || paths.some((path) => !seen.has(path)) ||
      await sha256(rebuilt) !== String(decoded.decoded_samples_sha256).toLowerCase()) return reply({ error: 'DNA tile set is incomplete or reconstructed samples do not match.' }, 409);
  for (let i = 0; i < rebuilt.length; i++) if (rebuilt[i] !== freshSamples[i]) return reply({ error: 'DNA samples differ from a fresh decode of the original source.' }, 409);

  const testedAt = new Date().toISOString();
  const report = { source_sha256: originalSha, source_size_bytes: size, decoded_samples_sha256: await sha256(rebuilt),
    dimensions: { width, height }, channel_layout: layout, tile_count: tiles.length, tile_bytes_total: tileBytesTotal,
    all_tile_hashes_verified: true, byte_for_byte_sample_comparison: true, original_bytes_unchanged: true,
    comparison_mode: 'decoded_exact', decoder: { name: 'ImageMagick WASM', version: '0.0.30' },
    note: 'Exact decoded-sample recovery under the DNA v3 pinned decoder contract; this does not claim original encoded-file byte recovery.' };
  const { data: existing, error: lookupError } = await ctx.supabaseAdmin.from('vyral_reconstruction_tests')
    .select('id').eq('asset_id', asset.id).eq('asset_version_id', version.id).eq('dna_record_id', row.id)
    .eq('comparison_mode', 'decoded_exact').eq('test_status', 'passed').eq('exact_match', true).limit(1).maybeSingle();
  if (lookupError) return reply({ error: 'Could not inspect existing reconstruction evidence.' }, 500);
  let testId = existing?.id;
  if (!testId) {
    const { data: testRow, error: insertError } = await ctx.supabaseAdmin.from('vyral_reconstruction_tests').insert({
      vyral_id: asset.vyral_id, user_id: userId, asset_id: asset.id, asset_version_id: version.id, dna_record_id: row.id,
      model_provider: 'VYRA', model_id: 'vyral-dna-v3-readback-verifier', protocol_version: 'dna-v3-readback-1',
      comparison_mode: 'decoded_exact', test_status: 'passed', exact_match: true, similarity_score: 1,
      verifier: { function: 'verify-vyral-dna-v3', method: 'persisted-tile-readback-and-independent-fresh-decode', hash_algorithm: 'SHA-256' },
      report, tested_at: testedAt,
    }).select('id').single();
    if (insertError || !testRow) return reply({ error: 'Readback passed but exact reconstruction evidence could not be saved.' }, 500);
    testId = testRow.id;
  }
  await ctx.supabaseAdmin.from('vyral_dna_records').update({
    verification_status: 'verified',
    reconstruction_data: { source_preservation: 'original_binary_retained', reconstruction_ready: true,
      recovery_level: 'decoded-samples-exact', encoded_source_bytes_recoverable: false, chunk_count: tiles.length,
      verified_at: testedAt, verification_method: 'persisted-dna-tile-readback-and-fresh-decode' },
  }).eq('id', row.id).eq('asset_id', asset.id).eq('user_id', userId);
  return reply({ status: 'passed', assetId, versionId, dnaRecordId, verificationTestId: testId,
    verifiedTiles: tiles.length, decodedSamplesSha256: await sha256(rebuilt), dimensions: { width, height }, channelLayout: layout,
    originalBytesUnchanged: true, comparisonMode: 'decoded_exact' });
});
