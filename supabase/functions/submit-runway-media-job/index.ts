import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { isRunwayLiveSubmissionEnabled, submitRunwayTask, type RunwayTask } from '../_shared/runwayMediaProvider.ts';

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

  // Keep this endpoint inert until both platform and Runway submission switches are enabled.
  if (!isRunwayLiveSubmissionEnabled((name) => Deno.env.get(name))) {
    return json({ error: 'Live media generation is not enabled by the VYRA platform.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (typeof body.jobId !== 'string' || !UUID.test(body.jobId)) {
    return json({ error: 'A valid generation job ID is required.' }, 400);
  }

  // The database claim changes pending -> submitted/unknown before the provider call.
  // A second invocation can never submit the same job again automatically.
  const { data: claim, error: claimError } = await context.supabaseAdmin.rpc('claim_runway_media_job', {
    p_user_id: userId, p_job_id: body.jobId,
  });
  if (claimError || !isRecord(claim)) return json({ error: 'The generation job could not be claimed safely.' }, 503);
  if (claim.claimed !== true) {
    return json({ job: { status: claim.status, providerTaskId: claim.provider_task_id ?? null },
      message: 'This generation job has already been claimed. A second provider submission was not attempted.' }, 409);
  }

  const job = claim.job;
  const quote = claim.quote;
  if (!isRecord(job) || !isRecord(quote) || !['image', 'video', 'audio'].includes(String(quote.task)) ||
      typeof quote.provider_config_id !== 'string' || !isRecord(quote.request_payload) ||
      !isRecord(quote.request_payload.input)) {
    await context.supabaseAdmin.rpc('record_runway_media_submission', {
      p_user_id: userId, p_job_id: body.jobId, p_outcome: 'rejected',
      p_failure_code: 'claimed_payload_invalid',
    });
    return json({ error: 'The claimed job payload is incomplete and requires reconciliation.' }, 503);
  }

  const { data: apiKey, error: secretError } = await context.supabaseAdmin.rpc('get_vyra_runway_secret');
  if (secretError || typeof apiKey !== 'string' || !apiKey) {
    await context.supabaseAdmin.rpc('record_runway_media_submission', {
      p_user_id: userId, p_job_id: body.jobId, p_outcome: 'rejected',
      p_failure_code: 'provider_secret_unavailable',
    });
    return json({ error: 'Provider credentials are unavailable. The job was not resubmitted.' }, 503);
  }

  const result = await submitRunwayTask({
    apiKey,
    task: quote.task as RunwayTask,
    configId: quote.provider_config_id,
    input: quote.request_payload.input,
  });

  const outcome = result.outcome === 'accepted' ? 'accepted' : result.outcome === 'rejected' ? 'rejected' : 'unknown';
  const recordArgs = {
    p_user_id: userId,
    p_job_id: body.jobId,
    p_outcome: outcome,
    p_provider_task_id: result.outcome === 'accepted' ? result.taskId : null,
    p_provider_request_id: result.requestId,
    p_http_status: result.httpStatus,
    p_failure_code: result.outcome === 'accepted' ? null : result.code,
  };

  // Provider submission is never repeated here. Only retry the idempotent DB
  // recording step so an accepted provider task ID is not lost to a transient DB error.
  let recorded: unknown = null;
  let recordError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await context.supabaseAdmin.rpc('record_runway_media_submission', recordArgs);
    recorded = response.data;
    recordError = response.error;
    if (!recordError && isRecord(recorded) && recorded.recorded === true) break;
  }
  if (recordError || !isRecord(recorded) || recorded.recorded !== true) {
    return json({ error: 'The provider response was received but could not be durably recorded. Do not retry submission; reconcile this job.' }, 503);
  }

  if (result.outcome === 'accepted') {
    return json({ job: { id: body.jobId, status: 'submitted', providerTaskId: result.taskId },
      message: 'Runway accepted the task. VYRA saved the provider task ID; polling and Asset ingestion are the next lifecycle steps.' }, 202);
  }
  if (result.outcome === 'rejected') {
    return json({ job: { id: body.jobId, status: 'failed' }, error: 'Runway rejected the submission: ' + result.code },
      result.retryable ? 429 : 422);
  }
  return json({ job: { id: body.jobId, status: 'unknown' },
    error: 'The provider submission outcome is unknown. VYRA will not automatically submit it again.' }, 202);
});
