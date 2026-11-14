import { supabase } from '../context/AuthContext';

export type MediaLibraryFolder = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

export type MediaLibraryItem = {
  id: string;
  user_id: string;
  folder_id: string | null;
  source_kind: 'upload' | 'vyral_asset' | 'generated';
  source_asset_id: string | null;
  bucket_id: 'vyral-assets';
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  signed_url: string | null;
  thumbnail_url: string | null;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SAFE_NAME = (value: string) => value.replaceAll('/', '-').replaceAll(String.fromCharCode(92), '-').split('').filter((char) => { const code = char.charCodeAt(0); return code >= 32 && code !== 127; }).join('').trim().slice(0, 180);
const SAFE_STORAGE_EXTENSION = (fileName: string) => {
  const extension = fileName.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1];
  return extension ? '.' + extension.toLowerCase() : '';
};
const getDb = () => {
  if (!supabase) throw new Error('Cloud storage is not configured in this environment.');
  return supabase;
};

async function getOwnerId(): Promise<string> {
  const db = getDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.id) throw new Error('Sign in to use My Media Library.');
  return data.user.id;
}

type MediaLibraryStorageCleanupJob = {
  id: string;
  bucket_id: string;
  storage_paths: string[];
  attempts: number;
};

/** Retries owner-scoped Storage cleanup jobs without blocking normal Library access. */
export async function processMediaLibraryStorageCleanup(limit = 4): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  const batchSize = Math.max(1, Math.min(8, Math.floor(limit)));
  const { data, error } = await db.from('media_library_storage_cleanup_jobs')
    .select('id,bucket_id,storage_paths,attempts')
    .eq('user_id', userId)
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(batchSize);
  if (error) return 0;

  let completed = 0;
  for (const job of (data ?? []) as MediaLibraryStorageCleanupJob[]) {
    // Never let a malformed or tampered queue row target canonical Vyral assets
    // or another user's objects. Standalone originals and thumbnails have
    // dedicated, owner-prefixed paths only.
    const validCleanupPaths = job.bucket_id === 'vyral-assets'
      && Array.isArray(job.storage_paths)
      && job.storage_paths.length > 0
      && job.storage_paths.every((path) => {
        if (typeof path !== 'string' || !path) return false;
        const segments = path.split('/');
        return !path.includes('\\')
          && !segments.some((segment) => !segment || segment === '.' || segment === '..')
          && (path.startsWith(userId + '/media-library/') || path.startsWith(userId + '/media-library-thumbnails/'));
      });
    if (!validCleanupPaths) {
      const attempts = job.attempts + 1;
      await db.from('media_library_storage_cleanup_jobs').update({
        attempts,
        next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        last_error: 'Blocked cleanup job with an unsafe bucket or object path.',
      }).eq('id', job.id).eq('user_id', userId);
      continue;
    }
    const { error: removeError } = await db.storage.from(job.bucket_id).remove(job.storage_paths);
    if (removeError) {
      const attempts = job.attempts + 1;
      const delayMinutes = Math.min(5 * (2 ** Math.min(attempts - 1, 8)), 1440);
      await db.from('media_library_storage_cleanup_jobs').update({
        attempts,
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        last_error: removeError.message.slice(0, 1000),
      }).eq('id', job.id).eq('user_id', userId);
      continue;
    }
    const { error: queueError } = await db.from('media_library_storage_cleanup_jobs')
      .delete().eq('id', job.id).eq('user_id', userId);
    if (!queueError) completed += 1;
  }
  return completed;
}

export async function loadMediaLibrary(): Promise<{ folders: MediaLibraryFolder[]; items: MediaLibraryItem[] }> {
  const db = getDb();
  const ownerId = await getOwnerId();
  // Cleanup is best-effort and owner-scoped; it must never prevent the Library from opening.
  void processMediaLibraryStorageCleanup(4).catch(() => undefined);
  const [folderResult, itemResult] = await Promise.all([
    db.from('media_library_folders').select('id,user_id,parent_id,name,created_at,updated_at').eq('user_id', ownerId).order('name'),
    db.from('media_library_items').select('id,user_id,folder_id,source_kind,source_asset_id,bucket_id,storage_path,file_name,mime_type,size_bytes,metadata,created_at,updated_at').eq('user_id', ownerId).order('created_at', { ascending: false }),
  ]);
  if (folderResult.error) throw new Error('Could not load Media Library folders: ' + folderResult.error.message);
  if (itemResult.error) throw new Error('Could not load Media Library files: ' + itemResult.error.message);
  const rawItems = (itemResult.data ?? []) as Omit<MediaLibraryItem, 'signed_url'>[];
  const items = await Promise.all(rawItems.map(async (item) => {
    const storage = db.storage.from(item.bucket_id);
    const thumbnailPath = typeof item.metadata?.thumbnail_path === 'string' ? item.metadata.thumbnail_path : null;
    const [{ data: original }, thumbnail] = await Promise.all([
      storage.createSignedUrl(item.storage_path, 60 * 60),
      thumbnailPath ? storage.createSignedUrl(thumbnailPath, 60 * 60) : Promise.resolve({ data: null, error: null }),
    ]);
    return { ...item, signed_url: original?.signedUrl ?? null, thumbnail_url: thumbnail.data?.signedUrl ?? null };
  }));
  return { folders: (folderResult.data ?? []) as MediaLibraryFolder[], items };
}

export async function createMediaLibraryFolder(name: string, parentId: string | null = null): Promise<MediaLibraryFolder> {
  const db = getDb();
  const userId = await getOwnerId();
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanName) throw new Error('Enter a folder name.');
  const { data, error } = await db.from('media_library_folders')
    .insert({ user_id: userId, parent_id: parentId, name: cleanName })
    .select('id,user_id,parent_id,name,created_at,updated_at').single();
  if (error) throw new Error(error.code === '23505' ? 'A folder with this name already exists here.' : 'Could not create folder: ' + error.message);
  return data as MediaLibraryFolder;
}

export async function renameMediaLibraryFolder(folderId: string, name: string): Promise<void> {
  const db = getDb();
  const userId = await getOwnerId();
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanName) throw new Error('Enter a folder name.');
  const { error } = await db.from('media_library_folders').update({ name: cleanName, updated_at: new Date().toISOString() }).eq('id', folderId).eq('user_id', userId);
  if (error) throw new Error(error.code === '23505' ? 'A folder with this name already exists here.' : 'Could not rename folder: ' + error.message);
}

export async function deleteMediaLibraryFolder(folderId: string): Promise<void> {
  const db = getDb();
  const userId = await getOwnerId();
  const [{ count: childCount, error: childError }, { count: itemCount, error: itemError }] = await Promise.all([
    db.from('media_library_folders').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('parent_id', folderId),
    db.from('media_library_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('folder_id', folderId),
  ]);
  if (childError || itemError) throw new Error('Could not check whether this folder is empty.');
  if ((childCount ?? 0) > 0 || (itemCount ?? 0) > 0) throw new Error('Move or remove this folder’s contents before deleting it.');
  const { error } = await db.from('media_library_folders').delete().eq('id', folderId).eq('user_id', userId);
  if (error) throw new Error('Could not delete folder: ' + error.message);
}

export async function moveMediaLibraryFolder(folderId: string, parentId: string | null): Promise<void> {
  const db = getDb();
  const userId = await getOwnerId();
  const { error } = await db.from('media_library_folders')
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq('id', folderId).eq('user_id', userId);
  if (error) {
    if (error.message.toLowerCase().includes('descendant') || error.message.toLowerCase().includes('cycle')) {
      throw new Error('A folder cannot be moved into itself or one of its subfolders.');
    }
    throw new Error('Could not move folder: ' + error.message);
  }
}

export async function moveMediaLibraryItems(itemIds: string[], folderId: string | null): Promise<void> {
  if (!itemIds.length) return;
  const db = getDb();
  const userId = await getOwnerId();
  const { error } = await db.from('media_library_items').update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .in('id', itemIds).eq('user_id', userId);
  if (error) throw new Error('Could not move selected files: ' + error.message);
}

export async function renameMediaLibraryItem(itemId: string, fileName: string): Promise<void> {
  const db = getDb();
  const userId = await getOwnerId();
  const cleanName = SAFE_NAME(fileName);
  if (!cleanName) throw new Error('Enter a file name.');
  const { error } = await db.from('media_library_items').update({ file_name: cleanName, updated_at: new Date().toISOString() })
    .eq('id', itemId).eq('user_id', userId);
  if (error) throw new Error('Could not rename file: ' + error.message);
}

export async function deleteMediaLibraryItems(itemIds: string[]): Promise<{ deletedCount: number; cleanupPending: boolean }> {
  if (!itemIds.length) return { deletedCount: 0, cleanupPending: false };
  const db = getDb();
  await getOwnerId();
  // The RPC atomically queues standalone originals/thumbnails and deletes the
  // Library index rows. Vyral-backed canonical binaries are never queued.
  const { data, error } = await db.rpc('delete_media_library_items_and_queue_storage_cleanup', {
    p_item_ids: itemIds,
  });
  if (error) throw new Error('Could not safely delete the selected files: ' + error.message);

  // Try immediately for a responsive experience; failed removals remain durable
  // and receive bounded exponential retry delays on later Library visits.
  await processMediaLibraryStorageCleanup(8);
  const { count, error: queueError } = await db.from('media_library_storage_cleanup_jobs')
    .select('id', { count: 'exact', head: true });
  return { deletedCount: typeof data === 'number' ? data : 0, cleanupPending: Boolean(queueError) || (count ?? 0) > 0 };
}

async function createMediaThumbnail(file: File): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const maxSide = 256;
  const drawFrame = (source: CanvasImageSource, width: number, height: number) => {
    if (!width || !height) return null;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.68));
  };

  try {
    if (file.type.startsWith('image/')) {
      if (typeof createImageBitmap !== 'function') return null;
      const bitmap = await createImageBitmap(file);
      try { return await drawFrame(bitmap, bitmap.width, bitmap.height); }
      finally { bitmap.close(); }
    }
    if (file.type.startsWith('video/')) {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      return await new Promise<Blob | null>((resolve) => {
        let settled = false;
        const finish = (blob: Blob | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(objectUrl);
          resolve(blob);
        };
        const timeout = window.setTimeout(() => finish(null), 8000);
        video.addEventListener('loadedmetadata', () => {
          if (!Number.isFinite(video.duration) || video.videoWidth === 0 || video.videoHeight === 0) return finish(null);
          video.currentTime = Math.min(0.25, video.duration / 2);
        }, { once: true });
        video.addEventListener('seeked', async () => {
          try { finish(await drawFrame(video, video.videoWidth, video.videoHeight)); }
          catch { finish(null); }
        }, { once: true });
        video.addEventListener('error', () => finish(null), { once: true });
        video.src = objectUrl;
        video.load();
      });
    }
  } catch {
    // Thumbnail generation is best-effort; the original upload remains usable.
  }
  return null;
}

/**
 * Backfills a small number of legacy image/video rows that predate thumbnails.
 * Originals are only downloaded; they are never moved, overwritten or deleted.
 * The thumbnail is stored first, then its path is added to the row metadata.
 */
export async function backfillMediaLibraryThumbnails(limit = 4): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  const batchSize = Math.max(1, Math.min(Math.floor(limit) || 1, 8));
  // Keep the PostgREST filter value free of fractional-second dots.
  const retryCutoff = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const { data, error } = await db.from('media_library_items')
    .select('id,bucket_id,storage_path,file_name,mime_type,metadata')
    .eq('user_id', userId)
    .is('metadata->thumbnail_path', null)
    .is('metadata->thumbnail_backfill_attempted_at', null)
    .or('metadata->thumbnail_backfill_retry_after_at.is.null,metadata->thumbnail_backfill_retry_after_at.lt.' + retryCutoff)
    .or('mime_type.like.image/%,mime_type.like.video/%')
    .order('created_at', { ascending: true })
    .limit(batchSize);
  if (error) throw new Error('Could not find older media thumbnails to generate: ' + error.message);

  let generated = 0;
  const scheduleRetry = async (row: { id: string; metadata: Record<string, unknown> | null }) => {
    const attempts = Number(row.metadata?.thumbnail_backfill_attempts ?? 0) + 1;
    const retryMetadata: Record<string, unknown> = {
      ...(row.metadata ?? {}),
      thumbnail_backfill_attempts: attempts,
    };
    if (attempts >= 8) {
      retryMetadata.thumbnail_backfill_attempted_at = new Date().toISOString();
      delete retryMetadata.thumbnail_backfill_retry_after_at;
    } else {
      // Exponential backoff (5 minutes to 24 hours) prevents old transient
      // failures from occupying every small batch on every Library visit.
      const delayMinutes = Math.min(5 * (2 ** (attempts - 1)), 24 * 60);
      retryMetadata.thumbnail_backfill_retry_after_at = new Date(Date.now() + delayMinutes * 60_000).toISOString();
    }
    await db.from('media_library_items')
      .update({ metadata: retryMetadata })
      .eq('id', row.id).eq('user_id', userId)
      .is('metadata->thumbnail_path', null)
      .is('metadata->thumbnail_backfill_attempted_at', null);
  };

  for (const row of (data ?? []) as Array<{
    id: string; bucket_id: 'vyral-assets'; storage_path: string; file_name: string;
    mime_type: string; metadata: Record<string, unknown> | null;
  }>) {
    try {
      const { data: original, error: downloadError } = await db.storage.from(row.bucket_id).download(row.storage_path);
      if (downloadError || !original) { await scheduleRetry(row); continue; }
      const sourceFile = new File([original], row.file_name, { type: row.mime_type || original.type || 'application/octet-stream' });
      const thumbnailBlob = await createMediaThumbnail(sourceFile);
      if (!thumbnailBlob) {
        // A decode timeout or temporary browser limitation may be recoverable;
        // use the same bounded backoff instead of permanently skipping the file.
        await scheduleRetry(row);
        continue;
      }

      const thumbnailType = thumbnailBlob.type === 'image/webp' ? 'image/webp' : 'image/png';
      const thumbnailExtension = thumbnailType === 'image/webp' ? 'webp' : 'png';
      // Each worker gets its own object key: a losing concurrent metadata update
      // must never remove the thumbnail object claimed by another worker.
      const thumbnailPath = userId + '/media-library-thumbnails/' + row.id + '-' + crypto.randomUUID() + '.' + thumbnailExtension;
      const { error: uploadError } = await db.storage.from('vyral-assets').upload(thumbnailPath, thumbnailBlob, {
        contentType: thumbnailType, upsert: true, cacheControl: '86400',
      });
      if (uploadError) { await scheduleRetry(row); continue; }

      const metadata = { ...(row.metadata ?? {}), thumbnail_path: thumbnailPath };
      const { data: updatedRow, error: updateError } = await db.from('media_library_items')
        .update({ metadata })
        .eq('id', row.id).eq('user_id', userId)
        .is('metadata->thumbnail_path', null)
        .select('id')
        .maybeSingle();
      // The row may have been deleted or another process may have attached a
      // thumbnail after the initial query. Remove our object unless this update
      // actually claimed the row, so a race cannot leave an orphaned thumbnail.
      if (updateError || !updatedRow) {
        await db.storage.from('vyral-assets').remove([thumbnailPath]);
        await scheduleRetry(row);
        continue;
      }
      generated += 1;
    } catch {
      // Retry transient download, upload or metadata failures without starving
      // later rows; the retry counter is bounded to eight attempts.
      await scheduleRetry(row);
    }
  }
  return generated;
}

export async function uploadMediaLibraryFiles(
  files: File[], folderId: string | null,
  onProgress?: (completed: number, total: number, currentFileName: string) => void,
  onFileError?: (file: File, error: Error) => void,
  signal?: AbortSignal,
): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  let uploaded = 0;
  for (const file of files) {
    // Cancellation is intentionally checked between files only: an active Storage
    // transfer is allowed to finish so it cannot leave a partially written object.
    if (signal?.aborted) break;
    // Report the file before its transfer starts so the UI never labels the
    // previously completed file as the one currently uploading.
    onProgress?.(uploaded, files.length, file.name);
    try {
      if (!file.size) throw new Error(file.name + ' is empty.');
      if (file.size > MAX_FILE_BYTES) throw new Error(file.name + ' exceeds the 100 MB per-file limit.');
      const id = crypto.randomUUID();
      // Keep the user's original filename in the Library record, but never use it
      // as a Storage object key: Unicode and punctuation can be rejected by the
      // storage backend. UUID + a conservative extension gives every upload a safe,
      // collision-resistant object path on every platform.
      const fileName = file.name.replace(/[\u0000-\u001F\u007F]/g, '').trim() || 'upload-' + id;
      const storagePath = userId + '/media-library/' + id + SAFE_STORAGE_EXTENSION(fileName);
      const mimeType = file.type || 'application/octet-stream';
      const { error: uploadError } = await db.storage.from('vyral-assets').upload(storagePath, file, {
        contentType: mimeType, upsert: false, cacheControl: '3600',
      });
      if (uploadError) throw new Error('Could not upload ' + file.name + ': ' + uploadError.message);
      let thumbnailPath: string | null = null;
      const thumbnailBlob = await createMediaThumbnail(file);
      if (thumbnailBlob) {
        const thumbnailType = thumbnailBlob.type === 'image/webp' ? 'image/webp' : 'image/png';
        const thumbnailExtension = thumbnailType === 'image/webp' ? 'webp' : 'png';
        const candidatePath = userId + '/media-library-thumbnails/' + id + '.' + thumbnailExtension;
        const { error: thumbnailError } = await db.storage.from('vyral-assets').upload(candidatePath, thumbnailBlob, {
          contentType: thumbnailType, upsert: false, cacheControl: '86400',
        });
        if (!thumbnailError) thumbnailPath = candidatePath;
      }
      const { error: insertError } = await db.from('media_library_items').insert({
        id, user_id: userId, folder_id: folderId, source_kind: 'upload', source_asset_id: null,
        bucket_id: 'vyral-assets', storage_path: storagePath, file_name: fileName,
        mime_type: mimeType, size_bytes: file.size,
        metadata: { upload_source: 'media_library', ...(thumbnailPath ? { thumbnail_path: thumbnailPath } : {}) },
      });
      if (insertError) {
        await db.storage.from('vyral-assets').remove([storagePath, ...(thumbnailPath ? [thumbnailPath] : [])]);
        throw new Error('The file uploaded but its library record could not be saved: ' + insertError.message);
      }
      uploaded += 1;
      onProgress?.(uploaded, files.length, file.name);
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('Could not upload ' + file.name + '.');
      // Keep the original fail-fast contract for existing callers. The Library UI
      // opts into per-file reporting so later files can still finish.
      if (!onFileError) throw failure;
      onFileError(file, failure);
    }
  }
  return uploaded;
}
/** Adds a successfully ingested Chat/Workspace Asset to the unified Library without duplicating its binary. */
export async function registerVyralAssetInMediaLibrary(input: {
  assetId: string; userId: string; fileName: string; mimeType: string; sizeBytes: number; storagePath: string;
  sourceKind?: 'vyral_asset' | 'generated';
  /** Pass the already-selected source File so thumbnails are created without downloading the canonical object again. */
  thumbnailSource?: File;
}): Promise<void> {
  const db = getDb();
  let thumbnailPath: string | null = null;
  if (input.thumbnailSource) {
    const thumbnailBlob = await createMediaThumbnail(input.thumbnailSource).catch(() => null);
    if (thumbnailBlob) {
      const thumbnailType = thumbnailBlob.type === 'image/webp' ? 'image/webp' : 'image/png';
      const thumbnailExtension = thumbnailType === 'image/webp' ? 'webp' : 'png';
      const candidatePath = input.userId + '/media-library-thumbnails/' + input.assetId + '.' + thumbnailExtension;
      const { error: thumbnailError } = await db.storage.from('vyral-assets').upload(candidatePath, thumbnailBlob, {
        contentType: thumbnailType, upsert: true, cacheControl: '86400',
      });
      if (!thumbnailError) thumbnailPath = candidatePath;
    }
  }
  const { error } = await db.from('media_library_items').upsert({
    user_id: input.userId, folder_id: null, source_kind: input.sourceKind ?? 'vyral_asset',
    source_asset_id: input.assetId, bucket_id: 'vyral-assets', storage_path: input.storagePath,
    file_name: SAFE_NAME(input.fileName) || 'Untitled asset', mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    metadata: { origin: 'vyral_asset_inventory', ...(thumbnailPath ? { thumbnail_path: thumbnailPath } : {}) },
  }, { onConflict: 'user_id,source_asset_id' });
  if (error) throw new Error('Could not add this Asset to My Media Library: ' + error.message);
}
