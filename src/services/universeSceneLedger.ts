export type SceneContinuityStatus = 'not_evaluated' | 'needs_review' | 'consistent' | 'creator_approved';

export interface SceneContinuityRecord {
  sceneId: string;
  sequence: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
  entryState: Record<string, unknown> | null;
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
