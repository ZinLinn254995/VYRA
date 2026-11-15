import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { getRunwayTask } from '../_shared/runwayMediaProvider.ts';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (typeof body.jobId !== 'string' || !UUID.test(body.jobId)) {
    return json({ error: 'A valid generation job ID is required.' }, 400);
  }

  const { data: claim, error: claimError } = await context.supabaseAdmin.rpc('claim_runway_media_task_poll', {
    p_user_id: userId, p_job_id: body.jobId,
  });
  if (claimError || !isRecord(claim)) return json({ error: 'The generation task could not be claimed for polling.' }, 503);
  if (claim.claimed !== true) {
    return json({
      job: { id: body.jobId, status: claim.status, providerTaskStatus: claim.provider_task_status ?? null,
        outputCount: claim.output_count ?? null },
      throttled: claim.throttled === true,
      message: claim.throttled === true
        ? 'Runway task polling is limited to one request every five seconds.'
        : 'This task is not currently eligible for polling.',
    }, claim.throttled === true ? 429 : 200);
  }

  const taskId = typeof claim.provider_task_id === 'string' ? claim.provider_task_id : '';
  const { data: apiKey, error: secretError } = await context.supabaseAdmin.rpc('get_vyra_runway_secret');
  if (secretError || typeof apiKey !== 'string' || !apiKey) {
    return json({ error: 'Provider credentials are unavailable. The task remains safely recorded for a later poll.' }, 503);
  }

  let snapshot;
  try {
    snapshot = await getRunwayTask(apiKey, taskId);
  } catch {
    return json({ error: 'Runway task status could not be retrieved. No task was resubmitted.' }, 502);
  }
  if (snapshot.status === 'unknown') {
    return json({ job: { id: body.jobId, status: 'unknown' },
      error: 'Runway returned an unrecognized task status. No output URL was exposed.' }, 502);
  }
  if (snapshot.status === 'succeeded' && snapshot.outputUrls.length === 0) {
    return json({ error: 'Runway marked the task successful but returned no usable output. The task remains available for reconciliation.' }, 502);
  }

  const { data: recorded, error: recordError } = await context.supabaseAdmin.rpc('record_runway_media_task_snapshot', {
    p_user_id: userId,
    p_job_id: body.jobId,
    p_provider_task_id: taskId,
    p_status: snapshot.status,
    p_failure_code: snapshot.failureCode,
    p_output_urls: snapshot.outputUrls,
    p_started_at: snapshot.createdAt,
    p_completed_at: snapshot.completedAt,
  });
  if (recordError || !isRecord(recorded) || recorded.recorded !== true) {
    return json({ error: 'The provider status was received but could not be durably recorded. Poll again after the five-second safety window.' }, 503);
  }

  return json({
    job: { id: body.jobId, status: recorded.status, providerTaskStatus: snapshot.status,
      outputCount: recorded.output_count ?? snapshot.outputUrls.length },
    message: snapshot.status === 'succeeded'
      ? 'Runway finished successfully. Output references are stored privately; Project Asset ingestion is still pending.'
      : snapshot.status === 'failed' ? 'Runway generation failed. No output was published.'
      : snapshot.status === 'cancelled' ? 'Runway generation was cancelled.'
      : 'Runway task status updated.',
  });
});
