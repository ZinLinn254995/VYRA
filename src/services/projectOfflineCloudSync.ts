import { supabase } from '../context/AuthContext';
import {
  getProjectOfflineFile,
  getProjectOfflineFileBlob,
  installProjectCloudFileToOfflineStorage,
  listPendingProjectOfflineSyncOperations,
  updateProjectOfflineCloudState,
} from './projectOfflineStorage';

const BUCKET = 'vyral-assets';
const MAX_BATCH = 20;

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
    const record = await getProjectOfflineFile(operation.projectFileId);
    if (!record || record.projectId !== operation.projectId || record.localState !== 'available') continue;
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
        folder_id: null,
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
  const { data: rows, error } = await db.from('media_library_items')
    .select('id,project_id,file_name,mime_type,size_bytes,storage_path,bucket_id,updated_at,metadata')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .is('universe_id', null)
    .order('updated_at', { ascending: false })
    .limit(Math.min(MAX_BATCH * 10, Math.max(1, limit)));
  if (error) throw new Error('Could not load the Project Cloud manifest: ' + error.message);

  let restored = 0;
  for (const row of rows ?? []) {
    if (row.bucket_id !== BUCKET || typeof row.storage_path !== 'string' ||
        !row.storage_path.startsWith(userId + '/media-library/' + projectId + '/')) continue;
    const local = await getProjectOfflineFile(row.id);
    if (local?.localState === 'available' && local.projectId === projectId) continue;
    const { data: downloaded, error: downloadError } = await db.storage.from(BUCKET).download(row.storage_path);
    if (downloadError || !downloaded) continue;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
    const expectedHash = typeof metadata.sha256 === 'string' ? metadata.sha256 : null;
    await installProjectCloudFileToOfflineStorage({
      projectId,
      projectFileId: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      lastModified: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
      blob: downloaded,
      expectedSha256: expectedHash,
    });
    restored += 1;
  }
  return restored;
}

/** Restore the signed-in account's Project files on a newly initialized device. */
export async function restoreAccountProjectsToOfflineStorage(): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  const { data: projects, error } = await db.from('vyral_storyboards')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error('Could not load the account Project list for Offline recovery: ' + error.message);
  let restored = 0;
  for (const project of projects ?? []) {
    restored += await restoreProjectOfflineFilesFromCloud(project.id, 200);
  }
  return restored;
}

/** Attach idempotent background sync triggers for the lifetime of the app shell. */
export function startProjectOfflineCloudSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let running = false;
  const run = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try { await syncPendingProjectFilesToCloud(5); } catch { /* retry on next trigger */ }
    finally { running = false; }
  };
  const onOnline = () => { void run(); };
  const onLocalFileReady = () => { void run(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('vyra:project-offline-file-ready', onLocalFileReady);
  void run();
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('vyra:project-offline-file-ready', onLocalFileReady);
  };
}
