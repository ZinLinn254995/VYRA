import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVyralQualityV1, type VyralQualityStandardProfile } from '../src/services/vyralQualityGradingV1.ts';

const fingerprint = 'a'.repeat(64);
const profile: VyralQualityStandardProfile = {
  id: 'vyra.general-readiness',
  version: 1,
  name: 'General Vyral Readiness',
  scope: 'general',
  gradeBands: {
    S: { min: 95, max: 100 },
    A: { min: 90, max: 95 },
    B: { min: 80, max: 90 },
    C: { min: 70, max: 80 },
    D: { min: 50, max: 70 },
    F: { min: 0, max: 50 },
  },
  rules: [
    { id: 'identity.integrity', title: 'Identity and integrity', category: 'universal', evidenceClass: 'deterministic', weight: 30, required: true, hardGate: true },
    { id: 'asset.dna-coverage', title: 'Asset DNA coverage', category: 'universal', evidenceClass: 'deterministic', weight: 30, required: true },
    { id: 'instructions.clarity', title: 'Instruction clarity', category: 'workflow', appliesTo: { workflowTypes: ['video_creation'] }, evidenceClass: 'ai_assessment', weight: 20, required: true },
    { id: 'relationships.optional', title: 'Optional relationships', category: 'purpose', appliesTo: { purposes: ['character_world'] }, evidenceClass: 'creator_declared', weight: 20, required: false },
  ],
};

const evidenceClassByRule: Record<string, 'deterministic' | 'creator_declared' | 'ai_assessment' | 'generation_test'> = {
  'identity.integrity': 'deterministic',
  'asset.dna-coverage': 'deterministic',
  'instructions.clarity': 'ai_assessment',
  'relationships.optional': 'creator_declared',
};
const finding = (ruleId: string, status: 'pass' | 'partial' | 'fail' | 'not_applicable' | 'not_evaluated', evidenceRefs: string[] = ['evidence://test']) => ({
  ruleId, evidenceClass: evidenceClassByRule[ruleId], status, evidenceRefs,
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

test('does not silently treat an applicable but unevaluated optional rule as a pass', () => {
  const result = evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      finding('identity.integrity', 'pass'),
      finding('asset.dna-coverage', 'pass'),
      finding('instructions.clarity', 'pass'),
    ],
  });
  assert.equal(result.status, 'incomplete_evidence');
  assert.equal(result.grade, null);
  assert.deepEqual(result.missingApplicableEvidence, ['relationships.optional']);
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

test('rejects evidence classes that do not match the standard and non-deterministic hard gates', () => {
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint, profile,
    findings: [{ ...finding('identity.integrity', 'pass'), evidenceClass: 'ai_assessment' }],
  }), /Evidence class does not match/);
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile: { ...profile, rules: [{ ...profile.rules[0], evidenceClass: 'ai_assessment' }, ...profile.rules.slice(1)] },
    findings: [],
  }), /invalid rule definition/);
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


test('assigns exact score boundaries to one and only one grade', () => {
  const gradeAt = (score: number) => {
    const boundaryProfile: VyralQualityStandardProfile = {
      id: 'vyra.boundary',
      version: 1,
      name: 'Boundary test',
      scope: 'general',
      gradeBands: {
        S: { min: 95, max: 100 },
        A: { min: 90, max: 95 },
        B: { min: 80, max: 90 },
        C: { min: 70, max: 80 },
        D: { min: 50, max: 70 },
        F: { min: 0, max: 50 },
      },
      rules: [
        { id: 'score.earned', title: 'Earned points', category: 'universal', evidenceClass: 'deterministic', weight: score, required: true },
        { id: 'score.unearned', title: 'Unearned points', category: 'universal', evidenceClass: 'deterministic', weight: 100 - score, required: true },
      ],
    };
    const result = evaluateVyralQualityV1({
      vyralId: 'vyral-boundary',
      snapshotFingerprint: fingerprint,
      profile: boundaryProfile,
      findings: [
        { ruleId: 'score.earned', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['evidence://earned'] },
        { ruleId: 'score.unearned', evidenceClass: 'deterministic', status: 'fail', evidenceRefs: ['evidence://unearned'] },
      ],
    });
    return { score: result.score, grade: result.grade };
  };
  assert.deepEqual(gradeAt(95), { score: 95, grade: 'S' });
  assert.deepEqual(gradeAt(90), { score: 90, grade: 'A' });
  assert.deepEqual(gradeAt(80), { score: 80, grade: 'B' });
  assert.deepEqual(gradeAt(70), { score: 70, grade: 'C' });
  assert.deepEqual(gradeAt(50), { score: 50, grade: 'D' });
  assert.deepEqual(gradeAt(0), { score: 0, grade: 'F' });
});

test('rejects custom grade bands with gaps, overlaps, or missing grades', () => {
  const findings = [
    finding('identity.integrity', 'pass'),
    finding('asset.dna-coverage', 'pass'),
    finding('instructions.clarity', 'pass'),
    finding('relationships.optional', 'not_applicable', []),
  ];
  const evaluateWithBands = (gradeBands: VyralQualityStandardProfile['gradeBands']) =>
    evaluateVyralQualityV1({ vyralId: 'vyral-bands', snapshotFingerprint: fingerprint, profile: { ...profile, gradeBands }, findings });

  assert.throws(() => evaluateWithBands({
    S: { min: 96, max: 100 }, A: { min: 90, max: 95 }, B: { min: 80, max: 90 },
    C: { min: 70, max: 80 }, D: { min: 50, max: 70 }, F: { min: 0, max: 50 },
  }), /contiguous and non-overlapping/);
  assert.throws(() => evaluateWithBands({
    S: { min: 95, max: 100 }, A: { min: 90, max: 96 }, B: { min: 80, max: 90 },
    C: { min: 70, max: 80 }, D: { min: 50, max: 70 }, F: { min: 0, max: 50 },
  }), /contiguous and non-overlapping/);
  assert.throws(() => evaluateWithBands({
    S: { min: 95, max: 100 }, A: { min: 90, max: 95 }, B: { min: 80, max: 90 },
    C: { min: 70, max: 80 }, D: { min: 50, max: 70 },
  }), /all six grade bands/);
  assert.throws(
    () => evaluateWithBands(undefined as unknown as VyralQualityStandardProfile['gradeBands']),
    /explicitly define all six grade bands/
  );
});

test('rejects duplicate evidence references and invalid hard-gate flags', () => {
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint, profile,
    findings: [{ ...finding('identity.integrity', 'pass'), evidenceRefs: ['evidence://same', 'evidence://same'] }],
  }), /non-empty and unique/);
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1', snapshotFingerprint: fingerprint,
    profile: { ...profile, rules: [{ ...profile.rules[0], hardGate: 'yes' as unknown as boolean }, ...profile.rules.slice(1)] },
    findings: [],
  }), /invalid rule definition/);
});

test('rejects evidence keys assigned to an incompatible evidence trust class', () => {
  const invalidProfile: VyralQualityStandardProfile = {
    ...profile,
    rules: [
      { ...profile.rules[0], evidenceKey: 'reconstruction.byte_exact' },
      ...profile.rules.slice(1),
    ],
  };
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile: invalidProfile,
    findings: [],
  }), /invalid rule definition/);
});

test('rejects unknown evidence keys in untrusted published profile JSON', () => {
  const invalidRule = {
    ...profile.rules[0],
    evidenceKey: 'browser.claimed-proof',
  } as unknown as VyralQualityStandardProfile['rules'][number];
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-1',
    snapshotFingerprint: fingerprint,
    profile: { ...profile, rules: [invalidRule, ...profile.rules.slice(1)] },
    findings: [],
  }), /invalid rule definition/);
});

test('rejects scoped rules without exact matching selectors or with unrelated selectors', () => {
  const malformed = [
    { ...profile.rules[2], appliesTo: undefined },
    { ...profile.rules[2], appliesTo: { purposes: ['video'] } },
    { ...profile.rules[0], appliesTo: { assetTypes: ['image'] } },
    { ...profile.rules[2], appliesTo: { workflowTypes: ['video'], assetTypes: ['image'] } },
  ];
  for (const rule of malformed) {
    assert.throws(() => evaluateVyralQualityV1({
      vyralId: 'vyral-scope',
      snapshotFingerprint: fingerprint,
      profile: { ...profile, rules: [rule, ...profile.rules.slice(1).filter((item) => item.id !== rule.id)] },
      findings: [],
    }), /invalid rule definition/);
  }
});

test('rejects standards with zero total configured weight', () => {
  const zeroWeightProfile = {
    ...profile,
    rules: profile.rules.map((rule) => ({ ...rule, weight: 0 })),
  };
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-zero-weight',
    snapshotFingerprint: fingerprint,
    profile: zeroWeightProfile,
    findings: [],
  }), /positive total weight/);
});

test('rejects oversized standard rule inventories', () => {
  const manyRules = Array.from({ length: 201 }, (_, index) => ({
    ...profile.rules[0],
    id: `rule.${index}`,
  }));
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-many-rules',
    snapshotFingerprint: fingerprint,
    profile: { ...profile, rules: manyRules },
    findings: [],
  }), /more than 200 rules/);
});

test('rejects extra grade bands and malformed band fields', () => {
  const findings = [
    finding('identity.integrity', 'pass'),
    finding('asset.dna-coverage', 'pass'),
    finding('instructions.clarity', 'pass'),
    finding('relationships.optional', 'not_applicable', []),
  ];
  const evaluateBands = (gradeBands: unknown) => evaluateVyralQualityV1({
    vyralId: 'vyral-extra-bands',
    snapshotFingerprint: fingerprint,
    profile: { ...profile, gradeBands } as VyralQualityStandardProfile,
    findings,
  });
  assert.throws(() => evaluateBands({
    ...profile.gradeBands,
    X: { min: 0, max: 0 },
  }), /exactly all six grade bands/);
  assert.throws(() => evaluateBands({
    ...profile.gradeBands,
    S: { ...profile.gradeBands.S, note: 'unexpected' },
  }), /Invalid score range for grade S/);
});

test('rejects duplicate selector values that differ only by case or whitespace', () => {
  const duplicateSelectorRule = {
    ...profile.rules[2],
    appliesTo: { workflowTypes: ['video_creation', ' Video_Creation '] },
  };
  assert.throws(() => evaluateVyralQualityV1({
    vyralId: 'vyral-duplicate-selectors',
    snapshotFingerprint: fingerprint,
    profile: {
      ...profile,
      rules: [profile.rules[0], profile.rules[1], duplicateSelectorRule, profile.rules[3]],
    },
    findings: [],
  }), /invalid rule definition/);
});
