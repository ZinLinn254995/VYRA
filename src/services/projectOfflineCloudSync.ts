import { supabase } from '../context/AuthContext';
import {
  getProjectOfflineFile,
  getProjectOfflineFileBlob,
  getProjectOfflineStorageEstimate,
  installProjectCloudFileToOfflineStorage,
  listPendingProjectOfflineSyncOperations,
  updateProjectOfflineCloudState,
  completeProjectOfflineFileDeletion,
  completeProjectOfflineFileMutation,
  listProjectOfflineFiles,
  removeProjectOfflineFile,
} from './projectOfflineStorage';
import { deleteMediaLibraryItems, moveMediaLibraryItems, renameMediaLibraryItem } from './mediaLibraryCloud';

const BUCKET = 'vyral-assets';
const MAX_BATCH = 20;
const MAX_RESTORE_BYTES_PER_PROJECT = 256 * 1024 * 1024;
const UNKNOWN_QUOTA_RESTORE_BUDGET = 64 * 1024 * 1024;

function getDb() {
  if (!supabase) throw new Error('Cloud synchronization is not configured.');
  return supabase;
}

function safeExtension(fileName: string): string {
  const extension = fileName.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1];
  return extension ? '.' + extension.toLowerCase() : '';
}

async function getOwnerId(): Promise<string> {
  const { data, error } = await getDb().auth.getUser();
  if (error || !data.user?.id) throw new Error('Sign in to synchronize Project files.');
  return data.user.id;
}

/**
 * Uploads durable Offline replicas to Cloud. It is intentionally callable from
 * app startup, online events, and foreground activity; no UI progress is emitted.
 */
export async function syncPendingProjectFilesToCloud(limit = 5): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  const operations = await listPendingProjectOfflineSyncOperations(Math.min(MAX_BATCH, Math.max(1, limit)));
  let synced = 0;

  for (const operation of operations) {
    if (operation.kind !== 'upload') {
      try {
        if (operation.kind === 'delete') {
          const { data: existingRow, error: lookupError } = await db.from('media_library_items')
            .select('id').eq('id', operation.projectFileId).eq('user_id', userId)
            .eq('project_id', operation.projectId).is('universe_id', null).maybeSingle();
          if (lookupError) throw new Error(lookupError.message);
          if (existingRow) await deleteMediaLibraryItems([operation.projectFileId], null, operation.projectId);
          await completeProjectOfflineFileDeletion(operation.projectFileId);
          synced += 1;
        } else if (operation.kind === 'rename' && operation.fileName) {
          await renameMediaLibraryItem(operation.projectFileId, operation.fileName, null, operation.projectId);
          await completeProjectOfflineFileMutation(operation.projectFileId, 'rename');
          synced += 1;
        } else if (operation.kind === 'move') {
          await moveMediaLibraryItems([operation.projectFileId], operation.folderId ?? null, null, operation.projectId);
          await completeProjectOfflineFileMutation(operation.projectFileId, 'move');
          synced += 1;
        }
      } catch { /* Keep the durable operation queued for a later retry. */ }
      continue;
    }
    const record = await getProjectOfflineFile(operation.projectFileId);
    if (!record || record.deletedAt || record.projectId !== operation.projectId || record.localState !== 'available') continue;
    const blob = await getProjectOfflineFileBlob(record.id);
    if (!blob || blob.size !== record.sizeBytes) {
      await updateProjectOfflineCloudState(record.id, 'failed', 'The local Offline replica is missing or incomplete.');
      continue;
    }

    try {
      await updateProjectOfflineCloudState(record.id, 'uploading');
      const storagePath = userId + '/media-library/' + record.projectId + '/' + record.id + safeExtension(record.fileName);
      const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, blob, {
        contentType: record.mimeType || 'application/octet-stream',
        upsert: true,
        cacheControl: '3600',
      });
      if (uploadError) throw new Error(uploadError.message);

      const { error: rowError } = await db.from('media_library_items').upsert({
        id: record.id,
        user_id: userId,
        project_id: record.projectId,
        universe_id: null,
        folder_id: record.folderId,
        source_kind: 'upload',
        source_asset_id: null,
        bucket_id: BUCKET,
        storage_path: storagePath,
        file_name: record.fileName,
        mime_type: record.mimeType || 'application/octet-stream',
        size_bytes: record.sizeBytes,
        metadata: {
          upload_source: 'project_offline_sync',
          sha256: record.contentHash,
          local_replica: true,
        },
      }, { onConflict: 'id' });
      if (rowError) {
        // Keep the binary for an idempotent retry. It is safe to overwrite this
        // deterministic object path on the next attempt.
        throw new Error(rowError.message);
      }
      await updateProjectOfflineCloudState(record.id, 'synced');
      synced += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Cloud synchronization failed.';
      await updateProjectOfflineCloudState(record.id, 'failed', message.slice(0, 500));
    }
  }
  return synced;
}

/**
 * Reconciles a Project's Cloud manifest with this device. Existing logical file
 * IDs are retained; only missing local replicas are downloaded and installed.
 */
export async function restoreProjectOfflineFilesFromCloud(projectId: string, limit = 100): Promise<number> {
  if (!projectId) throw new Error('A Project is required for Offline recovery.');
  const db = getDb();
  const userId = await getOwnerId();
  const pageSize = Math.min(MAX_BATCH * 10, Math.max(1, limit));
  let offset = 0;
  let restored = 0;
  let restoredBytes = 0;
  const cloudManifestIds = new Set<string>();
  while (true) {
    const { data: rows, error } = await db.from('media_library_items')
      .select('id,project_id,folder_id,file_name,mime_type,size_bytes,storage_path,bucket_id,updated_at,metadata')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .is('universe_id', null)
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error('Could not load the Project Cloud manifest: ' + error.message);
    if (!rows?.length) break;

    for (const row of rows) {
      cloudManifestIds.add(row.id);
      if (row.bucket_id !== BUCKET || typeof row.storage_path !== 'string' ||
          !row.storage_path.startsWith(userId + '/media-library/' + projectId + '/')) continue;
      const local = await getProjectOfflineFile(row.id);
      if (local?.deletedAt && local.projectId === projectId) continue;
      if (local?.localState === 'available' && local.projectId === projectId) continue;
      const fileSize = Math.max(0, Number(row.size_bytes) || 0);
      const estimate = await getProjectOfflineStorageEstimate();
      const passBudget = estimate.quotaBytes === null || estimate.usageBytes === null
        ? UNKNOWN_QUOTA_RESTORE_BUDGET
        : Math.min(MAX_RESTORE_BYTES_PER_PROJECT, Math.max(0, estimate.quotaBytes - estimate.usageBytes - Math.max(32 * 1024 * 1024, Math.floor(estimate.quotaBytes * 0.08))));
      if (fileSize <= 0 || restoredBytes + fileSize > passBudget) continue;
      const { data: downloaded, error: downloadError } = await db.storage.from(BUCKET).download(row.storage_path);
      if (downloadError || !downloaded) continue;
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
      const expectedHash = typeof metadata.sha256 === 'string' ? metadata.sha256 : null;
      await installProjectCloudFileToOfflineStorage({
        projectId,
        projectFileId: row.id,
        folderId: row.folder_id ?? null,
        fileName: row.file_name,
        mimeType: row.mime_type,
        lastModified: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
        blob: downloaded,
        expectedSha256: expectedHash,
      });
      restored += 1;
      restoredBytes += downloaded.size;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  // Prune only after the complete manifest was read. Synced local files absent
  // from Cloud were deleted on another device; queued/failed uploads are retained.
  const localFiles = await listProjectOfflineFiles(projectId);
  for (const local of localFiles) {
    if (local.cloudState === 'synced' && !cloudManifestIds.has(local.id)) {
      await removeProjectOfflineFile(local.id);
    }
  }
  return restored;
}

/** Restore the signed-in account's Project files on a newly initialized device. */
export async function restoreAccountProjectsToOfflineStorage(): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  const pageSize = 100;
  let offset = 0;
  let restored = 0;
  while (true) {
    const { data: projects, error } = await db.from('vyral_storyboards')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error('Could not load the account Project list for Offline recovery: ' + error.message);
    if (!projects?.length) break;
    for (const project of projects) {
      restored += await restoreProjectOfflineFilesFromCloud(project.id, 200);
    }
    if (projects.length < pageSize) break;
    offset += projects.length;
  }
  return restored;
}

/** Attach idempotent background sync triggers for the lifetime of the app shell. */
export function startProjectOfflineCloudSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let running = false;
  let rerunRequested = false;
  const run = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try { await syncPendingProjectFilesToCloud(5); } catch { /* retry on next trigger */ }
    finally {
      running = false;
      if (rerunRequested && navigator.onLine) { rerunRequested = false; void run(); }
    }
  };
  const onOnline = () => {
    void run();
    void restoreAccountProjectsToOfflineStorage().catch(() => undefined);
  };
  const onLocalFileReady = () => { if (running) rerunRequested = true; else void run(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('vyra:project-offline-file-ready', onLocalFileReady);
  void run();
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('vyra:project-offline-file-ready', onLocalFileReady);
  };
}
