import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVyralSemanticDnaV1,
  validateVyralSemanticDnaV1,
} from '../src/services/vyralSemanticDnaV1.ts';

const SHA = 'a'.repeat(64);
const base = {
  recordId: 'semantic-origin-01',
  asset: {
    id: 'origin-asset',
    name: 'ORIGIN-01 — Foundational Red Circle',
    asset_type: 'image',
    original_filename: 'origin.png',
    description: 'One solid red circle centered on a white square canvas.',
    descriptionProvenance: 'creator_confirmed',
    mime_type: 'image/png',
  },
  source: { assetVersionId: 'origin-version', sha256: SHA, sizeBytes: 1046585 },
  technicalMetadata: { width: 1254, height: 1254, colorSpace: 'sRGB', channelLayout: 'RGBA', decodedSamplesSha256: 'b'.repeat(64) },
  context: { vyralName: 'ORIGIN-01', vyralDescription: 'Foundational identity sample', purpose: 'DNA reconstruction acceptance test', intendedUses: ['reconstruction'] },
};

test('semantic DNA contains descriptive evidence but no original bytes or decoded samples', () => {
  const record = createVyralSemanticDnaV1(base);
  assert.equal(record.schema_id, 'vyra.asset-semantic-dna');
  assert.equal(record.source.asset_version_id, 'origin-version');
  assert.equal(record.creator_description.evidence_status, 'creator_declared');
  assert.equal(record.reconstruction.status, 'partial');
  assert.equal(record.reconstruction.exact_binary_recovery, false);
  assert.equal(record.reconstruction.decoded_sample_payload_included, false);
  assert.equal('lossless_payload' in record, false);
  assert.equal('encoded_file_payload' in record, false);
  assert.equal(JSON.stringify(record).includes('original_binary'), false);
  assert.equal(validateVyralSemanticDnaV1(record).record_id, 'semantic-origin-01');
});

test('semantic DNA does not treat unreviewed or disputed observations as confirmed evidence', () => {
  const record = createVyralSemanticDnaV1({
    ...base,
    confirmedObservations: [
      { observationId: 'obs-disputed', reviewId: 'review-disputed', decision: 'disputed', taskKind: 'description', assetVersionId: 'origin-version', sourceSha256: SHA, evidence: { summary: 'not accepted' } },
    ],
  });
  assert.equal(record.creator_confirmed_observations.length, 0);
  assert.ok(record.reconstruction.missing_information.includes('creator_confirmed_visual_observations'));
});

test('semantic DNA rejects creator evidence pinned to another Asset Version or source hash', () => {
  assert.throws(() => createVyralSemanticDnaV1({
    ...base,
    confirmedObservations: [
      { observationId: 'obs-wrong-version', reviewId: 'review-wrong-version', decision: 'creator_confirmed', taskKind: 'description', assetVersionId: 'another-version', sourceSha256: SHA, evidence: { summary: 'wrong source' } },
    ],
  }), /pinned to the exact source Asset Version and SHA-256/);
});

test('semantic DNA explicitly blocks reconstruction when creator descriptions and observations are absent', () => {
  const record = createVyralSemanticDnaV1({
    ...base,
    asset: { ...base.asset, description: '' },
  });
  assert.equal(record.reconstruction.status, 'blocked');
  assert.equal(record.creator_description.evidence_status, 'missing');
  assert.ok(record.reconstruction.missing_information.includes('creator_description'));
});

test('semantic DNA rejects embedded binary, media URLs and hidden payload fields', () => {
  const invalidEvidence = [
    { summary: 'red circle', image_url: 'https://example.test/original.png' },
    { summary: 'red circle', imageUrl: 'https://example.test/original.png' },
    { summary: 'red circle', originalFile: 'AQIDBA==' },
    { summary: 'red circle', note: 'A'.repeat(140) + '___' },
    { summary: 'red circle', binary_data: 'AQIDBA==' },
    { summary: 'red circle', nested: { decoded_samples: [1, 2, 3] } },
    { summary: 'red circle', reference: 'data:image/png;base64,AAAA' },
  ];
  for (const evidence of invalidEvidence) {
    assert.throws(() => createVyralSemanticDnaV1({
      ...base,
      confirmedObservations: [{
        observationId: 'obs-safe',
        reviewId: 'review-safe',
        decision: 'creator_confirmed',
        taskKind: 'description',
        assetVersionId: 'origin-version',
        sourceSha256: SHA,
        evidence,
      }],
    }), /cannot include media payloads|cannot contain data URLs/);
  }
});

test('semantic DNA never upgrades an unverified description to creator-declared evidence', () => {
  const record = createVyralSemanticDnaV1({
    ...base,
    asset: { ...base.asset, descriptionProvenance: 'unverified' },
  });
  assert.equal(record.creator_description.evidence_status, 'unverified');
  assert.ok(record.reconstruction.missing_information.includes('creator_description_attestation'));
});

test('semantic DNA rejects media references and encoded payloads in descriptions and Vyral context', () => {
  assert.throws(() => createVyralSemanticDnaV1({
    ...base,
    asset: { ...base.asset, description: 'See https://example.test/original.png' },
  }), /media URL|encoded payload/);
  assert.throws(() => createVyralSemanticDnaV1({
    ...base,
    context: { ...base.context, purpose: 'A'.repeat(160) + '==' },
  }), /media URL|encoded payload/);
  assert.throws(() => createVyralSemanticDnaV1({
    ...base,
    context: { ...base.context, intendedUses: ['data:image/png;base64,AAAA'] },
  }), /media URL|encoded payload/);
});
