import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyVyralAssetFile,
  ingestVyralAsset,
  VyralAssetIngestionError,
  type VyralAssetIngestionPort,
} from '../src/services/vyralAssetIngestion';

const userId = '2f6d8a10-9b21-4c32-8d43-5a6b7c8d9e01';
const vyralId = '3a7e9b11-0c32-4d43-9e54-6b7c8d9e0f12';
const versionId = '4b8f0c22-1d43-4e54-8f65-7c8d9e0f1a23';

function makePort(options: { rasterStatus?: string; dnaExists?: boolean; failAt?: string } = {}) {
  const calls: string[] = [];
  const port: VyralAssetIngestionPort = {
    async createAsset() { calls.push('createAsset'); if (options.failAt === 'createAsset') throw new Error('insert failed'); },
    async uploadOriginal() { calls.push('uploadOriginal'); if (options.failAt === 'uploadOriginal') throw new Error('storage failed'); },
    async createVersion() { calls.push('createVersion'); if (options.failAt === 'createVersion') throw new Error('version failed'); return versionId; },
    async createFingerprint() { calls.push('createFingerprint'); if (options.failAt === 'createFingerprint') throw new Error('fingerprint failed'); },
    async extractRasterDna() { calls.push('extractRasterDna'); return { status: options.rasterStatus ?? 'extracted', error: 'extract failed' }; },
    async insertDna() { calls.push('insertDna'); if (options.failAt === 'insertDna') throw new Error('DNA insert failed'); },
    async hasDnaRecord() { calls.push('hasDnaRecord'); return options.dnaExists ?? false; },
    async markReady() { calls.push('markReady'); if (options.failAt === 'markReady') throw new Error('ready update failed'); },
    async removeStorage() { calls.push('removeStorage'); },
    async deleteFingerprints() { calls.push('deleteFingerprints'); },
    async deleteVersions() { calls.push('deleteVersions'); },
    async deleteAsset() { calls.push('deleteAsset'); },
  };
  return { port, calls };
}

const makeFile = (name: string, type: string, content = 'source bytes') =>
  new File([content], name, { type });

test('classifies image, video, audio and common Vyral file types', () => {
  assert.equal(classifyVyralAssetFile(makeFile('a.png', 'image/png')), 'image');
  assert.equal(classifyVyralAssetFile(makeFile('a.mp4', 'video/mp4')), 'video');
  assert.equal(classifyVyralAssetFile(makeFile('a.wav', 'audio/wav')), 'audio');
  assert.equal(classifyVyralAssetFile(makeFile('a.glb', '')), 'model_3d');
  assert.equal(classifyVyralAssetFile(makeFile('a.pdf', 'application/pdf')), 'document');
});

test('ingests raster files only after server DNA v3 succeeds and then marks ready', async () => {
  const { port, calls } = makePort();
  const result = await ingestVyralAsset(port, {
    vyralId, userId, file: makeFile('image.png', 'image/png'),
    metadata: { upload_source: 'media_generation', generation_provenance: { schemaVersion: 1 } },
  });
  assert.equal(result.dnaKind, 'raster-v3');
  assert.equal(result.assetType, 'image');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(calls.indexOf('extractRasterDna') < calls.indexOf('markReady'), true);
  assert.equal(calls.includes('insertDna'), false);
  assert.match(result.storagePath, new RegExp('^' + userId + '/' + vyralId + '/'));
});

test('non-raster files receive source-bound universal File DNA before ready', async () => {
  const { port, calls } = makePort();
  const result = await ingestVyralAsset(port, { vyralId, userId, file: makeFile('voice.wav', 'audio/wav') });
  assert.equal(result.dnaKind, 'universal-file-v1');
  assert.equal(calls.indexOf('insertDna') < calls.indexOf('markReady'), true);
});

test('failed raster extraction never marks the Asset ready and cleans incomplete records', async () => {
  const { port, calls } = makePort({ rasterStatus: 'failed' });
  await assert.rejects(
    ingestVyralAsset(port, { vyralId, userId, file: makeFile('image.png', 'image/png') }),
    (error: unknown) => error instanceof VyralAssetIngestionError && !error.preservedForRecovery,
  );
  assert.equal(calls.includes('markReady'), false);
  assert.equal(calls.includes('removeStorage'), true);
  assert.equal(calls.includes('deleteAsset'), true);
});

test('preserves bytes and records when DNA commit may already exist', async () => {
  const { port, calls } = makePort({ rasterStatus: 'failed', dnaExists: true });
  await assert.rejects(
    ingestVyralAsset(port, { vyralId, userId, file: makeFile('image.png', 'image/png') }),
    (error: unknown) => error instanceof VyralAssetIngestionError && error.preservedForRecovery,
  );
  assert.equal(calls.includes('removeStorage'), false);
  assert.equal(calls.includes('deleteAsset'), false);
});

test('cleans partial uploads when the storage step fails', async () => {
  const { port, calls } = makePort({ failAt: 'uploadOriginal' });
  await assert.rejects(ingestVyralAsset(port, {
    vyralId, userId, file: makeFile('voice.wav', 'audio/wav'),
  }));
  assert.equal(calls.includes('removeStorage'), true);
  assert.equal(calls.includes('deleteAsset'), true);
});

test('rejects invalid ownership IDs and oversized files before creating records', async () => {
  const { port, calls } = makePort();
  await assert.rejects(ingestVyralAsset(port, {
    vyralId: 'bad', userId, file: makeFile('voice.wav', 'audio/wav'),
  }));
  await assert.rejects(ingestVyralAsset(port, {
    vyralId, userId, file: makeFile('large.wav', 'audio/wav'), maxBytes: 2,
  }));
  assert.deepEqual(calls, []);
});
