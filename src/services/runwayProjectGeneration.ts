import type { MediaQuality, MediaTask } from './mediaModelSelection';
import { ingestRunwayProjectOutput } from './runwayProjectOutputIngestion';

type RunwayTask = Exclude<MediaTask, 'video-edit'>;
type Db = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
  functions: { invoke(name: string, options: { body: Record<string, unknown>; signal?: AbortSignal }): Promise<{ data: any; error: any }> };
};
type Quote = {
  id: string;
  task: MediaTask;
  quality: MediaQuality;
  provider: string;
  model: string;
  estimatedCredits: number;
  estimatedCostUsd: number;
  expiresAt: string;
  requestFingerprint: string;
};
type WorkflowProgress =
  | { stage: 'quote'; quote: Quote }
  | { stage: 'approval-required'; quote: Quote }
  | { stage: 'reserved'; jobId: string }
  | { stage: 'submitted'; jobId: string; providerTaskId: string | null }
  | { stage: 'polling'; jobId: string; status: string }
  | { stage: 'ingesting'; jobId: string; outputIndex: number; outputCount: number }
  | { stage: 'ready'; jobId: string; assets: Awaited<ReturnType<typeof ingestRunwayProjectOutput>>['ingestion'][] };

export type RunwayProjectGenerationRequest = {
  targetVyralId: string;
  task: RunwayTask;
  quality: MediaQuality;
  /** Maximum USD amount the user is willing to approve for this one generation. */
  maxCostUsd: number;
  input: Record<string, unknown>;
  /** Explicit user confirmation callback. Returning null or confirmed:false creates no job and reserves no credits. */
  requestApproval: (quote: Quote) => Promise<{ confirmed: true; maxCostUsd: number } | { confirmed: false }>;
  onProgress?: (progress: WorkflowProgress) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type JobResponse = { job?: { id?: string; status?: string; providerTaskId?: string | null; outputCount?: number }; error?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class RunwayWorkflowRequestError extends Error {\n  readonly status: number | null;\n  constructor(message: string, status: number | null) { super(message); this.name = 'RunwayWorkflowRequestError'; this.status = status; }\n}\nconst sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Generation workflow cancelled.', 'AbortError'));
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Generation workflow cancelled.', 'AbortError')); };
  signal?.addEventListener('abort', abort, { once: true });
});
const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Generation workflow cancelled.', 'AbortError');
};
function requireRecord(value: unknown, message: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, any>;
}
async function invoke(db: Db, name: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await db.functions.invoke(name, { body, signal });
  if (error) {\n    const status = typeof error.context?.status === 'number' ? error.context.status :\n      typeof error.status === 'number' ? error.status : null;\n    throw new RunwayWorkflowRequestError(error.message || 'VYRA generation request failed.', status);\n  }
  return data;
}

/**
 * Customer-approved Project media generation lifecycle.
 * Provider submission is deliberately a single call: uncertain outcomes are
 * never retried. Polling is safe and respects the server's five-second guard.
 */
export async function generateRunwayProjectMedia(db: Db, request: RunwayProjectGenerationRequest) {
  if (!UUID.test(request.targetVyralId) || !['image', 'video', 'audio'].includes(request.task) ||
      !['draft', 'standard', 'premium'].includes(request.quality) ||
      !Number.isFinite(request.maxCostUsd) || request.maxCostUsd <= 0 ||
      !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    throw new Error('A valid Project destination, media task, quality, budget and generation input are required.');
  }
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in before generating Project media.');
  const userId = auth.user.id;
  const { data: destination, error: destinationError } = await db.from('vyrals')
    .select('id,user_id,metadata').eq('id', request.targetVyralId).eq('user_id', userId).maybeSingle();
  if (destinationError || !destination ||
      destination.metadata?.universe_scope !== 'storyboard' ||
      typeof destination.metadata?.storyboard_id !== 'string' || !destination.metadata.storyboard_id.trim()) {
    throw new Error('The selected Project Assets destination could not be verified.');
  }

  assertActive(request.signal);
  const quoteData = requireRecord(await invoke(db, 'quote-runway-media', {
    action: 'quote', task: request.task, quality: request.quality,
    mode: 'auto', maxCostUsd: request.maxCostUsd, input: request.input,
  }, request.signal), 'The media quote response is invalid.');
  const rawQuote = requireRecord(quoteData.quote, 'VYRA did not return a valid media quote.');
  const quote: Quote = {
    id: String(rawQuote.id ?? ''),
    task: rawQuote.task,
    quality: rawQuote.quality,
    provider: String(rawQuote.provider ?? ''),
    model: String(rawQuote.model ?? ''),
    estimatedCredits: Number(rawQuote.estimatedCredits),
    estimatedCostUsd: Number(rawQuote.estimatedCostUsd),
    expiresAt: String(rawQuote.expiresAt ?? ''),
    requestFingerprint: String(rawQuote.requestFingerprint ?? ''),
  };
  if (!UUID.test(quote.id) || quote.task !== request.task || quote.quality !== request.quality ||
      !Number.isFinite(quote.estimatedCredits) || quote.estimatedCredits < 0 ||
      !Number.isFinite(quote.estimatedCostUsd) || quote.estimatedCostUsd < 0 ||
      !/^[a-f0-9]{64}$/i.test(quote.requestFingerprint) ||
      !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) {
    throw new Error('The media quote is incomplete or expired. No generation was submitted.');
  }
  request.onProgress?.({ stage: 'quote', quote });
  request.onProgress?.({ stage: 'approval-required', quote });

  // The UI must present the exact estimate and obtain explicit customer consent.
  const approval = await request.requestApproval(quote);
  if (!approval.confirmed) return { status: 'approval_declined' as const, quote };
  if (!Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd < quote.estimatedCostUsd ||
      approval.maxCostUsd > request.maxCostUsd) {
    throw new Error('The approved maximum must cover the quote and cannot exceed the budget shown before quoting.');
  }
  assertActive(request.signal);

  await invoke(db, 'approve-runway-media-quote', {
    action: 'approve', confirmed: true, quoteId: quote.id,
    maxCostUsd: approval.maxCostUsd, idempotencyKey: 'approve-' + crypto.randomUUID(),
  }, request.signal);
  const jobData = requireRecord(await invoke(db, 'create-runway-media-job', {
    action: 'create', quoteId: quote.id,
    idempotencyKey: 'runway-' + crypto.randomUUID(),
    targetVyralId: request.targetVyralId,
  }, request.signal), 'The generation job response is invalid.');
  const job = requireRecord(jobData.job, 'VYRA did not create a generation job.');
  const jobId = String(job.id ?? '');
  if (!UUID.test(jobId) || job.targetVyralId !== request.targetVyralId) {
    throw new Error('The reserved generation job is not bound to this Project. No provider task was submitted.');
  }
  request.onProgress?.({ stage: 'reserved', jobId });
  assertActive(request.signal);

  // Never automatically retry this request: the server atomically claims before POST.
  const submitData = requireRecord(await invoke(db, 'submit-runway-media-job', { jobId }, request.signal),
    'The provider submission response is invalid. Do not submit this job again.');
  const submittedJob = requireRecord(submitData.job, 'The provider submission has no durable job status.');
  const submitStatus = String(submittedJob.status ?? '');
  if (submitStatus === 'unknown') {
    return { status: 'reconciliation_required' as const, quote, jobId };
  }
  if (submitStatus === 'failed') throw new Error(String(submitData.error ?? 'The provider rejected this generation.'));
  if (submitStatus !== 'submitted') {
    throw new Error('The job was claimed but its provider submission status is not confirmed. Do not resubmit it.');
  }
  request.onProgress?.({ stage: 'submitted', jobId, providerTaskId: typeof submittedJob.providerTaskId === 'string' ? submittedJob.providerTaskId : null });

  const startedAt = Date.now();
  const pollInterval = Math.max(5200, Math.min(30000, request.pollIntervalMs ?? 6000));
  const timeout = Math.max(60000, Math.min(30 * 60 * 1000, request.timeoutMs ?? 15 * 60 * 1000));
  let outputCount = 0;
  while (Date.now() - startedAt < timeout) {
    // Once submitted, cancellation only stops this browser's polling. The server job remains resumable.
    if (request.signal?.aborted) return { status: 'submitted_pending' as const, quote, jobId };
    await sleep(pollInterval, request.signal).catch((error) => {
      if (request.signal?.aborted) return;
      throw error;
    });
    if (request.signal?.aborted) return { status: 'submitted_pending' as const, quote, jobId };
    const pollData = requireRecord(await invoke(db, 'poll-runway-media-job', { jobId }, request.signal),
      'The task polling response is invalid.');
    if (pollData.throttled === true) continue;
    const polledJob = requireRecord(pollData.job, 'The task polling response has no job status.');
    const status = String(polledJob.status ?? '');
    request.onProgress?.({ stage: 'polling', jobId, status });
    if (status === 'failed' || status === 'cancelled') {
      return { status, quote, jobId, error: String(pollData.error ?? pollData.message ?? 'Media generation did not complete.') };
    }
    if (status === 'unknown') return { status: 'reconciliation_required' as const, quote, jobId };
    if (status === 'succeeded') {
      outputCount = Number(polledJob.outputCount ?? 0);
      if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > 16) {
        throw new Error('The completed provider task returned an invalid output count. Project Assets were not marked ready.');
      }
      break;
    }
  }
  if (!outputCount) return { status: 'submitted_pending' as const, quote, jobId };

  const assets = [];
  for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) {
    assertActive(request.signal);
    request.onProgress?.({ stage: 'ingesting', jobId, outputIndex, outputCount });
    const result = await ingestRunwayProjectOutput(db, { userId, jobId, outputIndex });
    assets.push(result.ingestion);
  }
  request.onProgress?.({ stage: 'ready', jobId, assets });
  return { status: 'ready' as const, quote, jobId, assets };
}


/** Resume private output ingestion for a job that already reached provider success.
 * This path never submits or polls the provider; it only reconciles the saved outputs.
 */
export async function resumeRunwayProjectMediaIngestion(db: Db, jobId: string, signal?: AbortSignal) {
  if (!UUID.test(jobId)) throw new Error('A valid generation job ID is required for recovery.');
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in before recovering Project media.');
  const { data: job, error: jobError } = await db.from('generation_jobs')
    .select('id,status,provider_output_count,target_vyral_id')
    .eq('id', jobId).eq('user_id', auth.user.id).maybeSingle();
  if (jobError || !job) throw jobError ?? new Error('The generation job was not found for this account.');
  if (job.status !== 'succeeded' || !UUID.test(job.target_vyral_id) ||
      !Number.isInteger(Number(job.provider_output_count)) ||
      Number(job.provider_output_count) < 1 || Number(job.provider_output_count) > 16) {
    throw new Error('Only a successfully completed Project generation job with saved outputs can be recovered.');
  }
  const assets = [];
  for (let outputIndex = 0; outputIndex < Number(job.provider_output_count); outputIndex++) {
    assertActive(signal);
    const result = await ingestRunwayProjectOutput(db, {
      userId: auth.user.id, jobId, outputIndex,
    });
    assets.push(result.ingestion);
  }
  return { status: 'ready' as const, jobId, assets };
}
