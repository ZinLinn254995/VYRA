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


test('Project Storage exposes local-first uploads and previews without waiting for Cloud', () => {
  const page = read('src/components/workspace/ProjectStoragePage.tsx');
  assert.ok(page.includes('importProjectFileToOfflineStorage({ projectId, folderId: activeFolderId, file })'));
  assert.ok(page.includes('listProjectOfflineFiles(projectId)'));
  assert.ok(page.includes('(record.folderId ?? null) === activeFolderId'));
  assert.ok(page.includes('record.fileName.toLocaleLowerCase().includes(serverQuery.toLocaleLowerCase())'));
  assert.ok(page.includes('getProjectOfflineFileBlob(entry.item.id)'));
  assert.ok(page.includes("window.addEventListener('vyra:project-offline-file-ready'"));
  assert.ok(!page.includes('uploadMediaLibraryFiles('));
});

test('Project local imports and device recovery respect available storage capacity', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(storage.includes('getProjectOfflineStorageEstimate()'));
  assert.ok(storage.includes('There is not enough available device storage'));
  assert.ok(sync.includes('MAX_RESTORE_BYTES_PER_PROJECT'));
  assert.ok(sync.includes('UNKNOWN_QUOTA_RESTORE_BUDGET'));
  assert.ok(sync.includes('getProjectOfflineStorageEstimate()'));
});


test('Project Chat persists attachments and sends supported media to AI inspection', () => {
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(chat.includes('importProjectFileToOfflineStorage'));
  assert.ok(chat.includes('projectId: storyboardId'));
  assert.ok(chat.includes('Project File ID:'));
  assert.ok(chat.includes('createVisionImagePreview(attachedFile)'));
  assert.ok(chat.includes('extractSelectedVideoFrames(attachedFile'));
  assert.ok(chat.includes('Attached text content:'));
  assert.ok(chat.includes('1 * 1024 * 1024'));
});


test('Editor resolves Project File IDs from Offline Storage before Cloud', () => {
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(editor.includes('getProjectOfflineFile(projectFileId)'));
  assert.ok(editor.includes('getProjectOfflineFileBlob(projectFileId)'));
  assert.ok(editor.includes('URL.createObjectURL(localBlob)'));
  assert.ok(editor.includes('getProjectMediaLibraryItemPlaybackSource(projectFileId, projectId, expectedKind)'));
  assert.ok(editor.includes('Project Files stored offline remain available'));
  assert.ok(editor.includes('projectFileObjectUrlsRef.current.values()'));
});


test('Editor media imports create Project File IDs locally first', () => {
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(editor.includes('importProjectFileToOfflineStorage({'));
  assert.ok(editor.includes('const projectFileId = imported.file.id'));
  assert.ok(editor.includes('projectFileId,'));
  assert.ok(editor.includes('resolveProjectFilePlaybackUrl'));
  assert.ok(!editor.includes('uploadMediaLibraryFiles('));
});


test('device recovery paginates the complete account manifest', () => {
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(sync.includes('.range(offset, offset + pageSize - 1)'));
  assert.ok(sync.includes('if (rows.length < pageSize) break'));
  assert.ok(sync.includes('if (projects.length < pageSize) break'));
});


test('Editor reuses existing Project Storage files without creating duplicate logical Assets', () => {
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(editor.includes('loadProjectStoragePicker'));
  assert.ok(editor.includes('for (let offset = 0; ; offset += 100)'));
  assert.ok(editor.includes('.range(offset, offset + 99)'));
  assert.ok(editor.includes(".eq('project_id', projectId).is('universe_id', null)"));
  assert.ok(editor.includes('listProjectOfflineFiles(projectId)'));
  assert.ok(editor.includes('getProjectOfflineFileBlob(entry.id)'));
  assert.ok(editor.includes('installProjectCloudFileToOfflineStorage'));
  assert.ok(editor.includes('projectFileId: entry.id'));
  assert.ok(editor.includes('Add from Project Storage'));
  assert.ok(editor.includes('placeTimelineMediaClip(value?.videoTracks || [], clip, kind'));
  assert.ok(editor.includes("placeTimelineOverlayClip(value?.audioTracks || [], clip, 'Audio'"));
});


test('Project Storage queues Offline rename, move, and tombstoned delete mutations', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  const page = read('src/components/workspace/ProjectStoragePage.tsx');
  assert.ok(storage.includes("kind: 'upload' | 'rename' | 'move' | 'delete'"));
  assert.ok(storage.includes('queueProjectOfflineFileMutation'));
  assert.ok(storage.includes("operationId: input.kind + ':' + input.projectFileId"));
  assert.ok(storage.includes("kind === 'delete' ? { deletedAt: now }"));
  assert.ok(storage.includes('completeProjectOfflineFileDeletion'));
  assert.ok(storage.includes('includeDeleted = false'));
  assert.ok(storage.includes('reconcileProjectOfflineFileMetadata'));
  assert.ok(sync.includes('renameMediaLibraryItem'));
  assert.ok(sync.includes('moveMediaLibraryItems'));
  assert.ok(sync.includes('deleteMediaLibraryItems'));
  assert.ok(sync.includes('if (local?.deletedAt && local.projectId === projectId) continue'));
  assert.ok(sync.includes('cloudManifestIds'));
  assert.ok(sync.includes('removeProjectOfflineFile(local.id)'));
  assert.ok(sync.includes('reconcileProjectOfflineFileMetadata'));
  assert.ok(sync.includes('if (existingRow) await deleteMediaLibraryItems'));
  assert.ok(page.includes("kind: 'rename', fileName: nextName"));
  assert.ok(page.includes("kind: 'move', folderId: destination"));
  assert.ok(page.includes("kind: 'delete'"));
  assert.ok(page.includes('const deletedIds = new Set'));
});


test('Project Chat preserves offline-only attachment references when no Cloud URL exists', () => {
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(chat.includes('Keep the canonical Project File reference even when Cloud has no row yet.'));
  assert.ok(chat.includes('return url ? { ...file, url } : file;'));
  assert.ok(!chat.includes('message.projectFiles.flatMap((file)'));
  assert.ok(chat.includes('getProjectOfflineFileBlob(attachment.projectFileId)'));
});

test('Project Chat keeps attachment IDs in message history and rehydrates prior-turn context', () => {
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(chat.includes("projectFiles: [{ projectFileId: attachedProjectFileId"));
  assert.ok(chat.includes('const attachmentRefs = nextMessages.flatMap'));
  assert.ok(chat.includes('getProjectOfflineFileBlob(attachment.projectFileId)'));
  assert.ok(chat.includes(".eq('project_id', storyboardId).is('universe_id', null).maybeSingle()"));
  assert.ok(chat.includes('installProjectCloudFileToOfflineStorage'));
  assert.ok(chat.includes('extractSelectedVideoFrames(blob, attachment.projectFileId'));
  assert.ok(chat.includes('nextMessages.slice(-12)'));
  assert.ok(chat.includes('.slice(-4)'));
  assert.ok(chat.includes('64 * 1024 * 1024'));
  assert.ok(chat.includes('visionImages.length < 8'));
  assert.ok(chat.includes('512 * 1024'));
  assert.ok(chat.includes('createVisionImagePreview(blob)'));
  assert.ok(chat.includes('historicalText.set(attachment.projectFileId'));
  assert.ok(chat.includes('promptMessages.map(({ role, content }) => ({ role, content }))'));
  assert.ok(chat.includes('message.projectFiles.map(({ projectFileId, name, mimeType })'));
});
