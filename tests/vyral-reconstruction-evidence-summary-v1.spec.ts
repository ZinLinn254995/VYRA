import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVyralReconstructionEvidenceV1 } from '../src/services/vyralReconstructionEvidenceSummaryV1.ts';

test('empty evidence requests controlled blind attempts', () => {
  const result = summarizeVyralReconstructionEvidenceV1([]);
  assert.equal(result.totalAttempts, 0);
  assert.equal(result.bestSimilarity, null);
  assert.ok(result.evidenceGaps.includes('no_reconstruction_attempts'));
  assert.ok(result.nextActions.some((item) => item.includes('three isolated')));
});

test('similarity never upgrades non-exact attempts', () => {
  const result = summarizeVyralReconstructionEvidenceV1([{
    id: 'a', test_status: 'failed', exact_match: false, similarity_score: 0.9999,
    model_version: 'v1', prompt_sha256: 'a'.repeat(64), tool_access: { browser: false },
    blindness_status: 'creator_attested',
  }]);
  assert.equal(result.exactMatches, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.bestSimilarity, 0.9999);
  assert.ok(result.evidenceGaps.includes('blindness_not_independently_verified'));
  assert.ok(result.evidenceGaps.includes('fewer_than_three_attempts'));
});

test('missing evidence is reported and next actions are specific', () => {
  const result = summarizeVyralReconstructionEvidenceV1([
    { id: 'a', test_status: 'inconclusive', exact_match: null },
    { id: 'b', test_status: 'failed', exact_match: false },
    { id: 'c', test_status: 'passed', exact_match: true, similarity_score: 1 },
  ]);
  assert.equal(result.totalAttempts, 3);
  assert.equal(result.exactMatches, 1);
  assert.equal(result.inconclusive, 1);
  assert.ok(result.evidenceGaps.includes('model_version_missing'));
  assert.ok(result.evidenceGaps.includes('prompt_hash_missing'));
  assert.ok(result.evidenceGaps.includes('tool_access_missing'));
  assert.ok(result.nextActions.some((item) => item.includes('preserve the prior DNA version')));
});

test('creator-attested attempts require a matching semantic-only zero-binary package audit', () => {
  const base = {
    id: 'semantic-attempt',
    test_status: 'inconclusive',
    exact_match: false,
    model_version: 'model-v1',
    prompt_sha256: 'b'.repeat(64),
    tool_access: { browser: false, file_access: false },
    blindness_status: 'creator_attested',
  };
  const missing = summarizeVyralReconstructionEvidenceV1([base]);
  assert.ok(missing.evidenceGaps.includes('semantic_package_audit_missing_or_invalid'));
  assert.ok(missing.nextActions.some((item) => item.includes('zero-binary-entry report')));
  const verified = summarizeVyralReconstructionEvidenceV1([{
    ...base,
    attempt_evidence: {
      blindness: {
        scope: 'semantic_only_no_media_payload',
        packageAudit: {
          status: 'passed',
          acceptedAsSemanticOnly: true,
          originalBinaryPayloadEntries: 0,
          packageSha256: 'c'.repeat(64),
        },
      },
    },
  }]);
  assert.ok(!verified.evidenceGaps.includes('semantic_package_audit_missing_or_invalid'));
  assert.ok(verified.evidenceGaps.includes('blindness_not_independently_verified'));
});
