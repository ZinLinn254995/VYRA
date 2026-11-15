import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUniverseKnowledgeFromAssetDna } from '../src/services/universeKnowledgeBuilder.ts';

const source = {
  assetId: 'asset-1',
  assetVersionId: 'version-2',
  assetDnaRecordId: 'dna-record-3',
  revision: 3,
  sourceSha256: 'a'.repeat(64),
  payload: {
    dna_schema_id: 'vyra.asset-semantic-dna',
    dna_record: {
      schema_id: 'vyra.asset-semantic-dna',
      schema_version: 1,
      source: { asset_id: 'asset-1', asset_version_id: 'version-2', sha256: 'a'.repeat(64) },
      identity: { name: 'Milo', asset_type: 'character' },
      creator_description: { text: 'A small blue robot', evidence_status: 'creator_declared' },
      technical_metadata: { width: 1024, height: 1024, color_space: 'sRGB', channel_layout: 'RGB', decoded_samples_sha256: null },
      creator_confirmed_observations: [{
        observation_id: 'obs-1',
        task_kind: 'visual_identity',
        source_asset_version_id: 'version-2',
        source_sha256: 'a'.repeat(64),
        evidence: { body_color: 'blue', head_shape: 'round', scarf: 'yellow' },
      }],
    },
  },
};

test('projects source-bound Asset DNA into typed Universe Knowledge records', () => {
  const records = buildUniverseKnowledgeFromAssetDna(source);
  assert.ok(records.some((item) => item.predicate === 'identity.name' && item.value === 'Milo'));
  assert.ok(records.some((item) => item.predicate === 'creator.description' && item.evidenceClass === 'creator_declared'));
  assert.ok(records.some((item) => item.predicate === 'observation.visual_identity'));
  assert.ok(records.every((item) => item.status === 'accepted' && item.subjectId === 'asset-1'));
  assert.ok(records.every((item) => item.sourceAssetIds?.[0] === 'asset-1'));
});

test('does not upgrade creator-confirmed observations into independent model verification', () => {
  const records = buildUniverseKnowledgeFromAssetDna(source);
  const observation = records.find((item) => item.predicate === 'observation.visual_identity');
  assert.equal(observation?.evidenceClass, 'creator_declared');
  assert.equal(observation?.status, 'accepted');
});

test('rejects DNA that does not match the exact immutable source version and fingerprint', () => {
  assert.throws(() => buildUniverseKnowledgeFromAssetDna({
    ...source,
    payload: {
      ...source.payload,
      dna_record: {
        ...source.payload.dna_record,
        source: { ...source.payload.dna_record.source, asset_version_id: 'older-version' },
      },
    },
  }), /exact canonical Asset version/);
});

test('rejects creator observations detached from their source version', () => {
  assert.throws(() => buildUniverseKnowledgeFromAssetDna({
    ...source,
    payload: {
      ...source.payload,
      dna_record: {
        ...source.payload.dna_record,
        creator_confirmed_observations: [{
          ...source.payload.dna_record.creator_confirmed_observations[0],
          source_asset_version_id: 'other-version',
        }],
      },
    },
  }), /exact source Asset version/);
});

test('does not create semantic claims from missing or unverified descriptions', () => {
  const payload = structuredClone(source.payload);
  payload.dna_record.creator_description = { text: 'Unverified text', evidence_status: 'unverified' };
  const records = buildUniverseKnowledgeFromAssetDna({ ...source, payload });
  assert.equal(records.some((item) => item.predicate === 'creator.description'), false);
});
