import { buildSceneContinuityRepairInstructions, evaluateSceneStateTransition, type SceneState, type SceneStateChange, type SceneStateEvaluation } from './universeSceneContinuity';

export type SceneContinuityStatus = 'not_evaluated' | 'needs_review' | 'consistent' | 'creator_approved';

export interface SceneContinuityRecord {
  sceneId: string;
  sequence: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
  entryState: Record<string, unknown> | null;
  entryFromSceneId?: string | null;
  entryFromSceneUpdatedAt?: string | null;
  intendedChanges: Array<{ path: string; value: unknown; reason: string }>;
  exitState: Record<string, unknown> | null;
  validationStatus: SceneContinuityStatus;
  stateAuthority: 'creator_approved_only';
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface SceneContinuityLedger {
  schemaVersion: 1;
  sceneOrder: string[];
  scenes: Record<string, SceneContinuityRecord>;
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const emptyRecord = (sceneId: string, sequence: number): SceneContinuityRecord => ({
  sceneId,
  sequence,
  previousSceneId: null,
  nextSceneId: null,
  entryState: null,
  entryFromSceneId: null,
  entryFromSceneUpdatedAt: null,
  intendedChanges: [],
  exitState: null,
  validationStatus: 'not_evaluated',
  stateAuthority: 'creator_approved_only',
  updatedAt: null,
});

/**
 * Adds a versioned continuity ledger to an existing Storyboard without
 * inventing Scene facts. Existing records and unknown extension fields survive
 * hydration; removed Scene records remain available as history.
 */
export function hydrateSceneContinuityLedger(
  existing: unknown,
  scenes: ReadonlyArray<{ id: string }>,
): SceneContinuityLedger {
  const prior = isRecord(existing) ? existing : {};
  const priorScenes = isRecord(prior.scenes) ? prior.scenes : {};
  const sceneOrder = [...new Set(scenes.map((scene) => scene.id).filter((id) => typeof id === 'string' && id.length > 0))];
  const records: Record<string, SceneContinuityRecord> = {};

  for (const [sceneId, value] of Object.entries(priorScenes)) {
    if (!isRecord(value)) continue;
    records[sceneId] = {
      ...emptyRecord(sceneId, typeof value.sequence === 'number' ? value.sequence : 0),
      ...value,
      sceneId,
      intendedChanges: Array.isArray(value.intendedChanges) ? value.intendedChanges as SceneContinuityRecord['intendedChanges'] : [],
      stateAuthority: 'creator_approved_only',
    } as SceneContinuityRecord;
  }

  sceneOrder.forEach((sceneId, index) => {
    const previousSceneId = index > 0 ? sceneOrder[index - 1] : null;
    const nextSceneId = index + 1 < sceneOrder.length ? sceneOrder[index + 1] : null;
    const current = records[sceneId] ?? emptyRecord(sceneId, index);
    records[sceneId] = {
      ...current,
      sceneId,
      sequence: index,
      previousSceneId,
      nextSceneId,
      stateAuthority: 'creator_approved_only',
    };
  });

  return {
    ...prior,
    schemaVersion: 1,
    sceneOrder,
    scenes: records,
  } as SceneContinuityLedger;
}

export interface SceneContinuityContext {
  sceneId: string;
  sequence: number;
  previousSceneId: string | null;
  previousExitState: Record<string, unknown> | null;
  previousSceneApproved: boolean;
  entrySnapshotStale: boolean;
  currentEntryState: Record<string, unknown> | null;
  intendedChanges: SceneContinuityRecord['intendedChanges'];
  contextComplete: boolean;
}

/** Returns only the selected Scene and its immediate predecessor's approved handoff. */
export function getSceneContinuityContext(
  ledgerInput: unknown,
  scenes: ReadonlyArray<{ id: string }>,
  sceneId: string,
): SceneContinuityContext | null {
  const ledger = hydrateSceneContinuityLedger(ledgerInput, scenes);
  const current = ledger.scenes[sceneId];
  if (!current) return null;
  const previous = current.previousSceneId ? ledger.scenes[current.previousSceneId] : null;
  const previousSceneApproved = !previous || (
    previous.validationStatus === 'creator_approved' && previous.exitState !== null
  );
  const previousExitState = previousSceneApproved ? previous?.exitState ?? null : null;
  // An entry snapshot is valid only for the exact predecessor version it was
  // evaluated against. Reordering or re-approving an earlier Scene invalidates
  // that snapshot and forces the newest approved handoff to be used.
  const entrySnapshotCurrent = current.entryFromSceneId === (current.previousSceneId ?? null)
    && (current.entryFromSceneUpdatedAt ?? null) === (previous?.updatedAt ?? null);
  const entrySnapshotStale = current.entryState !== null && !entrySnapshotCurrent;
  const currentEntryState = current.entryState ?? previousExitState;
  return {
    sceneId: current.sceneId,
    sequence: current.sequence,
    previousSceneId: current.previousSceneId,
    previousExitState,
    previousSceneApproved,
    entrySnapshotStale,
    currentEntryState,
    intendedChanges: current.intendedChanges,
    contextComplete: previousSceneApproved && currentEntryState !== null && !entrySnapshotStale,
  };
}

/** Records an evaluation as a proposal; generated state is never canon by itself. */
export function recordSceneContinuityEvaluation(
  ledgerInput: unknown,
  scenes: ReadonlyArray<{ id: string }>,
  input: {
    sceneId: string;
    entryState: Record<string, unknown>;
    intendedChanges: SceneContinuityRecord['intendedChanges'];
    expectedExitState: Record<string, unknown>;
    status: 'consistent' | 'needs_review';
    violations: unknown[];
    updatedAt?: string;
  },
): SceneContinuityLedger {
  const ledger = hydrateSceneContinuityLedger(ledgerInput, scenes);
  const current = ledger.scenes[input.sceneId];
  if (!current) throw new Error('Cannot record continuity for an unknown Scene.');
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  return {
    ...ledger,
    scenes: {
      ...ledger.scenes,
      [input.sceneId]: {
        ...current,
        entryState: structuredClone(input.entryState),
        entryFromSceneId: current.previousSceneId ?? null,
        entryFromSceneUpdatedAt: current.previousSceneId ? ledger.scenes[current.previousSceneId]?.updatedAt ?? null : null,
        intendedChanges: structuredClone(input.intendedChanges),
        proposedExitState: structuredClone(input.expectedExitState),
        validationStatus: input.status,
        violations: structuredClone(input.violations),
        updatedAt,
        // Keep any previously approved exit state intact until a new result
        // has been explicitly approved by the creator.
      },
    },
  };
}

/** Only an explicit creator action can promote a proposed exit state to canon. */
export function approveSceneContinuityState(
  ledgerInput: unknown,
  scenes: ReadonlyArray<{ id: string }>,
  sceneId: string,
  updatedAt = new Date().toISOString(),
): SceneContinuityLedger {
  const ledger = hydrateSceneContinuityLedger(ledgerInput, scenes);
  const current = ledger.scenes[sceneId];
  if (!current) throw new Error('Cannot approve continuity for an unknown Scene.');
  const continuity = getSceneContinuityContext(ledger, scenes, sceneId);
  if (!continuity?.contextComplete) {
    throw new Error('The previous Scene must have an approved continuity handoff before this Scene can be approved.');
  }
  if (
    current.validationStatus !== 'consistent'
    || !isRecord(current.proposedExitState)
    || !Array.isArray(current.violations)
    || current.violations.length !== 0
  ) {
    throw new Error('A Scene must pass continuity evaluation with no violations before its state can be approved.');
  }
  return {
    ...ledger,
    scenes: {
      ...ledger.scenes,
      [sceneId]: {
        ...current,
        exitState: structuredClone(current.proposedExitState),
        validationStatus: 'creator_approved',
        updatedAt,
      },
    },
  };
}


export interface SceneContinuityRuntimeResult {
  ledger: SceneContinuityLedger;
  evaluation: SceneStateEvaluation;
  repairInstructions: ReturnType<typeof buildSceneContinuityRepairInstructions>;
  retry: { allowed: boolean; attempt: number; maxAttempts: 2; requiresCreatorReview: boolean };
}

/**
 * Runtime entry point for a Scene-generation pipeline. Later Scenes always
 * inherit the immediately preceding creator-approved exit state. The first
 * Scene requires an explicit creator-approved starting state. Generated
 * output is recorded as a proposal and never promoted to canon here.
 */
export function evaluateAndRecordSceneContinuity(input: {
  ledger: unknown;
  scenes: ReadonlyArray<{ id: string }>;
  sceneId: string;
  observedExitState: SceneState;
  trackedPaths: string[];
  initialEntryState?: SceneState;
  intendedChanges?: SceneStateChange[];
  attempt?: number;
  updatedAt?: string;
}): SceneContinuityRuntimeResult {
  const hydrated = hydrateSceneContinuityLedger(input.ledger, input.scenes);
  const context = getSceneContinuityContext(hydrated, input.scenes, input.sceneId);
  if (!context) throw new Error('Cannot evaluate continuity for an unknown Scene.');

  let entryState: SceneState;
  if (context.previousSceneId) {
    if (!context.previousSceneApproved || !context.previousExitState) {
      throw new Error('Scene continuity context is incomplete; approve the previous Scene handoff first.');
    }
    // Always use the latest approved predecessor snapshot. This also safely
    // refreshes a stale downstream entry after an earlier Scene is re-approved.
    entryState = structuredClone(context.previousExitState);
  } else {
    const initial = input.initialEntryState ?? context.currentEntryState;
    if (!initial) throw new Error('The first Scene needs an explicit approved starting state.');
    entryState = structuredClone(initial);
  }

  const intendedChanges = input.intendedChanges ?? context.intendedChanges;
  const evaluation = evaluateSceneStateTransition({
    previousState: entryState,
    intendedChanges,
    observedState: input.observedExitState,
    trackedPaths: input.trackedPaths,
  });
  const ledger = recordSceneContinuityEvaluation(hydrated, input.scenes, {
    sceneId: input.sceneId,
    entryState,
    intendedChanges,
    expectedExitState: evaluation.expectedState,
    status: evaluation.status,
    violations: evaluation.violations,
    updatedAt: input.updatedAt,
  });
  const requestedAttempt = Number.isInteger(input.attempt) ? Number(input.attempt) : 0;
  const attempt = Math.max(0, Math.min(2, requestedAttempt));
  const maxAttempts = 2 as const;
  const retryAllowed = evaluation.status === 'needs_review' && attempt < maxAttempts;
  return {
    ledger,
    evaluation,
    repairInstructions: buildSceneContinuityRepairInstructions(evaluation),
    retry: {
      allowed: retryAllowed,
      attempt,
      maxAttempts,
      requiresCreatorReview: evaluation.status === 'needs_review' && !retryAllowed,
    },
  };
}

/**
 * Any edit to a Scene's content or project invalidates its previous continuity
 * approval. The prior exitState is retained as history, but cannot be handed
 * to the next Scene until the edited Scene is re-evaluated and re-approved.
 */
export function invalidateSceneContinuity(
  ledgerInput: unknown,
  scenes: ReadonlyArray<{ id: string }>,
  sceneId: string,
  updatedAt = new Date().toISOString(),
): SceneContinuityLedger {
  const ledger = hydrateSceneContinuityLedger(ledgerInput, scenes);
  const current = ledger.scenes[sceneId];
  if (!current) throw new Error('Cannot invalidate continuity for an unknown Scene.');
  return {
    ...ledger,
    scenes: {
      ...ledger.scenes,
      [sceneId]: {
        ...current,
        validationStatus: 'not_evaluated',
        updatedAt,
        invalidatedAt: updatedAt,
        invalidationReason: 'Scene content or project was edited after its last continuity evaluation.',
      },
    },
  };
}
