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

export async function loadMediaLibrary(): Promise<{ folders: MediaLibraryFolder[]; items: MediaLibraryItem[] }> {
  const db = getDb();
  const ownerId = await getOwnerId();
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
    return { ...item, signed_url: original?.signedUrl ?? null, thumbnail_url: thumbnail?.signedUrl ?? null };
  }));
  return { folders: (folderResult.data ?? []) as MediaLibraryFolder[], items };
}

export async function createMediaLibraryFolder(name: string, parentId: string | null = null): Promise<MediaLibraryFolder> {
  const db = getDb();
  const userId = await getOwnerId();
  const cleanName = name.trim().replace(/\\s+/g, ' ').slice(0, 80);
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
  const cleanName = name.trim().replace(/\\s+/g, ' ').slice(0, 80);
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

export async function deleteMediaLibraryItems(itemIds: string[]): Promise<void> {
  if (!itemIds.length) return;
  const db = getDb();
  const userId = await getOwnerId();
  const { data, error } = await db.from('media_library_items')
    .select('id,bucket_id,storage_path,source_asset_id,metadata').eq('user_id', userId).in('id', itemIds);
  if (error) throw new Error('Could not prepare file deletion: ' + error.message);
  const rows = (data ?? []) as Array<{ id: string; bucket_id: string; storage_path: string; source_asset_id: string | null; metadata: Record<string, unknown> | null }>;
  if (!rows.length) return;
  // Vyral-backed entries share their canonical binary with Asset DNA, Versions and Fingerprints.
  // Removing a Library shortcut must never delete that canonical object or corrupt its Vyral.
  const standaloneRows = rows.filter((row) => !row.source_asset_id);
  if (standaloneRows.length) {
    const storagePaths = standaloneRows.flatMap((row) => [row.storage_path, ...(typeof row.metadata?.thumbnail_path === 'string' ? [row.metadata.thumbnail_path] : [])]);
    const { error: storageError } = await db.storage.from('vyral-assets').remove(storagePaths);
    if (storageError) throw new Error('Files could not be removed from secure storage: ' + storageError.message);
  }
  const { error: rowError } = await db.from('media_library_items').delete().eq('user_id', userId).in('id', rows.map((row) => row.id));
  if (rowError) throw new Error('The files were removed from the Library index, but the index could not be updated. Refresh the library.');
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

export async function uploadMediaLibraryFiles(files: File[], folderId: string | null): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  let uploaded = 0;
  for (const file of files) {
    if (!file.size) throw new Error(file.name + ' is empty.');
    if (file.size > MAX_FILE_BYTES) throw new Error(file.name + ' exceeds the 100 MB per-file limit.');
    const id = crypto.randomUUID();
    // Keep the user's original filename in the Library record, but never use it
    // as a Storage object key: Unicode and punctuation can be rejected by the
    // storage backend. UUID + a conservative extension gives every upload a safe,
    // collision-resistant object path on every platform.
    const fileName = file.name.replace(/[\\u0000-\\u001F\\u007F]/g, '').trim() || 'upload-' + id;
    const storagePath = userId + '/media-library/' + id + SAFE_STORAGE_EXTENSION(fileName);
    const mimeType = file.type || 'application/octet-stream';
    const { error: uploadError } = await db.storage.from('vyral-assets').upload(storagePath, file, {
      contentType: mimeType, upsert: false, cacheControl: '3600',
    });
    if (uploadError) throw new Error('Could not upload ' + file.name + ': ' + uploadError.message);
    let thumbnailPath: string | null = null;
    const thumbnailBlob = await createMediaThumbnail(file);
    if (thumbnailBlob) {
      const candidatePath = userId + '/media-library-thumbnails/' + id + '.webp';
      const { error: thumbnailError } = await db.storage.from('vyral-assets').upload(candidatePath, thumbnailBlob, {
        contentType: 'image/webp', upsert: false, cacheControl: '86400',
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
  }
  return uploaded;
}

/** Adds a successfully ingested Chat/Workspace Asset to the unified Library without duplicating its binary. */
export async function registerVyralAssetInMediaLibrary(input: {
  assetId: string; userId: string; fileName: string; mimeType: string; sizeBytes: number; storagePath: string;
  sourceKind?: 'vyral_asset' | 'generated';
}): Promise<void> {
  const db = getDb();
  const { error } = await db.from('media_library_items').upsert({
    user_id: input.userId, folder_id: null, source_kind: input.sourceKind ?? 'vyral_asset',
    source_asset_id: input.assetId, bucket_id: 'vyral-assets', storage_path: input.storagePath,
    file_name: SAFE_NAME(input.fileName) || 'Untitled asset', mime_type: input.mimeType,
    size_bytes: input.sizeBytes, metadata: { origin: 'vyral_asset_inventory' },
  }, { onConflict: 'user_id,source_asset_id' });
  if (error) throw new Error('Could not add this Asset to My Media Library: ' + error.message);
}
