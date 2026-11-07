import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVyralZip,
  parseVyralManifest,
  readVyralZip,
  validateVyralManifest,
  VYRAL_PACKAGE_FORMAT,
  createVyralDnaOnlyPackage,
  createVyralAssetDnaOnlyPackage,
  reconstructVyralDnaV3FromPackage,
  reconstructVyralFileDnaFromPackage,
  encodeVyralDnaV3PngFromPackage,
} from '../src/services/vyralPackage.ts';
import { createVyralDnaV3 } from '../src/services/vyralDnaV3.ts';
import { createVyralMasterDnaV1 } from '../src/services/vyralMasterDnaV1.ts';
import { createVyralFileDnaV1 } from '../src/services/vyralFileDnaV1.ts';

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

test('explains which Assets are missing exact DNA in an incomplete DNA-only package', async () => {
  const { record } = await createVyralDnaV3({
    record_id: 'supported-record',
    source: {
      asset_id: 'asset-test',
      asset_version_id: 'version-test',
      sha256: 'a'.repeat(64),
      size_bytes: 3,
      mime_type: 'image/png',
    },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 1,
    height: 1,
    channel_layout: 'RGB',
    color_space: 'sRGB',
    icc_profile_sha256: null,
    alpha_mode: 'none',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    decoded_samples: new Uint8Array([255, 0, 0]),
  });
  const incomplete = {
    ...manifest,
    exportMode: 'dna-only',
    assets: [
      { id: 'asset-test', name: 'Supported image' },
      { id: 'asset-missing', name: 'Missing audio' },
    ],
    versions: [],
    dnaRecords: [{
      id: record.record_id,
      scope: 'asset',
      asset_id: 'asset-test',
      dna_schema_id: 'vyra.asset-dna',
      dna_schema_version: 3,
      dna_record: record,
    }],
    reconstructionCapabilities: {
      decoded_sample_stream_reconstructable: true,
      source_decode_independently_verified: false,
      encoded_source_bytes_recoverable: false,
      color_space_fully_characterized: true,
    },
  };
  assert.throws(
    () => validateVyralManifest(incomplete),
    /1 supported exact reconstruction record\\(s\\) for 2 Asset\\(s\\).*Missing audio \\(DNA missing\\)/,
  );
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

test('rejects ambiguous DNA-only manifests without v3 capability boundaries', () => {
  const dnaOnlyManifest = {
    ...manifest,
    exportMode: 'dna-only' as const,
    versions: [],
    dnaRecords: [{ id: 'dna-master', scope: 'vyral' }],
    fingerprints: [{ id: 'fingerprint-asset', asset_id: 'asset-test' }],
  };
  assert.throws(() => validateVyralManifest(dnaOnlyManifest), /capability boundaries are missing or invalid/);
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

test('rejects ambiguous DNA-only manifests without v3 capability boundaries', () => {
  const dnaOnlyManifest = {
    ...manifest,
    exportMode: 'dna-only' as const,
    versions: [],
    dnaRecords: [{ id: 'dna-master', scope: 'vyral' }],
    fingerprints: [{ id: 'fingerprint-asset', asset_id: 'asset-test' }],
  };
  assert.throws(() => validateVyralManifest(dnaOnlyManifest), /capability boundaries are missing or invalid/);
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
      folder_id: 'folder-original',
      preview_url: 'https://private.invalid/preview.png',
      thumbnail: { url: 'https://private.invalid/thumb.png' },
      storage_path: 'private/original.png',
      derivative_path: 'private/derived.webp',
    }, {
      id: 'unselected-asset',
      name: 'Not part of this DNA-only reconstruction',
      asset_type: 'image',
      mime_type: 'image/png',
    }],
    folders: [{ id: 'folder-original', name: 'Original folder', parent_id: null }],
  };
  const archive = await createVyralDnaOnlyPackage(sourceAwareManifest, record, entries);
  const archiveBytes = new Uint8Array(await archive.arrayBuffer());

  // Simulate two independent clean imports: each starts from the portable ZIP
  // bytes and creates a fresh file map with no source asset or shared state.
  const files = await readVyralZip(archiveBytes.slice());
  const parsed = parseVyralManifest(files);
  const packageWithHiddenSource = new Map(files);
  packageWithHiddenSource.set('assets/asset-test/versions/hidden-original.png', new Uint8Array([1, 2, 3]));
  assert.throws(() => parseVyralManifest(packageWithHiddenSource), /DNA-only package contains an undeclared file/);
  assert.equal(parsed.exportMode, 'dna-only');
  assert.equal(parsed.versions.length, 0);
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0].id, 'asset-test');
  assert.equal(parsed.assets[0].folder_id, null);
  assert.equal(parsed.folders.length, 0);
  assert.equal(parsed.dnaRecords.length, 1);
  assert.equal(parsed.fingerprints.length, 0);
  assert.equal(parsed.visionObservations.length, 0);
  assert.equal(parsed.lineage.length, 0);
  assert.equal(parsed.reconstructionTests.length, 0);
  assert.deepEqual(parsed.reconstructionCapabilities, {
    decoded_sample_stream_reconstructable: true,
    source_decode_independently_verified: false,
    encoded_source_bytes_recoverable: false,
    color_space_fully_characterized: true,
    verification_note: 'Package-level reconstruction capability only; source verification must be established by a separate trusted verifier. Each asset has its own decoded-sample digest.',
  });
  assert.equal(parsed.assets[0].description_provenance, 'creator_declared');
  assert.equal(parsed.assets[0].description_is_visual_measurement, false);
  const portableRecord = parsed.dnaRecords[0].dna_record as {
    decoded_image: { sample_layout: Record<string, unknown> };
  };
  assert.deepEqual(portableRecord.decoded_image.sample_layout, {
    row_order: 'top-to-bottom',
    pixel_order: 'left-to-right',
    channel_order: 'RGBA',
    packing: 'interleaved',
    row_stride: 'tightly-packed',
    hash_algorithm: 'SHA-256',
    hash_scope: 'full-decoded-sample-stream',
  });
  assert.equal(files.has('assets/asset-test/versions/1.bin'), false);
  assert.equal([...files.keys()].some((path) => /preview|thumbnail|derivative|original/i.test(path)), false);
  assert.equal([...files.keys()].every((path) => path === 'manifest.json' || path.startsWith('dna/v3/')), true);
  const serializedManifest = new TextDecoder().decode(files.get('manifest.json'));
  assert.equal(serializedManifest.includes('private.invalid'), false);
  assert.equal(serializedManifest.includes('storage_path'), false);

  const cleanImportA = await readVyralZip(archiveBytes.slice());
  const cleanImportB = await readVyralZip(archiveBytes.slice());
  const reconstructedA = await reconstructVyralDnaV3FromPackage(cleanImportA, record.record_id);
  const reconstructedB = await reconstructVyralDnaV3FromPackage(cleanImportB, record.record_id);
  assert.deepEqual(reconstructedA.samples, samples);
  assert.deepEqual(reconstructedB.samples, samples);
  assert.notEqual(reconstructedA.samples, reconstructedB.samples);
  assert.equal(reconstructedA.decoded_samples_sha256, record.decoded_image.decoded_samples_sha256);
  assert.equal(reconstructedB.decoded_samples_sha256, record.decoded_image.decoded_samples_sha256);
  assert.deepEqual(reconstructedA.samples, reconstructedB.samples);
});

test('encodes reconstructed DNA v3 samples into a PNG without changing sample bytes', async () => {
  const samples = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 128,
    0, 0, 255, 64, 10, 20, 30, 0,
  ]);
  const { record, entries } = await createVyralDnaV3({
    record_id: 'portable-png-roundtrip',
    source: {
      asset_id: 'asset-test',
      asset_version_id: 'version-test',
      sha256: 'd'.repeat(64),
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
  const archive = await createVyralDnaOnlyPackage(manifest, record, entries);
  const files = await readVyralZip(archive);
  const encoded = await encodeVyralDnaV3PngFromPackage(files, record.record_id);
  assert.deepEqual([...encoded.pngBytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const view = new DataView(encoded.pngBytes.buffer, encoded.pngBytes.byteOffset, encoded.pngBytes.byteLength);
  let cursor = 8;
  const idatParts: Uint8Array[] = [];
  while (cursor + 12 <= encoded.pngBytes.byteLength) {
    const length = view.getUint32(cursor, false);
    const type = new TextDecoder().decode(encoded.pngBytes.subarray(cursor + 4, cursor + 8));
    const data = encoded.pngBytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === 'IHDR') {
      assert.equal(view.getUint32(cursor + 8, false), 2);
      assert.equal(view.getUint32(cursor + 12, false), 2);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
    }
    if (type === 'IDAT') idatParts.push(data);
    cursor += 12 + length;
    if (type === 'IEND') break;
  }
  const idatLength = idatParts.reduce((sum, part) => sum + part.byteLength, 0);
  const idat = new Uint8Array(idatLength);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.byteLength;
  }
  const { inflateSync } = await import('node:zlib');
  const decodedScanlines = new Uint8Array(inflateSync(idat));
  const expectedScanlines = new Uint8Array([
    0, ...samples.slice(0, 8),
    0, ...samples.slice(8, 16),
  ]);
  assert.deepEqual(decodedScanlines, expectedScanlines);
  assert.deepEqual(encoded.samples, samples);
  assert.equal(encoded.decoded_samples_sha256, record.decoded_image.decoded_samples_sha256);
});

test('DNA-only manifests reject ambiguous or missing canonical sample layouts', async () => {
  const samples = new Uint8Array([1, 2, 3]);
  const { record, entries } = await createVyralDnaV3({
    record_id: 'portable-layout-contract',
    source: { asset_id: 'asset-test', asset_version_id: 'version-test', sha256: 'c'.repeat(64), size_bytes: 10, mime_type: 'image/png' },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 1, height: 1, channel_layout: 'RGB', color_space: 'unknown',
    icc_profile_sha256: null, alpha_mode: 'none',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    decoded_samples: samples,
  });
  const archive = await createVyralDnaOnlyPackage(manifest, record, entries);
  const files = await readVyralZip(archive);
  const parsed = parseVyralManifest(files);
  const dna = parsed.dnaRecords[0].dna_record as Record<string, unknown>;
  const decoded = dna.decoded_image as Record<string, unknown>;
  const badRecord = { ...dna, decoded_image: { ...decoded, sample_layout: { row_order: 'bottom-to-top' } } };
  const badManifest = { ...parsed, dnaRecords: [{ ...parsed.dnaRecords[0], dna_record: badRecord }] };
  assert.throws(() => validateVyralManifest(badManifest), /canonical decoded-sample layout/);
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
  await assert.rejects(() => createVyralDnaOnlyPackage(manifest, record, entries.slice(1)), /missing a correctly sized tile/);
  await assert.rejects(() => createVyralDnaOnlyPackage(manifest, record, [
    ...entries,
    { path: 'dna/v3/portable-dna-invalid/tiles/extra_0.raw', data: new Uint8Array([1]) },
  ]), /undeclared DNA payload entries/);
});


test('exports and reconstructs every asset in a whole-Vyral DNA-only package', async () => {
  const sourceRecords = [];
  const payloadEntries: { path: string; data: Uint8Array }[] = [];
  const assets = [
    { id: 'asset-main', name: 'Main image' },
    { id: 'asset-support', name: 'Supporting image' },
  ];
  for (const [index, asset] of assets.entries()) {
    const samples = new Uint8Array([
      255, index * 20, 0, 255,
      0, 255, index * 30, 255,
    ]);
    const result = await createVyralDnaV3({
      record_id: 'dna-record-' + index,
      source: {
        asset_id: asset.id,
        asset_version_id: 'version-' + index,
        sha256: String(index + 1).repeat(64),
        size_bytes: 128,
        mime_type: 'image/png',
      },
      extractor: { name: 'test-decoder', version: '1.0.0' },
      width: 2,
      height: 1,
      channel_layout: 'RGBA',
      color_space: 'sRGB',
      icc_profile_sha256: null,
      alpha_mode: 'straight',
      decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
      tile_width: 1,
      tile_height: 1,
      decoded_samples: samples,
    });
    sourceRecords.push(result.record);
    payloadEntries.push(...result.entries);
  }
  const masterDna = await createVyralMasterDnaV1({
    master_dna_id: 'master-dna-test',
    vyral: { vyral_id: 'vyral-test', name: 'Test Vyral' },
    snapshot: { revision: 1, created_at: '2026-11-06T00:00:00.000Z' },
    purpose: { summary: 'A main visual with a supporting visual.', intended_uses: ['storyboarding'] },
    main_asset_ids: ['asset-main'],
    assets: [
      {
        asset_id: 'asset-main', asset_version_id: 'version-0', role: 'main', purpose: 'Primary subject',
        media_type: 'image/png', dna_ref: { record_id: 'dna-record-0', schema_id: 'vyra.asset-dna', schema_version: 3 },
        asset_fingerprint: 'a'.repeat(64), reconstruction_claim: 'lossless_decoded',
      },
      {
        asset_id: 'asset-support', asset_version_id: 'version-1', role: 'supporting', purpose: 'Supporting detail',
        media_type: 'image/png', dna_ref: { record_id: 'dna-record-1', schema_id: 'vyra.asset-dna', schema_version: 3 },
        asset_fingerprint: 'b'.repeat(64), reconstruction_claim: 'lossless_decoded',
      },
    ],
    relationships: [{
      relationship_id: 'relationship-1', type: 'supports', rationale: 'The supporting visual complements the main subject.',
      from: { kind: 'asset', asset_id: 'asset-support' }, to: { kind: 'asset', asset_id: 'asset-main' },
    }],
    reconstruction_profile: { overall_claim: 'lossless_decoded', notes: ['Each asset has its own exact decoded-sample stream.'] },
    provenance: { creator_ref: null, license_ref: null, evidence_status: 'partially_verified' },
    source_resolution: { visibility: 'private', canonical_uri: null, resolution_policy: 'no_remote_resolution' },
    portable_projection: { profile: 'compact', includes_full_reconstruction_payloads: false, resolver_uri: null, retrieval_policy: 'no_remote_resolution' },
  });
  const base = {
    ...manifest,
    assets,
    versions: [],
    masterDna,
  };
  const tamperedMasterDna = {
    ...masterDna,
    integrity: { ...masterDna.integrity, vyral_fingerprint: '0'.repeat(64) },
  };
  await assert.rejects(
    () => createVyralDnaOnlyPackage({ ...base, masterDna: tamperedMasterDna }, sourceRecords, payloadEntries),
    /Vyral fingerprint verification failed/,
  );
  const archive = await createVyralDnaOnlyPackage(base, sourceRecords, payloadEntries);
  const files = await readVyralZip(archive);
  const parsed = parseVyralManifest(files);
  assert.equal(parsed.assets.length, 2);
  assert.equal(parsed.dnaRecords.length, 2);
  assert.equal(parsed.masterDna?.assets.length, 2);
  assert.equal(parsed.exportMode, 'dna-only');
  for (const record of parsed.dnaRecords) {
    const reconstructed = await reconstructVyralDnaV3FromPackage(files, String(record.id));
    const source = sourceRecords.find((item) => item.record_id === record.id)!;
    assert.equal(reconstructed.decoded_samples_sha256, source.decoded_image.decoded_samples_sha256);
  }
});


test('exports, validates and reconstructs a DNA-only binary File DNA package from clean ZIP bytes', async () => {
  const original = new Uint8Array([0x50,0x4b,0x03,0x04,11,22,33,44,55,66,77,88,99,111,122,133,144,155,166,177,188]);
  const fileDna = await createVyralFileDnaV1({
    record_id: 'portable-file-dna',
    source: { asset_id: 'asset-test', asset_version_id: 'version-test' },
    bytes: original,
    mime_type: 'application/zip',
    filename: 'project.zip',
    include_payload: true,
    chunk_size: 8,
  });
  const sourceAwareManifest = {
    ...manifest,
    assets: [{ id: 'asset-test', name: 'Project archive', asset_type: 'archive', mime_type: 'application/zip' }],
    versions: [],
    masterDna: null,
  };
  const archive = await createVyralAssetDnaOnlyPackage(sourceAwareManifest, [fileDna.record], fileDna.entries);
  const files = await readVyralZip(new Uint8Array(await archive.arrayBuffer()));
  const parsed = parseVyralManifest(files);
  assert.equal(parsed.exportMode, 'dna-only');
  assert.equal(parsed.dnaRecords.length, 1);
  assert.equal(parsed.dnaRecords[0].dna_schema_id, 'vyra.asset-file-dna');
  assert.equal(parsed.reconstructionCapabilities?.decoded_sample_stream_reconstructable, false);
  assert.equal(parsed.reconstructionCapabilities?.encoded_source_bytes_recoverable, true);
  assert.equal(parsed.reconstructionCapabilities?.binary_source_bytes_reconstructable, true);
  const restored = await reconstructVyralFileDnaFromPackage(files, 'portable-file-dna');
  assert.deepEqual(restored, original);

  const mismatchedSource = {
    ...parsed,
    dnaRecords: parsed.dnaRecords.map((record) => ({
      ...record,
      dna_record: {
        ...(record.dna_record as Record<string, unknown>),
        source: { ...((record.dna_record as Record<string, unknown>).source as Record<string, unknown>), asset_id: 'another-asset' },
      },
    })),
  };
  const mismatchedArchive = createVyralZip([...files.entries()].map(([path, data]) =>
    path === 'manifest.json' ? { path, data: JSON.stringify(mismatchedSource) } : { path, data }
  ));
  const mismatchedFiles = await readVyralZip(mismatchedArchive);
  await assert.rejects(() => reconstructVyralFileDnaFromPackage(mismatchedFiles, 'portable-file-dna'), /inconsistent identity metadata|source Asset identity/);

  const tampered = new Map(files);
  const chunkPath = fileDna.record.reconstruction.chunks[0].package_path;
  const changed = tampered.get(chunkPath)!.slice();
  changed[0] ^= 0xff;
  tampered.set(chunkPath, changed);
  await assert.rejects(() => reconstructVyralFileDnaFromPackage(tampered, 'portable-file-dna'), /failed integrity|SHA-256/);
  const undeclared = new Map(files);
  undeclared.set('extra.bin', new Uint8Array([1]));
  assert.throws(() => parseVyralManifest(undeclared), /undeclared file/);
});

test('mixed DNA-only export requires exact File DNA payloads and a record for every asset', async () => {
  const fileDna = await createVyralFileDnaV1({
    record_id: 'file-only-identity',
    source: { asset_id: 'asset-test', asset_version_id: 'version-test' },
    bytes: new Uint8Array([1,2,3,4,5,6]),
    mime_type: 'application/octet-stream',
    include_payload: false,
  });
  await assert.rejects(() => createVyralAssetDnaOnlyPackage({
    ...manifest,
    versions: [],
  }, [fileDna.record], []), /lossless source-byte chunks/);
});


test('exports a single mixed-media Vyral with raster and exact binary DNA records', async () => {
  const samples = new Uint8Array([255,0,0,255,0,255,0,255]);
  const raster = await createVyralDnaV3({
    record_id: 'mixed-raster-dna',
    source: { asset_id: 'asset-image', asset_version_id: 'version-image', sha256: 'a'.repeat(64), size_bytes: 1024, mime_type: 'image/png' },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 2, height: 1, channel_layout: 'RGBA', color_space: 'sRGB', icc_profile_sha256: null,
    alpha_mode: 'straight',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    tile_width: 1, tile_height: 1, decoded_samples: samples,
  });
  const originalAudio = new Uint8Array([0x49,0x44,0x33,1,2,3,4,5,6,7,8,9]);
  const binary = await createVyralFileDnaV1({
    record_id: 'mixed-audio-dna',
    source: { asset_id: 'asset-audio', asset_version_id: 'version-audio' },
    bytes: originalAudio, mime_type: 'audio/mpeg', filename: 'voice.mp3', include_payload: true, chunk_size: 5,
  });
  const masterDna = await createVyralMasterDnaV1({
    master_dna_id: 'mixed-master-dna',
    vyral: { vyral_id: 'vyral-test', name: 'Mixed Test Vyral' },
    snapshot: { revision: 1, created_at: '2026-11-07T00:00:00.000Z' },
    purpose: { summary: 'A visual reference paired with a voice recording.', intended_uses: ['storyboarding'] },
    main_asset_ids: ['asset-image'],
    assets: [
      { asset_id: 'asset-image', asset_version_id: 'version-image', role: 'main', purpose: 'Primary visual reference', media_type: 'image/png', dna_ref: { record_id: 'mixed-raster-dna', schema_id: 'vyra.asset-dna', schema_version: 3 }, asset_fingerprint: 'a'.repeat(64), reconstruction_claim: 'lossless_decoded' },
      { asset_id: 'asset-audio', asset_version_id: 'version-audio', role: 'supporting', purpose: 'Narration paired with the visual', media_type: 'audio/mpeg', dna_ref: { record_id: 'mixed-audio-dna', schema_id: 'vyra.asset-file-dna', schema_version: 1 }, asset_fingerprint: binary.record.file.sha256, reconstruction_claim: 'source_file_exact' },
    ],
    relationships: [{ relationship_id: 'mixed-supports', type: 'supports', rationale: 'The voice recording narrates the primary visual.', from: { kind: 'asset', asset_id: 'asset-audio' }, to: { kind: 'asset', asset_id: 'asset-image' } }],
    reconstruction_profile: { overall_claim: 'lossless_decoded', notes: ['Raster samples and original binary source bytes are independently verified.'] },
    provenance: { creator_ref: null, license_ref: null, evidence_status: 'partially_verified' },
    source_resolution: { visibility: 'private', canonical_uri: null, resolution_policy: 'no_remote_resolution' },
    portable_projection: { profile: 'compact', includes_full_reconstruction_payloads: false, resolver_uri: null, retrieval_policy: 'no_remote_resolution' },
  });
  const base = {
    ...manifest,
    assets: [
      { id: 'asset-image', name: 'Visual', asset_type: 'image', mime_type: 'image/png' },
      { id: 'asset-audio', name: 'Voice', asset_type: 'audio', mime_type: 'audio/mpeg' },
    ],
    versions: [],
    masterDna,
  };
  const archive = await createVyralAssetDnaOnlyPackage(base, [raster.record, binary.record], [...raster.entries, ...binary.entries]);
  const files = await readVyralZip(new Uint8Array(await archive.arrayBuffer()));
  const parsed = parseVyralManifest(files);
  assert.equal(parsed.assets.length, 2);
  assert.equal(parsed.dnaRecords.length, 2);
  assert.equal(parsed.reconstructionCapabilities?.decoded_sample_stream_reconstructable, true);
  assert.equal(parsed.reconstructionCapabilities?.encoded_source_bytes_recoverable, false);
  assert.equal(parsed.reconstructionCapabilities?.binary_source_bytes_reconstructable, true);
  const restoredBinary = await reconstructVyralFileDnaFromPackage(files, 'mixed-audio-dna');
  assert.deepEqual(restoredBinary, originalAudio);
  const restoredRaster = await reconstructVyralDnaV3FromPackage(files, 'mixed-raster-dna');
  assert.equal(restoredRaster.decoded_samples_sha256, raster.record.decoded_image.decoded_samples_sha256);
});

test('exports and reconstructs a single raster Asset DNA-only package without Master DNA', async () => {
  const samples = new Uint8Array([
    254, 253, 254, 255,
    220, 12, 18, 255,
    254, 253, 254, 255,
  ]);
  const raster = await createVyralDnaV3({
    record_id: 'single-asset-dna-v3',
    source: {
      asset_id: 'asset-single',
      asset_version_id: 'version-single',
      sha256: 'c'.repeat(64),
      size_bytes: 1024,
      mime_type: 'image/png',
    },
    extractor: { name: 'test-decoder', version: '1.0.0' },
    width: 3,
    height: 1,
    channel_layout: 'RGBA',
    color_space: 'sRGB',
    icc_profile_sha256: null,
    alpha_mode: 'straight',
    decoder_contract: { name: 'test-decoder', version: '1.0.0', color_management: 'preserve-declared-samples' },
    tile_width: 2,
    tile_height: 1,
    decoded_samples: samples,
  });
  const singleAssetManifest = {
    ...manifest,
    assets: [{ id: 'asset-single', name: 'Single raster Asset', asset_type: 'image', mime_type: 'image/png' }],
    versions: [],
    masterDna: null,
  };
  const archive = await createVyralAssetDnaOnlyPackage(singleAssetManifest, [raster.record], raster.entries);
  const cleanZipBytes = new Uint8Array(await archive.arrayBuffer());
  const files = await readVyralZip(cleanZipBytes.slice());
  const parsed = parseVyralManifest(files);

  assert.equal(parsed.exportMode, 'dna-only');
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0].id, 'asset-single');
  assert.equal(parsed.versions.length, 0);
  assert.equal(parsed.dnaRecords.length, 1);
  assert.equal(parsed.dnaRecords[0].id, 'single-asset-dna-v3');
  assert.equal(parsed.masterDna, null);
  assert.equal(parsed.reconstructionCapabilities?.decoded_sample_stream_reconstructable, true);

  const reconstructed = await reconstructVyralDnaV3FromPackage(files, 'single-asset-dna-v3');
  assert.deepEqual(reconstructed.samples, samples);
  assert.equal(reconstructed.decoded_samples_sha256, raster.record.decoded_image.decoded_samples_sha256);

  const { pngBytes } = await encodeVyralDnaV3PngFromPackage(files, 'single-asset-dna-v3');
  assert.deepEqual(Array.from(pngBytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  assert.equal(view.getUint32(16), 3);
  assert.equal(view.getUint32(20), 1);
});



test('imports legacy DNA-only packages after dropping version-bound evidence while preserving exact Asset DNA', async () => {
  const sourceBytes = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 4, 5, 6]);
  const fileDna = await createVyralFileDnaV1({
    record_id: 'portable-file-dna-legacy-compat',
    source: { asset_id: 'asset-test', asset_version_id: 'version-test' },
    bytes: sourceBytes,
    mime_type: 'audio/mpeg',
    filename: 'voice.mp3',
    include_payload: true,
    chunk_size: 4,
  });
  const cleanArchive = await createVyralAssetDnaOnlyPackage({
    ...manifest,
    assets: [{ id: 'asset-test', name: 'Voice', asset_type: 'audio', mime_type: 'audio/mpeg' }],
    versions: [],
    masterDna: null,
  }, [fileDna.record], fileDna.entries);
  const cleanFiles = await readVyralZip(new Uint8Array(await cleanArchive.arrayBuffer()));
  const cleanManifest = JSON.parse(new TextDecoder().decode(cleanFiles.get('manifest.json')!));
  const portableFileRecord = cleanManifest.dnaRecords[0];
  // Historical exports stored the schema identity and DNA body inside the
  // database row's payload instead of at the portable manifest record root.
  cleanManifest.dnaRecords = [{
    id: 'legacy-database-row-id',
    scope: 'asset',
    asset_id: 'asset-test',
    source_kind: 'creator',
    payload: {
      dna_schema_id: portableFileRecord.dna_schema_id,
      dna_schema_version: portableFileRecord.dna_schema_version,
      dna_record: portableFileRecord.dna_record,
      recovery_level: portableFileRecord.recovery_level,
    },
  }, {
    id: 'legacy-unsupported-file-dna',
    scope: 'asset',
    asset_id: 'asset-test',
    payload: {
      dna_schema_id: 'vyra.asset-file-dna',
      dna_schema_version: 0,
      dna_record: { legacy: true },
    },
  }];
  cleanManifest.fingerprints = [{ id: 'old-fingerprint', asset_id: 'asset-test', asset_version_id: 'omitted-version' }];
  cleanManifest.visionObservations = [{ id: 'old-observation', asset_id: 'asset-test', asset_version_id: 'omitted-version' }];
  cleanManifest.lineage = [{ id: 'old-lineage', parent_asset_id: 'asset-test', child_asset_id: 'asset-test' }];
  cleanManifest.reconstructionTests = [{ id: 'old-test', asset_id: 'asset-test', asset_version_id: 'omitted-version' }];
  const legacyArchive = createVyralZip([
    ...Array.from(cleanFiles.entries())
      .filter(([path]) => path !== 'manifest.json')
      .map(([path, data]) => ({ path, data })),
    { path: 'manifest.json', data: JSON.stringify(cleanManifest) },
  ]);
  const legacyFiles = await readVyralZip(new Uint8Array(await legacyArchive.arrayBuffer()));
  const imported = parseVyralManifest(legacyFiles);
  assert.equal(imported.dnaRecords.length, 1);
  assert.equal(imported.dnaRecords[0].dna_schema_version, 1);
  assert.deepEqual(imported.fingerprints, []);
  assert.deepEqual(imported.visionObservations, []);
  assert.deepEqual(imported.lineage, []);
  assert.deepEqual(imported.reconstructionTests, []);
  assert.deepEqual(await reconstructVyralFileDnaFromPackage(legacyFiles, 'portable-file-dna-legacy-compat'), sourceBytes);
});
