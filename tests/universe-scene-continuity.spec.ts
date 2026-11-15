import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSceneStateTransition } from '../src/services/universeSceneContinuity.ts';

test('keeps persistent character and prop details unchanged across Scenes', () => {
  const result = evaluateSceneStateTransition({
    previousState: {
      character: { hair: 'short black', outfit: 'blue coat' },
      prop: { key: { owner: 'Milo', location: 'left hand' } },
    },
    observedState: {
      character: { hair: 'short black', outfit: 'blue coat' },
      prop: { key: { owner: 'Milo', location: 'left hand' } },
    },
    trackedPaths: ['character.hair', 'character.outfit', 'prop.key.owner', 'prop.key.location'],
  });
  assert.equal(result.status, 'consistent');
  assert.deepEqual(result.violations, []);
});

test('accepts an explicitly intended change and carries it into the next expected state', () => {
  const result = evaluateSceneStateTransition({
    previousState: { character: { outfit: 'blue coat' }, prop: { keyOwner: 'Milo' } },
    intendedChanges: [
      { path: 'character.outfit', value: 'torn blue coat', reason: 'The coat is torn during the fight.' },
      { path: 'prop.keyOwner', value: 'Nora', reason: 'Milo hands the key to Nora.' },
    ],
    observedState: { character: { outfit: 'torn blue coat' }, prop: { keyOwner: 'Nora' } },
    trackedPaths: ['character.outfit', 'prop.keyOwner'],
  });
  assert.equal(result.status, 'consistent');
  assert.deepEqual(result.expectedState, {
    character: { outfit: 'torn blue coat' },
    prop: { keyOwner: 'Nora' },
  });
});

test('flags a later Scene reverting a detail changed in an earlier Scene', () => {
  const result = evaluateSceneStateTransition({
    previousState: { character: { outfit: 'torn blue coat' } },
    observedState: { character: { outfit: 'clean blue coat' } },
    trackedPaths: ['character.outfit'],
  });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.violations[0].kind, 'unexpected_change');
});

test('flags a Scene that fails to apply an explicitly intended change', () => {
  const result = evaluateSceneStateTransition({
    previousState: { character: { location: 'workshop' } },
    intendedChanges: [{ path: 'character.location', value: 'harbor', reason: 'The character travels to the harbor.' }],
    observedState: { character: { location: 'workshop' } },
    trackedPaths: ['character.location'],
  });
  assert.equal(result.violations[0].kind, 'missed_intended_change');
});

test('flags missing tracked details instead of assuming continuity', () => {
  const result = evaluateSceneStateTransition({
    previousState: { character: { scar: 'left cheek' } },
    observedState: { character: {} },
    trackedPaths: ['character.scar'],
  });
  assert.equal(result.violations[0].kind, 'missing_state');
});

test('rejects contradictory intended changes for the same state path', () => {
  assert.throws(() => evaluateSceneStateTransition({
    previousState: { character: { location: 'workshop' } },
    intendedChanges: [
      { path: 'character.location', value: 'harbor', reason: 'Travel to harbor.' },
      { path: 'character.location', value: 'forest', reason: 'Travel to forest.' },
    ],
    observedState: { character: { location: 'harbor' } },
    trackedPaths: ['character.location'],
  }), /Conflicting intended changes/);
});
