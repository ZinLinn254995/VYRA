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
  assert.ok(migration.includes('source_asset_id uuid references public.vyral_assets(id) on delete cascade'));
  assert.ok(migration.includes('on public.media_library_items(user_id, source_asset_id)'));
  const indexes = read('supabase/migrations/20261114080528_media_library_foreign_key_indexes.sql');
  for (const index of ['media_library_folders_parent_fk_idx','media_library_items_folder_fk_idx','media_library_items_source_asset_fk_idx']) assert.ok(indexes.includes(index));
});

test('Media Library service supports private cloud upload, preview, folders, moves and safe deletion', () => {
  const service = read('src/services/mediaLibraryCloud.ts');
  for (const snippet of [
    'MAX_FILE_BYTES = 100 * 1024 * 1024',
    "storage.from('vyral-assets').upload",
    "userId + '/media-library/'",
    'createSignedUrl',
    'createMediaThumbnail',
    'media-library-thumbnails/',
    "contentType: thumbnailType",
    "thumbnailBlob.type === 'image/webp' ? 'image/webp' : 'image/png'",
    "typeof item.metadata?.thumbnail_path === 'string'",
    "thumbnailSource?: File",
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
    'toggleAll', 'selectedIds', 'moveMediaLibraryItems', 'role="toolbar"', 'aria-label="Selected item actions"', 'Rename selected item', 'Move selected files to folder', 'Move selected folder to folder', 'moveSelectedFolder', 'blockedFolderIds', 'folderPath(folder.id)', 'Delete selected items',
    'deleteMediaLibraryItems', 'createMediaLibraryFolder',
    'renameMediaLibraryFolder', 'renameMediaLibraryItem',
    '<video', '<audio', 'entry.item!.thumbnail_url', 'loading="lazy"',
    'const breadcrumbs = useMemo(', 'aria-label="Folder path"',
    'navigateToFolder(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null)',
    'folder.parent_id === activeFolderId', 'item.folder_id === activeFolderId',
    'New folder name', 'onContextMenu', 'event.preventDefault()',
    'onPointerDown', 'onPointerCancel', 'aria-label="Folder path"', '[-webkit-touch-callout:none]', 'select-none',
  ]) assert.ok(page.includes(snippet), 'Missing Media Library UI feature: ' + snippet);
  assert.ok(!page.includes('<aside'), 'Folder tree sidebar should not replace standard file-manager navigation.');
  assert.ok(!page.includes('Open folder'), 'Folder entries should display only their icon and name.');
  assert.ok(page.includes('formatBytes(entry.item.size_bytes)'), 'List view should retain file size metadata.');
  assert.ok(page.includes('Date modified'), 'List view should retain modification date metadata.');
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
