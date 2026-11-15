import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUniverseKnowledgeFromAssetDna } from '../src/services/universeKnowledgeBuilder.ts';
import { createVyralSemanticDnaV1 } from '../src/services/vyralSemanticDnaV1.ts';
import { createVyralDnaV3 } from '../src/services/vyralDnaV3.ts';
import { createVyralFileDnaV1 } from '../src/services/vyralFileDnaV1.ts';

const semanticRecord = createVyralSemanticDnaV1({
  recordId: 'semantic-dna-1',
  asset: {
    id: 'asset-1', name: 'Milo', asset_type: 'character',
    description: 'A small blue robot', descriptionProvenance: 'creator_declared',
    mime_type: 'image/png',
  },
  source: { assetVersionId: 'version-2', sha256: 'a'.repeat(64), sizeBytes: 4096 },
  technicalMetadata: {
    width: 1024, height: 1024, colorSpace: 'sRGB', channelLayout: 'RGB',
  },
  confirmedObservations: [{
    observationId: 'obs-1', reviewId: 'review-1', decision: 'creator_confirmed',
    taskKind: 'visual_identity', assetVersionId: 'version-2',
    sourceSha256: 'a'.repeat(64),
    evidence: { body_color: 'blue', head_shape: 'round', scarf: 'yellow' },
  }],
  context: { vyralName: 'Universe' },
});

const source = {
  assetId: 'asset-1',
  assetVersionId: 'version-2',
  assetDnaRecordId: 'dna-record-3',
  revision: 3,
  sourceSha256: 'a'.repeat(64),
  payload: { dna_schema_id: 'vyra.asset-semantic-dna', dna_record: semanticRecord },
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
        creator_confirmed_observations: source.payload.dna_record.creator_confirmed_observations.map((item) => ({ ...item, source_asset_version_id: 'older-version' })),
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
  }), /not pinned to its source/);
});

test('does not create semantic claims from missing or unverified descriptions', () => {
  const payload = structuredClone(source.payload);
  payload.dna_record.creator_description = { text: 'Unverified text', evidence_status: 'unverified' };
  const records = buildUniverseKnowledgeFromAssetDna({ ...source, payload });
  assert.equal(records.some((item) => item.predicate === 'creator.description'), false);
});

test('projects lossless raster DNA v3 measurements into deterministic Universe Knowledge', async () => {
  const { record } = await createVyralDnaV3({
    record_id: 'raster-dna-1',
    source: { asset_id: 'raster-asset', asset_version_id: 'raster-version', sha256: 'c'.repeat(64), size_bytes: 4, mime_type: 'image/png' },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 1, height: 1, channel_layout: 'RGBA', color_space: 'sRGB',
    icc_profile_sha256: null, alpha_mode: 'straight',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    decoded_samples: new Uint8Array([255, 0, 0, 255]),
  });
  const records = buildUniverseKnowledgeFromAssetDna({
    assetId: 'raster-asset', assetVersionId: 'raster-version', assetDnaRecordId: 'raster-dna-row',
    revision: 1, sourceSha256: 'c'.repeat(64), payload: record,
  });
  assert.ok(records.some((item) => item.predicate === 'technical.width' && item.value === 1));
  assert.ok(records.some((item) => item.predicate === 'technical.decoded_samples_sha256' && item.evidenceClass === 'deterministic'));
  assert.ok(records.some((item) => item.predicate === 'reconstruction.lossless_tile_count' && item.value === 1));
});

test('projects deterministic file-container DNA facts into Universe Knowledge', async () => {
  const bytes = new Uint8Array(44);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, 36, true);
  bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
  new DataView(bytes.buffer).setUint32(16, 16, true);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 2, true);
  new DataView(bytes.buffer).setUint32(24, 48000, true);
  new DataView(bytes.buffer).setUint32(28, 192000, true);
  new DataView(bytes.buffer).setUint16(32, 4, true);
  new DataView(bytes.buffer).setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode('data'), 36);
  new DataView(bytes.buffer).setUint32(40, 0, true);
  const { record } = await createVyralFileDnaV1({
    record_id: 'audio-file-dna',
    source: { asset_id: 'audio-asset', asset_version_id: 'audio-version' },
    bytes, mime_type: 'audio/wav', filename: 'voice.wav',
  });
  const records = buildUniverseKnowledgeFromAssetDna({
    assetId: 'audio-asset', assetVersionId: 'audio-version', assetDnaRecordId: 'audio-dna-row',
    revision: 1, sourceSha256: record.file.sha256, payload: record,
  });
  assert.ok(records.some((item) => item.predicate === 'file.format_signature' && item.value === 'wav'));
  assert.ok(records.some((item) => item.predicate === 'file.structure.profile' && item.value === 'audio'));
  assert.ok(records.some((item) => item.predicate === 'file.structure.sample_rate' && item.value === 48000));
});
