import { buildRunwayProjectConsistencyContext, buildRunwaySceneContinuityPrompt, type RunwaySceneContinuityInput } from './runwayProjectConsistencyContext';
import type { MediaQuality, MediaTask } from './mediaModelSelection';
import { ingestRunwayProjectOutput } from './runwayProjectOutputIngestion';
import {
  validateCreativeProductionPlan,
  type CreativeScenePlan,
  type CreativeShotPlan,
} from './creativeProductionPlanning';
import {
  evaluateSceneVisualVerification,
  buildSceneVisualRepairPrompt,
  buildSceneVisualTransitionAnchors,
  type SceneVisualAnchor,
  type SceneVisualObservation,
  type SceneVisualVerificationResult,
} from './universeSceneVisualVerification';


type RunwayTask = Exclude<MediaTask, 'video-edit'>;
type Db = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
  functions: { invoke(name: string, options: { body: Record<string, unknown>; signal?: AbortSignal }): Promise<{ data: any; error: any }> };
  storage?: { from(bucket: string): { createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl?: string } | null; error: unknown }> } };
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
  /** Active Scene context from Workspace; only creator-approved state is authoritative. */
  sceneContext?: RunwaySceneContinuityInput | null;
  /** Explicit user confirmation callback. Returning null or confirmed:false creates no job and reserves no credits. */
  requestApproval: (quote: Quote) => Promise<{ confirmed: true; maxCostUsd: number } | { confirmed: false }>;
  onProgress?: (progress: WorkflowProgress) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type JobResponse = { job?: { id?: string; status?: string; providerTaskId?: string | null; outputCount?: number }; error?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class RunwayWorkflowRequestError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) { super(message); this.name = 'RunwayWorkflowRequestError'; this.status = status; }
}
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
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
  if (error) {
    const status = typeof error.context?.status === 'number' ? error.context.status :
      typeof error.status === 'number' ? error.status : null;
    throw new RunwayWorkflowRequestError(error.message || 'VYRA generation request failed.', status);
  }
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
  const rawPrompt = typeof request.input.promptText === 'string' ? request.input.promptText : '';
  const sceneContext = buildRunwaySceneContinuityPrompt(rawPrompt, request.sceneContext);
  const consistency = await buildRunwayProjectConsistencyContext(db, {
    userId,
    targetVyralId: request.targetVyralId,
    promptText: sceneContext.promptText,
  });
  const maxReferenceImages = request.task === 'video' ? 4 : request.task === 'image' ? 16 : 0;
  const suppliedReferences = Array.isArray(request.input.referenceImages)
    ? request.input.referenceImages.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, maxReferenceImages)
    : [];
  const suppliedUris = new Set(suppliedReferences.map((item: any) => typeof item.uri === 'string' ? item.uri : '').filter(Boolean));
  const automaticReferences = consistency.referenceImages
    .filter((reference) => !suppliedUris.has(reference.uri))
    .slice(0, Math.max(0, maxReferenceImages - suppliedReferences.length))
    .map((reference) => request.task === 'video' ? { ...reference, role: 'reference' } : reference);
  const generationInput = {
    ...request.input,
    ...(typeof request.input.promptText === 'string' ? { promptText: consistency.promptText } : {}),
    ...(suppliedReferences.length || automaticReferences.length
      ? { referenceImages: [...suppliedReferences, ...automaticReferences] }
      : {}),
  };
  const quoteData = requireRecord(await invoke(db, 'quote-runway-media', {
    action: 'quote', task: request.task, quality: request.quality,
    mode: 'auto', maxCostUsd: request.maxCostUsd, input: generationInput,
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
    let pollResponse: unknown;
    try {
      pollResponse = await invoke(db, 'poll-runway-media-job', { jobId }, request.signal);
    } catch (error) {
      if (error instanceof RunwayWorkflowRequestError && [429, 502, 503].includes(error.status ?? 0)) continue;
      throw error;
    }
    const pollData = requireRecord(pollResponse, 'The task polling response is invalid.');
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


export type RunwayProjectRecoveryJob = {
  id: string;
  status: string;
  providerTaskStatus: string | null;
  outputCount: number | null;
  assetIngestionStatus: string;
  createdAt: string;
};

/** List only unfinished jobs owned by the signed-in user and bound to this Project. */
export async function listRunwayProjectMediaRecovery(
  db: Db,
  targetVyralId: string,
  limit = 6,
): Promise<RunwayProjectRecoveryJob[]> {
  if (!UUID.test(targetVyralId)) throw new Error('A valid Project Assets destination is required.');
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in to view Project generation history.');
  const { data, error } = await db.from('generation_jobs')
    .select('id,status,provider_task_status,provider_output_count,asset_ingestion_status,created_at,target_vyral_id')
    .eq('user_id', auth.user.id).eq('target_vyral_id', targetVyralId)
    .in('status', ['submitted', 'processing', 'unknown', 'succeeded'])
    .neq('asset_ingestion_status', 'ready')
    .order('created_at', { ascending: false }).limit(Math.max(1, Math.min(12, limit)));
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row: Record<string, unknown>) => {
    if (!UUID.test(String(row.id ?? '')) || row.target_vyral_id !== targetVyralId ||
        typeof row.status !== 'string' || typeof row.asset_ingestion_status !== 'string') return [];
    return [{
      id: String(row.id),
      status: row.status,
      providerTaskStatus: typeof row.provider_task_status === 'string' ? row.provider_task_status : null,
      outputCount: Number.isInteger(Number(row.provider_output_count)) ? Number(row.provider_output_count) : null,
      assetIngestionStatus: row.asset_ingestion_status,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    }];
  });
}

/**
 * Reconcile one existing Project job. This never submits a provider task.
 * A safe status poll may discover provider success, after which canonical
 * Asset/DNA/Fingerprint ingestion is resumed idempotently.
 */
export async function recoverRunwayProjectMediaJob(
  db: Db,
  targetVyralId: string,
  jobId: string,
  signal?: AbortSignal,
) {
  if (!UUID.test(targetVyralId) || !UUID.test(jobId)) throw new Error('A valid Project and generation job are required.');
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user?.id) throw new Error('Sign in before recovering Project media.');
  const { data: job, error: jobError } = await db.from('generation_jobs')
    .select('id,status,asset_ingestion_status,target_vyral_id')
    .eq('id', jobId).eq('user_id', auth.user.id).eq('target_vyral_id', targetVyralId).maybeSingle();
  if (jobError || !job) throw jobError ?? new Error('This generation job does not belong to the selected Project.');
  assertActive(signal);

  if (job.status === 'unknown') return { status: 'reconciliation_required' as const, jobId };
  if (job.status === 'submitted' || job.status === 'processing') {
    const poll = requireRecord(await invoke(db, 'poll-runway-media-job', { jobId }, signal),
      'The generation status response is invalid.');
    if (poll.throttled === true) return { status: 'submitted_pending' as const, jobId };
    const polledJob = requireRecord(poll.job, 'The generation status response has no job.');
    const status = String(polledJob.status ?? '');
    if (status === 'unknown') return { status: 'reconciliation_required' as const, jobId };
    if (status === 'failed' || status === 'cancelled') return { status, jobId };
    if (status !== 'succeeded') return { status: 'submitted_pending' as const, jobId };
  } else if (job.status !== 'succeeded') {
    return { status: 'not_recoverable' as const, jobId };
  }

  const recovered = await resumeRunwayProjectMediaIngestion(db, jobId, signal);
  return { ...recovered, status: 'ready' as const };
}


export type RunwayProjectOutputAsset = Awaited<ReturnType<typeof ingestRunwayProjectOutput>>['ingestion'];

export type RunwayShotVisualVerificationAdapter = {
  /** Immutable creator-approved Scene baseline revision captured before generation. */
  baselineRevision: string;
  anchors: SceneVisualAnchor[];
  /** Inspect the ingested private video Asset using the configured vision adapter. */
  getAnchorsForShot?: (shot: CreativeShotPlan, shotIndex: number, scene: CreativeScenePlan) => SceneVisualAnchor[];
  inspect: (input: {
    asset: RunwayProjectOutputAsset;
    shot: CreativeShotPlan;
    shotIndex: number;
    shotCount: number;
    scene: CreativeScenePlan;
    anchors: SceneVisualAnchor[];
    signal?: AbortSignal;
  }) => Promise<{ observations: SceneVisualObservation[]; inspectionComplete: boolean }>;
  /** Inspect the previous shot's final frame against the current shot's opening frame. */
  inspectTransition?: (input: {
    previousAsset: RunwayProjectOutputAsset;
    currentAsset: RunwayProjectOutputAsset;
    previousShot: CreativeShotPlan;
    currentShot: CreativeShotPlan;
    previousShotIndex: number;
    currentShotIndex: number;
    scene: CreativeScenePlan;
    anchors: SceneVisualAnchor[];
    signal?: AbortSignal;
  }) => Promise<{ observations: SceneVisualObservation[]; inspectionComplete: boolean }>;
  /** Read the latest approved baseline revision after inspection to detect stale results. */
  getCurrentBaselineRevision: () => Promise<string>;
};

export type RunwayProjectShotSequenceRequest = Omit<
  RunwayProjectGenerationRequest,
  'input' | 'requestApproval' | 'maxCostUsd' | 'task'
> & {
  scene: CreativeScenePlan;
  productionTitle: string;
  logline: string;
  genre: string;
  tone: string;
  sceneIndex?: number;
  promptText: string;
  referenceImages?: unknown[];
  /** Hard ceiling for all approved shot costs in this sequence. */
  maxTotalCostUsd: number;
  /** Per-shot quote ceiling shown to the creator before approval. */
  maxCostUsdPerShot: number;
  requestApproval: (
    quote: Quote,
    shot: CreativeShotPlan,
    shotIndex: number,
  ) => Promise<{ confirmed: true; maxCostUsd: number } | { confirmed: false }>;
  /** When supplied, every generated output is inspected before the next shot is submitted. */
  visualVerification?: RunwayShotVisualVerificationAdapter;
  /** A one-shot repair retains the original Scene and re-inspects every downstream cut in order. */
  repair?: { shotIndex: number; previousShotAsset?: RunwayProjectOutputAsset; nextShotAsset?: RunwayProjectOutputAsset; downstreamShotAssets?: Array<{ shotIndex: number; asset: RunwayProjectOutputAsset }> };
  onShotProgress?: (event: {
    shotId: string;
    shotIndex: number;
    shotCount: number;
    status: string;
    jobId?: string;
  }) => void;
};

export type RunwayProjectShotSequenceAsset = {
  shotId: string;
  shotIndex: number;
  durationSeconds: number;
  assetId: string;
  assetVersionId: string;
  mimeType: string;
};

export type RunwayProjectShotSequenceReady = {
  storyboardId: string;
  sceneId: string;
  /** When true, replace only matching shot IDs and preserve the rest of the Editor sequence. */
  replaceShot?: boolean;
  shots: RunwayProjectShotSequenceAsset[];
};

export type RunwayProjectShotSequenceResult = {
  status: 'ready' | 'approval_declined' | 'budget_exceeded' | 'partial' | 'needs_review';
  visualVerificationStatus: 'verified' | 'not_configured' | 'not_run' | 'partial' | 'needs_review';
  completedShots: Array<{
    shotId: string;
    shotIndex: number;
    jobId: string;
    assets: RunwayProjectOutputAsset[];
    visualVerifications?: SceneVisualVerificationResult[];
    transitionVerification?: SceneVisualVerificationResult;
    outgoingTransitionVerification?: SceneVisualVerificationResult;
    downstreamTransitionVerifications?: Array<{ previousShotIndex: number; currentShotIndex: number; verification: SceneVisualVerificationResult }>;
    downstreamShotVerifications?: Array<{ shotIndex: number; verification: SceneVisualVerificationResult }>;
    repairPrompts?: string[];
  }>;
  /** Exact failed handoff; currentShotIndex is the correct repair target for a boundary mismatch. */
  failedTransitionBoundary?: { previousShotIndex: number; currentShotIndex: number; status: SceneVisualVerificationResult['status']; verification: SceneVisualVerificationResult };
  finalSceneValidation?: { status: 'verified' | 'needs_review'; checkedShotIndices: number[]; expectedShotIndices: number[]; checkedBoundaryIndices: number[]; expectedBoundaryIndices: number[]; baselineRevision: string; reasons: string[] };
  stoppedAtShotIndex: number | null;
  stoppedStatus: string | null;
  stoppedJobId?: string;
  approvedCostUsd: number;
};

export function validateFinalSceneRepairCoverage(input: {
  targetShotIndex: number;
  shotCount: number;
  baselineRevision: string;
  latestBaselineRevision: string | null;
  shotVerifications: Array<{ shotIndex: number; verification: SceneVisualVerificationResult }>;
  boundaryVerifications: Array<{ previousShotIndex: number; currentShotIndex: number; verification: SceneVisualVerificationResult }>;
}): NonNullable<RunwayProjectShotSequenceResult['finalSceneValidation']> {
  const expectedShotIndices = Array.from(
    { length: Math.max(0, input.shotCount - input.targetShotIndex) },
    (_item, offset) => input.targetShotIndex + offset,
  );
  const checkedShotIndices = [...new Set(input.shotVerifications
    .filter((item) => item.verification.status === 'consistent')
    .map((item) => item.shotIndex))].sort((a, b) => a - b);
  const expectedBoundaryIndices = Array.from(
    { length: Math.max(0, input.shotCount - 1 - Math.max(0, input.targetShotIndex - 1)) },
    (_item, offset) => Math.max(0, input.targetShotIndex - 1) + offset,
  );
  const checkedBoundaryIndices = [...new Set(input.boundaryVerifications
    .filter((item) => item.verification.status === 'consistent'
      && item.currentShotIndex === item.previousShotIndex + 1)
    .map((item) => item.previousShotIndex))].sort((a, b) => a - b);
  const allVerifications = [
    ...input.shotVerifications.map((item) => item.verification),
    ...input.boundaryVerifications.map((item) => item.verification),
  ];
  const reasons: string[] = [];
  if (checkedShotIndices.length !== expectedShotIndices.length
    || expectedShotIndices.some((index, position) => checkedShotIndices[position] !== index)) {
    reasons.push('One or more repaired/downstream shots are missing a complete visual inspection.');
  }
  if (checkedBoundaryIndices.length !== expectedBoundaryIndices.length
    || expectedBoundaryIndices.some((index, position) => checkedBoundaryIndices[position] !== index)) {
    reasons.push('One or more incoming/downstream shot boundaries are missing a complete continuity inspection.');
  }
  if (allVerifications.some((item) => item.baselineRevision !== input.baselineRevision)) {
    reasons.push('The verification results do not share the same approved Scene baseline revision.');
  }
  if (!input.latestBaselineRevision) {
    reasons.push('The latest approved Scene baseline revision could not be confirmed.');
  } else if (input.latestBaselineRevision !== input.baselineRevision) {
    reasons.push('The approved Scene baseline changed before final validation completed.');
  }
  return {
    status: reasons.length === 0 ? 'verified' : 'needs_review',
    checkedShotIndices, expectedShotIndices, checkedBoundaryIndices, expectedBoundaryIndices,
    baselineRevision: input.baselineRevision, reasons,
  };
}

/** Build a bounded, single-shot prompt while retaining the approved Scene context. */
export function buildRunwayProjectShotPrompt(
  request: Pick<RunwayProjectShotSequenceRequest, 'productionTitle' | 'logline' | 'genre' | 'tone' | 'sceneIndex' | 'promptText'>,
  scene: CreativeScenePlan,
  shot: CreativeShotPlan,
  shotIndex: number,
): string {
  const shotCount = scene.shots.length;
  const previous = shotIndex > 0 ? scene.shots[shotIndex - 1] : null;
  const next = shotIndex + 1 < shotCount ? scene.shots[shotIndex + 1] : null;
  const lines = [
    'PRODUCTION: ' + request.productionTitle,
    'STORY: ' + request.logline,
    'GENRE / TONE: ' + request.genre + ' / ' + request.tone,
    'SCENE ' + ((request.sceneIndex ?? 0) + 1) + ': ' + scene.title,
    'SCENE PURPOSE: ' + scene.purpose,
    'LOCATION: ' + scene.location,
    'CHARACTERS: ' + (scene.characters.length ? scene.characters.join(', ') : 'No on-screen characters'),
    'SCENE ENTRY STATE: ' + scene.entryState,
    'SCENE ACTION: ' + scene.action,
    'SHOT ' + (shotIndex + 1) + ' OF ' + shotCount + ' (target duration ' + shot.durationSeconds + ' seconds)',
    'SHOT PURPOSE: ' + shot.purpose,
    'ACTION TO GENERATE: ' + shot.action,
    'FRAMING: ' + shot.framing,
    'CAMERA ANGLE: ' + shot.cameraAngle,
    'CAMERA MOVEMENT: ' + shot.cameraMovement,
    'COMPOSITION AND BLOCKING: ' + shot.composition,
    'LIGHTING: ' + shot.lighting,
    'FOCUS / DEPTH: ' + shot.focus,
    'SOUND INTENT: ' + shot.sound,
    'SHOT CONTINUITY: ' + shot.continuityNotes.join('; '),
    previous ? 'PREVIOUS SHOT HANDOFF: ' + previous.action + ' | ' + previous.continuityNotes.join('; ') : 'FIRST SHOT: establish the Scene geography and initial blocking.',
    next ? 'NEXT SHOT SETUP: ' + next.purpose + ' | ' + next.action : 'FINAL SHOT: resolve into the planned Scene exit state: ' + scene.exitState,
    'Generate only this planned shot, not the entire Scene or other shots. Preserve the approved Project Asset identities and Scene continuity. Do not add unplanned characters, wardrobe, props, locations, or story events. The target duration is creative direction; never claim exact duration unless the selected provider confirms it.',
  ];
  return (request.promptText.trim() + '\n\n' + lines.join('\n')).slice(0, 9000);
}

/**
 * Generate the approved Scene one shot at a time. Each shot keeps the existing
 * quote → explicit approval → reserved job → single submit → safe poll →
 * private Asset/DNA/Fingerprint ingestion lifecycle. The sequence stops on the
 * first declined, pending, failed, or unknown task; it never skips ahead.
 */
export async function generateRunwayProjectShotSequence(
  db: Db,
  request: RunwayProjectShotSequenceRequest,
): Promise<RunwayProjectShotSequenceResult> {
  if (!request.scene || !Array.isArray(request.scene.shots) ||
      request.scene.shots.length < 1 || request.scene.shots.length > 12 ||
      !Number.isFinite(request.maxTotalCostUsd) || request.maxTotalCostUsd <= 0 ||
      !Number.isFinite(request.maxCostUsdPerShot) || request.maxCostUsdPerShot <= 0 ||
      !request.promptText.trim()) {
    throw new Error('A valid Scene shot plan, prompt and bounded generation budget are required.');
  }
  if (request.visualVerification && (
      !request.visualVerification.baselineRevision.trim() ||
      !Array.isArray(request.visualVerification.anchors) ||
      request.visualVerification.anchors.length === 0
  )) {
    throw new Error('Visual verification requires a creator-approved baseline revision and at least one visual anchor before paid generation.');
  }
  if (request.visualVerification && request.scene.shots.length > 1
    && typeof request.visualVerification.inspectTransition !== 'function') {
    throw new Error('Multi-shot visual verification requires a shot-boundary continuity inspector.');
  }
  const validation = validateCreativeProductionPlan({
    title: request.productionTitle,
    logline: request.logline,
    requestedDurationSeconds: request.scene.durationSeconds,
    genre: request.genre,
    tone: request.tone,
    scenes: [{ ...request.scene, characters: request.scene.characters.length ? request.scene.characters : ['(no characters)'] }],
  });
  if (!validation.valid) {
    throw new Error('The Scene shot plan is incomplete: ' + validation.errors.join(' '));
  }

  if (request.repair && !request.visualVerification) {
    throw new Error('A paid shot repair requires the same creator-approved visual verification adapter.');
  }
  if (request.repair && (!Number.isInteger(request.repair.shotIndex) || request.repair.shotIndex < 0 || request.repair.shotIndex >= request.scene.shots.length)) {
    throw new Error('A shot repair must target one existing shot in the approved Scene.');
  }
  if (request.repair?.previousShotAsset && request.repair.shotIndex === 0) {
    throw new Error('The first shot cannot have a previous-shot repair reference.');
  }
  const completedShots: RunwayProjectShotSequenceResult['completedShots'] = [];
  let finalSceneValidation: RunwayProjectShotSequenceResult['finalSceneValidation'];
  let approvedCostUsd = 0;
  let budgetExceeded = false;
  let verifiedShotCount = 0;
  const shotIndices = request.repair ? [request.repair.shotIndex] : request.scene.shots.map((_shot, index) => index);
  for (const shotIndex of shotIndices) {
    assertActive(request.signal);
    const shot = request.scene.shots[shotIndex];
    const promptText = buildRunwayProjectShotPrompt(request, request.scene, shot, shotIndex);
    const result = await generateRunwayProjectMedia(db, {
      targetVyralId: request.targetVyralId,
      task: 'video',
      quality: request.quality,
      maxCostUsd: request.maxCostUsdPerShot,
      input: {
        promptText,
        ...(request.referenceImages?.length ? { referenceImages: request.referenceImages } : {}),
      },
      sceneContext: request.sceneContext,
      signal: request.signal,
      pollIntervalMs: request.pollIntervalMs,
      timeoutMs: request.timeoutMs,
      onProgress: (progress) => {
        const jobId = 'jobId' in progress ? progress.jobId : undefined;
        request.onShotProgress?.({
          shotId: shot.id, shotIndex, shotCount: request.scene.shots.length,
          status: progress.stage, ...(jobId ? { jobId } : {}),
        });
        request.onProgress?.(progress);
      },
      requestApproval: async (quote) => {
        if (approvedCostUsd + quote.estimatedCostUsd > request.maxTotalCostUsd) {
          budgetExceeded = true;
          return { confirmed: false };
        }
        const approval = await request.requestApproval(quote, shot, shotIndex);
        if (!approval.confirmed) return approval;
        if (approvedCostUsd + approval.maxCostUsd > request.maxTotalCostUsd) {
          budgetExceeded = true;
          return { confirmed: false };
        }
        approvedCostUsd += approval.maxCostUsd;
        return approval;
      },
    });

    if (result.status !== 'ready') {
      request.onShotProgress?.({
        shotId: shot.id, shotIndex, shotCount: request.scene.shots.length,
        status: result.status,
        ...('jobId' in result && result.jobId ? { jobId: result.jobId } : {}),
      });
      return {
        status: budgetExceeded ? 'budget_exceeded' : result.status === 'approval_declined' ? 'approval_declined' : 'partial',
        visualVerificationStatus: !request.visualVerification ? 'not_configured' : verifiedShotCount > 0 ? 'partial' : 'not_run',
        completedShots, stoppedAtShotIndex: shotIndex,
        stoppedStatus: budgetExceeded ? 'budget_exceeded' : result.status,
        ...('jobId' in result && result.jobId ? { stoppedJobId: result.jobId } : {}),
        approvedCostUsd,
      };
    }
    const shotAssets = result.assets;
    if (!Array.isArray(shotAssets) || shotAssets.length === 0) {
      throw new Error('A completed shot did not return verified Project Assets.');
    }
    const visualVerifications: SceneVisualVerificationResult[] = [];
    const repairPrompts: string[] = [];
    if (request.visualVerification) {
      for (const asset of shotAssets) {
        const shotAnchors = request.visualVerification.getAnchorsForShot?.(shot, shotIndex, request.scene)
          ?? request.visualVerification.anchors;
        let observations: SceneVisualObservation[] = [];
        let inspectionComplete = false;
        let currentBaselineRevision = request.visualVerification.baselineRevision;
        try {
          if (/^video\//i.test(asset.mimeType)) {
            const inspection = await request.visualVerification.inspect({
              asset, shot, shotIndex, shotCount: request.scene.shots.length,
              scene: request.scene, anchors: shotAnchors, signal: request.signal,
            });
            observations = Array.isArray(inspection.observations) ? inspection.observations : [];
            inspectionComplete = inspection.inspectionComplete === true && Array.isArray(inspection.observations);
          }
        } catch (error) {
          if (request.signal?.aborted) throw error;
          // A failed vision pass is an unknown result, never a silent pass.
          inspectionComplete = false;
        }
        try {
          const latestRevision = await request.visualVerification.getCurrentBaselineRevision();
          if (typeof latestRevision !== 'string' || !latestRevision.trim()) {
            throw new Error('The current approved Scene baseline revision is unavailable.');
          }
          currentBaselineRevision = latestRevision;
        } catch {
          // If the current canon revision cannot be read, fail closed as an incomplete inspection.
          inspectionComplete = false;
        }
        const verification = evaluateSceneVisualVerification({
          mediaId: asset.assetId,
          mediaKind: 'video',
          baselineRevision: request.visualVerification.baselineRevision,
          currentBaselineRevision,
          anchors: shotAnchors,
          observations,
          inspectionComplete,
        });
        visualVerifications.push(verification);
        repairPrompts.push(buildSceneVisualRepairPrompt(verification, shot));
      }
    }
    let transitionVerification: SceneVisualVerificationResult | undefined;
    let outgoingTransitionVerification: SceneVisualVerificationResult | undefined;
    const downstreamTransitionVerifications: NonNullable<RunwayProjectShotSequenceResult['completedShots'][number]['downstreamTransitionVerifications']> = [];
    if (request.visualVerification && shotIndex > 0) {
      const previousCompleted = completedShots.find((completed) => completed.shotIndex === shotIndex - 1);
      const previousShot = request.scene.shots[shotIndex - 1];
      const previousAsset = previousCompleted?.assets.find((asset) => /^video\//i.test(asset.mimeType))
        ?? (request.repair?.shotIndex === shotIndex ? request.repair.previousShotAsset : undefined);
      const currentAsset = shotAssets.find((asset) => /^video\//i.test(asset.mimeType));
      let transitionObservations: SceneVisualObservation[] = [];
      let transitionInspectionComplete = false;
      let currentBaselineRevision = request.visualVerification.baselineRevision;
      try {
        if (previousAsset && currentAsset && request.visualVerification.inspectTransition) {
          const transition = await request.visualVerification.inspectTransition({
            previousAsset, currentAsset, previousShot, currentShot: shot,
            previousShotIndex: shotIndex - 1, currentShotIndex: shotIndex,
            scene: request.scene, anchors: buildSceneVisualTransitionAnchors(), signal: request.signal,
          });
          transitionObservations = Array.isArray(transition.observations) ? transition.observations : [];
          transitionInspectionComplete = transition.inspectionComplete === true && Array.isArray(transition.observations);
        }
      } catch (error) {
        if (request.signal?.aborted) throw error;
        transitionInspectionComplete = false;
      }
      try {
        const latestRevision = await request.visualVerification.getCurrentBaselineRevision();
        if (typeof latestRevision !== 'string' || !latestRevision.trim()) throw new Error('The approved Scene baseline revision is unavailable.');
        currentBaselineRevision = latestRevision;
      } catch {
        transitionInspectionComplete = false;
      }
      transitionVerification = evaluateSceneVisualVerification({
        mediaId: currentAsset?.assetId ?? shot.id,
        mediaKind: 'video',
        baselineRevision: request.visualVerification.baselineRevision,
        currentBaselineRevision,
        anchors: buildSceneVisualTransitionAnchors(),
        observations: transitionObservations,
        inspectionComplete: transitionInspectionComplete,
      });
      repairPrompts.push(buildSceneVisualRepairPrompt(transitionVerification, shot));
    }
    let downstreamShotVerifications: NonNullable<RunwayProjectShotSequenceResult['completedShots'][number]['downstreamShotVerifications']> = [];
    if (request.visualVerification && request.repair?.shotIndex === shotIndex) {
      const currentAsset = shotAssets.find((asset) => /^video\//i.test(asset.mimeType));
      let previousAsset = currentAsset;
      let previousShot = shot;
      let previousShotIndex = shotIndex;
      const expectedDownstreamIndices = request.scene.shots.map((_item, index) => index).filter((index) => index > shotIndex);
      const suppliedDownstream = request.repair.downstreamShotAssets ?? [];
      if (!suppliedDownstream.some((item) => item.shotIndex === shotIndex + 1) && request.repair.nextShotAsset) {
        suppliedDownstream.push({ shotIndex: shotIndex + 1, asset: request.repair.nextShotAsset });
      }
      for (const currentShotIndex of expectedDownstreamIndices) {
        const nextShot = request.scene.shots[currentShotIndex];
        const nextAsset = suppliedDownstream.find((item) => item.shotIndex === currentShotIndex)?.asset;
        const nextShotAnchors = request.visualVerification.getAnchorsForShot?.(nextShot, currentShotIndex, request.scene)
          ?? request.visualVerification.anchors;
        let shotObservations: SceneVisualObservation[] = [];
        let shotInspectionComplete = false;
        let shotBaselineRevision = request.visualVerification.baselineRevision;
        try {
          if (nextAsset && /^video\//i.test(nextAsset.mimeType)) {
            const inspection = await request.visualVerification.inspect({
              asset: nextAsset, shot: nextShot, shotIndex: currentShotIndex,
              shotCount: request.scene.shots.length, scene: request.scene,
              anchors: nextShotAnchors, signal: request.signal,
            });
            shotObservations = Array.isArray(inspection.observations) ? inspection.observations : [];
            shotInspectionComplete = inspection.inspectionComplete === true && Array.isArray(inspection.observations);
          }
        } catch (error) {
          if (request.signal?.aborted) throw error;
          shotInspectionComplete = false;
        }
        try {
          const latestRevision = await request.visualVerification.getCurrentBaselineRevision();
          if (typeof latestRevision !== 'string' || !latestRevision.trim()) throw new Error('The approved Scene baseline revision is unavailable.');
          shotBaselineRevision = latestRevision;
        } catch {
          shotInspectionComplete = false;
        }
        const shotVerification = evaluateSceneVisualVerification({
          mediaId: nextAsset?.assetId ?? nextShot.id, mediaKind: 'video',
          baselineRevision: request.visualVerification.baselineRevision,
          currentBaselineRevision: shotBaselineRevision,
          anchors: nextShotAnchors, observations: shotObservations,
          inspectionComplete: shotInspectionComplete,
        });
        downstreamShotVerifications.push({ shotIndex: currentShotIndex, verification: shotVerification });
        repairPrompts.push(buildSceneVisualRepairPrompt(shotVerification, nextShot));
        let observations: SceneVisualObservation[] = [];
        let inspectionComplete = false;
        let currentBaselineRevision = request.visualVerification.baselineRevision;
        try {
          if (previousAsset && nextAsset && /^video\//i.test(nextAsset.mimeType) && request.visualVerification.inspectTransition) {
            const transition = await request.visualVerification.inspectTransition({
              previousAsset, currentAsset: nextAsset, previousShot, currentShot: nextShot,
              previousShotIndex, currentShotIndex, scene: request.scene,
              anchors: buildSceneVisualTransitionAnchors(), signal: request.signal,
            });
            observations = Array.isArray(transition.observations) ? transition.observations : [];
            inspectionComplete = transition.inspectionComplete === true && Array.isArray(transition.observations);
          }
        } catch (error) {
          if (request.signal?.aborted) throw error;
          inspectionComplete = false;
        }
        try {
          const latestRevision = await request.visualVerification.getCurrentBaselineRevision();
          if (typeof latestRevision !== 'string' || !latestRevision.trim()) throw new Error('The approved Scene baseline revision is unavailable.');
          currentBaselineRevision = latestRevision;
        } catch {
          inspectionComplete = false;
        }
        const verification = evaluateSceneVisualVerification({
          mediaId: nextAsset?.assetId ?? nextShot.id, mediaKind: 'video',
          baselineRevision: request.visualVerification.baselineRevision, currentBaselineRevision,
          anchors: buildSceneVisualTransitionAnchors(), observations, inspectionComplete,
        });
        downstreamTransitionVerifications.push({ previousShotIndex, currentShotIndex, verification });
        repairPrompts.push(buildSceneVisualRepairPrompt(verification, nextShot));
        if (!outgoingTransitionVerification) outgoingTransitionVerification = verification;
        if (!nextAsset || !/^video\//i.test(nextAsset.mimeType)) {
          // The chain cannot skip a missing timeline shot and still claim continuity.
          break;
        }
        previousAsset = nextAsset;
        previousShot = nextShot;
        previousShotIndex = currentShotIndex;
      }
      const repairShotVerifications = [
        ...visualVerifications.map((verification) => ({ shotIndex, verification })),
        ...downstreamShotVerifications,
      ];
      const repairBoundaryVerifications = [
        ...(shotIndex > 0 && transitionVerification
          ? [{ previousShotIndex: shotIndex - 1, currentShotIndex: shotIndex, verification: transitionVerification }]
          : []),
        ...downstreamTransitionVerifications,
      ];
      let latestBaselineRevision: string | null = null;
      try {
        const latestRevision = await request.visualVerification.getCurrentBaselineRevision();
        if (typeof latestRevision === 'string' && latestRevision.trim()) latestBaselineRevision = latestRevision;
      } catch {
        latestBaselineRevision = null;
      }
      finalSceneValidation = validateFinalSceneRepairCoverage({
        targetShotIndex: shotIndex,
        shotCount: request.scene.shots.length,
        baselineRevision: request.visualVerification.baselineRevision,
        latestBaselineRevision,
        shotVerifications: repairShotVerifications,
        boundaryVerifications: repairBoundaryVerifications,
      });
    }
    completedShots.push({
      shotId: shot.id, shotIndex, jobId: result.jobId, assets: shotAssets,
      ...(request.visualVerification ? { visualVerifications, repairPrompts } : {}),
      ...(transitionVerification ? { transitionVerification } : {}),
      ...(outgoingTransitionVerification ? { outgoingTransitionVerification } : {}),
      ...(downstreamTransitionVerifications.length ? { downstreamTransitionVerifications } : {}),
      ...(downstreamShotVerifications.length ? { downstreamShotVerifications } : {}),
    });
    const downstreamShotFailed = downstreamShotVerifications.some((item) => item.verification.status !== 'consistent');
    if (visualVerifications.some((verification) => verification.status !== 'consistent')
      || (transitionVerification && transitionVerification.status !== 'consistent')
      || (outgoingTransitionVerification && outgoingTransitionVerification.status !== 'consistent')
      || downstreamShotFailed
      || downstreamTransitionVerifications.some((item) => item.verification.status !== 'consistent')
      || (request.repair !== undefined && finalSceneValidation?.status !== 'verified')) {
      request.onShotProgress?.({
        shotId: shot.id, shotIndex, shotCount: request.scene.shots.length,
        status: downstreamShotFailed ? 'downstream-shot-visual-needs-review' : downstreamTransitionVerifications.some((item) => item.verification.status !== 'consistent') ? 'downstream-shot-chain-needs-review' : outgoingTransitionVerification && outgoingTransitionVerification.status !== 'consistent' ? 'outgoing-shot-transition-needs-review' : transitionVerification && transitionVerification.status !== 'consistent' ? 'shot-transition-needs-review' : 'visual-verification-needs-review', jobId: result.jobId,
      });
      // Do not generate later shots against an unverified handoff, and never
      // auto-regenerate a paid output. Return targeted repair guidance for review.
      const failedDownstreamBoundary = downstreamTransitionVerifications.find((item) => item.verification.status !== 'consistent');
      const failedTransitionBoundary = failedDownstreamBoundary
        ? { previousShotIndex: failedDownstreamBoundary.previousShotIndex, currentShotIndex: failedDownstreamBoundary.currentShotIndex, status: failedDownstreamBoundary.verification.status, verification: failedDownstreamBoundary.verification }
        : transitionVerification && transitionVerification.status !== 'consistent' && shotIndex > 0
          ? { previousShotIndex: shotIndex - 1, currentShotIndex: shotIndex, status: transitionVerification.status, verification: transitionVerification }
          : outgoingTransitionVerification && outgoingTransitionVerification.status !== 'consistent' && shotIndex + 1 < request.scene.shots.length
            ? { previousShotIndex: shotIndex, currentShotIndex: shotIndex + 1, status: outgoingTransitionVerification.status, verification: outgoingTransitionVerification }
            : undefined;
      return {
        status: 'needs_review',
        visualVerificationStatus: 'needs_review',
        completedShots,
        ...(failedTransitionBoundary ? { failedTransitionBoundary } : {}),
        ...(finalSceneValidation ? { finalSceneValidation } : {}),
        stoppedAtShotIndex: shotIndex,
        stoppedStatus: downstreamShotFailed ? 'downstream_shot_visual_needs_review' : downstreamTransitionVerifications.some((item) => item.verification.status !== 'consistent') ? 'downstream_shot_chain_needs_review' : outgoingTransitionVerification && outgoingTransitionVerification.status !== 'consistent' ? 'outgoing_shot_transition_needs_review' : transitionVerification && transitionVerification.status !== 'consistent' ? 'shot_transition_needs_review' : 'visual_verification_needs_review',
        stoppedJobId: result.jobId,
        approvedCostUsd,
      };
    }
    if (visualVerifications.length > 0 && visualVerifications.every((verification) => verification.status === 'consistent')) {
      verifiedShotCount += 1;
    }
    request.onShotProgress?.({
      shotId: shot.id, shotIndex, shotCount: request.scene.shots.length,
      status: request.visualVerification ? 'visually-verified' : 'ready-unverified',
      jobId: result.jobId,
    });
  }
  return {
    status: 'ready',
    visualVerificationStatus: request.visualVerification ? 'verified' : 'not_configured',
    ...(finalSceneValidation ? { finalSceneValidation } : {}),
    completedShots, stoppedAtShotIndex: null, stoppedStatus: null, approvedCostUsd,
  };
}
