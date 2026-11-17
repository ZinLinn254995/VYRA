import type { ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
import type { ProjectRenderManifest } from './projectRenderManifest';

export type ProjectRenderJobStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'uploading'
  | 'cancel_requested'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ProjectRenderJobError = { code: string; message: string };

export type ProjectRenderJob = {
  schema: 'vyra.project-render-job';
  version: 1;
  id: string;
  projectId: string;
  ownerId: string;
  idempotencyKey: string;
  inputDigest: string;
  manifest: ProjectRenderManifest;
  compositionPlan: ProjectRenderCompositionPlan;
  status: ProjectRenderJobStatus;
  progress: number;
  attempt: number;
  revision: number;
  outputProjectFileId: string | null;
  error: ProjectRenderJobError | null;
  cancelRequestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRenderJobEvent =
  | { type: 'advance'; status: 'preparing' | 'rendering' | 'uploading'; progress: number; at: string }
  | { type: 'request_cancel'; at: string }
  | { type: 'cancelled'; at: string }
  | { type: 'complete'; outputProjectFileId: string; at: string }
  | { type: 'fail'; error: ProjectRenderJobError; at: string }
  | { type: 'retry'; at: string };

const activeStatuses = new Set<ProjectRenderJobStatus>(['queued', 'preparing', 'rendering', 'uploading']);
const phaseOrder: Record<'preparing' | 'rendering' | 'uploading', number> = {
  preparing: 1,
  rendering: 2,
  uploading: 3,
};

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error('A valid render-job timestamp is required.');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(freeze);
  }
  return value;
}

/** Create the immutable job envelope. Persistence and provider execution are deliberately separate. */
export function createProjectRenderJob(input: {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  inputDigest: string;
  manifest: ProjectRenderManifest;
  compositionPlan: ProjectRenderCompositionPlan;
  at: string;
}): ProjectRenderJob {
  assertTimestamp(input.at);
  if (!input.id.trim() || !input.ownerId.trim()) throw new Error('A render job ID and owner ID are required.');
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new Error('A bounded idempotency key is required.');
  if (!/^[a-f0-9]{64}$/i.test(input.inputDigest)) throw new Error('A SHA-256 render input digest is required.');
  if (input.manifest.projectId !== input.compositionPlan.projectId) throw new Error('The render manifest and composition plan must belong to the same Project.');
  if (input.compositionPlan.schema !== 'vyra.project-render-composition-plan' || input.compositionPlan.version !== 1) {
    throw new Error('A supported immutable Project composition plan is required.');
  }
  const job: ProjectRenderJob = {
    schema: 'vyra.project-render-job',
    version: 1,
    id: input.id,
    projectId: input.manifest.projectId,
    ownerId: input.ownerId,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest.toLowerCase(),
    manifest: input.manifest,
    compositionPlan: input.compositionPlan,
    status: 'queued',
    progress: 0,
    attempt: 1,
    revision: 1,
    outputProjectFileId: null,
    error: null,
    cancelRequestedAt: null,
    completedAt: null,
    createdAt: input.at,
    updatedAt: input.at,
  };
  return freeze(job);
}

/** Apply one monotonic, validated lifecycle event to an immutable render job snapshot. */
export function transitionProjectRenderJob(job: ProjectRenderJob, event: ProjectRenderJobEvent): ProjectRenderJob {
  assertTimestamp(event.at);
  if (!job || job.schema !== 'vyra.project-render-job' || job.version !== 1) throw new Error('A supported Project render job is required.');
  if (job.status === 'completed' || job.status === 'cancelled') throw new Error('A terminal render job cannot be changed.');
  if (Date.parse(event.at) < Date.parse(job.updatedAt)) throw new Error('Render job events cannot move the update timestamp backwards.');
  const next: ProjectRenderJob = { ...job, revision: job.revision + 1, updatedAt: event.at };

  if (event.type === 'advance') {
    if (!activeStatuses.has(job.status)) throw new Error('Only an active render job can advance.');
    if (!Number.isFinite(event.progress) || event.progress < job.progress || event.progress < 0 || event.progress > 99) {
      throw new Error('Render progress must be finite, monotonic, and below 100 until output is committed.');
    }
    if (job.status === 'cancel_requested') throw new Error('A cancellation-requested job cannot advance.');
    if (job.status !== 'queued' && phaseOrder[event.status] < phaseOrder[job.status as 'preparing' | 'rendering' | 'uploading']) {
      throw new Error('Render job phases cannot move backwards.');
    }
    if (job.status === 'queued' && event.status !== 'preparing') throw new Error('A queued render job must enter preparation first.');
    if (job.status === 'preparing' && event.status === 'uploading') throw new Error('A render job must render before uploading its output.');
    next.status = event.status;
    next.progress = event.progress;
    next.error = null;
  } else if (event.type === 'request_cancel') {
    if (!activeStatuses.has(job.status)) throw new Error('Only an active render job can be cancelled.');
    next.status = 'cancel_requested';
    next.cancelRequestedAt = event.at;
  } else if (event.type === 'cancelled') {
    if (job.status !== 'cancel_requested') throw new Error('A render job must have a cancellation request before it can be cancelled.');
    next.status = 'cancelled';
  } else if (event.type === 'complete') {
    if (job.status !== 'uploading') throw new Error('A render output must be uploaded before the job can complete.');
    if (!event.outputProjectFileId.trim()) throw new Error('A completed render must reference its canonical Project File ID.');
    next.status = 'completed';
    next.progress = 100;
    next.outputProjectFileId = event.outputProjectFileId;
    next.completedAt = event.at;
    next.error = null;
  } else if (event.type === 'fail') {
    if (!activeStatuses.has(job.status)) throw new Error('Only an active render job can fail.');
    if (!event.error.code.trim() || !event.error.message.trim()) throw new Error('A render failure requires a stable code and safe message.');
    next.status = 'failed';
    next.error = { code: event.error.code.slice(0, 100), message: event.error.message.slice(0, 1000) };
  } else if (event.type === 'retry') {
    if (job.status !== 'failed') throw new Error('Only a failed render job can be retried.');
    next.status = 'queued';
    next.progress = 0;
    next.attempt += 1;
    next.outputProjectFileId = null;
    next.error = null;
    next.cancelRequestedAt = null;
    next.completedAt = null;
  }
  return freeze(next);
}
