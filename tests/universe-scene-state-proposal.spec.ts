import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSceneStateProposal } from '../src/services/universeSceneStateProposal.ts';

const makeResponse = (facts: unknown[] = [], intendedChanges: unknown[] = []) => {
  const narrative = 'Mira enters the hall wearing a torn blue coat. She leaves the silver key on the table.';
  return narrative + '\n<vyra-scene-state>' + JSON.stringify({
    schemaVersion: 1, sceneId: 'scene-1', facts, intendedChanges,
  }) + '</vyra-scene-state>';
};

test('parses explicit state facts and retains model-only proposal authority', () => {
  const response = makeResponse([
    { path: 'character.mira.outfit', value: 'torn blue coat', scope: 'persistent', evidence: 'wearing a torn blue coat' },
    { path: 'props.silverKey.location', value: 'on the table', scope: 'scene_state', evidence: 'leaves the silver key on the table' },
  ], [
    { path: 'props.silverKey.location', value: 'on the table', reason: 'Mira leaves the key behind.', evidence: 'leaves the silver key on the table' },
  ]);
  const result = parseSceneStateProposal(response, 'scene-1');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.proposal.observedExitState, {
    character: { mira: { outfit: 'torn blue coat' } },
    props: { silverKey: { location: 'on the table' } },
  });
  assert.equal(result.proposal.authority, 'model_declared_unverified');
  assert.equal(result.proposal.status, 'proposal');
  assert.equal(result.proposal.intendedChanges.length, 1);
});


test('rejects an empty state snapshot so continuity cannot pass vacuously', () => {
  assert.equal(parseSceneStateProposal(makeResponse([], []), 'scene-1').ok, false);
});

test('rejects prose-only output rather than guessing Scene state', () => {
  assert.equal(parseSceneStateProposal('Mira walks into a hall.', 'scene-1').ok, false);
});

test('requires exact evidence excerpts to occur in the generated narrative', () => {
  const result = parseSceneStateProposal(makeResponse([
    { path: 'character.hair', value: 'black', scope: 'persistent', evidence: 'hair is black' },
  ]), 'scene-1');
  assert.equal(result.ok, false);
});

test('rejects mismatched Scene IDs and unsupported schema versions', () => {
  const wrongScene = makeResponse([{ path: 'hero.location', value: 'hall', scope: 'scene_state', evidence: 'enters the hall' }]);
  assert.equal(parseSceneStateProposal(wrongScene, 'scene-2').ok, false);
  const wrongSchema = wrongScene.replace('"schemaVersion":1', '"schemaVersion":2');
  assert.equal(parseSceneStateProposal(wrongSchema, 'scene-1').ok, false);
});

test('rejects duplicate, unsafe and overlapping state paths', () => {
  const duplicate = makeResponse([
    { path: 'hero.location', value: 'hall', scope: 'scene_state', evidence: 'enters the hall' },
    { path: 'hero.location', value: 'street', scope: 'scene_state', evidence: 'enters the hall' },
  ]);
  assert.equal(parseSceneStateProposal(duplicate, 'scene-1').ok, false);
  const unsafe = makeResponse([
    { path: '__proto__.polluted', value: true, scope: 'scene_state', evidence: 'enters the hall' },
  ]);
  assert.equal(parseSceneStateProposal(unsafe, 'scene-1').ok, false);
  const overlap = makeResponse([
    { path: 'hero', value: { location: 'hall' }, scope: 'scene_state', evidence: 'enters the hall' },
    { path: 'hero.location', value: 'hall', scope: 'scene_state', evidence: 'enters the hall' },
  ]);
  assert.equal(parseSceneStateProposal(overlap, 'scene-1').ok, false);
});

test('rejects malformed or ungrounded intended changes', () => {
  const result = parseSceneStateProposal(makeResponse([], [
    { path: 'hero.location', value: 'street', reason: 'A transition happened.', evidence: 'nowhere in the narrative' },
  ]), 'scene-1');
  assert.equal(result.ok, false);
});

test('rejects duplicate structured blocks and oversized responses', () => {
  const valid = makeResponse();
  assert.equal(parseSceneStateProposal(valid + valid.slice(valid.indexOf('<vyra-scene-state>')), 'scene-1').ok, false);
  assert.equal(parseSceneStateProposal('x'.repeat(40_001), 'scene-1').ok, false);
});
