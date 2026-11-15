import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hydrateSceneContinuityLedger } from '../src/services/universeSceneLedger.ts';

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
