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
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SAFE_NAME = (value: string) => value.replace(/[\\/\\\\]/g, '-').replace(/[\\u0000-\\u001f]/g, '').trim().slice(0, 180);
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
    const { data } = await db.storage.from(item.bucket_id).createSignedUrl(item.storage_path, 60 * 60);
    return { ...item, signed_url: data?.signedUrl ?? null };
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
    .select('id,bucket_id,storage_path').eq('user_id', userId).in('id', itemIds);
  if (error) throw new Error('Could not prepare file deletion: ' + error.message);
  const rows = (data ?? []) as Array<{ id: string; bucket_id: string; storage_path: string }>;
  if (!rows.length) return;
  const paths = rows.map((row) => row.storage_path);
  const { error: storageError } = await db.storage.from('vyral-assets').remove(paths);
  if (storageError) throw new Error('Files could not be removed from secure storage: ' + storageError.message);
  const { error: rowError } = await db.from('media_library_items').delete().eq('user_id', userId).in('id', rows.map((row) => row.id));
  if (rowError) throw new Error('Storage files were removed, but the library index could not be updated. Refresh the library.');
}

export async function uploadMediaLibraryFiles(files: File[], folderId: string | null): Promise<number> {
  const db = getDb();
  const userId = await getOwnerId();
  let uploaded = 0;
  for (const file of files) {
    if (!file.size) throw new Error(file.name + ' is empty.');
    if (file.size > MAX_FILE_BYTES) throw new Error(file.name + ' exceeds the 100 MB per-file limit.');
    const id = crypto.randomUUID();
    const fileName = SAFE_NAME(file.name) || 'upload-' + id;
    const storagePath = userId + '/media-library/' + id + '/' + fileName;
    const mimeType = file.type || 'application/octet-stream';
    const { error: uploadError } = await db.storage.from('vyral-assets').upload(storagePath, file, {
      contentType: mimeType, upsert: false, cacheControl: '3600',
    });
    if (uploadError) throw new Error('Could not upload ' + file.name + ': ' + uploadError.message);
    const { error: insertError } = await db.from('media_library_items').insert({
      id, user_id: userId, folder_id: folderId, source_kind: 'upload', source_asset_id: null,
      bucket_id: 'vyral-assets', storage_path: storagePath, file_name: fileName,
      mime_type: mimeType, size_bytes: file.size, metadata: { upload_source: 'media_library' },
    });
    if (insertError) {
      await db.storage.from('vyral-assets').remove([storagePath]);
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
