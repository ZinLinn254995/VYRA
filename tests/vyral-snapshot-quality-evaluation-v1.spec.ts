import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVyralSnapshotQualityV1 } from '../src/services/vyralSnapshotQualityEvaluationV1.ts';
import { createVyralMasterDnaV1, type VyralMasterDnaV1 } from '../src/services/vyralMasterDnaV1.ts';
import type { VyralQualityStandardProfile } from '../src/services/vyralQualityGradingV1.ts';

const fingerprint = 'c'.repeat(64);
const profile: VyralQualityStandardProfile = {
  id: 'vyra.creator-readiness',
  version: 3,
  name: 'Creator readiness',
  scope: 'general',
  rules: [
    { id: 'identity.integrity', title: 'Snapshot identity', category: 'universal', evidenceClass: 'deterministic', weight: 50, required: true, hardGate: true },
    { id: 'audio.quality', title: 'Audio quality', category: 'asset_type', evidenceClass: 'deterministic', weight: 30, required: true, appliesTo: { assetTypes: ['audio'] } },
    { id: 'image.quality', title: 'Image quality', category: 'asset_type', evidenceClass: 'ai_assessment', weight: 20, required: true, appliesTo: { assetTypes: ['image'] } },
    { id: 'purpose.reference', title: 'Reference use', category: 'purpose', evidenceClass: 'creator_declared', weight: 10, required: false, appliesTo: { purposes: ['reference'] } },
  ],
};

const masterDna = async (assets: VyralMasterDnaV1['assets']): Promise<VyralMasterDnaV1> =>
  createVyralMasterDnaV1({
    master_dna_id: 'master-1',
    vyral: { vyral_id: 'vyral-1', name: 'Mixed collection' },
    snapshot: { revision: 7, created_at: '2026-11-09T00:00:00.000Z' },
    purpose: { summary: 'Personal library', intended_uses: ['reference'] },
    main_asset_ids: [],
    assets,
    relationships: [],
    reconstruction_profile: { overall_claim: 'semantic_only', notes: [] },
    provenance: { creator_ref: null, license_ref: null, evidence_status: 'creator_attested' },
    source_resolution: { visibility: 'private', canonical_uri: null, resolution_policy: 'no_remote_resolution' },
    portable_projection: { profile: 'compact', includes_full_reconstruction_payloads: false, resolver_uri: null, retrieval_policy: 'no_remote_resolution' },
  });

const asset = (id: string, asset_type: string | undefined, media_type: string) => ({
  asset_id: id, asset_version_id: `version-${id}`, asset_type, media_type,
  dna_ref: { record_id: `dna-${id}`, schema_id: 'vyra.asset-file-dna', schema_version: 1 },
  asset_fingerprint: fingerprint, reconstruction_claim: 'semantic_only' as const,
});

test('evaluates a mixed collection against the exact Master DNA snapshot and pins standard version', async () => {
  const result = await evaluateVyralSnapshotQualityV1({
    masterDna: await masterDna([asset('audio-1', 'audio', 'audio/wav'), asset('image-1', 'image', 'image/png')]),
    profile,
    evidenceFindings: [
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://snapshot'] },
      { ruleId: 'audio.quality', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://audio'] },
      { ruleId: 'image.quality', evidenceClass: 'ai_assessment', status: 'partial', evidenceRefs: ['proof://image'] },
      { ruleId: 'purpose.reference', evidenceClass: 'creator_declared', status: 'pass', evidenceRefs: ['creator://purpose'] },
    ],
  });
  assert.equal(result.snapshot.revision, 7);
  assert.equal(result.snapshot.fingerprint, fingerprint);
  assert.equal(result.evaluation.standard.version, 3);
  assert.equal(result.evaluation.status, 'graded');
  assert.equal(result.evaluation.grade, 'A');
  assert.deepEqual(result.inventory.typeCounts, { audio: 1, image: 1 });
});

test('marks unrelated scoped rules N/A for a known audio-only collection', async () => {
  const result = await evaluateVyralSnapshotQualityV1({
    masterDna: await masterDna([asset('audio-1', 'audio', 'audio/wav')]),
    profile,
    evidenceFindings: [
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://snapshot'] },
      { ruleId: 'audio.quality', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://audio'] },
      { ruleId: 'purpose.reference', evidenceClass: 'creator_declared', status: 'pass', evidenceRefs: ['creator://purpose'] },
    ],
  });
  assert.ok(result.applicability.notApplicableRuleIds.includes('image.quality'));
  assert.ok(result.applicability.applicableRuleIds.includes('purpose.reference'));
  assert.equal(result.evaluation.status, 'graded');
});

test('unknown asset classification keeps type-scoped rules applicable instead of silently N/A', async () => {
  const result = await evaluateVyralSnapshotQualityV1({
    masterDna: await masterDna([asset('opaque-1', undefined, 'application/octet-stream')]),
    profile,
    evidenceFindings: [
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://snapshot'] },
    ],
  });
  assert.ok(result.applicability.applicableRuleIds.includes('audio.quality'));
  assert.ok(result.applicability.applicableRuleIds.includes('image.quality'));
  assert.equal(result.evaluation.status, 'incomplete_evidence');
  assert.deepEqual(result.evaluation.missingRequiredEvidence, ['audio.quality', 'image.quality']);
});

test('prevents evidence input from overriding applicability decisions', async () => {
  await assert.rejects(async () => evaluateVyralSnapshotQualityV1({
    masterDna: await masterDna([asset('audio-1', 'audio', 'audio/wav')]),
    profile,
    evidenceFindings: [
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://snapshot'] },
      { ruleId: 'image.quality', evidenceClass: 'ai_assessment', status: 'pass', evidenceRefs: ['proof://image'] },
    ],
  }), /cannot override a contextually not-applicable rule/);
  await assert.rejects(async () => evaluateVyralSnapshotQualityV1({
    masterDna: await masterDna([asset('audio-1', 'audio', 'audio/wav')]),
    profile,
    evidenceFindings: [
      { ruleId: 'identity.integrity', evidenceClass: 'deterministic', status: 'pass', evidenceRefs: ['proof://snapshot'] },
      { ruleId: 'audio.quality', evidenceClass: 'deterministic', status: 'not_applicable', evidenceRefs: [] },
    ],
  }), /cannot be manually marked not applicable/);
});

test('rejects an unpinned or empty Master DNA snapshot', async () => {
  const invalid = await masterDna([asset('audio-1', 'audio', 'audio/wav')]);
  invalid.integrity.vyral_fingerprint = 'invalid';
  await assert.rejects(() => evaluateVyralSnapshotQualityV1({ masterDna: invalid, profile, evidenceFindings: [] }), /Master DNA integrity metadata is invalid/);
  await assert.rejects(async () => evaluateVyralSnapshotQualityV1({ masterDna: await masterDna([]), profile, evidenceFindings: [] }), /Master DNA collection metadata or asset inventory is invalid/);
});
