import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { verifyVyralFileDnaSourceV1 } from '../_shared/vyralFileDnaVerifierV1.ts';

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
    .select('id,vyral_id,user_id,name,mime_type,storage_path,sha256,size_bytes')
    .eq('id', body.assetId)
    .eq('user_id', userId)
    .maybeSingle();
  if (assetError) return json({ error: 'Could not verify asset ownership.' }, 500);
  if (!asset) return json({ error: 'Asset not found.' }, 404);

  const { data: version, error: versionError } = await context.supabase
    .from('vyral_asset_versions')
    .select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,version_number,mime_type')
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
  const expectedHashes = [
    ...(typeof version.sha256 === 'string' ? [version.sha256] : []),
    ...(currentAssetVersion && typeof asset.sha256 === 'string' ? [asset.sha256] : []),
  ];
  const expectedSizes = [
    expectedSize,
    ...(currentAssetVersion && Number.isSafeInteger(Number(asset.size_bytes)) ? [Number(asset.size_bytes)] : []),
  ];
  const sizeMatches = expectedSizes.every((size) => actualSize === size);
  const hashMatches = expectedHashes.every((hash) => hash.toLowerCase() === actualSha256);
  const comparisonStatus = !sizeMatches || !hashMatches ? 'mismatch' : expectedHashes.length === 0 ? 'baseline_created' : 'matched';
  const verifiedAt = new Date().toISOString();
  const expectedSha256 = expectedHashes.length ? expectedHashes[0] : null;

  const fingerprintMetadata = {
    verification_status: 'server_verified',
    comparison_status: comparisonStatus,
    verified_by: FUNCTION_ID,
    verified_at: verifiedAt,
    source: 'private_storage_download',
    expected_sha256: expectedHashes,
    actual_size_bytes: actualSize,
    expected_size_bytes: expectedSizes,
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

  if (typeof version.sha256 !== 'string' || (currentAssetVersion && typeof asset.sha256 !== 'string')) {
    if (typeof version.sha256 !== 'string') {
      const { error: versionUpdateError } = await context.supabaseAdmin
        .from('vyral_asset_versions')
        .update({ sha256: actualSha256 })
        .eq('id', version.id)
        .eq('user_id', userId);
      if (versionUpdateError) return json({ error: 'Hash was verified but could not be saved to the asset version.' }, 500);
    }
    if (currentAssetVersion && typeof asset.sha256 !== 'string') {
      const { error: assetUpdateError } = await context.supabaseAdmin
        .from('vyral_assets')
        .update({ sha256: actualSha256 })
        .eq('id', asset.id)
        .eq('user_id', userId);
      if (assetUpdateError) return json({ error: 'Hash was verified but could not be saved to the asset record.' }, 500);
    }
  }

  // A non-raster upload starts with a compact File DNA identity record. Verify
  // that its protected source can be split into canonical chunks and rebuilt
  // byte-for-byte, then persist a version-pinned exact-readback acceptance row.
  let sourceFileReconstruction: 'byte_exact' | null = null;
  const { data: dnaRows, error: dnaLookupError } = await context.supabaseAdmin
    .from('vyral_dna_records')
    .select('id,schema_version,payload')
    .eq('asset_id', asset.id)
    .eq('vyral_id', asset.vyral_id)
    .eq('user_id', userId)
    .eq('scope', 'asset')
    .eq('schema_version', 1)
    .order('created_at', { ascending: false })
    .limit(50);
  if (dnaLookupError) return json({ error: 'Could not load File DNA for exact source verification.' }, 500);

  const fileDnaRow = (dnaRows ?? []).find((row: Record<string, unknown>) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
    const record = payload.dna_record && typeof payload.dna_record === 'object' ? payload.dna_record as Record<string, unknown> : {};
    const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : {};
    return (payload.dna_schema_id === 'vyra.asset-file-dna' || record.schema_id === 'vyra.asset-file-dna') &&
      (source.asset_version_id === version.id || payload.source_version_id === version.id);
  }) as Record<string, unknown> | undefined;

  if (fileDnaRow) {
    const payload = fileDnaRow.payload as Record<string, unknown>;
    const fileDnaRecord = payload.dna_record as Record<string, unknown>;
    let readback;
    try {
      readback = await verifyVyralFileDnaSourceV1({
        record: fileDnaRecord,
        assetId: asset.id,
        versionId: version.id,
        sourceBytes: new Uint8Array(bytes),
        expectedSha256: actualSha256,
        expectedSizeBytes: actualSize,
        expectedMimeType: String(version.mime_type || asset.mime_type || 'application/octet-stream').toLowerCase(),
      });
    } catch (error) {
      return json({
        error: error instanceof Error ? error.message : 'File DNA exact source verification failed.',
        status: 'file_dna_verification_failed',
        assetId: asset.id,
        versionId: version.id,
      }, 409);
    }

    const fileRecord = fileDnaRecord.file && typeof fileDnaRecord.file === 'object'
      ? fileDnaRecord.file as Record<string, unknown> : {};
    const reconstruction = fileDnaRecord.reconstruction && typeof fileDnaRecord.reconstruction === 'object'
      ? fileDnaRecord.reconstruction as Record<string, unknown> : {};
    const recordId = typeof fileDnaRecord.record_id === 'string' ? fileDnaRecord.record_id : String(fileDnaRow.id);
    const chunkSize = 1024 * 1024;
    const chunkCount = Math.ceil(actualSize / chunkSize);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(recordId) || chunkCount < 1 || chunkCount > 100) {
      return json({ error: 'File DNA chunk inventory exceeds the supported exact-recovery limits.' }, 413);
    }

    const chunkMetadata: Array<Record<string, unknown>> = [];
    const chunkStoragePaths: string[] = [];
    const uploadedPaths: string[] = [];
    let dnaRecordUpdated = false;
    const storage = context.supabaseAdmin.storage.from(BUCKET);
    const prefix = userId + '/' + asset.vyral_id + '/' + asset.id + '/dna/file/v1/' + recordId + '/chunks/';
    try {
      // Persist the actual DNA payload, not merely hashes derived transiently
      // from the original source. Every stored chunk is read back and verified.
      for (let offset = 0, index = 0; offset < actualSize; offset += chunkSize, index += 1) {
        const chunk = new Uint8Array(bytes.slice(offset, Math.min(offset + chunkSize, actualSize)));
        const digest = await sha256Hex(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        const packagePath = 'dna/file/v1/' + recordId + '/chunks/' + index.toString().padStart(8, '0') + '.bin';
        const storagePath = prefix + index.toString().padStart(8, '0') + '.bin';
        const { error: uploadError } = await storage.upload(storagePath, new Blob([chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)]), {
          contentType: 'application/octet-stream',
          upsert: true,
          cacheControl: '31536000',
        });
        if (uploadError) throw new Error('Could not persist a File DNA reconstruction chunk.');
        uploadedPaths.push(storagePath);
        chunkStoragePaths.push(storagePath);
        chunkMetadata.push({ index, byte_length: chunk.byteLength, sha256: digest, package_path: packagePath });
      }

      const rebuilt = new Uint8Array(actualSize);
      let rebuiltOffset = 0;
      for (let index = 0; index < chunkStoragePaths.length; index += 1) {
        const { data: storedChunk, error: readError } = await storage.download(chunkStoragePaths[index]);
        if (readError || !storedChunk) throw new Error('Could not read back a persisted File DNA chunk.');
        const storedBytes = new Uint8Array(await storedChunk.arrayBuffer());
        const expected = chunkMetadata[index];
        const digest = await sha256Hex(storedBytes.buffer.slice(storedBytes.byteOffset, storedBytes.byteOffset + storedBytes.byteLength));
        if (storedBytes.byteLength !== expected.byte_length || digest !== expected.sha256) {
          throw new Error('A persisted File DNA chunk failed its byte-length or SHA-256 check.');
        }
        rebuilt.set(storedBytes, rebuiltOffset);
        rebuiltOffset += storedBytes.byteLength;
      }
      const rebuiltSha = await sha256Hex(rebuilt.buffer);
      if (rebuiltOffset !== actualSize || rebuiltSha !== actualSha256) {
        throw new Error('Persisted File DNA chunks did not reconstruct the exact original source bytes.');
      }

      const updatedRecord = {
        ...fileDnaRecord,
        reconstruction: {
          claim: 'source_file_exact',
          payload_encoding: 'raw-chunks-v1',
          chunk_size: chunkSize,
          chunks: chunkMetadata,
        },
      };
      const updatedPayload = {
        ...payload,
        dna_record: updatedRecord,
        chunk_storage_paths: chunkStoragePaths,
      };
      const { error: dnaUpdateError } = await context.supabaseAdmin
        .from('vyral_dna_records')
        .update({
          payload: updatedPayload,
          reconstruction_data: {
            source_preservation: 'original_binary_retained',
            reconstruction_ready: true,
            recovery_level: 'source-file-exact',
            encoded_source_bytes_recoverable: true,
            chunk_count: chunkCount,
            chunk_size: chunkSize,
            verified_at: verifiedAt,
            verification_method: 'persisted-dna-chunk-readback',
          },
          verification_status: 'verified',
        })
        .eq('id', fileDnaRow.id)
        .eq('asset_id', asset.id)
        .eq('user_id', userId);
      if (dnaUpdateError) throw new Error('Exact File DNA was reconstructed but its verified payload could not be saved.');
      dnaRecordUpdated = true;

      const { data: existingExactTest, error: exactTestLookupError } = await context.supabaseAdmin
        .from('vyral_reconstruction_tests')
        .select('id')
        .eq('asset_id', asset.id)
        .eq('asset_version_id', version.id)
        .eq('dna_record_id', fileDnaRow.id)
        .eq('comparison_mode', 'byte_exact')
        .eq('test_status', 'passed')
        .eq('exact_match', true)
        .limit(1)
        .maybeSingle();
      if (exactTestLookupError) throw new Error('Could not inspect existing exact reconstruction evidence.');
      if (!existingExactTest) {
        const { error: exactTestInsertError } = await context.supabaseAdmin
          .from('vyral_reconstruction_tests')
          .insert({
            vyral_id: asset.vyral_id,
            user_id: userId,
            asset_id: asset.id,
            asset_version_id: version.id,
            dna_record_id: fileDnaRow.id,
            model_provider: 'VYRA',
            model_id: 'universal-file-dna-v1-readback-verifier',
            protocol_version: 'file-dna-v1-readback-2',
            comparison_mode: 'byte_exact',
            test_status: 'passed',
            exact_match: true,
            similarity_score: 1,
            verifier: {
              function: FUNCTION_ID,
              method: 'persisted-dna-chunk-readback-and-byte-exact-reassembly',
              hash_algorithm: 'SHA-256',
              chunk_size: chunkSize,
              chunk_count: chunkCount,
            },
            report: {
              original_sha256: actualSha256,
              reconstructed_sha256: rebuiltSha,
              original_size_bytes: actualSize,
              reconstructed_size_bytes: rebuiltOffset,
              chunk_sha256: chunkMetadata.map((item) => item.sha256),
              byte_for_byte_equal: true,
              source_storage_path: version.storage_path,
              dna_chunk_storage_paths: chunkStoragePaths,
            },
            tested_at: verifiedAt,
          });
        if (exactTestInsertError) throw new Error('Exact File DNA reconstruction passed but its acceptance evidence could not be saved.');
      }
      sourceFileReconstruction = 'byte_exact';
    } catch (error) {
      if (!dnaRecordUpdated && uploadedPaths.length) await storage.remove(uploadedPaths);
      return json({
        error: error instanceof Error ? error.message : 'File DNA exact reconstruction failed.',
        status: 'file_dna_verification_failed',
        assetId: asset.id,
        versionId: version.id,
      }, 409);
    }
  }

  return json({
    status: 'verified',
    assetId: asset.id,
    versionId: version.id,
    sha256: actualSha256,
    sizeBytes: actualSize,
    verifiedAt,
    sourceFileReconstruction,
  });
});
