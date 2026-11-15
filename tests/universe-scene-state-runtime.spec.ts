import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveSceneContinuityState, recordSceneContinuityEvaluation } from '../src/services/universeSceneLedger.ts';
import { evaluateSceneStateProposal } from '../src/services/universeSceneStateRuntime.ts';

const response = (sceneId = 's1', outfit = 'torn blue coat', event = 'Mira enters wearing a torn blue coat.') =>
  event + '\n<vyra-scene-state>' + JSON.stringify({
    schemaVersion: 1,
    sceneId,
    facts: [{ path: 'character.mira.outfit', value: outfit, scope: 'persistent', evidence: 'wearing a torn blue coat' }],
    intendedChanges: [{ path: 'character.mira.outfit', value: outfit, reason: 'The coat is torn in the fight.', evidence: 'wearing a torn blue coat' }],
  }) + '</vyra-scene-state>';

test('evaluates AI state against approved baseline without promoting model-suggested events to canon', () => {
  const result = evaluateSceneStateProposal({
    response: response(),
    expectedSceneId: 's1',
    scenes: [{ id: 's1' }],
    initialEntryState: { character: { mira: { outfit: 'clean blue coat' } } },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.authority, 'model_declared_unverified');
  assert.equal(result.requiresCreatorApproval, true);
  assert.equal(result.runtime.evaluation.status, 'needs_review');
  assert.equal(result.runtime.evaluation.violations[0].kind, 'unexpected_change');
  assert.deepEqual(result.runtime.ledger.scenes.s1.intendedChanges, []);
  assert.equal(result.suggestedEvents.length, 1);
  assert.equal(result.runtime.ledger.scenes.s1.validationStatus, 'needs_review');
});

test('accepts only separately creator-approved events when evaluating a Scene transition', () => {
  const approvedEvent = {
    path: 'character.mira.outfit',
    value: 'torn blue coat',
    reason: 'Creator approved the coat tear in this Scene.',
  };
  const result = evaluateSceneStateProposal({
    response: response(),
    expectedSceneId: 's1',
    scenes: [{ id: 's1' }],
    initialEntryState: { character: { mira: { outfit: 'clean blue coat' } } },
    approvedIntendedChanges: [approvedEvent],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.runtime.evaluation.status, 'consistent');
  assert.deepEqual(result.runtime.ledger.scenes.s1.intendedChanges, [approvedEvent]);
  assert.equal(result.runtime.ledger.scenes.s1.validationStatus, 'consistent');
  assert.equal(result.requiresCreatorApproval, true);
});

test('requires a current approved predecessor before evaluating later Scenes', () => {
  const scenes = [{ id: 's1' }, { id: 's2' }];
  let ledger = recordSceneContinuityEvaluation(undefined, scenes, {
    sceneId: 's1',
    entryState: { character: { location: 'room' } },
    intendedChanges: [],
    expectedExitState: { character: { location: 'hall' } },
    status: 'consistent',
    violations: [],
  });
  ledger = approveSceneContinuityState(ledger, scenes, 's1');
  const result = evaluateSceneStateProposal({
    response: response('s2'),
    expectedSceneId: 's2',
    ledger,
    scenes,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.runtime.ledger.scenes.s2.entryState, { character: { location: 'hall' } });
  assert.equal(result.runtime.evaluation.status, 'needs_review');
});

test('rejects invalid structured state without mutating the supplied ledger', () => {
  const ledger = undefined;
  const result = evaluateSceneStateProposal({
    response: 'Mira walks into the hall.',
    expectedSceneId: 's1',
    scenes: [{ id: 's1' }],
    ledger,
    initialEntryState: { character: { location: 'room' } },
  });
  assert.equal(result.ok, false);
  assert.equal(ledger, undefined);
});

test('bounds deterministic repair attempts and requires creator review after the limit', () => {
  const evaluateAt = (attempt: number) => evaluateSceneStateProposal({
    response: response(),
    expectedSceneId: 's1',
    scenes: [{ id: 's1' }],
    initialEntryState: { character: { mira: { outfit: 'clean blue coat' } } },
    attempt,
  });
  const first = evaluateAt(0);
  const second = evaluateAt(1);
  const exhausted = evaluateAt(2);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(exhausted.ok, true);
  if (!first.ok || !second.ok || !exhausted.ok) return;
  assert.deepEqual(first.runtime.retry, { allowed: true, attempt: 0, maxAttempts: 2, requiresCreatorReview: false });
  assert.deepEqual(second.runtime.retry, { allowed: true, attempt: 1, maxAttempts: 2, requiresCreatorReview: false });
  assert.deepEqual(exhausted.runtime.retry, { allowed: false, attempt: 2, maxAttempts: 2, requiresCreatorReview: true });
  assert.equal(exhausted.runtime.ledger.scenes.s1.validationStatus, 'needs_review');
});
