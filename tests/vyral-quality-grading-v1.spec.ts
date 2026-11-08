import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVyralQualityV1, type VyralQualityStandardProfile } from '../src/services/vyralQualityGradingV1.ts';

const fingerprint = 'a'.repeat(64);
const profile: VyralQualityStandardProfile = {
  id: 'vyra.general-readiness',
  version: 1,
  name: 'General Vyral Readiness',
  scope: 'general',
  rules: [
    { id: 'identity.integrity', title: 'Identity and integrity', category: 'universal', evidenceClass: 'deterministic', weight: 30, required: true, hardGate: true },
    { id: 'asset.dna-coverage', title: 'Asset DNA coverage', category: 'universal', evidenceClass: 'deterministic', weight: 30, required: true },
    { id: 'instructions.clarity', title: 'Instruction clarity', category: 'workflow', evidenceClass: 'ai_assessment', weight: 20, required: true },
    { id: 'relationships.optional', title: 'Optional relationships', category: 'purpose', evidenceClass: 'creator_declared', weight: 20, required: false },
  ],
};

const finding = (ruleId: string, status: 'pass' | 'partial' | 'fail' | 'not_applicable' | 'not_evaluated', evidenceRefs: string[] = ['evidence://test']) => ({
  ruleId, status, evidenceRefs,
});

test('computes a deterministic grade from weighted, evidence-backed rule findings', () => {
  const result = evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      finding('identity.integrity', 'pass'),
      finding('asset.dna-coverage', 'pass'),
      finding('instructions.clarity', 'partial'),
      finding('relationships.optional', 'not_applicable', []),
    ],
  });
  assert.equal(result.status, 'graded');
  assert.equal(result.score, 87.5);
  assert.equal(result.grade, 'B');
  assert.equal(result.standard.version, 1);
});

test('does not grade when required evidence is missing', () => {
  const result = evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      finding('identity.integrity', 'pass'),
      finding('asset.dna-coverage', 'not_evaluated', []),
      finding('instructions.clarity', 'pass'),
    ],
  });
  assert.equal(result.status, 'incomplete_evidence');
  assert.equal(result.score, null);
  assert.equal(result.grade, null);
  assert.deepEqual(result.missingRequiredEvidence, ['asset.dna-coverage']);
});

test('hard-gate failure blocks grading even when other rules pass', () => {
  const result = evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      finding('identity.integrity', 'fail'),
      finding('asset.dna-coverage', 'pass'),
      finding('instructions.clarity', 'pass'),
    ],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.score, null);
  assert.equal(result.grade, null);
  assert.deepEqual(result.hardGateFailures, ['identity.integrity']);
});

test('does not require optional relationships for an unrelated Asset collection', () => {
  const result = evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      finding('identity.integrity', 'pass'),
      finding('asset.dna-coverage', 'pass'),
      finding('instructions.clarity', 'pass'),
      finding('relationships.optional', 'not_applicable', []),
    ],
  });
  assert.equal(result.status, 'graded');
  assert.equal(result.grade, 'S');
});

test('rejects unsupported rule IDs, duplicate findings, and scored findings without evidence', () => {
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint, profile,
    findings: [finding('unknown.rule', 'pass')],
  }), /unknown rule ID/);
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint, profile,
    findings: [finding('identity.integrity', 'pass'), finding('identity.integrity', 'pass')],
  }), /Duplicate finding/);
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint, profile,
    findings: [finding('identity.integrity', 'pass', [])],
  }), /requires evidence/);
});

test('rejects malformed snapshot fingerprints and duplicate standard rule IDs', () => {
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: 'not-a-hash', profile, findings: [],
  }), /SHA-256 snapshot fingerprint/);
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile: { ...profile, rules: [...profile.rules, profile.rules[0]] },
    findings: [],
  }), /Duplicate quality rule ID/);
});
