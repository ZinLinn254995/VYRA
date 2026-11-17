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


test('Editor Project File IDs survive timeline state persistence and Project autosave', () => {
  const workspace = read('src/components/workspace/WorkspacePage.tsx');
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(workspace.includes('projectId={activeStoryboard.id}'));
  assert.ok(workspace.includes('details: { ...current.details, masterTimeline }'));
  assert.ok(workspace.includes('const saved = { ...snapshot, updatedAt: new Date().toISOString() }'));
  assert.ok(workspace.includes('void persistStoryboard(saved, ownerStorageKey)'));
  assert.ok(editor.includes('projectFileId: projectFileId'));
  assert.ok(editor.includes('resolveProjectFilePlaybackUrl'));
});


test('Editor Director video track accepts Project File IDs without legacy Asset IDs', () => {
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(editor.includes('(clip.projectFileId || (clip.assetId && clip.assetVersionId))'));
  assert.ok(editor.includes('(instance?.projectFileId || (instance?.assetId && instance.assetVersionId))'));
  assert.ok(editor.includes('sourceIn, sourceOut, projectFileId: instance.projectFileId'));
});

test('Editor scopes cached Project File playback URLs to the active Project and validates media kind first', () => {
  const editor = read('src/components/workspace/MasterTimelineEditor.tsx');
  assert.ok(editor.includes("const cacheKey = projectId + ':' + projectFileId"), 'cached URLs must not leak across Project switches');
  assert.ok(editor.includes("if (localRecord?.projectId === projectId)"), 'local metadata must belong to the active Project');
  assert.ok(editor.includes("if (!matchesKind) throw new Error('The Project file is not a valid ' + expectedKind + ' source.')"));
  const resolver = editor.slice(editor.indexOf('const resolveProjectFilePlaybackUrl = async'), editor.indexOf('const [mediaUploadBusy', editor.indexOf('const resolveProjectFilePlaybackUrl = async')));
  assert.ok(resolver.indexOf('const matchesKind = expectedKind') < resolver.indexOf('const cachedUrl = projectFileObjectUrlsRef.current.get(cacheKey)'), 'validate the stored media type before reusing a cached URL');
});

test('Cloud recovery repairs evicted local binaries without changing Project File identity', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(storage.includes('const existingBlob = await getProjectOfflineFileBlob(input.projectFileId)'));
  assert.ok(storage.includes('if (existingBlob) return existing'));
  assert.ok(storage.includes('Treat that replica as damaged and reinstall the Cloud copy'));
  assert.ok(sync.includes('const localBlob = await getProjectOfflineFileBlob(row.id)'));
  assert.ok(sync.includes('if (localBlob) {'));
  assert.ok(sync.includes('Fall through and repair from Cloud'));
  assert.ok(sync.includes('if (downloaded.size !== expectedSize) continue'));
  assert.ok(sync.includes('projectFileId: row.id'), 'repair must retain the canonical Cloud Project File ID');
});

test('Offline restore cannot reassign a Project File ID across Projects', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  assert.ok(storage.includes('if (existing && existing.projectId !== input.projectId)'));
  assert.ok(storage.includes('already belongs to a different Project and cannot be reassigned'));
});


test('Project import atomically commits availability and Cloud upload queue without reusing an existing ID', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  assert.ok(storage.includes('async function storeValuesAtomically(entries: Array<{ storeName: string; value: unknown }>)'));
  assert.ok(storage.includes("db.transaction(storeNames, 'readwrite')"));
  assert.ok(storage.includes("{ storeName: FILE_STORE, value: readyRecord }"));
  assert.ok(storage.includes("{ storeName: SYNC_STORE, value: syncOperation }"));
  assert.ok(storage.includes('const existingIdentity = await getProjectOfflineFile(projectFileId)'));
  assert.ok(storage.includes('async function addValue<T>(storeName: string, value: T)'));
  assert.ok(storage.includes('transaction.objectStore(storeName).add(value)'));
  assert.ok(storage.includes('await addValue(FILE_STORE, initialRecord)'));
  assert.ok(storage.includes('already in use and cannot be overwritten by a new import'));
});

test('IndexedDB blocked-open errors clear the cached database promise so recovery can retry', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const blocked = storage.slice(storage.indexOf('request.onblocked'), storage.indexOf('};', storage.indexOf('request.onblocked')) + 2);
  assert.ok(blocked.includes('databasePromise = null'));
  assert.ok(blocked.includes('VYRA Offline Storage is busy in another app tab.'));
});


test('failed Project imports clean up their unique local binary and copying record', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const importBody = storage.slice(
    storage.indexOf('export async function importProjectFileToOfflineStorage'),
    storage.indexOf('export async function installProjectCloudFileToOfflineStorage'),
  );
  assert.ok(importBody.includes('await directory?.removeEntry(storageKey)'));
  assert.ok(importBody.includes('await deleteValue(BLOB_STORE, storageKey)'));
  assert.ok(importBody.includes('await deleteValue(FILE_STORE, projectFileId)'));
  assert.ok(!importBody.includes("localState: 'failed' as const"));
});


test('Project file metadata mutations commit atomically and stale Cloud completions cannot erase newer intent', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(storage.includes('revision: createId()'));
  assert.ok(storage.includes('await storeValuesAtomically('));
  assert.ok(storage.includes("storeName: FILE_STORE, value: updated"));
  assert.ok(storage.includes("storeName: SYNC_STORE, value: operation"));
  assert.ok(storage.includes("kind + ':' + projectFileId"));
  assert.ok(storage.includes('currentOperation.revision !== expectedRevision'));
  assert.ok(storage.includes('Never delete that newer intent'));
  assert.ok(sync.includes("completeProjectOfflineFileMutation(operation.projectFileId, 'rename', operation.revision)"));
  assert.ok(sync.includes("completeProjectOfflineFileMutation(operation.projectFileId, 'move', operation.revision)"));
});


test('Project Offline sync serializes workers and reconciles Cloud metadata without overwriting queued local changes', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const sync = read('src/services/projectOfflineCloudSync.ts');
  assert.ok(sync.includes('let projectCloudSyncPromise: Promise<number> | null = null'));
  assert.ok(sync.includes("lockManager.request('vyra-project-offline-cloud-sync'"));
  assert.ok(sync.includes('performPendingProjectFileSync(limit)'));
  assert.ok(storage.includes("db.transaction([FILE_STORE, SYNC_STORE], 'readwrite')"));
  assert.ok(storage.includes("syncStore.get('rename:' + input.projectFileId)"));
  assert.ok(storage.includes("syncStore.get('move:' + input.projectFileId)"));
  assert.ok(storage.includes('renamePending || movePending) return'));
});


test('Project Cloud upload rechecks delete tombstones before and after publishing the manifest', () => {
  const sync = read('src/services/projectOfflineCloudSync.ts');
  const before = sync.indexOf('const latestBeforeManifest = await getProjectOfflineFile(record.id)');
  const upsert = sync.indexOf(".from('media_library_items').upsert({", before);
  const after = sync.indexOf('const latestAfterManifest = await getProjectOfflineFile(record.id)', upsert);
  assert.ok(before >= 0 && upsert > before && after > upsert);
  assert.ok(sync.includes("db.storage.from(BUCKET).remove([storagePath])"));
  assert.ok(sync.includes('await deleteMediaLibraryItems([record.id], null, record.projectId)'));
  assert.ok(sync.includes('latestBeforeManifest.deletedAt'));
  assert.ok(sync.includes('latestAfterManifest.deletedAt'));
});


test('Cloud restore cannot overwrite a newer local replica or deletion', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const installStart = storage.indexOf('export async function installProjectCloudFileToOfflineStorage');
  const installEnd = storage.indexOf('export async function getProjectOfflineFile', installStart);
  const install = storage.slice(installStart, installEnd);
  assert.ok(storage.includes('replicaRevision?: string'));
  assert.ok(install.includes('replicaRevision: createId()'));
  assert.ok(install.includes('latestBeforeReady.replicaRevision !== base.replicaRevision'));
  assert.ok(install.includes('latestBeforeReady.updatedAt !== base.updatedAt'));
  assert.ok(install.includes('latest.updatedAt === base.updatedAt'));
  assert.ok(install.includes('latestBeforeReady.deletedAt'));
  assert.ok(install.includes('latest?.replicaRevision === base.replicaRevision && !latest.deletedAt'));
  assert.ok(install.includes('Never let an older restore overwrite its state'));
});


test('Cloud restore atomically claims a Project File ID before writing replica bytes', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const claimStart = storage.indexOf('async function claimProjectFileRestore');
  const claimEnd = storage.indexOf('async function storeValuesAtomically', claimStart);
  const claim = storage.slice(claimStart, claimEnd);
  const installStart = storage.indexOf('export async function installProjectCloudFileToOfflineStorage');
  const installEnd = storage.indexOf('export async function getProjectOfflineFile', installStart);
  const install = storage.slice(installStart, installEnd);
  assert.ok(claim.includes("db.transaction(FILE_STORE, 'readwrite')"));
  assert.ok(claim.includes('current.replicaRevision === expected.replicaRevision'));
  assert.ok(claim.includes('current.updatedAt === expected.updatedAt'));
  assert.ok(claim.includes('current.fileName === expected.fileName'));
  assert.ok(claim.includes('current.folderId === expected.folderId'));
  assert.ok(claim.includes('!current.deletedAt'));
  assert.ok(claim.includes(': !current'));
  assert.ok(claim.includes('transaction.abort()'));
  assert.ok(claim.includes('store.put(next)'));
  assert.ok(install.includes('await claimProjectFileRestore(existing, base)'));
  assert.ok(install.includes("existing?.localState === 'copying'"), 'Cloud restore must not race an active local import or restore');
  assert.ok(!install.includes('await storeValue(FILE_STORE, base)'));
});


test('Cloud tombstone cleanup retains deletion ownership until bytes are removed and finalizes metadata atomically', () => {
  const storage = read('src/services/projectOfflineStorage.ts');
  const start = storage.indexOf('export async function completeProjectOfflineFileDeletion');
  const end = storage.indexOf('export async function removeProjectOfflineFile', start);
  const deletion = storage.slice(start, end);
  const bytes = deletion.indexOf('await directory.removeEntry(record.storageKey)');
  const finalize = deletion.indexOf("db.transaction([FILE_STORE, SYNC_STORE], 'readwrite')");
  assert.ok(deletion.includes('if (!record?.deletedAt) return'));
  assert.ok(bytes >= 0 && finalize > bytes, 'the tombstone must remain while local bytes are cleaned');
  assert.ok(deletion.includes('current.storageKey !== record.storageKey'));
  assert.ok(deletion.includes('current.replicaRevision !== record.replicaRevision'));
  assert.ok(deletion.includes('current.updatedAt !== record.updatedAt'));
  assert.ok(deletion.includes("syncStore.delete(kind + ':' + projectFileId)"));
  assert.ok(!deletion.includes('await deleteValue(FILE_STORE, projectFileId)'));
});
