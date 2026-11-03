import { normalizeProviderUsage, isUsageLedgerServerEnabled, type NormalizedProviderUsage } from './usageLedgerContract.js';

type LedgerJob = { id: string; userId: string; idempotencyKey: string; attemptId: string; enabled: true } | { enabled: false };
type LedgerInput = {
  userId: string;
  idempotencyKey: string;
  model: string;
  messageCount: number;
  totalCharacters: number;
};
type Fetcher = typeof fetch;

function config() {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!isUsageLedgerServerEnabled() || !url || !key) return null;
  return { url, key };
}

async function restRequest(path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<Response> {
  const settings = config();
  if (!settings) throw new Error('USAGE_LEDGER_NOT_CONFIGURED');
  return fetcher(settings.url + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: settings.key,
      Authorization: 'Bearer ' + settings.key,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error('USAGE_LEDGER_WRITE_FAILED_' + response.status);
}

export async function beginOpenRouterTextUsageJob(input: LedgerInput, fetcher: Fetcher = fetch): Promise<LedgerJob> {
  if (!config()) return { enabled: false };
  const jobResponse = await restRequest(
    'generation_jobs?on_conflict=user_id,idempotency_key&select=id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: input.userId,
        idempotency_key: input.idempotencyKey,
        capability: 'text',
        model_id: input.model,
        status: 'pending',
        estimate_status: 'unavailable',
        estimated_cost_usd: null,
        request_parameters: {
          message_count: Math.max(0, Math.min(12, Math.trunc(input.messageCount))),
          total_characters: Math.max(0, Math.min(30000, Math.trunc(input.totalCharacters))),
          billing_mode: 'byok',
        },
      }),
    }, fetcher,
  );
  await requireOk(jobResponse);
  const jobs = await jobResponse.json() as Array<{ id?: unknown }>;
  const jobId = jobs[0]?.id;
  if (typeof jobId !== 'string') {
    // Existing idempotency key: never submit the same paid provider request twice.
    throw new Error('USAGE_LEDGER_DUPLICATE_REQUEST');
  }

  let attemptId: string;
  try {
    const attemptResponse = await restRequest('provider_attempts?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: input.userId,
        generation_job_id: jobId,
        provider: 'openrouter',
        model_id: input.model,
        status: 'submitted',
        usage: { billing_mode: 'byok' },
      }),
    }, fetcher);
    await requireOk(attemptResponse);
    const attempts = await attemptResponse.json() as Array<{ id?: unknown }>;
    if (typeof attempts[0]?.id !== 'string') throw new Error('USAGE_LEDGER_ATTEMPT_CREATE_FAILED');
    attemptId = attempts[0].id;

    const updateResponse = await restRequest('generation_jobs?id=eq.' + encodeURIComponent(jobId), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'submitted', updated_at: new Date().toISOString() }),
    }, fetcher);
    await requireOk(updateResponse);
  } catch (error) {
    await restRequest('generation_jobs?id=eq.' + encodeURIComponent(jobId), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
    }, fetcher).catch(() => undefined);
    throw error;
  }
  return { enabled: true, id: jobId, userId: input.userId, idempotencyKey: input.idempotencyKey, attemptId };
}

export async function finishOpenRouterTextUsageJob(
  job: LedgerJob,
  result: { status: 'succeeded' | 'failed' | 'unknown'; model: string; usage?: unknown },
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (!job.enabled) return;
  const usage: NormalizedProviderUsage = normalizeProviderUsage(result.usage);
  const attemptResponse = await restRequest('provider_attempts?id=eq.' + encodeURIComponent(job.attemptId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: result.status,
      completed_at: result.status === 'unknown' ? null : new Date().toISOString(),
      provider_request_id: usage.generationId,
      usage: {
        ...(usage.promptTokens === undefined ? {} : { prompt_tokens: usage.promptTokens }),
        ...(usage.completionTokens === undefined ? {} : { completion_tokens: usage.completionTokens }),
        ...(usage.totalTokens === undefined ? {} : { total_tokens: usage.totalTokens }),
        billing_mode: 'byok',
      },
    }),
  }, fetcher);
  await requireOk(attemptResponse);

  const jobResponse = await restRequest('generation_jobs?id=eq.' + encodeURIComponent(job.id), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: result.status, updated_at: new Date().toISOString() }),
  }, fetcher);
  await requireOk(jobResponse);

  // Only a finite, non-negative provider-reported cost is actual cost. Unknown stays unknown.
  if (result.status === 'succeeded' && usage.costUsd !== null) {
    const costResponse = await restRequest('rpc/record_provider_cost', {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: job.userId,
        p_generation_job_id: job.id,
        p_provider_attempt_id: job.attemptId,
        p_idempotency_key: job.id + ':actual-cost',
        p_provider: 'openrouter',
        p_model_id: result.model,
        p_provider_generation_id: usage.generationId,
        p_actual_cost_usd: usage.costUsd,
        p_usage: {
          ...(usage.promptTokens === undefined ? {} : { prompt_tokens: usage.promptTokens }),
          ...(usage.completionTokens === undefined ? {} : { completion_tokens: usage.completionTokens }),
          ...(usage.totalTokens === undefined ? {} : { total_tokens: usage.totalTokens }),
        },
        p_source: 'provider_usage',
      }),
    }, fetcher);
    await requireOk(costResponse);
  }
}
