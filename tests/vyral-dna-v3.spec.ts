import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createVyralDnaV3, createVyralDnaV3EncodedFilePayload, reconstructVyralDnaV3, reconstructVyralDnaV3EncodedFile, validateVyralDnaV3Record } from '../src/services/vyralDnaV3.ts';

const source = {
  asset_id: 'origin-asset',
  asset_version_id: 'origin-version',
  sha256: 'a'.repeat(64),
  size_bytes: 1234,
  mime_type: 'image/png',
};

const makeInput = (samples: Uint8Array) => ({
  record_id: 'dna-v3-test',
  source,
  extractor: { name: 'test-decoder', version: '1.0.0' },
  width: 3,
  height: 2,
  channel_layout: 'RGBA' as const,
  color_space: 'sRGB',
  icc_profile_sha256: null,
  alpha_mode: 'straight' as const,
  decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
  tile_width: 2,
  tile_height: 1,
  decoded_samples: samples,
});

test('DNA v3 losslessly tiles and reconstructs decoded RGBA samples', async () => {
  const samples = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255,
  ]);
  const { record, entries } = await createVyralDnaV3(makeInput(samples));
  const files = new Map(entries.map((entry) => [entry.path, entry.data]));
  const reconstructed = await reconstructVyralDnaV3(record, files);
  assert.deepEqual(reconstructed.samples, samples);
  assert.equal(reconstructed.width, 3);
  assert.equal(reconstructed.height, 2);
  assert.equal(reconstructed.channel_layout, 'RGBA');
  assert.equal(entries.length, 4);
});

test('DNA v3 rejects missing, altered, or truncated tiles', async () => {
  const samples = new Uint8Array(3 * 2 * 4).fill(127);
  const { record, entries } = await createVyralDnaV3(makeInput(samples));
  const missing = new Map(entries.slice(1).map((entry) => [entry.path, entry.data]));
  await assert.rejects(() => reconstructVyralDnaV3(record, missing), /tile is missing/);

  const alteredEntries = entries.map((entry) => ({ ...entry, data: entry.data.slice() }));
  alteredEntries[0].data[0] ^= 0xff;
  const altered = new Map(alteredEntries.map((entry) => [entry.path, entry.data]));
  await assert.rejects(() => reconstructVyralDnaV3(record, altered), /tile integrity check failed/);

  const truncatedEntries = entries.map((entry) => ({ ...entry, data: entry.data.slice() }));
  truncatedEntries[0].data = truncatedEntries[0].data.slice(1);
  const truncated = new Map(truncatedEntries.map((entry) => [entry.path, entry.data]));
  await assert.rejects(() => reconstructVyralDnaV3(record, truncated), /tile integrity check failed/);
});

test('DNA v3 rejects wrong dimensions, unsupported schema, and incomplete tile grids', async () => {
  const samples = new Uint8Array(3 * 2 * 4).fill(42);
  const { record } = await createVyralDnaV3(makeInput(samples));
  await assert.rejects(() => createVyralDnaV3(makeInput(samples.slice(1))), /byte length does not match/);
  assert.throws(() => validateVyralDnaV3Record({ ...record, schema_version: 2 }), /Unsupported VYRA DNA schema/);
  assert.throws(() => validateVyralDnaV3Record({
    ...record,
    lossless_payload: { ...record.lossless_payload, tiles: record.lossless_payload.tiles.slice(1) },
  }), /tile count does not cover/);
});

test('DNA v3 rejects a decoded sample stream with an incorrect aggregate digest', async () => {
  const samples = new Uint8Array(3 * 2 * 4).fill(9);
  const { record, entries } = await createVyralDnaV3(makeInput(samples));
  const tamperedRecord = {
    ...record,
    decoded_image: { ...record.decoded_image, decoded_samples_sha256: 'b'.repeat(64) },
  };
  const files = new Map(entries.map((entry) => [entry.path, entry.data]));
  await assert.rejects(() => reconstructVyralDnaV3(tamperedRecord, files), /decoded-sample digest does not match/);
});

test('DNA v3 rejects malformed nested metadata without leaking TypeErrors', async () => {
  const { record } = await createVyralDnaV3(makeInput(new Uint8Array(24).fill(7)));
  assert.throws(() => validateVyralDnaV3Record({ ...record, source: null }), /source asset and version IDs/);
  assert.throws(() => validateVyralDnaV3Record({ ...record, decoded_image: null }), /decoded image metadata/);
  assert.throws(() => validateVyralDnaV3Record({
    ...record,
    decoded_image: { ...record.decoded_image, decoder_contract: null },
  }), /extraction and decoder provenance/);
  assert.throws(() => validateVyralDnaV3Record({
    ...record,
    decoded_image: { ...record.decoded_image, alpha_mode: 'transparent-ish' },
  }), /alpha mode is unsupported/);
  assert.throws(() => validateVyralDnaV3Record({
    ...record,
    lossless_payload: { ...record.lossless_payload, tiles: [null] },
  }), /tile metadata is missing or invalid/);
});

test('DNA v3 reconstruction rejects undeclared tile payloads', async () => {
  const { record, entries } = await createVyralDnaV3(makeInput(new Uint8Array(24).fill(3)));
  const files = new Map(entries.map((entry) => [entry.path, entry.data]));
  files.set('dna/v3/dna-v3-test/tiles/extra_0.raw', new Uint8Array([1]));
  await assert.rejects(() => reconstructVyralDnaV3(record, files), /undeclared tile/);
});

test('DNA v3 can carry and exactly recover the original encoded source file in addition to decoded samples', async () => {
  const samples = new Uint8Array(4).fill(255);
  const original = new Uint8Array(Buffer.from('PNG encoded source bytes with metadata\\x00', 'utf8'));
  const sourceHash = createHash('sha256').update(original).digest('hex');
  const input = {
    ...makeInput(samples),
    width: 1,
    height: 1,
    source: { ...source, sha256: sourceHash, size_bytes: original.byteLength },
  };
  const { record, entries } = await createVyralDnaV3(input);
  const encoded = await createVyralDnaV3EncodedFilePayload(record, original, 'origin.png', 8);
  const complete = { ...record, encoded_file_payload: encoded.payload };
  validateVyralDnaV3Record(complete);
  const files = new Map(encoded.entries.map((entry) => [entry.path, entry.data]));
  const restored = await reconstructVyralDnaV3EncodedFile(complete, files);
  assert.deepEqual(restored, original);
  assert.equal(createHash('sha256').update(restored).digest('hex'), sourceHash);
});

test('DNA v3 rejects an encoded source payload whose bytes do not match the original source hash', async () => {
  const samples = new Uint8Array(4).fill(255);
  const original = new Uint8Array(Buffer.from('original source', 'utf8'));
  const sourceHash = createHash('sha256').update(original).digest('hex');
  const input = { ...makeInput(samples), width: 1, height: 1, source: { ...source, sha256: sourceHash, size_bytes: original.byteLength } };
  const { record } = await createVyralDnaV3(input);
  const encoded = await createVyralDnaV3EncodedFilePayload(record, original, 'origin.png', 8);
  const files = new Map(encoded.entries.map((entry) => [entry.path, entry.data]));
  const first = encoded.payload.chunks[0];
  files.set(first.package_path, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  await assert.rejects(() => reconstructVyralDnaV3EncodedFile({ ...record, encoded_file_payload: encoded.payload }, files), /chunk integrity check failed/);
});
