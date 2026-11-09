import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT } from '../src/services/vyralPortableReconstruction.ts';

const FIXTURE_BUILDER = "\nimport hashlib, json, sys, zipfile\nfrom pathlib import Path\ntarget = Path(sys.argv[1])\nmode = sys.argv[2] if len(sys.argv) > 2 else \"valid\"\nraster = bytes([255, 0, 0, 255, 0, 255, 0, 128])\nsource = b\"VYRA exact source bytes\\x00\\x01\"\nraster_source = b\"original PNG bytes, encoded and compressed\\x00\"\nsha = lambda b: hashlib.sha256(b).hexdigest()\ndefinitions = [\n(\"manifest.json\",\"package_manifest\",\"package.manifest\"),\n(\"system/identity.json\",\"identity\",\"manifest.vyral\"),\n(\"system/asset-index.json\",\"asset_index\",\"manifest.assets\"),\n(\"system/asset-dna/index.json\",\"asset_dna_index\",\"manifest.dnaRecords\"),\n(\"system/master-dna.ref.json\",\"master_dna_reference\",\"manifest.masterDna\"),\n(\"system/fingerprints/index.json\",\"fingerprint_index\",\"manifest.fingerprints\"),\n(\"system/provenance/index.json\",\"provenance_index\",\"manifest.lineage\"),\n(\"system/relationships/index.json\",\"relationship_index\",\"manifest.masterDna.relationships\"),\n(\"system/classifications/index.json\",\"classification_index\",\"manifest.assets[].asset_type\"),\n(\"system/creator-instructions/index.json\",\"creator_instructions\",\"manifest.vyral.metadata.creator_instructions\"),\n(\"system/licensing.json\",\"licensing\",\"manifest.vyral.license_policy\"),\n(\"system/integrity.json\",\"integrity\",\"package.entries\"),\n(\"system/system-files.json\",\"system_file_index\",\"package.systemFiles\")]\ndescriptors = [{\"path\":p,\"kind\":k,\"source\":s,\"required\":True,\"protected\":True,\"state\":\"present\"} for p,k,s in definitions]\nfiles = {\"README.txt\":b\"fixture\",\"AI_RECONSTRUCTION_GUIDE.md\":b\"guide\",\"tools/reconstruct_vyral.py\":b\"# decoder\",\"assets/red.raw\":raster,\"assets/source.bin\":source,\"dna/v3/dna-raster/source/0.bin\":raster_source}\nraster_hash = \"0\"*64 if mode == \"bad_tile_hash\" else sha(raster)\nmanifest = {\n\"format\":\"application/vnd.vyra.vyral+zip\",\"formatVersion\":1,\"exportMode\":\"dna-only\",\"versions\":[],\"folders\":[],\n\"assets\":[{\"id\":\"asset-raster\",\"name\":\"Red Sample\"},{\"id\":\"asset-file\",\"name\":\"Binary Sample\",\"original_filename\":\"sample.bin\"}],\n\"dnaRecords\":[\n{\"id\":\"dna-raster\",\"asset_id\":\"asset-raster\",\"dna_schema_id\":\"vyra.asset-dna\",\"dna_schema_version\":3,\"recovery_level\":\"decoded-samples-exact\",\n\"dna_record\":{\"record_id\":\"dna-raster\",\"source\":{\"asset_id\":\"asset-raster\",\"asset_version_id\":\"version-raster\",\"sha256\":sha(raster_source),\"size_bytes\":len(raster_source),\"mime_type\":\"image/png\"},\"encoded_file_payload\":{\"encoding\":\"raw-chunks-v1\",\"filename\":\"origin.png\",\"mime_type\":\"image/png\",\"size_bytes\":len(raster_source),\"sha256\":sha(raster_source),\"chunk_size\":len(raster_source),\"chunks\":[{\"index\":0,\"byte_length\":len(raster_source),\"sha256\":sha(raster_source),\"package_path\":\"dna/v3/dna-raster/source/0.bin\"}]},\n\"decoded_image\":{\"width\":2,\"height\":1,\"channel_layout\":\"RGBA\",\"sample_format\":\"uint8\",\"color_space\":\"sRGB\",\"alpha_mode\":\"straight\",\"decoder_contract\":{\"name\":\"fixture\",\"version\":\"1\"},\"decoded_samples_sha256\":sha(raster)},\n\"lossless_payload\":{\"tiles\":[{\"x\":0,\"y\":0,\"width\":2,\"height\":1,\"byte_length\":len(raster),\"sha256\":raster_hash,\"package_path\":\"assets/red.raw\"}]}}},\n{\"id\":\"dna-file\",\"asset_id\":\"asset-file\",\"dna_schema_id\":\"vyra.asset-file-dna\",\"dna_schema_version\":1,\"recovery_level\":\"source-file-exact\",\n\"dna_record\":{\"record_id\":\"dna-file\",\"source\":{\"asset_id\":\"asset-file\"},\n\"reconstruction\":{\"claim\":\"source_file_exact\",\"chunks\":[{\"index\":0,\"byte_length\":len(source),\"sha256\":sha(source),\"package_path\":\"assets/source.bin\"}]},\n\"file\":{\"size_bytes\":len(source),\"sha256\":sha(source),\"extension\":\"bin\"}}}],\n\"systemFiles\":descriptors}\nfor p,_,_ in definitions[1:]:\n    if p not in (\"system/integrity.json\",\"system/system-files.json\"):\n        files[p] = json.dumps({\"fixture\":p}).encode()\nfiles[\"system/system-files.json\"] = json.dumps({\"schema\":\"vyra.vyral-system-file-index\",\"version\":1,\"files\":descriptors,\n\"deletion_policy\":{\"individual_system_file_deletion\":\"forbidden\",\"delete_with_parent_vyral_only\":True}}).encode()\nintegrity_paths = set(files) - {\"system/integrity.json\",\"system/system-files.json\"}\nfiles[\"system/integrity.json\"] = json.dumps({\"hash_algorithm\":\"SHA-256\",\"entries\":[\n{\"path\":p,\"size_bytes\":len(files[p]),\"sha256\":sha(files[p])} for p in sorted(integrity_paths)]}).encode()\nif mode == \"unsafe_path\":\n    files[\"../escape.txt\"] = b\"bad\"\nif mode == \"undeclared_original\":\n    files[\"hidden-original.png\"] = b\"original bytes must never be smuggled into DNA-only exports\"\nfiles[\"manifest.json\"] = json.dumps(manifest).encode()\nwith zipfile.ZipFile(target,\"w\",compression=zipfile.ZIP_STORED) as z:\n    for path,data in files.items():\n        z.writestr(path,data)\n";

function makeFixture(mode = 'valid') {
  const dir = mkdtempSync(join(tmpdir(), 'vyra-portable-'));
  const packagePath = join(dir, 'fixture.vyral');
  const scriptPath = join(dir, 'reconstruct_vyral.py');
  writeFileSync(scriptPath, VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT, 'utf8');
  execFileSync('python3', ['-c', FIXTURE_BUILDER, packagePath, mode]);
  return { dir, packagePath, scriptPath, output: join(dir, 'out') };
}

function runDecoder(fixture: ReturnType<typeof makeFixture>, extraArgs: string[] = []) {
  return spawnSync('python3', [fixture.scriptPath, fixture.packagePath, '--output', fixture.output, ...extraArgs], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
  });
}

test('portable DNA-only decoder restores exact raster samples and exact original file bytes', () => {
  const fixture = makeFixture();
  try {
    const result = runDecoder(fixture);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reconstructed_assets.length, 2);
    const raster = report.reconstructed_assets.find((item: { asset_id: string }) => item.asset_id === 'asset-raster');
    const file = report.reconstructed_assets.find((item: { asset_id: string }) => item.asset_id === 'asset-file');
    assert.equal(raster.result, 'decoded-samples-exact');
    assert.equal(readFileSync(raster.raw_samples).length, 8);
    assert.equal(readFileSync(raster.viewable_png).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(raster.original_encoded_file_bytes_recovered, true);
    assert.deepEqual(readFileSync(raster.source_file_exact.file), Buffer.from('original PNG bytes, encoded and compressed\\x00'));
    assert.equal(file.result, 'source-file-exact');
    assert.deepEqual(readFileSync(file.file), Buffer.from('VYRA exact source bytes\x00\x01'));
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder honors explicit Asset selection and does not emit unselected Assets', () => {
  const fixture = makeFixture();
  try {
    const result = runDecoder(fixture, ['--asset', 'asset-raster']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.reconstructed_assets.map((item: { asset_id: string }) => item.asset_id), ['asset-raster']);
    assert.equal(readdirSync(fixture.output).some((name) => name.startsWith('sample-asset-fi')), false);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder rejects a tile whose declared SHA-256 does not match its bytes', () => {
  const fixture = makeFixture('bad_tile_hash');
  try {
    const result = runDecoder(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Payload SHA-256 mismatch/);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder rejects ZIP path traversal before reading package contents', () => {
  const fixture = makeFixture('unsafe_path');
  try {
    const result = runDecoder(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe ZIP path/);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder audits a DNA-only package without writing reconstructed Assets', () => {
  const fixture = makeFixture();
  try {
    const result = runDecoder(fixture, ['--audit-only']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.validation, 'passed');
    assert.equal(report.export_mode, 'dna-only');
    assert.equal(report.asset_count, 2);
    assert.equal(report.undeclared_entries, 0);
    assert.equal(report.integrity, 'passed');
    assert.equal(report.contains_original_encoded_file_bytes, true);
    assert.equal(report.assets.find((item: { asset_id: string }) => item.asset_id === 'asset-raster').payload_kind, 'decoded-pixel-samples+original-file-bytes');
    assert.deepEqual(report.assets.map((item: { asset_id: string }) => item.asset_id), ['asset-raster', 'asset-file']);
    assert.equal(existsSync(fixture.output), false);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder audits only the explicitly selected Asset', () => {
  const fixture = makeFixture();
  try {
    const result = runDecoder(fixture, ['--audit-only', '--asset', 'asset-file']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.asset_count, 1);
    assert.equal(report.assets[0].asset_id, 'asset-file');
    assert.equal(report.assets[0].recovery_level, 'source-file-exact');
    assert.equal(report.assets[0].payload_kind, 'original-file-bytes');
    assert.equal(report.assets[0].original_encoded_file_bytes_included, true);
    assert.equal(report.contains_original_encoded_file_bytes, true);
    assert.equal(existsSync(fixture.output), false);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder audit reports the package SHA-256 and exact byte length', () => {
  const fixture = makeFixture();
  try {
    const result = runDecoder(fixture, ['--audit-only']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const packageBytes = readFileSync(fixture.packagePath);
    assert.equal(report.package_size_bytes, packageBytes.length);
    assert.equal(report.package_sha256, createHash('sha256').update(packageBytes).digest('hex'));
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('portable decoder rejects undeclared hidden original files in a DNA-only package', () => {
  const fixture = makeFixture('undeclared_original');
  try {
    const result = runDecoder(fixture, ['--audit-only']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(Vyral package integrity inventory does not match its ZIP entries|Package entries do not match the declared reconstruction payloads)/);
    assert.equal(existsSync(fixture.output), false);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});
