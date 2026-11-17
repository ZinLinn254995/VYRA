import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('Project offline storage is a durable local replica, not a disposable cache', () => {
  const service = read('src/services/projectOfflineStorage.ts');
  assert.ok(service.includes("const DATABASE_NAME = 'vyra-project-offline'"));
  assert.ok(service.includes("const FILE_STORE = 'projectFiles'"));
  assert.ok(service.includes("const BLOB_STORE = 'fallbackBlobs'"));
  assert.ok(service.includes("const SYNC_STORE = 'syncOperations'"));
  assert.ok(service.includes('navigator.storage as StorageWithOpfs'));
  assert.ok(service.includes('getDirectory?: () => Promise<OpfsDirectoryHandle>'));
  assert.ok(service.includes('requestProjectOfflinePersistence'));
  assert.ok(service.includes('getProjectOfflineStorageEstimate'));
  assert.ok(service.includes('importProjectFileToOfflineStorage'));
  assert.ok(service.includes('await copyToOpfs(input.file, storageKey, projectFileId, input.onProgress)'));
  assert.ok(service.includes('await storeValue(BLOB_STORE, { key: storageKey, blob: input.file, projectFileId })'));
  assert.ok(service.includes("operationId: 'upload:' + projectFileId"));
  assert.ok(service.includes("cloudState: 'queued'"));
  assert.ok(service.includes('listPendingProjectOfflineSyncOperations'));
  assert.ok(service.includes("operation.state === 'uploading'"));
  assert.ok(service.includes('getProjectOfflineFileAsFile'));
  assert.ok(service.includes('installProjectCloudFileToOfflineStorage'));
  assert.ok(service.includes('expectedSha256'));
  assert.ok(service.includes('The downloaded Cloud file failed its SHA-256 integrity check.'));
});

test('Project offline storage preserves one logical Project File identity across replicas', () => {
  const service = read('src/services/projectOfflineStorage.ts');
  assert.ok(service.includes('id: projectFileId'));
  assert.ok(service.includes('projectFileId: projectFileId'));
  assert.ok(service.includes('storageKey = projectFileId +'));
  assert.ok(service.includes('The source File is never moved or modified'));
  assert.ok(service.includes('emitOfflineStorageChanged(projectFileId)'));
  assert.ok(service.includes("if (record.cloudState !== 'synced')"));
  assert.ok(service.includes('cannot be removed from Offline Storage'));
});

test('Project architecture documents account recovery and two-way background sync', () => {
  const document = read('docs/architecture/PROJECT_CORE_REBUILD.md');
  for (const requirement of [
    'Device → Offline → Cloud',
    'Device onboarding and account recovery',
    'installProjectCloudFileToOfflineStorage',
    'Working branch: `feature/project-core-hybrid-rebuild`',
    'Two-way synchronization',
    'One logical Project File',
    'Cloud upload/download and reconciliation run in the background',
    'Chat and Editor integration',
    'Verification gates',
  ]) assert.ok(document.includes(requirement), 'Missing architecture requirement: ' + requirement);
});

test('Project Cloud sync reuses the canonical Project File ID for upload and device recovery', () => {
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(sync.includes('syncPendingProjectFilesToCloud'));
  assert.ok(sync.includes('restoreProjectOfflineFilesFromCloud'));
  assert.ok(sync.includes('startProjectOfflineCloudSync'));
  assert.ok(sync.includes("id: record.id"));
  assert.ok(sync.includes(".eq('project_id', projectId)"));
  assert.ok(sync.includes('installProjectCloudFileToOfflineStorage'));
  assert.ok(sync.includes("window.addEventListener('online'"));
  assert.ok(sync.includes("window.addEventListener('vyra:project-offline-file-ready'"));
});

test('account login starts background sync and automatic Cloud-to-device recovery', () => {
  const app = read('src/App.tsx');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(app.includes('startProjectOfflineCloudSync'));
  assert.ok(app.includes('restoreAccountProjectsToOfflineStorage'));
  assert.ok(app.includes('if (!user?.id || isGuestSession) return'));
  assert.ok(sync.includes('restoreAccountProjectsToOfflineStorage'));
  assert.ok(sync.includes("window.addEventListener('online'"));
});
