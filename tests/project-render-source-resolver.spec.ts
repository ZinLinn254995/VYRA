import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectRenderSourceBlob } from '../src/services/projectRenderSourceResolver.ts';
import type { ProjectOfflineFileRecord } from '../src/services/projectOfflineStorage.ts';

const record = (overrides: Partial<ProjectOfflineFileRecord> = {}): ProjectOfflineFileRecord => ({
  id: 'file-1', projectId: 'project-1', folderId: null, fileName: 'clip.mp4', mimeType: 'video/mp4',
  sizeBytes: 4, lastModified: 1, localState: 'available', cloudState: 'synced', storageBackend: 'indexeddb',
  storageKey: 'file-1.blob', contentHash: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const ports = (overrides: Record<string, unknown> = {}) => ({
  getOfflineRecord: async () => record(),
  getOfflineBlob: async () => new Blob(['local']),
  getProjectCloudSource: async () => ({ projectFileId: 'file-1', signedUrl: 'https://private.invalid/file', mimeType: 'video/mp4', fileName: 'clip.mp4', sizeBytes: 4, expectedSha256: null }),
  installCloudReplica: async () => record(),
  getLegacyPlaybackUrl: async () => 'https://private.invalid/legacy',
  fetchBlob: async () => new Blob(['cloud']),
  ...overrides,
});

test('resolves an available same-Project local replica without requesting Cloud', async () => {
  let cloudCalls = 0;
  const result = await resolveProjectRenderSourceBlob({ projectId: 'project-1', source: { kind: 'project-file', projectFileId: 'file-1', mimeType: 'video/mp4' }, expectedKind: 'video' }, ports({ getProjectCloudSource: async () => { cloudCalls += 1; throw new Error('unexpected cloud call'); } }) as never);
  assert.equal(result.replica, 'offline');
  assert.equal(result.sourceKey, 'project-file:file-1');
  assert.equal(cloudCalls, 0);
});

test('rejects cross-Project local identities before accessing Cloud', async () => {
  await assert.rejects(() => resolveProjectRenderSourceBlob({ projectId: 'project-2', source: { kind: 'project-file', projectFileId: 'file-1' }, expectedKind: 'video' }, ports({ getOfflineRecord: async () => record() }) as never), /different Project/);
});

test('restores missing local Project File bytes from Cloud under the same ID', async () => {
  let installedId = '';
  const result = await resolveProjectRenderSourceBlob({ projectId: 'project-1', source: { kind: 'project-file', projectFileId: 'file-1', mimeType: 'video/mp4' }, expectedKind: 'video' }, ports({
    getOfflineRecord: async () => null,
    getOfflineBlob: async () => new Blob(['cloud']),
    installCloudReplica: async (input: { projectFileId: string }) => { installedId = input.projectFileId; return record(); },
  }) as never);
  assert.equal(installedId, 'file-1');
  assert.equal(result.replica, 'restored');
});

test('rejects wrong Project ownership, MIME mismatch, and incomplete Cloud downloads', async () => {
  await assert.rejects(() => resolveProjectRenderSourceBlob({ projectId: 'project-1', source: { kind: 'project-file', projectFileId: 'file-1' }, expectedKind: 'video' }, ports({ getOfflineRecord: async () => record({ mimeType: 'audio/mpeg' }) }) as never), /MIME type/);
  await assert.rejects(() => resolveProjectRenderSourceBlob({ projectId: 'project-1', source: { kind: 'project-file', projectFileId: 'file-1' }, expectedKind: 'video' }, ports({ getOfflineRecord: async () => null, getOfflineBlob: async () => null, fetchBlob: async () => new Blob(['x']) }) as never), /size does not match/);
});

test('resolves historical immutable Asset versions without converting them into Project File IDs', async () => {
  let requested = '';
  const result = await resolveProjectRenderSourceBlob({ projectId: 'project-1', source: { kind: 'legacy-asset', assetId: 'asset-1', assetVersionId: 'version-3', mimeType: 'audio/mpeg' }, expectedKind: 'audio' }, ports({
    getLegacyPlaybackUrl: async (source: { assetId: string; assetVersionId: string }) => { requested = source.assetId + ':' + source.assetVersionId; return 'https://private.invalid/legacy'; },
    fetchBlob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
  }) as never);
  assert.equal(requested, 'asset-1:version-3');
  assert.equal(result.sourceKey, 'legacy-asset:asset-1:version-3');
  assert.equal(result.replica, 'legacy-cache-or-cloud');
});
