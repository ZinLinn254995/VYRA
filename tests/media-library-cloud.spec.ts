import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('Media Library database is cloud-backed and owner-isolated', () => {
  const migration = read('supabase/migrations/20261114080203_media_library_cloud.sql');
  for (const table of ['media_library_folders', 'media_library_items']) {
    assert.ok(migration.includes('create table if not exists public.' + table));
    assert.ok(migration.includes('alter table public.' + table + ' enable row level security'));
    for (const action of ['select','insert','update','delete']) assert.ok(migration.includes(table + '_' + action + '_own'));
  }
  assert.ok(migration.includes('enforce_media_library_item_owner_refs'));
  assert.ok(migration.includes('enforce_media_library_folder_parent_owner'));
  const safeMoves = read('supabase/migrations/20261114081200_media_library_safe_folder_moves.sql');
  assert.ok(safeMoves.includes('with recursive descendants(id)'));
  assert.ok(safeMoves.includes('union'));
  assert.ok(safeMoves.includes('A folder cannot be moved into one of its descendants'));
  const safeDelete = read('supabase/migrations/20261114151320_media_library_prevent_nonempty_folder_delete.sql');
  assert.ok(safeDelete.includes('prevent_nonempty_media_library_folder_delete'));
  assert.ok(safeDelete.includes('before delete on public.media_library_folders'));
  assert.ok(safeDelete.includes('parent_id = old.id'), 'The database must reject deletion while child folders remain.');
  assert.ok(safeDelete.includes('folder_id = old.id'), 'The database must reject deletion while files remain.');
  assert.ok(safeDelete.includes('pg_trigger_depth() > 1'), 'Account-level cascading deletion must remain possible.');
  assert.ok(safeDelete.includes('Media Library folder is not empty'));
  assert.ok(migration.includes('source_asset_id uuid references public.vyral_assets(id) on delete cascade'));
  assert.ok(migration.includes('on public.media_library_items(user_id, source_asset_id)'));
  const indexes = read('supabase/migrations/20261114080528_media_library_foreign_key_indexes.sql');
  for (const index of ['media_library_folders_parent_fk_idx','media_library_items_folder_fk_idx','media_library_items_source_asset_fk_idx']) assert.ok(indexes.includes(index));
});

test('Media Library service supports private cloud upload, preview, folders, moves and safe deletion', () => {
  const service = read('src/services/mediaLibraryCloud.ts');
  const backfillStart = service.indexOf('export async function backfillMediaLibraryThumbnails');
  const backfillEnd = service.indexOf('export async function uploadMediaLibraryFiles', backfillStart);
  const backfill = service.slice(backfillStart, backfillEnd);
  assert.ok(backfill.includes('.update({ metadata })'), 'thumbnail metadata should update without changing the file modified date');
  assert.ok(!backfill.includes('updated_at: new Date().toISOString()'), 'thumbnail backfill must preserve the original modified date');
  const thumbnailFailure = backfill.slice(backfill.indexOf('if (!thumbnailBlob)'), backfill.indexOf('const thumbnailType'));
  assert.ok(thumbnailFailure.includes('await scheduleRetry(row)'), 'Thumbnail decode failures must use bounded retry rather than being permanently skipped after one attempt.');
  assert.ok(!thumbnailFailure.includes('thumbnail_backfill_attempted_at: new Date().toISOString()'), 'A single decode timeout must not permanently suppress thumbnail retries.');
  for (const snippet of [
    'MAX_FILE_BYTES = 100 * 1024 * 1024',
    "storage.from('vyral-assets').upload",
    "userId + '/media-library/'",
    'createSignedUrl',
    'createMediaThumbnail',
    'backfillMediaLibraryThumbnails',
    'const batchSize = Math.max(1, Math.min(Math.floor(limit) || 1, 8))',
    ".is('metadata->thumbnail_path', null)",
    ".is('metadata->thumbnail_backfill_attempted_at', null)",
    ".or('metadata->thumbnail_backfill_retry_after_at.is.null,metadata->thumbnail_backfill_retry_after_at.lt.' + retryCutoff)",
    'const retryCutoff = new Date().toISOString()',
    'thumbnail_backfill_attempted_at',
    'thumbnail_backfill_retry_after_at',
    'thumbnail_backfill_attempts',
    'const attempts = Number(row.metadata?.thumbnail_backfill_attempts ?? 0) + 1',
    'if (attempts >= 8)',
    'const delayMinutes = Math.min(5 * (2 ** (attempts - 1)), 24 * 60)',
    'await scheduleRetry(row)',
    ".or('mime_type.like.image/%,mime_type.like.video/%')",
    ".order('created_at', { ascending: true })",
    '.limit(batchSize)',
    ".storage.from(row.bucket_id).download(row.storage_path)",
    "'/media-library-thumbnails/' + row.id + '-' + crypto.randomUUID()",
    '.update({ metadata })',
    ".select('id')",
    '.maybeSingle()',
    'if (updateError || !updatedRow)',
    'actually claimed the row',
    'Originals are only downloaded; they are never moved, overwritten or deleted.',
    'media-library-thumbnails/',
    "contentType: thumbnailType",
    "thumbnailBlob.type === 'image/webp' ? 'image/webp' : 'image/png'",
    "typeof item.metadata?.thumbnail_path === 'string'",
    "thumbnailSource?: File",
    'signal?: AbortSignal',
    'if (signal?.aborted) break;',
    'Cancellation is intentionally checked between files only',
    'thumbnail_url',
    'createMediaLibraryFolder',
    'renameMediaLibraryFolder',
    'deleteMediaLibraryFolder',
    'moveMediaLibraryItems',
    'moveMediaLibraryFolder',
    'deleteMediaLibraryItems',
    'registerVyralAssetInMediaLibrary',
    "onConflict: 'user_id,source_asset_id'",
    'const standaloneRows = rows.filter((row) => !row.source_asset_id)',
  ]) assert.ok(service.includes(snippet), 'Missing Media Library contract: ' + snippet);
  assert.ok(service.includes('onProgress?.(uploaded, files.length, file.name);\n    try {'), 'Upload progress should identify each file before its transfer begins.');
  assert.ok(service.includes(String.raw`replace(/\s+/g, ' ')`), 'Folder names should collapse repeated whitespace.');
  assert.ok(service.includes(String.raw`const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 80);`), 'Folder renames should collapse repeated whitespace.');
  assert.ok(service.includes(String.raw`replace(/[\u0000-\u001F\u007F]/g`), 'Uploaded filenames should strip control characters before storage.');
  assert.ok(service.includes('if (insertError)'));
  assert.ok(service.includes('thumbnailPath ? [thumbnailPath] : []'), 'Deleting standalone uploads should also remove their thumbnail objects.');
  assert.ok(service.includes('Thumbnail generation is best-effort'), 'Thumbnail failures must not invalidate original uploads.');
  assert.ok(service.includes('Removing a Library shortcut must never delete that canonical object'));
});

test('My Media Library UI includes required organization, filtering, views and multi-select', () => {
  const page = read('src/components/profile/MyMediaLibraryPage.tsx');
  for (const value of ["'image'","'video'","'audio'","'document'","'other'"]) assert.ok(page.includes(value));
  for (const snippet of [
    "setView('grid')", "setView('list')", 'multiple className="hidden"',
    'toggleAll', 'selectedIds', 'moveMediaLibraryItems', 'role="toolbar"', 'aria-label="Selected item actions"', 'Rename selected item', 'Move selected files to folder', 'Move selected folder to folder', 'moveSelectedFolder', 'blockedFolderIds', 'folderPath(folder.id)',
    'folderTree.filter(({ folder }) => folder.id !== activeFolderId)', 'Delete selected items',
    'deleteMediaLibraryItems', 'createMediaLibraryFolder',
    'renameMediaLibraryFolder', 'renameMediaLibraryItem',
    '<video', '<audio', 'previewItem.mime_type === \'application/pdf\'', 'PDF preview:', 'entry.item!.thumbnail_url', 'loading="lazy"', 'Stop after current file', 'requestUploadStop', 'Stopping…',
    'backfillMediaLibraryThumbnails(4)', 'refresh(true)',
    'only four legacy image/video files per visit',
    'const breadcrumbs = useMemo(', 'aria-label="Folder path"',
    'navigateToFolder(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null)',
    'folder.parent_id === activeFolderId', 'item.folder_id === activeFolderId',
    'New folder name', 'onContextMenu', 'event.preventDefault()',
    'onPointerDown', 'onPointerCancel', 'aria-label="Folder path"', '[-webkit-touch-callout:none]', 'select-none',
  ]) assert.ok(page.includes(snippet), 'Missing Media Library UI feature: ' + snippet);
  assert.ok(!page.includes('<aside'), 'Folder tree sidebar should not replace standard file-manager navigation.');
  assert.ok(!page.includes('Open folder'), 'Folder entries should display only their icon and name.');
  assert.ok(page.includes('downloadUrl.searchParams.set(\'download\', previewItem.file_name)'), 'Original files must use Storage download disposition with the original filename.');
  assert.ok(page.includes('aria-label="Download original file"'), 'The preview action must be exposed as a download, not an inline open.');
  assert.ok(page.includes('formatBytes(entry.item.size_bytes)'), 'List view should retain file size metadata.');
  assert.ok(page.includes('Date modified'), 'List view should retain modification date metadata.');
  assert.ok(!page.includes("'Folder created.'"), 'Folder creation should not show a success toast.');
});

test('Profile routes My Media Library and AI Chat Vyral uploads are indexed automatically', () => {
  const profile = read('src/components/profile/ProfilePage.tsx');
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(profile.includes("import { MyMediaLibraryPage }"));
  assert.ok(profile.includes('<MyMediaLibraryPage />'));
  assert.ok(chat.includes('registerVyralAssetInMediaLibrary'));
  assert.ok(chat.includes('thumbnailSource: sourceFile'), 'AI Chat should reuse the selected File to create its Library thumbnail without re-downloading the original.');
  assert.ok(chat.includes('assetId: ingested.assetId'));
  assert.ok(chat.includes('storagePath: ingested.storagePath'));
  assert.ok(chat.includes('**My Media Library:** Added automatically.'));
});


test('Media Library failure handling keeps retries scoped and protects canonical files', () => {
  const service = read('src/services/mediaLibraryCloud.ts');
  const page = read('src/components/profile/MyMediaLibraryPage.tsx');

  const uploadStart = service.indexOf('export async function uploadMediaLibraryFiles');
  const uploadEnd = service.indexOf('export async function registerVyralAssetInMediaLibrary', uploadStart);
  const upload = service.slice(uploadStart, uploadEnd);
  assert.ok(upload.indexOf('if (signal?.aborted) break;') < upload.indexOf('await db.storage.from(\'vyral-assets\').upload(storagePath'));
  assert.ok(upload.includes('if (!onFileError) throw failure;'), 'Legacy callers should retain fail-fast upload behavior.');
  assert.ok(upload.includes('onFileError(file, failure);'), 'The Library should be able to collect one file failure and continue.');
  assert.ok(upload.includes('if (insertError)'));
  assert.ok(upload.includes('remove([storagePath, ...(thumbnailPath ? [thumbnailPath] : [])])'), 'A failed database insert must clean up its uploaded objects.');

  const folderRenameStart = service.indexOf('export async function renameMediaLibraryFolder');
  const folderRenameEnd = service.indexOf('export async function deleteMediaLibraryFolder', folderRenameStart);
  const folderRename = service.slice(folderRenameStart, folderRenameEnd);
  assert.ok(folderRename.includes("if (error) throw new Error(error.code === '23505' ? 'A folder with this name already exists here.' : 'Could not rename folder: ' + error.message)"), 'Folder rename conflicts and backend failures must be surfaced.');

  const folderMoveStart = service.indexOf('export async function moveMediaLibraryFolder');
  const folderMoveEnd = service.indexOf('export async function moveMediaLibraryItems', folderMoveStart);
  const folderMove = service.slice(folderMoveStart, folderMoveEnd);
  assert.ok(folderMove.includes('A folder cannot be moved into itself or one of its subfolders.'), 'Folder cycle violations must be reported clearly.');
  assert.ok(folderMove.includes("throw new Error('Could not move folder: ' + error.message)"), 'Unexpected folder move failures must be surfaced.');

  const fileMoveStart = service.indexOf('export async function moveMediaLibraryItems');
  const fileMoveEnd = service.indexOf('export async function renameMediaLibraryItem', fileMoveStart);
  const fileMove = service.slice(fileMoveStart, fileMoveEnd);
  assert.ok(fileMove.includes("throw new Error('Could not move selected files: ' + error.message)"), 'File move failures must be surfaced.');

  const fileRenameStart = service.indexOf('export async function renameMediaLibraryItem');
  const fileRenameEnd = service.indexOf('export async function deleteMediaLibraryItems', fileRenameStart);
  const fileRename = service.slice(fileRenameStart, fileRenameEnd);
  assert.ok(fileRename.includes("throw new Error('Could not rename file: ' + error.message)"), 'File rename failures must be surfaced.');

  const folderDeleteStart = service.indexOf('export async function deleteMediaLibraryFolder');
  const folderDeleteEnd = service.indexOf('export async function moveMediaLibraryFolder', folderDeleteStart);
  const folderDelete = service.slice(folderDeleteStart, folderDeleteEnd);
  assert.ok(folderDelete.includes('if (childError || itemError) throw new Error('), 'Folder deletion must stop if its emptiness check fails.');
  assert.ok(folderDelete.includes("throw new Error('Could not delete folder: ' + error.message)"), 'Folder delete failures must be surfaced.');

  const deleteStart = service.indexOf('export async function deleteMediaLibraryItems');
  const deleteEnd = service.indexOf('async function createMediaThumbnail', deleteStart);
  const deletion = service.slice(deleteStart, deleteEnd);
  assert.ok(deletion.includes("db.rpc('delete_media_library_items_and_queue_storage_cleanup'"), 'Index deletion and cleanup enqueueing must be atomic.');
  assert.ok(deletion.includes('await processMediaLibraryStorageCleanup(8)'), 'Deletion should attempt queued cleanup immediately.');
  assert.ok(deletion.includes('cleanupPending'), 'The UI must be able to report when secure cleanup remains queued.');

  const cleanupStart = service.indexOf('export async function processMediaLibraryStorageCleanup');
  const cleanupEnd = service.indexOf('export async function loadMediaLibrary', cleanupStart);
  const cleanup = service.slice(cleanupStart, cleanupEnd);
  assert.ok(cleanup.includes(".from('media_library_storage_cleanup_jobs')"), 'Storage cleanup must use the durable owner-scoped queue.');
  assert.ok(cleanup.includes('.eq(\'user_id\', userId)'), 'Cleanup jobs must remain isolated to the signed-in owner.');
  assert.ok(cleanup.includes('next_attempt_at'), 'Failed cleanup jobs must be scheduled for retry.');
  assert.ok(cleanup.includes('Math.min(5 * (2 ** Math.min(attempts - 1, 8)), 1440)'), 'Storage cleanup retries must use capped exponential backoff.');
  assert.ok(cleanup.includes(".storage.from(job.bucket_id).remove(job.storage_paths)"), 'The worker must remove only the queued object paths.');
  assert.ok(service.includes('void processMediaLibraryStorageCleanup(4).catch(() => undefined)'), 'Library visits must retry pending cleanup without blocking the page.');

  const cleanupMigration = read('supabase/migrations/20261114180000_media_library_storage_cleanup_queue.sql');
  assert.ok(cleanupMigration.includes('create table if not exists public.media_library_storage_cleanup_jobs'));
  assert.ok(cleanupMigration.includes('enable row level security'));
  assert.ok(cleanupMigration.includes('media_library_storage_cleanup_select_own'));
  assert.ok(cleanupMigration.includes('delete_media_library_items_and_queue_storage_cleanup'));
  assert.ok(cleanupMigration.includes('and item.source_asset_id is null'), 'Vyral canonical objects must never enter the cleanup queue.');
  assert.ok(cleanupMigration.includes('array_remove(array[item.storage_path, nullif(item.metadata->>\'thumbnail_path\', \'\')], null)'), 'Both standalone originals and thumbnails must be queued together.');
  assert.ok(cleanupMigration.includes('security invoker'), 'The delete RPC must respect caller RLS policies.');

  assert.ok(folderDelete.includes('if ((childCount ?? 0) > 0 || (itemCount ?? 0) > 0) throw new Error('), 'Non-empty folders must never be deleted.');

  const uploadUiStart = page.indexOf('const runUploadBatch =');
  const uploadUiEnd = page.indexOf('const createFolder =', uploadUiStart);
  const uploadUi = page.slice(uploadUiStart, uploadUiEnd);
  assert.ok(uploadUi.includes('setFailedUploads(failures)'), 'Failed files must remain available to retry.');
  assert.ok(uploadUi.includes('controller.signal.aborted'), 'The UI must report a user-requested stop.');
  assert.ok(uploadUi.includes('finally {\n      uploadAbortControllerRef.current = null;'), 'Upload cancellation state must be cleaned up after the batch.');
  assert.ok(page.includes('const retryFiles = failedUploads.map(({ file }) => file)'), 'Retry must contain failed files only.');
  assert.ok(page.includes('uploadAbortControllerRef.current.abort()'), 'Stop should signal the active batch rather than interrupt a storage request.');
});
