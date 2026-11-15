export const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
export const RUNWAY_API_VERSION = '2024-11-06';

export type RunwayTask = 'image' | 'video' | 'audio';
export type RunwayTaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export type RunwaySubmitResult =
  | { outcome: 'accepted'; taskId: string; httpStatus: number; requestId: string | null }
  | { outcome: 'rejected'; retryable: boolean; httpStatus: number; code: string; requestId: string | null }
  | { outcome: 'unknown'; retryable: false; httpStatus: number | null; code: string; requestId: string | null };

export interface RunwayTaskSnapshot {
  taskId: string;
  status: RunwayTaskStatus;
  outputUrls: string[];
  failureCode: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface RunwayProviderOptions {
  apiKey: string;
  task: RunwayTask;
  configId: string;
  input: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validTaskId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requestHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: 'Bearer ' + apiKey,
    'X-Runway-Version': RUNWAY_API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Submit exactly one live Model Router request.
 *
 * A network timeout, 5xx, or malformed 2xx response is UNKNOWN: the provider may
 * have accepted and billed the task. Callers must reconcile before any retry.
 */
export async function submitRunwayTask(options: RunwayProviderOptions): Promise<RunwaySubmitResult> {
  const { apiKey, task, configId, input } = options;
  if (!apiKey.trim()) throw new Error('Runway API key is required.');
  if (!['image', 'video', 'audio'].includes(task)) throw new Error('Unsupported Runway task.');
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(configId)) throw new Error('Invalid Runway Model Router config ID.');
  if (!isRecord(input)) throw new Error('Runway input must be an object.');

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${RUNWAY_API_BASE}/generate/${task}`, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({ configId, input }),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch {
    return { outcome: 'unknown', retryable: false, httpStatus: null, code: 'submission_outcome_unknown', requestId: null };
  }

  const requestId = response.headers.get('x-request-id');
  if (response.status === 429) {
    return { outcome: 'rejected', retryable: true, httpStatus: 429, code: 'provider_rate_limited', requestId };
  }
  if (response.status >= 400 && response.status < 500) {
    return { outcome: 'rejected', retryable: false, httpStatus: response.status, code: 'provider_rejected_request', requestId };
  }
  if (!response.ok) {
    return { outcome: 'unknown', retryable: false, httpStatus: response.status, code: 'provider_server_outcome_unknown', requestId };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || !validTaskId(payload.id)) {
    return { outcome: 'unknown', retryable: false, httpStatus: response.status, code: 'provider_task_id_missing', requestId };
  }
  return { outcome: 'accepted', taskId: payload.id, httpStatus: response.status, requestId };
}

/** Retrieve a task snapshot. Runway recommends polling no more often than every five seconds. */
export async function getRunwayTask(
  apiKey: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<RunwayTaskSnapshot> {
  if (!apiKey.trim()) throw new Error('Runway API key is required.');
  if (!validTaskId(taskId)) throw new Error('Invalid Runway task ID.');

  const response = await fetchImpl(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
    method: 'GET',
    headers: requestHeaders(apiKey),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Runway task lookup failed with HTTP ${response.status}.`);

  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || payload.id !== taskId || typeof payload.status !== 'string') {
    throw new Error('Runway returned an invalid task snapshot.');
  }

  const rawStatus = payload.status.toUpperCase();
  const status: RunwayTaskStatus =
    rawStatus === 'PENDING' || rawStatus === 'THROTTLED' ? 'pending' :
    rawStatus === 'RUNNING' || rawStatus === 'PROCESSING' ? 'processing' :
    rawStatus === 'SUCCEEDED' ? 'succeeded' :
    rawStatus === 'FAILED' ? 'failed' :
    rawStatus === 'CANCELED' || rawStatus === 'CANCELLED' ? 'cancelled' : 'unknown';

  const outputUrls = Array.isArray(payload.output)
    ? payload.output.filter((item): item is string => typeof item === 'string' && /^https:\/\//i.test(item))
    : [];
  const failureCode = isRecord(payload.failure) && typeof payload.failure.code === 'string'
    ? payload.failure.code.slice(0, 80)
    : null;

  return {
    taskId,
    status,
    outputUrls,
    failureCode,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : null,
    completedAt: typeof payload.completedAt === 'string' ? payload.completedAt : null,
  };
}

/** Explicit kill switch; both flags must be enabled by server-side deployment configuration. */
export function isRunwayLiveSubmissionEnabled(env: (name: string) => string | undefined): boolean {
  return env('VYRA_MEDIA_GENERATION_ENABLED') === 'true' &&
    env('VYRA_RUNWAY_LIVE_SUBMISSION_ENABLED') === 'true';
}
