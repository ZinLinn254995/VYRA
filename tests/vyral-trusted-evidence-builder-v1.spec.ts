import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVyralTrustedEvidenceFindingsV1 } from '../src/services/vyralTrustedEvidenceBuilderV1.ts';
import type { VyralMasterDnaV1 } from '../src/services/vyralMasterDnaV1.ts';
import type { VyralQualityStandardProfile } from '../src/services/vyralQualityGradingV1.ts';

const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const verifiedFingerprint = { verification_status: 'server_verified', verified_by: 'verify-vyral-asset', comparison_status: 'matched', actual_size_bytes: 1024 };
const masterDna = {
  assets: [
    { asset_id: 'asset-a', asset_version_id: 'version-a', dna_ref: { record_id: 'dna-a' } },
    { asset_id: 'asset-b', asset_version_id: 'version-b', dna_ref: { record_id: 'dna-b' } },
  ],
} as unknown as VyralMasterDnaV1;

const profile = (evidenceKey: 'snapshot.integrity' | 'fingerprint.cryptographic' | 'reconstruction.byte_exact' | 'reconstruction.decoded_exact' | 'vision.corroborated', evidenceClass: 'deterministic' | 'generation_test' | 'ai_assessment'): VyralQualityStandardProfile => ({
  id: 'test.standard',
  version: 1,
  name: 'Evidence test',
  scope: 'general',
  gradeBands: {
    S: { min: 95, max: 100 }, A: { min: 90, max: 95 }, B: { min: 80, max: 90 },
    C: { min: 70, max: 80 }, D: { min: 50, max: 70 }, F: { min: 0, max: 50 },
  },
  rules: [{ id: 'evidence.rule', title: 'Evidence coverage', category: 'universal', evidenceClass, weight: 10, required: true, evidenceKey }],
});

const base = {
  masterDna,
  masterDnaRevisionId: 'revision-7',
  assetVersions: [
    { asset_id: 'asset-a', asset_version_id: 'version-a', sha256: shaA },
    { asset_id: 'asset-b', asset_version_id: 'version-b', sha256: shaB },
  ],
  fingerprints: [],
  reconstructionTests: [],
  visionObservations: [],
};


test('pins snapshot integrity to the immutable Master DNA revision ID', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('snapshot.integrity', 'deterministic'),
  });
  assert.equal(result[0].status, 'pass');
  assert.deepEqual(result[0].evidenceRefs, ['revision-7']);
});

test('requires a matching SHA-256 cryptographic fingerprint for every exact Asset Version', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('fingerprint.cryptographic', 'deterministic'),
    fingerprints: [
      { id: 'fp-a', asset_id: 'asset-a', asset_version_id: 'version-a', fingerprint_kind: 'cryptographic', algorithm: 'SHA256', value: shaA, metadata: verifiedFingerprint },
      { id: 'fp-b', asset_id: 'asset-b', asset_version_id: 'version-b', fingerprint_kind: 'cryptographic', algorithm: 'sha256', value: shaB, metadata: verifiedFingerprint },
    ],
  });
  assert.equal(result[0].status, 'pass');
  assert.deepEqual(result[0].evidenceRefs, ['fp-a', 'fp-b']);
});


test('does not treat client-created cryptographic fingerprint rows as trusted evidence', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('fingerprint.cryptographic', 'deterministic'),
    fingerprints: [
      { id: 'client-fp-a', asset_id: 'asset-a', asset_version_id: 'version-a', fingerprint_kind: 'cryptographic', algorithm: 'SHA-256', value: shaA, metadata: {} },
      { id: 'client-fp-b', asset_id: 'asset-b', asset_version_id: 'version-b', fingerprint_kind: 'cryptographic', algorithm: 'SHA-256', value: shaB, metadata: {} },
    ],
  });
  assert.equal(result[0].status, 'not_evaluated');
});

test('does not treat partial fingerprint coverage as a pass', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('fingerprint.cryptographic', 'deterministic'),
    fingerprints: [
      { id: 'fp-a', asset_id: 'asset-a', asset_version_id: 'version-a', fingerprint_kind: 'cryptographic', algorithm: 'sha256', value: shaA, metadata: verifiedFingerprint },
    ],
  });
  assert.equal(result[0].status, 'not_evaluated');
});

test('accepts only trusted byte-exact verifier evidence pinned to the snapshot DNA record', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('reconstruction.byte_exact', 'generation_test'),
    reconstructionTests: [
      { id: 'test-a', asset_id: 'asset-a', asset_version_id: 'version-a', dna_record_id: 'dna-a', comparison_mode: 'byte_exact', test_status: 'passed', exact_match: true, model_id: 'universal-file-dna-v1-readback-verifier' },
      { id: 'test-b', asset_id: 'asset-b', asset_version_id: 'version-b', dna_record_id: 'dna-b', comparison_mode: 'byte_exact', test_status: 'passed', exact_match: true, model_id: 'universal-file-dna-v1-readback-verifier' },
    ],
  });
  assert.equal(result[0].status, 'pass');
  assert.deepEqual(result[0].evidenceRefs, ['test-a', 'test-b']);
});

test('does not trust model-generated or wrong-DNA reconstruction claims as exact proof', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('reconstruction.byte_exact', 'generation_test'),
    reconstructionTests: [
      { id: 'test-a', asset_id: 'asset-a', asset_version_id: 'version-a', dna_record_id: 'dna-a', comparison_mode: 'byte_exact', test_status: 'passed', exact_match: true, model_id: 'external-ai-model' },
      { id: 'test-b', asset_id: 'asset-b', asset_version_id: 'version-b', dna_record_id: 'wrong-dna', comparison_mode: 'byte_exact', test_status: 'passed', exact_match: true, model_id: 'universal-file-dna-v1-readback-verifier' },
    ],
  });
  assert.equal(result[0].status, 'not_evaluated');
  assert.deepEqual(result[0].evidenceRefs, []);
});

test('a trusted exact reconstruction failure is a failure, not missing evidence', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('reconstruction.decoded_exact', 'generation_test'),
    reconstructionTests: [
      { id: 'test-a', asset_id: 'asset-a', asset_version_id: 'version-a', dna_record_id: 'dna-a', comparison_mode: 'decoded_exact', test_status: 'failed', exact_match: false, model_id: 'vyral-dna-v3-readback-verifier' },
    ],
  });
  assert.equal(result[0].status, 'fail');
  assert.deepEqual(result[0].evidenceRefs, ['test-a']);
});

test('requires source SHA-256 match for corroborated vision observations', () => {
  const result = buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('vision.corroborated', 'ai_assessment'),
    visionObservations: [
      { id: 'vision-a', asset_id: 'asset-a', asset_version_id: 'version-a', verification_status: 'corroborated', source_sha256: shaA },
      { id: 'vision-b', asset_id: 'asset-b', asset_version_id: 'version-b', verification_status: 'corroborated', source_sha256: shaA },
    ],
  });
  assert.equal(result[0].status, 'not_evaluated');
  assert.deepEqual(result[0].evidenceRefs, ['vision-a']);
});

test('rejects evidence rows outside the pinned snapshot', () => {
  assert.throws(() => buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('fingerprint.cryptographic', 'deterministic'),
    fingerprints: [{ id: 'foreign', asset_id: 'other-asset', asset_version_id: 'other-version', fingerprint_kind: 'cryptographic', algorithm: 'sha256', value: shaA }],
  }), /outside the exact Master DNA Asset Version snapshot/);
});

test('rejects missing source hashes and evidence-class mismatches', () => {
  assert.throws(() => buildVyralTrustedEvidenceFindingsV1({
    ...base,
    assetVersions: [{ asset_id: 'asset-a', asset_version_id: 'version-a', sha256: null }],
    profile: profile('fingerprint.cryptographic', 'deterministic'),
  }), /SHA-256 is missing or ambiguous/);
  assert.throws(() => buildVyralTrustedEvidenceFindingsV1({
    ...base,
    profile: profile('fingerprint.cryptographic', 'ai_assessment'),
  }), /incompatible evidence class/);
});
