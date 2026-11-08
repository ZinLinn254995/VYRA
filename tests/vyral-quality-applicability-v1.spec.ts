import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVyralQualityV1 } from '../src/services/vyralQualityGradingV1.ts';
import { resolveVyralQualityApplicabilityV1 } from '../src/services/vyralQualityApplicabilityV1.ts';
import type { VyralQualityStandardProfile } from '../src/services/vyralQualityGradingV1.ts';

const profile: VyralQualityStandardProfile = {
  id: 'vyra.multi-asset',
  version: 1,
  name: 'Multi-asset collection',
  scope: 'general',
  rules: [
    { id: 'identity.integrity', title: 'Identity integrity', category: 'universal', evidenceClass: 'deterministic', weight: 40, required: true, hardGate: true },
    { id: 'image.visual-quality', title: 'Visual quality', category: 'asset_type', evidenceClass: 'ai_assessment', weight: 30, required: true, appliesTo: { assetTypes: ['image', 'illustration'] } },
    { id: 'audio.signal-quality', title: 'Audio signal quality', category: 'asset_type', evidenceClass: 'deterministic', weight: 30, required: true, appliesTo: { assetTypes: ['audio', 'music'] } },
    { id: 'purpose.storytelling', title: 'Storytelling suitability', category: 'purpose', evidenceClass: 'creator_declared', weight: 10, required: false, appliesTo: { purposes: ['storytelling'] } },
    { id: 'workflow.video-production', title: 'Video production workflow', category: 'workflow', evidenceClass: 'creator_declared', weight: 10, required: false, appliesTo: { workflowTypes: ['video-production'] } },
  ],
};

const fingerprint = 'b'.repeat(64);

test('does not apply image rules to an audio-only Vyral and explicitly seeds N/A findings', () => {
  const applicability = resolveVyralQualityApplicabilityV1(profile, { assetTypes: ['audio'] });
  assert.deepEqual(applicability.notApplicableRuleIds, [
    'image.visual-quality',
    'purpose.storytelling',
    'workflow.video-production',
  ]);
  assert.deepEqual(applicability.applicableRuleIds, ['identity.integrity', 'audio.signal-quality']);
  assert.ok(applicability.seededFindings.every((finding) => finding.status === 'not_applicable'));

  const evaluation = evaluateVyralQualityV1({
    vyralId: 'audio-vyral',
    snapshotFingerprint: fingerprint,
    profile,
    findings: [
      ...applicability.seededFindings,
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://identity'] },
      { ruleId: 'audio.signal-quality', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://audio'] },
    ],
  });
  assert.equal(evaluation.status, 'graded');
  assert.equal(evaluation.score, 100);
  assert.equal(evaluation.grade, 'S');
});

test('matches multiple declared asset types without requiring unrelated relationships', () => {
  const applicability = resolveVyralQualityApplicabilityV1(profile, {
    assetTypes: ['document', 'image'],
    purpose: 'reference-library',
  });
  assert.ok(applicability.applicableRuleIds.includes('image.visual-quality'));
  assert.ok(!applicability.applicableRuleIds.includes('audio.signal-quality'));
  assert.ok(applicability.notApplicableRuleIds.includes('purpose.storytelling'));
});

test('matches purpose and workflow selectors case-insensitively', () => {
  const applicability = resolveVyralQualityApplicabilityV1(profile, {
    assetTypes: [],
    purpose: 'STORYTELLING',
    workflowType: 'Video-Production',
  });
  assert.ok(applicability.applicableRuleIds.includes('purpose.storytelling'));
  assert.ok(applicability.applicableRuleIds.includes('workflow.video-production'));
});

test('fails closed when a scoped rule has no explicit applicability selector', () => {
  const invalid = {
    ...profile,
    rules: profile.rules.map((rule) =>
      rule.id === 'image.visual-quality' ? { ...rule, appliesTo: undefined } : rule
    ),
  };
  assert.throws(
    () => resolveVyralQualityApplicabilityV1(invalid, { assetTypes: ['audio'] }),
    /must declare appliesTo.assetTypes/
  );
});

test('rejects malformed asset type context instead of guessing', () => {
  assert.throws(
    () => resolveVyralQualityApplicabilityV1(profile, { assetTypes: ['audio', '  '] }),
    /Asset types must be non-empty strings/
  );
});
