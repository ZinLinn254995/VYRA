import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVyralFileDnaSourceV1 } from '../supabase/functions/_shared/vyralFileDnaVerifierV1.ts';

const bytes = new Uint8Array(Array.from({ length: 37 }, (_, index) => (index * 29) % 256));
const sha256 = async (value: Uint8Array) => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const makeRecord = async () => ({
  schema_id: 'vyra.asset-file-dna',
  schema_version: 1,
  record_id: 'file-dna-record',
  source: { asset_id: 'asset-1', asset_version_id: 'version-1' },
  file: { size_bytes: bytes.byteLength, mime_type: 'application/octet-stream', sha256: await sha256(bytes) },
  reconstruction: { claim: 'unavailable', payload_encoding: 'none', chunk_size: 8, chunks: [] },
});

test('verifies File DNA v1 by reconstructing exact bytes across multiple chunks', async () => {
  const result = await verifyVyralFileDnaSourceV1({
    record: await makeRecord(), assetId: 'asset-1', versionId: 'version-1',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'application/octet-stream',
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.comparisonMode, 'byte_exact');
  assert.equal(result.exactMatch, true);
  assert.equal(result.similarityScore, 1);
  assert.equal(result.chunkCount, 5);
  assert.equal(result.byteForByteEqual, true);
});

test('rejects File DNA tied to a different Asset or immutable Version', async () => {
  const record = await makeRecord();
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record, assetId: 'another-asset', versionId: 'version-1',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'application/octet-stream',
  }), /identity does not match/);
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record, assetId: 'asset-1', versionId: 'another-version',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'application/octet-stream',
  }), /identity does not match/);
});

test('rejects altered source bytes, size, MIME type and unsupported chunk sizes', async () => {
  const record = await makeRecord();
  const altered = bytes.slice();
  altered[4] ^= 0xff;
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record, assetId: 'asset-1', versionId: 'version-1',
    sourceBytes: altered, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'application/octet-stream',
  }), /SHA-256 check/);
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record, assetId: 'asset-1', versionId: 'version-1',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength + 1, expectedMimeType: 'application/octet-stream',
  }), /metadata does not match/);
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record, assetId: 'asset-1', versionId: 'version-1',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'audio/mpeg',
  }), /metadata does not match/);
  const invalidChunkRecord = { ...record, reconstruction: { ...record.reconstruction, chunk_size: 0 } };
  await assert.rejects(async () => verifyVyralFileDnaSourceV1({
    record: invalidChunkRecord, assetId: 'asset-1', versionId: 'version-1',
    sourceBytes: bytes, expectedSha256: await sha256(bytes),
    expectedSizeBytes: bytes.byteLength, expectedMimeType: 'application/octet-stream',
  }), /unsupported reconstruction chunk size/);
});
