import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVyralAssetDnaV1, type VyralAssetDnaAssessmentInput } from '../src/services/vyralAssetDnaAssessmentV1.ts';

const base = (): VyralAssetDnaAssessmentInput => ({
  assetId: 'asset-1',
  assetVersionId: 'version-1',
  sourceSha256: 'a'.repeat(64),
  sourceSizeBytes: 4096,
  dnaRecordId: 'dna-1',
  dnaSchemaId: 'vyra.asset-dna',
  dnaSchemaVersion: 3,
  dnaSource: { assetId: 'asset-1', assetVersionId: 'version-1', sha256: 'a'.repeat(64), sizeBytes: 4096 },
  structure: { schemaValid: true, provenanceVerified: true, knowledgeFactCount: 4 },
  recovery: {
    declaredLevel: 'decoded_samples_exact',
    payloadPresent: true,
    payloadIntegrityVerified: true,
    exactTest: {
      status: 'passed', mode: 'decoded_samples_exact',
      assetVersionId: 'version-1', dnaRecordId: 'dna-1', sourceSha256: 'a'.repeat(64),
    },
  },
});

test('assesses a pinned, verified decoded-sample reconstruction as Asset DNA ready', () => {
  const result = assessVyralAssetDnaV1(base());
  assert.equal(result.scope, 'asset_dna');
  assert.equal(result.status, 'ready');
  assert.equal(result.checks.sourceBinding, 'pass');
  assert.equal(result.checks.exactReconstruction, 'pass');
  assert.ok(result.limitations.includes('decoded_sample_recovery_does_not_restore_original_encoded_file_bytes'));
});

test('does not confuse decoded-sample exactness with original source-file exactness', () => {
  const input = base();
  input.recovery.declaredLevel = 'source_file_exact';
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('reconstruction_test_mode_or_payload_mismatch'));
});

test('blocks source identity mismatches', () => {
  const input = base();
  input.dnaSource.sha256 = 'b'.repeat(64);
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.sourceBinding, 'fail');
  assert.ok(result.blockers.includes('source_binding_mismatch'));
});

test('does not pass reconstruction when payload integrity has not been verified', () => {
  const input = base();
  input.recovery.payloadIntegrityVerified = false;
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.payloadIntegrity, 'fail');
  assert.ok(result.blockers.includes('reconstruction_payload_integrity_unverified'));
});

test('does not infer exact recovery from a declaration without a test', () => {
  const input = base();
  input.recovery.exactTest = null;
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.checks.exactReconstruction, 'not_tested');
  assert.ok(result.limitations.includes('source_file_exact_claim_not_test_verified') === false);
});

test('keeps semantic-only DNA explicitly partial', () => {
  const input = base();
  input.recovery = { declaredLevel: 'semantic_only', payloadPresent: false, payloadIntegrityVerified: false, exactTest: null };
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.recoveryLevel, 'semantic_only');
  assert.equal(result.checks.payloadIntegrity, 'not_applicable');
});

test('rejects malformed assessment identity and evidence', () => {
  const input = base();
  input.sourceSha256 = 'bad';
  assert.throws(() => assessVyralAssetDnaV1(input), /identity is invalid/);
  const malformed = base();
  malformed.structure.knowledgeFactCount = -1;
  assert.throws(() => assessVyralAssetDnaV1(malformed), /evidence is malformed/);
});

test('rejects a reconstruction test pinned to a different DNA record', () => {
  const input = base();
  input.recovery.exactTest!.dnaRecordId = 'dna-other';
  const result = assessVyralAssetDnaV1(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('reconstruction_test_snapshot_mismatch'));
});
