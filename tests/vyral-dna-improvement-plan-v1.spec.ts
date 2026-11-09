import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVyralDnaImprovementPlanV1 } from '../src/services/vyralDnaImprovementPlanV1.ts';

const identity = { assetId: 'asset-1', assetVersionId: 'version-1', dnaRecordId: 'dna-1', sourceSha256: 'a'.repeat(64) };

test('maps deterministic blockers to prioritized, measurable improvements', () => {
  const plan = buildVyralDnaImprovementPlanV1({
    assessmentVersion: 1, identity,
    blockers: ['source_binding_mismatch', 'exact_reconstruction_test_failed', 'unknown_future_blocker'],
    limitations: ['no_structured_knowledge_facts'],
  });
  assert.equal(plan.improvements.length, 2);
  assert.equal(plan.improvements[0].priority, 'critical');
  assert.match(plan.improvements[1].acceptanceEvidence, /predeclared exactness criteria/);
  assert.equal(plan.informational.length, 1);
  assert.ok(plan.safety.some((item) => item.includes('does not mutate Asset DNA')));
});

test('keeps decoded sample recovery distinct from original-file recovery', () => {
  const plan = buildVyralDnaImprovementPlanV1({
    assessmentVersion: 1, identity, blockers: [],
    limitations: ['decoded_sample_recovery_does_not_restore_original_encoded_file_bytes'],
  });
  assert.match(plan.informational[0], /not original-file byte exactness/);
});

test('preserves the exact source snapshot identity in the plan', () => {
  const plan = buildVyralDnaImprovementPlanV1({
    assessmentVersion: 1, identity, blockers: ['reconstruction_test_snapshot_mismatch'], limitations: [],
  });
  assert.deepEqual(plan.sourceIdentity, identity);
  assert.equal(plan.improvements[0].target, 'reconstruction');
});
