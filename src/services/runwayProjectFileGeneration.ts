import type { MediaQuality, MediaTask } from './mediaModelSelection';
import { installProjectCloudFileToOfflineStorage } from './projectOfflineStorage';

type RunwayTask = Exclude<MediaTask, 'video-edit'>;
type Db = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
  functions: { invoke(name: string, options: { body: Record<string, unknown>; signal?: AbortSignal }): Promise<{ data: any; error: any }> };
  storage: { from(bucket: string): { createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl?: string } | null; error: unknown }> } };
};
type Quote = {
  id: string; task: MediaTask; quality: MediaQuality; provider: string; model: string;
  estimatedCredits: number; estimatedCostUsd: number; expiresAt: string; requestFingerprint: string;
};
export type ProjectGeneratedFile = {
  projectFileId: string; projectId: string; fileName: string; mimeType: string;
  sizeBytes: number; sha256: string; storagePath: string;
};
type Progress =
  | { stage: 'quote'; quote: Quote }
  | { stage: 'approval-required'; quote: Quote }
  | { stage: 'reserved'; jobId: string }
  | { stage: 'submitted'; jobId: string; providerTaskId: string | null }
  | { stage: 'polling'; jobId: string; status: string }
  | { stage: 'ingesting'; jobId: string; outputIndex: number; outputCount: number }
  | { stage: 'ready'; jobId: string; files: ProjectGeneratedFile[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Generation cancelled.', 'AbortError'));
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Generation cancelled.', 'AbortError')); };
  signal?.addEventListener('abort', abort, { once: true });
});
function record(value: unknown, message: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, any>;
}
async function invoke(db: Db, name: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await db.functions.invoke(name, { body, signal });
  if (error) throw new Error(error.message || 'VYRA generation request failed.');
  return data;
}

/**
 * Project-native generation path. New outputs are media_library_items with a
 * stable Project File ID; this flow never creates or requires Vyral Assets.
 */
export async function generateRunwayProjectFiles(db: Db, request: {
  projectId: string; task: RunwayTask; quality: MediaQuality; maxCostUsd: number;
  input: Record<string, unknown>;
  requestApproval: (quote: Quote) => Promise<{ confirmed: true; maxCostUsd: number } | { confirmed: false }>;
  onProgress?: (progress: Progress) => void; signal?: AbortSignal;
  pollIntervalMs?: number; timeoutMs?: number;
}) {
  if (!UUID.test(request.projectId) || !['image', 'video', 'audio'].includes(request.task) ||
      !['draft', 'standard', 'premium'].includes(request.quality) ||
      !Number.isFinite(request.maxCostUsd) || request.maxCostUsd <= 0 ||
      !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    throw new Error('A valid Project, task, quality, budget and generation input are required.');
  }
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in before generating Project media.');
  const userId = auth.user.id;
  const { data: project, error: projectError } = await db.from('vyral_storyboards')
    .select('id,user_id').eq('id', request.projectId).eq('user_id', userId).maybeSingle();
  if (projectError || !project) throw new Error('The selected Project could not be verified.');

  const quoteData = record(await invoke(db, 'quote-runway-media', {
    action: 'quote', task: request.task, quality: request.quality,
    mode: 'auto', maxCostUsd: request.maxCostUsd, input: request.input,
  }, request.signal), 'The media quote response is invalid.');
  const raw = record(quoteData.quote, 'VYRA did not return a valid media quote.');
  const quote: Quote = {
    id: String(raw.id ?? ''), task: raw.task, quality: raw.quality,
    provider: String(raw.provider ?? ''), model: String(raw.model ?? ''),
    estimatedCredits: Number(raw.estimatedCredits), estimatedCostUsd: Number(raw.estimatedCostUsd),
    expiresAt: String(raw.expiresAt ?? ''), requestFingerprint: String(raw.requestFingerprint ?? ''),
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
  const approval = await request.requestApproval(quote);
  if (!approval.confirmed) return { status: 'approval_declined' as const, quote };
  if (!Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd < quote.estimatedCostUsd ||
      approval.maxCostUsd > request.maxCostUsd) throw new Error('The approved maximum must cover the quote and stay within the shown budget.');

  await invoke(db, 'approve-runway-media-quote', {
    action: 'approve', confirmed: true, quoteId: quote.id,
    maxCostUsd: approval.maxCostUsd, idempotencyKey: 'approve-' + crypto.randomUUID(),
  }, request.signal);
  const created = record(await invoke(db, 'create-runway-media-job', {
    action: 'create', quoteId: quote.id, idempotencyKey: 'project-runway-' + crypto.randomUUID(),
    targetProjectId: request.projectId,
  }, request.signal), 'The generation job response is invalid.');
  const job = record(created.job, 'VYRA did not create a Project generation job.');
  const jobId = String(job.id ?? '');
  if (!UUID.test(jobId) || job.targetProjectId !== request.projectId) throw new Error('The generation job is not bound to this Project.');
  request.onProgress?.({ stage: 'reserved', jobId });

  const submitted = record(await invoke(db, 'submit-runway-media-job', { jobId }, request.signal), 'The provider submission response is invalid.');
  const submittedJob = record(submitted.job, 'The provider submission has no durable job status.');
  if (submittedJob.status === 'unknown') return { status: 'reconciliation_required' as const, quote, jobId };
  if (submittedJob.status === 'failed') throw new Error(String(submitted.error ?? 'The provider rejected this generation.'));
  if (submittedJob.status !== 'submitted') throw new Error('The job submission is not confirmed. Do not submit it again.');
  request.onProgress?.({ stage: 'submitted', jobId, providerTaskId: typeof submittedJob.providerTaskId === 'string' ? submittedJob.providerTaskId : null });

  const started = Date.now();
  const interval = Math.max(5200, Math.min(30000, request.pollIntervalMs ?? 6000));
  const timeout = Math.max(60000, Math.min(30 * 60 * 1000, request.timeoutMs ?? 15 * 60 * 1000));
  let outputCount = 0;
  while (Date.now() - started < timeout) {
    if (request.signal?.aborted) return { status: 'submitted_pending' as const, quote, jobId };
    try { await sleep(interval, request.signal); } catch (error) { if (request.signal?.aborted) return { status: 'submitted_pending' as const, quote, jobId }; throw error; }
    const polled = record(await invoke(db, 'poll-runway-media-job', { jobId }, request.signal), 'The task polling response is invalid.');
    if (polled.throttled === true) continue;
    const state = record(polled.job, 'The task polling response has no job status.');
    const status = String(state.status ?? '');
    request.onProgress?.({ stage: 'polling', jobId, status });
    if (status === 'unknown') return { status: 'reconciliation_required' as const, quote, jobId };
    if (status === 'failed' || status === 'cancelled') return { status, quote, jobId, error: String(polled.error ?? polled.message ?? 'Generation failed.') };
    if (status === 'succeeded') {
      outputCount = Number(state.outputCount ?? 0);
      if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > 16) throw new Error('The provider returned an invalid output count.');
      break;
    }
  }
  if (!outputCount) return { status: 'submitted_pending' as const, quote, jobId };

  const files: ProjectGeneratedFile[] = [];
  for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) {
    if (request.signal?.aborted) return { status: 'ingestion_pending' as const, quote, jobId, files };
    request.onProgress?.({ stage: 'ingesting', jobId, outputIndex, outputCount });
    const transferred = record(await invoke(db, 'transfer-runway-media-output', { jobId, outputIndex }, request.signal), 'The Project output transfer response is invalid.');
    if (transferred.status !== 'stored' || transferred.targetProjectId !== request.projectId ||
        !UUID.test(String(transferred.projectFileId ?? '')) || typeof transferred.storagePath !== 'string' ||
        typeof transferred.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(transferred.sha256) ||
        typeof transferred.mimeType !== 'string' || !Number.isSafeInteger(transferred.sizeBytes) ||
        Number(transferred.sizeBytes) <= 0 || typeof transferred.fileName !== 'string') {
      throw new Error('The provider output was not saved as a verified Project File.');
    }
    const file: ProjectGeneratedFile = {
      projectFileId: transferred.projectFileId, projectId: request.projectId,
      fileName: transferred.fileName, mimeType: transferred.mimeType,
      sizeBytes: Number(transferred.sizeBytes), sha256: transferred.sha256,
      storagePath: transferred.storagePath,
    };
    const { data: signed, error: signError } = await db.storage.from('vyral-assets').createSignedUrl(file.storagePath, 300);
    if (!signed?.signedUrl || signError) throw new Error('The saved Project File could not be opened for local installation.');
    const response = await fetch(signed.signedUrl, { cache: 'no-store', redirect: 'error', signal: request.signal });
    if (!response.ok) throw new Error('The generated Project File could not be downloaded for Offline Storage.');
    const blob = await response.blob();
    if (blob.size !== file.sizeBytes) throw new Error('The generated Project File size changed during local installation.');
    await installProjectCloudFileToOfflineStorage({
      projectId: request.projectId, projectFileId: file.projectFileId,
      fileName: file.fileName, mimeType: file.mimeType, blob,
      expectedSha256: file.sha256,
    });
    const completed = record(await invoke(db, 'complete-runway-media-output', { jobId, outputIndex }, request.signal), 'The Project output completion response is invalid.');
    if (completed.status !== 'ingested' || completed.projectFileId !== file.projectFileId) {
      throw new Error('The Project File is saved but its completion record needs a safe retry.');
    }
    files.push(file);
  }
  request.onProgress?.({ stage: 'ready', jobId, files });
  return { status: 'ready' as const, quote, jobId, files };
}


/** Recover a Project job that already succeeded at the provider. This never
 * submits or polls a new provider task; it only reconciles saved output rows. */
export async function recoverRunwayProjectFiles(db: Db, projectId: string, jobId: string, signal?: AbortSignal) {
  if (!UUID.test(projectId) || !UUID.test(jobId)) throw new Error('A valid Project and generation job are required.');
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in before recovering Project media.');
  const { data: job, error: jobError } = await db.from('generation_jobs')
    .select('id,status,provider_output_count,target_project_id')
    .eq('id', jobId).eq('user_id', auth.user.id).eq('target_project_id', projectId).maybeSingle();
  if (jobError || !job) throw jobError ?? new Error('This generation job does not belong to the selected Project.');
  if (job.status === 'unknown') return { status: 'reconciliation_required' as const, jobId };
  if (job.status === 'submitted' || job.status === 'processing') {
    const polled = record(await invoke(db, 'poll-runway-media-job', { jobId }, signal), 'The Project job status response is invalid.');
    if (polled.throttled === true) return { status: 'submitted_pending' as const, jobId };
    const polledJob = record(polled.job, 'The Project job status response has no job.');
    if (polledJob.status === 'unknown') return { status: 'reconciliation_required' as const, jobId };
    if (polledJob.status === 'failed' || polledJob.status === 'cancelled') return { status: String(polledJob.status), jobId };
    if (polledJob.status !== 'succeeded') return { status: 'submitted_pending' as const, jobId };
    job.status = 'succeeded';
    job.provider_output_count = polledJob.outputCount;
  }
  if (job.status !== 'succeeded' || !Number.isInteger(Number(job.provider_output_count)) ||
      Number(job.provider_output_count) < 1 || Number(job.provider_output_count) > 16) {
    throw new Error('Only a successful Project generation job with saved outputs can be recovered.');
  }
  const files: ProjectGeneratedFile[] = [];
  for (let outputIndex = 0; outputIndex < Number(job.provider_output_count); outputIndex++) {
    if (signal?.aborted) throw new DOMException('Generation recovery cancelled.', 'AbortError');
    const transferred = record(await invoke(db, 'transfer-runway-media-output', { jobId, outputIndex }, signal),
      'The saved Project output could not be recovered.');
    if (transferred.status !== 'stored' || transferred.targetProjectId !== projectId ||
        !UUID.test(String(transferred.projectFileId ?? '')) || typeof transferred.storagePath !== 'string' ||
        typeof transferred.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(transferred.sha256) ||
        typeof transferred.mimeType !== 'string' || !Number.isSafeInteger(transferred.sizeBytes) ||
        Number(transferred.sizeBytes) <= 0 || typeof transferred.fileName !== 'string') {
      throw new Error('A saved generation output is not yet available as a verified Project File.');
    }
    const file: ProjectGeneratedFile = {
      projectFileId: transferred.projectFileId, projectId, fileName: transferred.fileName,
      mimeType: transferred.mimeType, sizeBytes: Number(transferred.sizeBytes),
      sha256: transferred.sha256, storagePath: transferred.storagePath,
    };
    const { data: signed, error: signError } = await db.storage.from('vyral-assets').createSignedUrl(file.storagePath, 300);
    if (!signed?.signedUrl || signError) throw new Error('The recovered Project File could not be opened.');
    const response = await fetch(signed.signedUrl, { cache: 'no-store', redirect: 'error', signal });
    if (!response.ok) throw new Error('The recovered Project File could not be downloaded.');
    const blob = await response.blob();
    if (blob.size !== file.sizeBytes) throw new Error('The recovered Project File size failed verification.');
    await installProjectCloudFileToOfflineStorage({
      projectId, projectFileId: file.projectFileId, fileName: file.fileName,
      mimeType: file.mimeType, blob, expectedSha256: file.sha256,
    });
    const completed = record(await invoke(db, 'complete-runway-media-output', { jobId, outputIndex }, signal),
      'The recovered Project output completion response is invalid.');
    if (completed.status !== 'ingested' || completed.projectFileId !== file.projectFileId) {
      throw new Error('The recovered Project File still needs completion reconciliation.');
    }
    files.push(file);
  }
  return { status: 'ready' as const, jobId, files };
}
