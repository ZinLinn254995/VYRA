import { buildRunwayProjectConsistencyContext, buildRunwaySceneContinuityPrompt, type RunwaySceneContinuityInput } from './runwayProjectConsistencyContext';
import type { MediaQuality, MediaTask } from './mediaModelSelection';
import { ingestRunwayProjectOutput } from './runwayProjectOutputIngestion';

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


import {
  validateCreativeProductionPlan,
  type CreativeScenePlan,
  type CreativeShotPlan,
} from './creativeProductionPlanning';

export type RunwayProjectShotSequenceRequest = Omit<
  RunwayProjectGenerationRequest,
  'input' | 'requestApproval'
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
  onShotProgress?: (event: {
    shotId: string;
    shotIndex: number;
    shotCount: number;
    status: string;
    jobId?: string;
  }) => void;
};

export type RunwayProjectShotSequenceResult = {
  status: 'ready' | 'approval_declined' | 'budget_exceeded' | 'partial';
  completedShots: Array<{
    shotId: string;
    shotIndex: number;
    jobId: string;
    assets: Awaited<ReturnType<typeof ingestRunwayProjectOutput>>['ingestion'][];
  }>;
  stoppedAtShotIndex: number | null;
  approvedCostUsd: number;
};

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

  const completedShots: RunwayProjectShotSequenceResult['completedShots'] = [];
  let approvedCostUsd = 0;
  let budgetExceeded = false;
  for (let shotIndex = 0; shotIndex < request.scene.shots.length; shotIndex++) {
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
        completedShots, stoppedAtShotIndex: shotIndex, approvedCostUsd,
      };
    }
    completedShots.push({ shotId: shot.id, shotIndex, jobId: result.jobId, assets: result.assets });
    request.onShotProgress?.({
      shotId: shot.id, shotIndex, shotCount: request.scene.shots.length,
      status: 'ready', jobId: result.jobId,
    });
  }
  return { status: 'ready', completedShots, stoppedAtShotIndex: null, approvedCostUsd };
}
