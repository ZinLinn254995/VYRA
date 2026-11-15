import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneContinuityRepairInstructions, deriveTrackedSceneStatePaths, evaluateSceneStateTransition } from '../src/services/universeSceneContinuity.ts';

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

test('rejects unsafe state paths before writing into the expected state', () => {
  assert.throws(() => evaluateSceneStateTransition({
    previousState: {},
    intendedChanges: [{ path: '__proto__.polluted', value: true, reason: 'Invalid path.' }],
    observedState: {},
    trackedPaths: [],
  }), /safe, non-empty dot paths/);
});

test('matches approved parent-path events to tracked nested continuity details', () => {
  const result = evaluateSceneStateTransition({
    previousState: { character: { outfit: { jacket: 'blue', condition: 'clean' } } },
    intendedChanges: [{
      path: 'character.outfit',
      value: { jacket: 'blue', condition: 'torn' },
      reason: 'The jacket tears during the Scene.',
    }],
    observedState: { character: { outfit: { jacket: 'blue', condition: 'torn' } } },
    trackedPaths: ['character.outfit.jacket', 'character.outfit.condition'],
  });
  assert.equal(result.status, 'consistent');
});

test('carries an approved state change through consecutive Scene transitions', () => {
  const first = evaluateSceneStateTransition({
    previousState: { prop: { keyOwner: 'Milo' } },
    intendedChanges: [{ path: 'prop.keyOwner', value: 'Nora', reason: 'Milo gives Nora the key.' }],
    observedState: { prop: { keyOwner: 'Nora' } },
    trackedPaths: ['prop.keyOwner'],
  });
  const second = evaluateSceneStateTransition({
    previousState: first.expectedState,
    observedState: { prop: { keyOwner: 'Nora' } },
    trackedPaths: ['prop.keyOwner'],
  });
  assert.equal(first.status, 'consistent');
  assert.equal(second.status, 'consistent');
  assert.equal(second.expectedState.prop && (second.expectedState.prop as Record<string, unknown>).keyOwner, 'Nora');
});

test('builds narrowly scoped repair guidance without changing canonical state', () => {
  const evaluation = evaluateSceneStateTransition({
    previousState: { character: { hair: 'short black', outfit: 'blue coat' } },
    observedState: { character: { hair: 'long blonde', outfit: 'blue coat' } },
    trackedPaths: ['character.hair', 'character.outfit'],
  });
  const instructions = buildSceneContinuityRepairInstructions(evaluation);
  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].path, 'character.hair');
  assert.match(instructions[0].instruction, /Repair only "character.hair"/);
  assert.match(instructions[0].instruction, /Do not alter unrelated Scene details or rewrite canon/);
  assert.deepEqual(evaluation.expectedState, {
    character: { hair: 'short black', outfit: 'blue coat' },
  });
});


test('derives tracked paths for every nested persistent detail and treats arrays atomically', () => {
  const paths = deriveTrackedSceneStatePaths({
    character: { appearance: { hair: 'black', scar: 'left cheek' }, outfit: 'blue coat' },
    prop: { keys: ['brass key', 'silver key'] },
    environment: {},
  });
  assert.deepEqual(paths, [
    '@keys:$root',
    '@keys:character',
    '@keys:character.appearance',
    '@keys:prop',
    'character.appearance.hair',
    'character.appearance.scar',
    'character.outfit',
    'environment',
    'prop.keys',
  ]);
});

test('fails closed when automatic continuity path limits are exceeded', () => {
  assert.throws(() => deriveTrackedSceneStatePaths(
    { character: { hair: 'black', outfit: 'blue', scar: 'left cheek' } },
    [],
    { maxPaths: 2 },
  ), /maximum tracked continuity paths/);
  assert.throws(() => deriveTrackedSceneStatePaths(
    { character: { appearance: { hair: 'black' } } },
    [],
    { maxDepth: 1 },
  ), /maximum continuity depth/);
});

test('detects an unlisted detail change because runtime derives tracked paths automatically', async () => {
  const { evaluateAndRecordSceneContinuity } = await import('../src/services/universeSceneLedger.ts');
  const scenes = [{ id: 's1' }];
  const result = evaluateAndRecordSceneContinuity({
    ledger: undefined,
    scenes,
    sceneId: 's1',
    initialEntryState: { character: { hair: 'black', outfit: 'blue coat' } },
    observedExitState: { character: { hair: 'blond', outfit: 'blue coat' } },
    trackedPaths: [],
  });
  assert.equal(result.evaluation.status, 'needs_review');
  assert.equal(result.evaluation.violations[0].path, 'character.hair');
});


test('detects newly added nested details even when all previous leaf values remain unchanged', () => {
  const previousState = { character: { hair: 'black', outfit: 'blue coat' } };
  const result = evaluateSceneStateTransition({
    previousState,
    observedState: { character: { hair: 'black', outfit: 'blue coat', eyeColor: 'green' } },
    trackedPaths: deriveTrackedSceneStatePaths(previousState),
  });
  assert.equal(result.status, 'needs_review');
  assert.ok(result.violations.some((violation) => violation.path === 'character' && violation.reason.includes('added or removed')));
});

test('accepts an explicitly intended addition to an existing object', () => {
  const previousState = { character: { hair: 'black' } };
  const intendedChanges = [{ path: 'character.eyeColor', value: 'green', reason: 'The character reveals green eyes.' }];
  const result = evaluateSceneStateTransition({
    previousState,
    intendedChanges,
    observedState: { character: { hair: 'black', eyeColor: 'green' } },
    trackedPaths: deriveTrackedSceneStatePaths(previousState, intendedChanges),
  });
  assert.equal(result.status, 'consistent');
});
