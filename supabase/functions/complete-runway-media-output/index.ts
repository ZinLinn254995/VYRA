import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const BUCKET = 'vyral-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!UUID.test(userId)) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (typeof body.jobId !== 'string' || !UUID.test(body.jobId) ||
      !Number.isInteger(body.outputIndex) || Number(body.outputIndex) < 0 || Number(body.outputIndex) > 15 ||
      typeof body.assetId !== 'string' || !UUID.test(body.assetId) ||
      typeof body.assetVersionId !== 'string' || !UUID.test(body.assetVersionId)) {
    return json({ error: 'A valid job, output, Asset and Asset Version are required.' }, 400);
  }

  const { data: job, error: jobError } = await context.supabaseAdmin.from('generation_jobs')
    .select('target_vyral_id').eq('id', body.jobId).eq('user_id', userId).maybeSingle();
  if (jobError || !job?.target_vyral_id) return json({ error: 'The Project generation destination could not be verified.' }, 404);

  const { data: output, error: outputError } = await context.supabaseAdmin.from('media_generation_job_outputs')
    .select('transfer_status,storage_path,sha256,mime_type,size_bytes')
    .eq('job_id', body.jobId).eq('output_index', body.outputIndex).maybeSingle();
  if (outputError || !output || !['stored', 'ingesting', 'ingested'].includes(output.transfer_status)) {
    return json({ error: 'The privately stored generation output is not ready for completion.' }, 409);
  }

  const { data: asset, error: assetError } = await context.supabaseAdmin.from('vyral_assets')
    .select('id,vyral_id,user_id,processing_status,storage_path,mime_type,size_bytes,sha256')
    .eq('id', body.assetId).eq('user_id', userId).maybeSingle();
  if (assetError || !asset || asset.vyral_id !== job.target_vyral_id || asset.processing_status !== 'ready') {
    return json({ error: 'The canonical Project Asset has not passed its readiness gate.' }, 409);
  }
  const { data: version, error: versionError } = await context.supabaseAdmin.from('vyral_asset_versions')
    .select('id,asset_id,vyral_id,user_id,storage_path,mime_type,size_bytes,sha256')
    .eq('id', body.assetVersionId).eq('asset_id', body.assetId).eq('user_id', userId).maybeSingle();
  if (versionError || !version || version.vyral_id !== job.target_vyral_id ||
      version.storage_path !== asset.storage_path || version.sha256 !== asset.sha256 ||
      version.mime_type !== asset.mime_type || Number(version.size_bytes) !== Number(asset.size_bytes) ||
      output.sha256 !== asset.sha256 || output.mime_type !== asset.mime_type ||
      Number(output.size_bytes) !== Number(asset.size_bytes)) {
    return json({ error: 'The Asset Version does not match the verified generation output bytes.' }, 409);
  }

  const [{ data: dna, error: dnaError }, { data: fingerprint, error: fingerprintError }] = await Promise.all([
    context.supabaseAdmin.from('vyral_dna_records').select('id').eq('asset_id', body.assetId).eq('user_id', userId).limit(1),
    context.supabaseAdmin.from('vyral_fingerprints').select('id').eq('asset_id', body.assetId)
      .eq('asset_version_id', body.assetVersionId).eq('user_id', userId)
      .eq('algorithm', 'SHA-256').eq('value', asset.sha256).limit(1),
  ]);
  if (dnaError || fingerprintError || !dna?.length || !fingerprint?.length) {
    return json({ error: 'The Asset DNA or SHA-256 Fingerprint evidence is missing.' }, 409);
  }

  const { data: recorded, error: recordError } = await context.supabaseAdmin.rpc('record_runway_output_transfer', {
    p_user_id: userId, p_job_id: body.jobId, p_output_index: body.outputIndex,
    p_status: 'ingested', p_storage_path: asset.storage_path,
    p_asset_id: asset.id, p_asset_version_id: version.id,
    p_sha256: asset.sha256, p_mime_type: asset.mime_type, p_size_bytes: asset.size_bytes,
  });
  if (recordError || !isRecord(recorded) || recorded.recorded !== true) {
    return json({ error: 'The ready Asset exists, but the generation completion record needs a safe retry.' }, 503);
  }

  const expectedStagingPrefix = userId + '/' + job.target_vyral_id + '/.runway-staging/' + body.jobId + '/' + body.outputIndex + '.';
  let stagingCleanup = 'not_needed';
  if (typeof output.storage_path === 'string' && output.storage_path.startsWith(expectedStagingPrefix) &&
      output.storage_path !== asset.storage_path) {
    const { error: cleanupError } = await context.supabaseAdmin.storage.from(BUCKET).remove([output.storage_path]);
    stagingCleanup = cleanupError ? 'pending' : 'complete';
  }
  return json({
    jobId: body.jobId, outputIndex: body.outputIndex, status: 'ingested',
    assetId: asset.id, assetVersionId: version.id, sha256: asset.sha256,
    stagingCleanup,
    message: 'The Project Asset passed canonical DNA and Fingerprint checks and is now recorded as ready.',
  });
});
