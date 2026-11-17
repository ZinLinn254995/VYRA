import { buildProjectRenderCompositionPlan, type ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
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

/** Canonical JSON encoding makes the render input digest independent of object key insertion order. */
function canonicalRenderInput(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Render input contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error('Render input must not contain circular references.');
    if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol' ||
        (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)))) {
      throw new Error('Render arrays must not contain symbol or custom properties.');
    }
    ancestors.add(value);
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new Error('Render arrays must not contain sparse elements.');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) {
        throw new Error('Render arrays must contain only data properties.');
      }
      items.push(canonicalRenderInput(descriptor.value, ancestors));
    }
    ancestors.delete(value);
    return '[' + items.join(',') + ']';
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error('Render input must contain only plain JSON objects.');
    }
    if (ancestors.has(value)) throw new Error('Render input must not contain circular references.');
    ancestors.add(value);
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw new Error('Render objects must not contain symbol keys.');
    }
    const keys = (ownKeys as string[]).sort();
    const result = '{' + keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new Error('Render objects must contain only enumerable data properties.');
      }
      if (descriptor.value === undefined) throw new Error('Render input must not contain undefined values.');
      return JSON.stringify(key) + ':' + canonicalRenderInput(descriptor.value, ancestors);
    }).join(',') + '}';
    ancestors.delete(value);
    return result;
  }
  throw new Error('Render input must contain only JSON-compatible values.');
}

/** Hash the exact immutable manifest and composition plan pinned to a render job. */
export async function createProjectRenderInputDigest(
  manifest: ProjectRenderManifest,
  compositionPlan: ProjectRenderCompositionPlan,
): Promise<string> {
  if (!manifest || manifest.schema !== 'vyra.project-render-manifest' || manifest.version !== 1 ||
      !compositionPlan || compositionPlan.schema !== 'vyra.project-render-composition-plan' || compositionPlan.version !== 1 ||
      manifest.projectId !== compositionPlan.projectId) {
    throw new Error('A matching supported Project render manifest and composition plan are required.');
  }
  // A digest is only trustworthy when the plan is the deterministic projection
  // of the pinned manifest. Never allow a caller to pair a valid Project manifest
  // with a different source list, clip schedule, or layer ordering.
  const expectedPlan = buildProjectRenderCompositionPlan(manifest);
  if (canonicalRenderInput(expectedPlan) !== canonicalRenderInput(compositionPlan)) {
    throw new Error('The composition plan does not match the pinned Project render manifest.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable in this runtime.');
  const canonical = canonicalRenderInput({ manifest, compositionPlan });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  if (!input.manifest || input.manifest.schema !== 'vyra.project-render-manifest' || input.manifest.version !== 1 ||
      !input.manifest.projectId?.trim()) {
    throw new Error('A supported Project render manifest is required.');
  }
  if (!input.compositionPlan || input.compositionPlan.schema !== 'vyra.project-render-composition-plan' ||
      input.compositionPlan.version !== 1 || !input.compositionPlan.projectId?.trim()) {
    throw new Error('A supported immutable Project composition plan is required.');
  }
  if (input.manifest.projectId !== input.compositionPlan.projectId) {
    throw new Error('The render manifest and composition plan must belong to the same Project.');
  }
  // Detach the job snapshot from caller-owned objects before freezing it. Freezing
  // the caller's manifest in place would create surprising cross-feature side effects.
  const pinnedManifest = JSON.parse(canonicalRenderInput(input.manifest)) as ProjectRenderManifest;
  const pinnedCompositionPlan = JSON.parse(canonicalRenderInput(input.compositionPlan)) as ProjectRenderCompositionPlan;
  const expectedPlan = buildProjectRenderCompositionPlan(pinnedManifest);
  if (canonicalRenderInput(expectedPlan) !== canonicalRenderInput(pinnedCompositionPlan)) {
    throw new Error('The composition plan does not match the pinned Project render manifest.');
  }
  const job: ProjectRenderJob = {
    schema: 'vyra.project-render-job',
    version: 1,
    id: input.id,
    projectId: pinnedManifest.projectId,
    ownerId: input.ownerId,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest.toLowerCase(),
    manifest: pinnedManifest,
    compositionPlan: pinnedCompositionPlan,
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


/** Build a render job only after deriving its digest from the exact pinned inputs. */
export async function createProjectRenderJobFromInputs(input: {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  manifest: ProjectRenderManifest;
  compositionPlan: ProjectRenderCompositionPlan;
  at: string;
}): Promise<ProjectRenderJob> {
  const inputDigest = await createProjectRenderInputDigest(input.manifest, input.compositionPlan);
  return createProjectRenderJob({ ...input, inputDigest });
}

/** Apply one monotonic, validated lifecycle event to an immutable render job snapshot. */
export function transitionProjectRenderJob(job: ProjectRenderJob, event: ProjectRenderJobEvent): ProjectRenderJob {
  assertTimestamp(event.at);
  if (!job || job.schema !== 'vyra.project-render-job' || job.version !== 1) throw new Error('A supported Project render job is required.');
  if (!job.id?.trim() || !job.projectId?.trim() || !job.ownerId?.trim() ||
      !/^[a-f0-9]{64}$/i.test(job.inputDigest) || !Number.isSafeInteger(job.revision) || job.revision < 1 ||
      !Number.isSafeInteger(job.attempt) || job.attempt < 1 ||
      !Number.isFinite(job.progress) || job.progress < 0 || job.progress > 100) {
    throw new Error('The render job snapshot contains invalid identity or lifecycle values.');
  }
  assertTimestamp(job.createdAt);
  assertTimestamp(job.updatedAt);
  if (Date.parse(job.updatedAt) < Date.parse(job.createdAt)) {
    throw new Error('The render job update timestamp cannot precede its creation timestamp.');
  }
  if (!['queued', 'preparing', 'rendering', 'uploading', 'cancel_requested', 'completed', 'failed', 'cancelled'].includes(job.status)) {
    throw new Error('The render job has an unsupported lifecycle status.');
  }
  const hasOutput = typeof job.outputProjectFileId === 'string' && Boolean(job.outputProjectFileId.trim());
  const hasCancelRequest = typeof job.cancelRequestedAt === 'string' && Boolean(job.cancelRequestedAt);
  const hasCompletion = typeof job.completedAt === 'string' && Boolean(job.completedAt);
  const hasError = job.error !== null && typeof job.error === 'object' &&
    typeof job.error.code === 'string' && Boolean(job.error.code.trim()) &&
    typeof job.error.message === 'string' && Boolean(job.error.message.trim());
  const validError = hasError && job.error!.code.length <= 100 && job.error!.message.length <= 1000;
  if ((job.status === 'completed' && (!hasOutput || !hasCompletion || job.progress !== 100 || hasCancelRequest || job.error !== null)) ||
      (job.status !== 'completed' && (hasOutput || hasCompletion)) ||
      ((job.status === 'cancel_requested' || job.status === 'cancelled') !== hasCancelRequest) ||
      (job.status === 'failed' ? !validError : job.error !== null)) {
    throw new Error('The render job snapshot contains inconsistent lifecycle fields.');
  }
  if (hasCancelRequest) {
    assertTimestamp(job.cancelRequestedAt as string);
    if (Date.parse(job.cancelRequestedAt as string) > Date.parse(job.updatedAt)) {
      throw new Error('The cancellation timestamp cannot follow the last job update.');
    }
  }
  if (hasCompletion) {
    assertTimestamp(job.completedAt as string);
    if (Date.parse(job.completedAt as string) > Date.parse(job.updatedAt)) {
      throw new Error('The completion timestamp cannot follow the last job update.');
    }
  }
  if (job.status === 'completed' || job.status === 'cancelled') throw new Error('A terminal render job cannot be changed.');
  if (Date.parse(event.at) < Date.parse(job.updatedAt)) throw new Error('Render job events cannot move the update timestamp backwards.');
  if (job.revision === Number.MAX_SAFE_INTEGER) throw new Error('The render job revision limit has been reached.');
  if (event.type === 'retry' && job.attempt === Number.MAX_SAFE_INTEGER) throw new Error('The render job attempt limit has been reached.');
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
    next.outputProjectFileId = event.outputProjectFileId.trim();
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
  } else {
    throw new Error('The render job event type is unsupported.');
  }
  return freeze(next);
}
