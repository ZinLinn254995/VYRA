import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveSceneContinuityState, evaluateAndRecordSceneContinuity, getSceneContinuityContext, hydrateSceneContinuityLedger, recordSceneContinuityEvaluation } from '../src/services/universeSceneLedger.ts';

test('initializes an empty versioned ledger without inventing Scene state', () => {
  const ledger = hydrateSceneContinuityLedger(undefined, [{ id: 's1' }, { id: 's2' }]);
  assert.equal(ledger.schemaVersion, 1);
  assert.deepEqual(ledger.sceneOrder, ['s1', 's2']);
  assert.equal(ledger.scenes.s1.entryState, null);
  assert.equal(ledger.scenes.s1.exitState, null);
  assert.equal(ledger.scenes.s1.validationStatus, 'not_evaluated');
  assert.equal(ledger.scenes.s1.nextSceneId, 's2');
  assert.equal(ledger.scenes.s2.previousSceneId, 's1');
});

test('preserves approved state, history and unknown extension fields during hydration', () => {
  const existing = {
    schemaVersion: 1,
    customExtension: { retained: true },
    sceneOrder: ['s1'],
    scenes: {
      s1: {
        sceneId: 's1',
        sequence: 8,
        entryState: { hero: { outfit: 'blue coat' } },
        intendedChanges: [{ path: 'hero.outfit', value: 'torn coat', reason: 'A fight.' }],
        exitState: { hero: { outfit: 'torn coat' } },
        validationStatus: 'creator_approved',
        customEvidenceId: 'evidence-7',
      },
      removedScene: { sceneId: 'removedScene', sequence: 9, exitState: { prop: 'kept' } },
    },
  };
  const ledger = hydrateSceneContinuityLedger(existing, [{ id: 's1' }, { id: 's2' }]);
  assert.deepEqual(ledger.scenes.s1.entryState, existing.scenes.s1.entryState);
  assert.deepEqual(ledger.scenes.s1.exitState, existing.scenes.s1.exitState);
  assert.equal(ledger.scenes.s1.validationStatus, 'creator_approved');
  assert.equal(ledger.scenes.s1.customEvidenceId, 'evidence-7');
  assert.deepEqual(ledger.customExtension, { retained: true });
  assert.deepEqual(ledger.scenes.removedScene.exitState, { prop: 'kept' });
  assert.equal(ledger.scenes.s2.validationStatus, 'not_evaluated');
});

test('rebuilds scene order and links after reordering without erasing stored states', () => {
  const existing = {
    scenes: {
      a: { entryState: { location: 'room' }, exitState: { location: 'hall' } },
      b: { entryState: { location: 'hall' }, exitState: { location: 'street' } },
    },
  };
  const ledger = hydrateSceneContinuityLedger(existing, [{ id: 'b' }, { id: 'a' }]);
  assert.deepEqual(ledger.sceneOrder, ['b', 'a']);
  assert.equal(ledger.scenes.b.nextSceneId, 'a');
  assert.equal(ledger.scenes.a.previousSceneId, 'b');
  assert.deepEqual(ledger.scenes.a.exitState, { location: 'hall' });
});

test('ignores malformed prior ledger containers and duplicate scene ids safely', () => {
  const ledger = hydrateSceneContinuityLedger({ scenes: 'invalid' }, [{ id: 'x' }, { id: 'x' }, { id: '' }]);
  assert.deepEqual(ledger.sceneOrder, ['x']);
  assert.deepEqual(Object.keys(ledger.scenes), ['x']);
});

test('Scene evaluation remains proposed until the creator explicitly approves it', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  const initial = hydrateSceneContinuityLedger(undefined, scenes);
  const proposed = recordSceneContinuityEvaluation(initial, scenes, {
    sceneId: 's1',
    entryState: { hero: { outfit: 'blue coat' } },
    intendedChanges: [{ path: 'hero.outfit', value: 'torn coat', reason: 'A fight occurs.' }],
    expectedExitState: { hero: { outfit: 'torn coat' } },
    status: 'consistent',
    violations: [],
    updatedAt: '2026-11-15T00:00:00.000Z',
  });
  assert.equal(proposed.scenes.s1.validationStatus, 'consistent');
  assert.equal(proposed.scenes.s1.exitState, null);
  assert.deepEqual(proposed.scenes.s1.proposedExitState, { hero: { outfit: 'torn coat' } });
  const approved = approveSceneContinuityState(proposed, scenes, 's1', '2026-11-15T00:01:00.000Z');
  assert.equal(approved.scenes.s1.validationStatus, 'creator_approved');
  assert.deepEqual(approved.scenes.s1.exitState, { hero: { outfit: 'torn coat' } });
});

test('a failed Scene evaluation cannot be promoted into canonical state', () => {
  const scenes = [{ id: 's1' }];
  const proposed = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1', entryState: {}, intendedChanges: [],
    expectedExitState: { hero: 'present' }, status: 'needs_review',
    violations: [{ path: 'hero', kind: 'missing_state' }],
  });
  assert.throws(() => approveSceneContinuityState(proposed, scenes, 's1'), /must pass continuity evaluation/);
});

test('next Scene receives only the immediately preceding creator-approved handoff', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  const proposed = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1', entryState: {}, intendedChanges: [],
    expectedExitState: { hero: { location: 'hall' } }, status: 'consistent', violations: [],
  });
  const blocked = getSceneContinuityContext(proposed, scenes, 's2');
  assert.equal(blocked?.contextComplete, false);
  assert.equal(blocked?.previousExitState, null);
  assert.throws(() => approveSceneContinuityState(proposed, scenes, 's2'), /previous Scene must have an approved continuity handoff/);
  const approved = approveSceneContinuityState(proposed, scenes, 's1');
  const ready = getSceneContinuityContext(approved, scenes, 's2');
  assert.equal(ready?.contextComplete, true);
  assert.equal(ready?.entrySnapshotStale, false);
  assert.deepEqual(ready?.previousExitState, { hero: { location: 'hall' } });
  assert.deepEqual(ready?.currentEntryState, { hero: { location: 'hall' } });
});


test('a later approved predecessor update exposes a stale downstream Scene entry snapshot', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  let ledger = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1', entryState: { hero: { location: 'room' } }, intendedChanges: [],
    expectedExitState: { hero: { location: 'hall' } }, status: 'consistent', violations: [],
    updatedAt: '2026-11-15T01:00:00.000Z',
  });
  ledger = approveSceneContinuityState(ledger, scenes, 's1', '2026-11-15T01:01:00.000Z');
  ledger = recordSceneContinuityEvaluation(ledger, scenes, {
    sceneId: 's2', entryState: { hero: { location: 'hall' } }, intendedChanges: [],
    expectedExitState: { hero: { location: 'street' } }, status: 'consistent', violations: [],
    updatedAt: '2026-11-15T01:02:00.000Z',
  });
  ledger = recordSceneContinuityEvaluation(ledger, scenes, {
    sceneId: 's1', entryState: { hero: { location: 'room' } }, intendedChanges: [],
    expectedExitState: { hero: { location: 'garden' } }, status: 'consistent', violations: [],
    updatedAt: '2026-11-15T01:03:00.000Z',
  });
  ledger = approveSceneContinuityState(ledger, scenes, 's1', '2026-11-15T01:04:00.000Z');
  const context = getSceneContinuityContext(ledger, scenes, 's2');
  assert.deepEqual(context?.previousExitState, { hero: { location: 'garden' } });
  assert.deepEqual(context?.currentEntryState, { hero: { location: 'hall' } });
  assert.equal(context?.entrySnapshotStale, true);
  assert.equal(context?.contextComplete, false);
});

test('a consistent label cannot approve a proposal that still contains violations', () => {
  const scenes = [{ id: 's1' }];
  const proposed = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1', entryState: {}, intendedChanges: [],
    expectedExitState: { hero: 'present' }, status: 'consistent',
    violations: [{ path: 'hero', kind: 'unexpected_change' }],
  });
  assert.throws(() => approveSceneContinuityState(proposed, scenes, 's1'), /no violations/);
});

test('first Scene context is incomplete until an explicit entry state exists', () => {
  const scenes = [{ id: 's1' }];
  const ledger = hydrateSceneContinuityLedger(undefined, scenes);
  const context = getSceneContinuityContext(ledger, scenes, 's1');
  assert.equal(context?.contextComplete, false);
  assert.equal(context?.currentEntryState, null);
});


test('runtime evaluates first Scene from an explicit start state and keeps result proposed', () => {
  const scenes = [{ id: 's1' }];
  const result = evaluateAndRecordSceneContinuity({
    ledger: undefined,
    scenes,
    sceneId: 's1',
    initialEntryState: { hero: { outfit: 'blue coat' } },
    observedExitState: { hero: { outfit: 'torn coat' } },
    intendedChanges: [{ path: 'hero.outfit', value: 'torn coat', reason: 'The hero is injured in the fight.' }],
    trackedPaths: ['hero.outfit'],
    updatedAt: '2026-11-15T02:00:00.000Z',
  });
  assert.equal(result.evaluation.status, 'consistent');
  assert.equal(result.ledger.scenes.s1.validationStatus, 'consistent');
  assert.equal(result.ledger.scenes.s1.exitState, null);
  assert.deepEqual(result.ledger.scenes.s1.entryState, { hero: { outfit: 'blue coat' } });
  assert.deepEqual(result.ledger.scenes.s1.proposedExitState, { hero: { outfit: 'torn coat' } });
});

test('runtime refuses later Scene evaluation until predecessor handoff is approved', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  assert.throws(() => evaluateAndRecordSceneContinuity({
    ledger: undefined, scenes, sceneId: 's2',
    observedExitState: { hero: { location: 'hall' } },
    trackedPaths: ['hero.location'],
  }), /approve the previous Scene handoff/);
});

test('runtime inherits latest approved predecessor state and refreshes stale downstream entries', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  let ledger = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1', entryState: { hero: { location: 'room' } }, intendedChanges: [],
    expectedExitState: { hero: { location: 'hall' } }, status: 'consistent', violations: [],
    updatedAt: '2026-11-15T02:01:00.000Z',
  });
  ledger = approveSceneContinuityState(ledger, scenes, 's1', '2026-11-15T02:02:00.000Z');
  const result = evaluateAndRecordSceneContinuity({
    ledger, scenes, sceneId: 's2',
    observedExitState: { hero: { location: 'street' } },
    intendedChanges: [{ path: 'hero.location', value: 'street', reason: 'The hero walks outside.' }],
    trackedPaths: ['hero.location'],
  });
  assert.equal(result.evaluation.status, 'consistent');
  assert.deepEqual(result.ledger.scenes.s2.entryState, { hero: { location: 'hall' } });
});

test('runtime caps repair attempts at two and escalates unresolved continuity to creator review', () => {
  const scenes = [{ id: 's1' }];
  const first = evaluateAndRecordSceneContinuity({
    ledger: undefined, scenes, sceneId: 's1',
    initialEntryState: { hero: { outfit: 'blue coat' } },
    observedExitState: { hero: { outfit: 'red coat' } },
    trackedPaths: ['hero.outfit'],
    attempt: 0,
  });
  assert.equal(first.evaluation.status, 'needs_review');
  assert.equal(first.retry.allowed, true);
  assert.equal(first.retry.requiresCreatorReview, false);
  assert.equal(first.repairInstructions.length, 1);
  const finalAttempt = evaluateAndRecordSceneContinuity({
    ledger: first.ledger, scenes, sceneId: 's1',
    observedExitState: { hero: { outfit: 'red coat' } },
    trackedPaths: ['hero.outfit'],
    attempt: 2,
  });
  assert.equal(finalAttempt.retry.allowed, false);
  assert.equal(finalAttempt.retry.requiresCreatorReview, true);
});
