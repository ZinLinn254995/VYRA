import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVyralZip,
  parseVyralManifest,
  readVyralZip,
  validateVyralManifest,
  VYRAL_PACKAGE_FORMAT,
  createVyralDnaOnlyPackage,
  reconstructVyralDnaV3FromPackage,
} from '../src/services/vyralPackage.ts';
import { createVyralDnaV3 } from '../src/services/vyralDnaV3.ts';

const manifest = {
  format: VYRAL_PACKAGE_FORMAT,
  formatVersion: 1,
  packageId: 'package-test',
  exportedAt: '2026-11-06T00:00:00.000Z',
  vyral: { id: 'vyral-test', name: 'Test Vyral' },
  folders: [],
  assets: [{ id: 'asset-test', name: 'Asset' }],
  versions: [{ id: 'version-test', asset_id: 'asset-test', version_number: 1, package_path: 'assets/asset-test/versions/1.bin' }],
  dnaRecords: [],
  fingerprints: [],
  visionObservations: [],
  lineage: [],
  reconstructionTests: [],
};

test('writes and reads a ZIP-compatible VYRAL package with binary media', async () => {
  const media = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const archive = createVyralZip([
    { path: 'README.txt', data: 'VYRAL package test' },
    { path: 'assets/asset-test/versions/1.bin', data: media },
    { path: 'manifest.json', data: JSON.stringify(manifest) },
  ]);
  const files = await readVyralZip(archive);
  assert.equal(new TextDecoder().decode(files.get('README.txt')), 'VYRAL package test');
  assert.deepEqual(files.get('assets/asset-test/versions/1.bin'), media);
  assert.equal(parseVyralManifest(files).vyral.name, 'Test Vyral');
});

test('rejects unsafe and duplicate package paths', () => {
  assert.throws(() => createVyralZip([{ path: '../outside.txt', data: 'no' }]), /Unsafe package path/);
  assert.throws(() => createVyralZip([{ path: 'assets\\\\..\\\\outside.txt', data: 'no' }]), /Unsafe package path/);
  assert.throws(() => createVyralZip([
    { path: 'same.txt', data: 'one' },
    { path: 'same.txt', data: 'two' },
  ]), /Duplicate package path/);
});

test('rejects unsupported manifest versions and malformed manifests', () => {
  assert.throws(() => validateVyralManifest({ ...manifest, formatVersion: 99 }), /Unsupported VYRAL package version/);
  assert.throws(() => validateVyralManifest({ ...manifest, versions: 'not-an-array' }), /versions/);
});

test('rejects ZIP payload corruption using CRC32', async () => {
  const archive = createVyralZip([
    { path: 'manifest.json', data: JSON.stringify(manifest) },
    { path: 'assets/asset-test/versions/1.bin', data: new Uint8Array([1, 2, 3, 4]) },
  ]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  bytes[43] ^= 0xff;
  await assert.rejects(() => readVyralZip(bytes), /integrity check failed/);
});

test('accepts case-insensitive SHA-256 hex and validates package timestamps', () => {
  const upperHash = 'A'.repeat(64);
  assert.equal(validateVyralManifest({
    ...manifest,
    versions: [{ ...manifest.versions[0], sha256: upperHash }],
  }).versions[0].sha256, upperHash);
  assert.throws(() => validateVyralManifest({ ...manifest, exportedAt: 'not-a-date' }), /identity metadata is missing or invalid/);
  assert.throws(() => validateVyralManifest({ ...manifest, packageId: 'x'.repeat(129) }), /identity metadata is missing or invalid/);
});

test('accepts DNA-only test packages with asset metadata and no binary versions', () => {
  const dnaOnlyManifest = {
    ...manifest,
    exportMode: 'dna-only' as const,
    versions: [],
    dnaRecords: [{ id: 'dna-master', scope: 'vyral' }],
    fingerprints: [{ id: 'fingerprint-asset', asset_id: 'asset-test' }],
  };
  const validated = validateVyralManifest(dnaOnlyManifest);
  assert.equal(validated.exportMode, 'dna-only');
  assert.equal(validated.assets.length, 1);
  assert.equal(validated.versions.length, 0);
});

test('rejects missing asset versions and circular folder trees', () => {
  assert.throws(() => validateVyralManifest({ ...manifest, versions: [] }), /at least one binary version/);
  assert.throws(() => validateVyralManifest({
    ...manifest,
    folders: [
      { id: 'folder-a', name: 'A', parent_id: 'folder-b' },
      { id: 'folder-b', name: 'B', parent_id: 'folder-a' },
    ],
  }), /circular reference/);
});

test('rejects asset versions that reference an unknown asset', () => {
  assert.throws(() => validateVyralManifest({
    ...manifest,
    versions: [{ ...manifest.versions[0], asset_id: 'missing-asset' }],
  }), /missing asset/);
});

test('requires every manifest media path to exist in the package', async () => {
  const archive = createVyralZip([{ path: 'manifest.json', data: JSON.stringify(manifest) }]);
  const files = await readVyralZip(archive);
  assert.throws(() => parseVyralManifest(files), /media is missing/);
});

test('rejects ZIP entries without the VYRAL UTF-8 flag and multi-disk metadata', async () => {
  const archive = createVyralZip([{ path: 'file.txt', data: 'safe' }]);
  const original = new Uint8Array(await archive.arrayBuffer());
  const endOffset = original.length - 22;
  const centralOffset = new DataView(original.buffer).getUint32(endOffset + 16, true);

  const missingUtf8 = original.slice();
  new DataView(missingUtf8.buffer).setUint16(centralOffset + 8, 0, true);
  await assert.rejects(() => readVyralZip(missingUtf8), /UTF-8 names/);

  const multiDisk = original.slice();
  new DataView(multiDisk.buffer).setUint16(centralOffset + 34, 1, true);
  await assert.rejects(() => readVyralZip(multiDisk), /Multi-disk and ZIP64/);
});

test('accepts DNA-only test packages with asset metadata and no binary versions', () => {
  const dnaOnlyManifest = {
    ...manifest,
    exportMode: 'dna-only' as const,
    versions: [],
    dnaRecords: [{ id: 'dna-master', scope: 'vyral' }],
    fingerprints: [{ id: 'fingerprint-asset', asset_id: 'asset-test' }],
  };
  const validated = validateVyralManifest(dnaOnlyManifest);
  assert.equal(validated.exportMode, 'dna-only');
  assert.equal(validated.assets.length, 1);
  assert.equal(validated.versions.length, 0);
});

test('rejects invalid DNA, fingerprint, vision, lineage and reconstruction references', () => {
  assert.throws(() => validateVyralManifest({
    ...manifest,
    dnaRecords: [{ id: 'dna-1', scope: 'asset', asset_id: 'missing-asset' }],
  }), /DNA record references a missing asset/);

  assert.throws(() => validateVyralManifest({
    ...manifest,
    fingerprints: [{ asset_id: 'asset-test', asset_version_id: 'missing-version' }],
  }), /fingerprint references an invalid asset version/);

  assert.throws(() => validateVyralManifest({
    ...manifest,
    visionObservations: [{ asset_id: 'missing-asset' }],
  }), /Vision observation references a missing asset/);

  assert.throws(() => validateVyralManifest({
    ...manifest,
    lineage: [{ parent_asset_id: 'asset-test', child_asset_id: 'missing-asset' }],
  }), /lineage record references a missing asset/);

  assert.throws(() => validateVyralManifest({
    ...manifest,
    reconstructionTests: [{ asset_id: 'asset-test', dna_record_id: 'missing-dna' }],
  }), /missing DNA record/);
});


test('exports and reconstructs a DNA v3-only package without source media or derivative references', async () => {
  const samples = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 10, 20, 30, 255,
  ]);
  const { record, entries } = await createVyralDnaV3({
    record_id: 'portable-dna-v3',
    source: {
      asset_id: 'asset-test',
      asset_version_id: 'version-test',
      sha256: 'a'.repeat(64),
      size_bytes: 2048,
      mime_type: 'image/png',
    },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 2,
    height: 2,
    channel_layout: 'RGBA',
    color_space: 'sRGB',
    icc_profile_sha256: null,
    alpha_mode: 'straight',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    tile_width: 1,
    tile_height: 1,
    decoded_samples: samples,
  });
  const sourceAwareManifest = {
    ...manifest,
    assets: [{
      ...manifest.assets[0],
      preview_url: 'https://private.invalid/preview.png',
      thumbnail: { url: 'https://private.invalid/thumb.png' },
      storage_path: 'private/original.png',
      derivative_path: 'private/derived.webp',
    }],
  };
  const archive = await createVyralDnaOnlyPackage(sourceAwareManifest, record, entries);
  const files = await readVyralZip(archive);
  const parsed = parseVyralManifest(files);
  assert.equal(parsed.exportMode, 'dna-only');
  assert.equal(parsed.versions.length, 0);
  assert.equal(files.has('assets/asset-test/versions/1.bin'), false);
  assert.equal([...files.keys()].some((path) => /preview|thumbnail|derivative|original/i.test(path)), false);
  const serializedManifest = new TextDecoder().decode(files.get('manifest.json'));
  assert.equal(serializedManifest.includes('private.invalid'), false);
  assert.equal(serializedManifest.includes('storage_path'), false);
  const reconstructed = await reconstructVyralDnaV3FromPackage(files, record.record_id);
  assert.deepEqual(reconstructed.samples, samples);
  assert.equal(reconstructed.decoded_samples_sha256, record.decoded_image.decoded_samples_sha256);
});

test('rejects DNA-only export with missing or undeclared DNA tile payloads', async () => {
  const samples = new Uint8Array(2 * 2 * 4).fill(11);
  const { record, entries } = await createVyralDnaV3({
    record_id: 'portable-dna-invalid',
    source: {
      asset_id: 'asset-test',
      asset_version_id: 'version-test',
      sha256: 'b'.repeat(64),
      size_bytes: 2048,
      mime_type: 'image/png',
    },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 2,
    height: 2,
    channel_layout: 'RGBA',
    color_space: 'sRGB',
    icc_profile_sha256: null,
    alpha_mode: 'straight',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    tile_width: 1,
    tile_height: 1,
    decoded_samples: samples,
  });
  await assert.rejects(() => createVyralDnaOnlyPackage(manifest, record, entries.slice(1)), /requires every declared v3 tile/);
  await assert.rejects(() => createVyralDnaOnlyPackage(manifest, record, [
    ...entries,
    { path: 'dna/v3/portable-dna-invalid/tiles/extra_0.raw', data: new Uint8Array([1]) },
  ]), /undeclared DNA payload entries/);
});
