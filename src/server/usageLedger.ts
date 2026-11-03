import {
  normalizeProviderUsage,
  type NormalizedProviderUsage,
} from './usageLedgerContract.js';

export type UsageLedgerServerOptions = {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetcher?: typeof fetch;
};

export type OpenRouterTextJobInput = {
  userId: string;
  idempotencyKey: string;
  model: string;
  messageCount: number;
  inputCharacters: number;
};

export type OpenRouterTextJob = {
  jobId: string;
  attemptId: string;
};

export type UsageLedgerResult =
  | { ok: true; job: OpenRouterTextJob }
  | { ok: false; reason: 'duplicate' | 'unavailable' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readOptions(options: UsageLedgerServerOptions) {
  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceRoleKey = (options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return { supabaseUrl, serviceRoleKey, fetcher: options.fetcher ?? fetch };
}

function serviceHeaders(serviceRoleKey: string, extra: Record<string, string> = {}): Headers {
  return new Headers({
    apikey: serviceRoleKey,
    Authorization: 'Bearer ' + serviceRoleKey,
    Accept: 'application/json',
    ...extra,
  });
}

async function patchJob(
  options: UsageLedgerServerOptions,
  userId: string,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { supabaseUrl, serviceRoleKey, fetcher } = readOptions(options);
  if (!supabaseUrl || !serviceRoleKey) return false;
  const endpoint = new URL('/rest/v1/generation_jobs', supabaseUrl);
  endpoint.searchParams.set('id', 'eq.' + jobId);
  endpoint.searchParams.set('user_id', 'eq.' + userId);
  try {
    const response = await fetcher(endpoint, {
      method: 'PATCH',
      headers: serviceHeaders(serviceRoleKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function beginOpenRouterTextJob(
  input: OpenRouterTextJobInput,
  options: UsageLedgerServerOptions = {},
): Promise<UsageLedgerResult> {
  const { supabaseUrl, serviceRoleKey, fetcher } = readOptions(options);
  if (!supabaseUrl || !serviceRoleKey || !UUID_PATTERN.test(input.userId)
      || !/^[A-Za-z0-9._:-]{1,160}$/.test(input.idempotencyKey)
      || !input.model.trim() || input.model.length > 240) {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    const jobsEndpoint = new URL('/rest/v1/generation_jobs', supabaseUrl);
    jobsEndpoint.searchParams.set('on_conflict', 'user_id,idempotency_key');
    const jobResponse = await fetcher(jobsEndpoint, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify({
        user_id: input.userId,
        idempotency_key: input.idempotencyKey,
        capability: 'text',
        model_id: input.model.trim(),
        status: 'pending',
        estimate_status: 'unavailable',
        estimated_cost_usd: null,
        request_parameters: {
          messageCount: Math.max(0, Math.min(12, Math.trunc(input.messageCount))),
          inputCharacters: Math.max(0, Math.min(30000, Math.trunc(input.inputCharacters))),
        },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!jobResponse.ok) return { ok: false, reason: 'unavailable' };
    const rows: unknown = await jobResponse.json();
    const created = Array.isArray(rows) ? asRecord(rows[0]) : {};
    const jobId = typeof created.id === 'string' && UUID_PATTERN.test(created.id) ? created.id : '';
    if (!jobId) return { ok: false, reason: 'duplicate' };

    const attemptsEndpoint = new URL('/rest/v1/provider_attempts', supabaseUrl);
    const attemptResponse = await fetcher(attemptsEndpoint, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({
        user_id: input.userId,
        generation_job_id: jobId,
        provider: 'openrouter',
        model_id: input.model.trim(),
        status: 'submitted',
        usage: {},
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!attemptResponse.ok) {
      await patchJob(options, input.userId, jobId, { status: 'failed' });
      return { ok: false, reason: 'unavailable' };
    }
    const attemptRows: unknown = await attemptResponse.json();
    const attempt = Array.isArray(attemptRows) ? asRecord(attemptRows[0]) : {};
    const attemptId = typeof attempt.id === 'string' && UUID_PATTERN.test(attempt.id) ? attempt.id : '';
    if (!attemptId) {
      await patchJob(options, input.userId, jobId, { status: 'failed' });
      return { ok: false, reason: 'unavailable' };
    }

    return { ok: true, job: { jobId, attemptId } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function finishOpenRouterTextJob(
  input: {
    userId: string;
    job: OpenRouterTextJob;
    status: 'succeeded' | 'failed' | 'unknown';
    model: string;
    generationId?: string | null;
    usage?: unknown;
  },
  options: UsageLedgerServerOptions = {},
): Promise<boolean> {
  const { supabaseUrl, serviceRoleKey, fetcher } = readOptions(options);
  if (!supabaseUrl || !serviceRoleKey || !UUID_PATTERN.test(input.userId)
      || !UUID_PATTERN.test(input.job.jobId) || !UUID_PATTERN.test(input.job.attemptId)) return false;

  const usage: NormalizedProviderUsage = normalizeProviderUsage(input.usage);
  const now = new Date().toISOString();
  const generationId = input.generationId && /^[A-Za-z0-9_-]{1,200}$/.test(input.generationId)
    ? input.generationId
    : usage.generationId;

  try {
    if (usage.costUsd !== null) {
      const costEndpoint = new URL('/rest/v1/rpc/record_provider_cost', supabaseUrl);
      const costResponse = await fetcher(costEndpoint, {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          p_user_id: input.userId,
          p_generation_job_id: input.job.jobId,
          p_provider_attempt_id: input.job.attemptId,
          p_idempotency_key: 'openrouter-text-cost:' + input.job.jobId,
          p_provider: 'openrouter',
          p_model_id: input.model,
          p_provider_generation_id: generationId,
          p_actual_cost_usd: usage.costUsd,
          p_usage: {
            ...(usage.promptTokens === undefined ? {} : { promptTokens: usage.promptTokens }),
            ...(usage.completionTokens === undefined ? {} : { completionTokens: usage.completionTokens }),
            ...(usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
          },
          p_source: 'provider_usage',
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!costResponse.ok) return false;
    }

    const attemptEndpoint = new URL('/rest/v1/provider_attempts', supabaseUrl);
    attemptEndpoint.searchParams.set('id', 'eq.' + input.job.attemptId);
    attemptEndpoint.searchParams.set('user_id', 'eq.' + input.userId);
    const attemptResponse = await fetcher(attemptEndpoint, {
      method: 'PATCH',
      headers: serviceHeaders(serviceRoleKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({
        status: input.status,
        provider_request_id: generationId,
        usage: {
          ...(usage.promptTokens === undefined ? {} : { promptTokens: usage.promptTokens }),
          ...(usage.completionTokens === undefined ? {} : { completionTokens: usage.completionTokens }),
          ...(usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
          ...(usage.costUsd === null ? {} : { costUsd: usage.costUsd }),
        },
        completed_at: now,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!attemptResponse.ok) return false;

    return patchJob(options, input.userId, input.job.jobId, {
      status: input.status,
      provider_request_id: generationId,
    });
  } catch {
    return false;
  }
}
