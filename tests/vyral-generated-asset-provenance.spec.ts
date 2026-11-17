import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVyralGeneratedAssetLineage,
  buildVyralGeneratedAssetMetadata,
} from '../src/services/vyralGeneratedAssetProvenance';

const jobId = '2f6d8a10-9b21-4c32-8d43-5a6b7c8d9e01';
const quoteId = '3a7e9b11-0c32-4d43-9e54-6b7c8d9e0f12';
const assetId = '4b8f0c22-1d43-4e54-8f65-7c8d9e0f1a23';
const digest = 'a'.repeat(64);

test('generated Asset metadata retains provider, model, quote, job and source digests', () => {
  const metadata = buildVyralGeneratedAssetMetadata({
    generationJobId: jobId, task: 'image', provider: 'runway', model: 'gen-4-image',
    requestFingerprint: digest, promptSha256: digest, quoteId, generationId: 'provider-task-123',
    actualCostUsd: 0.42,
  });
  assert.equal(metadata.upload_source, 'media_generation');
  assert.equal(metadata.visibility, 'private');
  assert.equal(metadata.generation_provenance.generationJobId, jobId);
  assert.equal(metadata.generation_provenance.quoteId, quoteId);
  assert.equal(metadata.generation_provenance.actualCostUsd, 0.42);
  assert.equal(metadata.generation_provenance.promptSha256, digest);
  assert.equal('prompt' in metadata.generation_provenance, false);
  assert.equal('apiKey' in metadata.generation_provenance, false);
});

test('generated Asset metadata rejects invalid identifiers, hashes, task and cost', () => {
  const base = {
    generationJobId: jobId, task: 'image' as const, provider: 'runway', model: 'gen-4-image',
    requestFingerprint: digest, promptSha256: digest,
  };
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, generationJobId: 'not-a-uuid' }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, task: 'text' as never }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, provider: 'runway\nsecret' }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, requestFingerprint: 'abc' }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, promptSha256: 'abc' }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, actualCostUsd: -1 }));
  assert.throws(() => buildVyralGeneratedAssetMetadata({ ...base, quoteId: 'invalid' }));
});

test('lineage is omitted for standalone generations and explicit for derived outputs', () => {
  assert.equal(buildVyralGeneratedAssetLineage({ generationJobId: jobId, childAssetId: assetId }), null);
  assert.deepEqual(buildVyralGeneratedAssetLineage({
    generationJobId: jobId, parentAssetId: quoteId, childAssetId: assetId,
  }), {
    parent_asset_id: quoteId, child_asset_id: assetId,
    relation_kind: 'generated_from', generation_job_id: jobId,
  });
  assert.throws(() => buildVyralGeneratedAssetLineage({
    generationJobId: jobId, parentAssetId: assetId, childAssetId: assetId,
  }));
});
