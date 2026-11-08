import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { assessVyralAssetDnaV1, type VyralAssetDnaAssessmentInput } from '../../../src/services/vyralAssetDnaAssessmentV1.ts';

const BUCKET = 'vyral-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sha256 = async (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const verifyDecodedPayload = async (
  admin: any, userId: string, vyralId: string, assetId: string, recordId: string, payload: any,
): Promise<boolean> => {
  const dna = payload?.dna_record;
  const decoded = dna?.decoded_image;
  const tiles = dna?.lossless_payload?.tiles;
  const paths = payload?.tile_storage_paths;
  const prefix = payload?.storage_prefix;
  const expectedPrefix = userId + '/' + vyralId + '/' + assetId + '/dna/v3/' + recordId + '/tiles/';
  if (!isObject(dna) || dna.record_id !== recordId || dna.schema_id !== 'vyra.asset-dna' ||
      dna.schema_version !== 3 || !isObject(decoded) || !Array.isArray(tiles) ||
      !Array.isArray(paths) || tiles.length === 0 || paths.length !== tiles.length ||
      prefix !== expectedPrefix || decoded.sample_format !== 'uint8' ||
      !['RGB','RGBA'].includes(decoded.channel_layout) || decoded.decoder_contract?.name !== 'ImageMagick WASM' ||
      decoded.decoder_contract?.version !== '0.0.30' || !SHA.test(String(decoded.decoded_samples_sha256))) {
    return false;
  }
  const width = Number(decoded.width), height = Number(decoded.height);
  const channels = decoded.channel_layout === 'RGB' ? 3 : 4;
  const pixelCount = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || !Number.isSafeInteger(pixelCount) || pixelCount > 8_000_000) return false;
  const reconstructed = new Uint8Array(pixelCount * channels);
  const coverage = new Uint8Array(pixelCount);
  const expectedPaths = new Set<string>();
  for (const tile of tiles) {
    if (!isObject(tile) || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) ||
        !Number.isSafeInteger(tile.width) || !Number.isSafeInteger(tile.height) ||
        tile.x < 0 || tile.y < 0 || tile.x % 128 !== 0 || tile.y % 128 !== 0 ||
        tile.width !== Math.min(128, width - tile.x) ||
        tile.height !== Math.min(128, height - tile.y) ||
        !Number.isSafeInteger(tile.byte_length) || tile.byte_length !== tile.width * tile.height * channels ||
        !SHA.test(String(tile.sha256))) return false;
    const path = prefix + tile.x + '_' + tile.y + '.raw';
    if (expectedPaths.has(path) || !paths.includes(path)) return false;
    expectedPaths.add(path);
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data || data.size !== tile.byte_length) return false;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (await sha256(bytes) !== tile.sha256) return false;
    for (let row = 0; row < tile.height; row += 1) {
      const sourceStart = row * tile.width * channels;
      const targetStart = (tile.y + row) * width * channels + tile.x * channels;
      for (let col = 0; col < tile.width; col += 1) {
        const pixelIndex = (tile.y + row) * width + tile.x + col;
        if (coverage[pixelIndex]) return false;
        coverage[pixelIndex] = 1;
      }
      reconstructed.set(bytes.subarray(sourceStart, sourceStart + tile.width * channels), targetStart);
    }
  }
  if (expectedPaths.size !== paths.length || !paths.every((path: string) => expectedPaths.has(path)) ||
      coverage.some((covered) => covered !== 1)) return false;
  return await sha256(reconstructed) === String(decoded.decoded_samples_sha256).toLowerCase();
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return reply({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: 'Request body must be valid JSON.' }, 400); }
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  if (!userId || !UUID.test(assetId)) {
    return reply({ error: 'A valid Asset ID is required.' }, 400);
  }

  const assetResult = await context.supabaseAdmin.from('vyral_assets')
    .select('id,vyral_id,user_id,sha256,size_bytes,processing_status')
    .eq('id', assetId).eq('user_id', userId).maybeSingle();
  if (assetResult.error) return reply({ error: 'Could not load the owner-scoped Asset.' }, 500);
  const asset = assetResult.data;
  if (!asset) return reply({ error: 'Asset was not found for this account.' }, 404);
  const [versionResult, dnaResult] = await Promise.all([
    context.supabaseAdmin.from('vyral_asset_versions')
      .select('id,asset_id,vyral_id,user_id,sha256,size_bytes,version_number')
      .eq('asset_id', assetId).eq('user_id', userId)
      .order('version_number', { ascending: false }).limit(1).maybeSingle(),
    context.supabaseAdmin.from('vyral_dna_records')
      .select('id,vyral_id,user_id,asset_id,schema_version,payload,reconstruction_data,verification_status,created_at')
      .eq('asset_id', assetId).eq('user_id', userId).eq('scope', 'asset')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (versionResult.error || dnaResult.error) return reply({ error: 'Could not resolve the latest owner-scoped Asset Version and DNA record.' }, 500);
  const version = versionResult.data, dnaRow = dnaResult.data;
  if (!asset || !version || !dnaRow) return reply({ error: 'Asset, source Version, or DNA record was not found for this account.' }, 404);
  const versionId = version.id;
  const dnaRecordId = dnaRow.id;
  if (asset.vyral_id !== version.vyral_id || dnaRow.vyral_id !== asset.vyral_id ||
      asset.processing_status !== 'ready' || !SHA.test(String(version.sha256)) ||
      !Number.isSafeInteger(Number(version.size_bytes)) || Number(version.size_bytes) <= 0) {
    return reply({ error: 'Asset, Version and DNA ownership or source metadata is inconsistent.' }, 409);
  }

  const payload = isObject(dnaRow.payload) ? dnaRow.payload : {};
  const record = isObject(payload.dna_record) ? payload.dna_record : null;
  const fileSource = isObject(record?.source) ? record.source : {};
  const legacySource = isObject(payload.source) ? payload.source : {};
  const sourceAssetId = String(fileSource.asset_id ?? legacySource.asset_id ?? '');
  const sourceVersionId = String(fileSource.asset_version_id ?? legacySource.asset_version_id ?? payload.source_version_id ?? '');
  const sourceSha = String(fileSource.sha256 ?? record?.file?.sha256 ?? legacySource.sha256 ?? payload.source_file_sha256 ?? '').toLowerCase();
  const sourceSize = Number(fileSource.size_bytes ?? record?.file?.size_bytes ?? legacySource.size_bytes ?? payload.source_size_bytes ?? 0);
  const schemaId = String(record?.schema_id ?? payload.dna_schema_id ?? 'vyra.asset-file-dna');
  const schemaVersion = Number(record?.schema_version ?? payload.dna_schema_version ?? dnaRow.schema_version);
  const hasV3Shape = isObject(record?.decoded_image) && isObject(record?.lossless_payload);
  const hasFileDnaShape = isObject(record?.file) && isObject(record?.reconstruction);
  const schemaValid = isObject(record) && record.record_id === dnaRecordId &&
    Number(record.schema_version) === Number(dnaRow.schema_version) &&
    typeof record.schema_id === 'string' && isObject(record.source) &&
    (hasV3Shape || hasFileDnaShape);

  const sourceBinding = sourceAssetId === assetId && sourceVersionId === versionId &&
    sourceSha === String(version.sha256).toLowerCase() && sourceSize === Number(version.size_bytes);
  let declaredLevel: VyralAssetDnaAssessmentInput['recovery']['declaredLevel'] = 'unavailable';
  let payloadPresent = false;
  let payloadIntegrityVerified = false;
  const recoveryData = isObject(dnaRow.reconstruction_data) ? dnaRow.reconstruction_data : {};
  if (recoveryData.recovery_level === 'decoded-samples-exact' ||
      (recoveryData.encoding === 'raw-tiled-v1' && Array.isArray(payload.tile_storage_paths) && payload.tile_storage_paths.length > 0)) {
    declaredLevel = 'decoded_samples_exact';
    payloadPresent = Array.isArray(payload.tile_storage_paths) && payload.tile_storage_paths.length > 0;
    if (payloadPresent && sourceBinding && schemaValid) {
      payloadIntegrityVerified = await verifyDecodedPayload(
        context.supabaseAdmin, userId, asset.vyral_id, assetId, dnaRecordId, payload,
      );
    }
  } else if (recoveryData.eligible_for_dna_only_reconstruction === true) {
    declaredLevel = 'semantic_only';
  } else if (isObject(record) && isObject(record.reconstruction) &&
      record.reconstruction.claim === 'source_file_exact') {
    // A manifest claim without a verified, server-addressable payload is not recoverable evidence.
    declaredLevel = 'unavailable';
  } else if (Object.keys(payload).length > 0) {
    declaredLevel = 'semantic_only';
  }

  const { data: tests, error: testsError } = await context.supabaseAdmin
    .from('vyral_reconstruction_tests')
    .select('id,asset_version_id,dna_record_id,comparison_mode,test_status,exact_match,model_id,created_at')
    .eq('asset_id', assetId).eq('asset_version_id', versionId).eq('dna_record_id', dnaRecordId)
    .order('created_at', { ascending: false }).limit(100);
  if (testsError) return reply({ error: 'Could not load pinned reconstruction test history.' }, 500);
  const trusted = (tests ?? []).filter((row: any) =>
    ['universal-file-dna-v1-readback-verifier','vyral-dna-v3-readback-verifier','ORIGIN-01-readback-verifier'].includes(row.model_id)
  );
  const latestByVerifier = new Map<string, any>();
  for (const row of trusted) {
    if (!Number.isFinite(Date.parse(row.created_at))) return reply({ error: 'Trusted reconstruction test timestamp is invalid.' }, 409);
    const previous = latestByVerifier.get(row.model_id);
    if (!previous) latestByVerifier.set(row.model_id, row);
    else if (Date.parse(row.created_at) === Date.parse(previous.created_at)) {
      return reply({ error: 'Latest trusted reconstruction result is timestamp-ambiguous.' }, 409);
    }
  }
  const latestTrusted = [...latestByVerifier.values()];
  const failedTest = latestTrusted.find((row) => row.test_status === 'failed' && row.exact_match === false);
  const selectedTest = failedTest ?? latestTrusted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  let exactTest: VyralAssetDnaAssessmentInput['recovery']['exactTest'] = null;
  if (selectedTest) {
    exactTest = {
      status: selectedTest.test_status === 'passed' && selectedTest.exact_match === true ? 'passed'
        : selectedTest.test_status === 'failed' && selectedTest.exact_match === false ? 'failed' : 'not_run',
      mode: selectedTest.comparison_mode === 'byte_exact' ? 'source_file_exact'
        : selectedTest.comparison_mode === 'decoded_exact' ? 'decoded_samples_exact' : null,
      assetVersionId: selectedTest.asset_version_id,
      dnaRecordId: selectedTest.dna_record_id,
      sourceSha256: sourceSha,
    };
  }

  const structureFacts = Array.isArray(record?.structure?.facts) ? record.structure.facts.length
    : Array.isArray(record?.knowledge?.facts) ? record.knowledge.facts.length
    : Array.isArray(payload.knowledge_facts) ? payload.knowledge_facts.length : 0;
  const input: VyralAssetDnaAssessmentInput = {
    assetId, assetVersionId: versionId, sourceSha256: String(version.sha256).toLowerCase(),
    sourceSizeBytes: Number(version.size_bytes), dnaRecordId, dnaSchemaId: schemaId,
    dnaSchemaVersion: schemaVersion,
    dnaSource: { assetId: sourceAssetId, assetVersionId: sourceVersionId, sha256: sourceSha, sizeBytes: sourceSize },
    structure: {
      schemaValid: Boolean(schemaValid),
      provenanceVerified: ['independently_verified','corroborated'].includes(String(dnaRow.verification_status)),
      knowledgeFactCount: structureFacts,
    },
    recovery: { declaredLevel, payloadPresent, payloadIntegrityVerified, exactTest },
  };
  let assessment;
  try { assessment = assessVyralAssetDnaV1(input); }
  catch (error) { return reply({ error: error instanceof Error ? error.message : 'Asset DNA assessment input is invalid.' }, 422); }

  const { data: saved, error: saveError } = await context.supabaseAdmin
    .from('vyral_asset_dna_assessments')
    .insert({
      vyral_id: asset.vyral_id, user_id: userId, asset_id: assetId,
      asset_version_id: versionId, dna_record_id: dnaRecordId,
      source_sha256: String(version.sha256).toLowerCase(),
      assessment_version: assessment.assessmentVersion, status: assessment.status,
      recovery_level: assessment.recoveryLevel, assessment,
    }).select('id,created_at').single();
  if (saveError || !saved) return reply({ error: 'Assessment could not be saved to Asset DNA history.', detail: saveError?.message ?? null }, 500);
  return reply({ status: 'assessed', assessmentId: saved.id, createdAt: saved.created_at, assessment });
});
