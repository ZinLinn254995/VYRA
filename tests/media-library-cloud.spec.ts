import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('Media Library database is cloud-backed and owner-isolated', () => {
  const migration = read('supabase/migrations/20261114100000_media_library_cloud.sql');
  for (const table of ['media_library_folders', 'media_library_items']) {
    assert.ok(migration.includes('create table if not exists public.' + table));
    assert.ok(migration.includes('alter table public.' + table + ' enable row level security'));
    for (const action of ['select','insert','update','delete']) assert.ok(migration.includes(table + '_' + action + '_own'));
  }
  assert.ok(migration.includes('enforce_media_library_item_owner_refs'));
  assert.ok(migration.includes('enforce_media_library_folder_parent_owner'));
  assert.ok(migration.includes('source_asset_id uuid references public.vyral_assets(id) on delete cascade'));
  assert.ok(migration.includes('on public.media_library_items(user_id, source_asset_id)'));
});

test('Media Library service supports private cloud upload, preview, folders, moves and safe deletion', () => {
  const service = read('src/services/mediaLibraryCloud.ts');
  for (const snippet of [
    'MAX_FILE_BYTES = 100 * 1024 * 1024',
    "storage.from('vyral-assets').upload",
    "userId + '/media-library/'",
    'createSignedUrl',
    'createMediaLibraryFolder',
    'renameMediaLibraryFolder',
    'deleteMediaLibraryFolder',
    'moveMediaLibraryItems',
    'deleteMediaLibraryItems',
    'registerVyralAssetInMediaLibrary',
    "onConflict: 'user_id,source_asset_id'",
    'const standaloneRows = rows.filter((row) => !row.source_asset_id)',
  ]) assert.ok(service.includes(snippet), 'Missing Media Library contract: ' + snippet);
  assert.ok(service.includes('if (insertError)'));
  assert.ok(service.includes('Removing a Library shortcut must never delete that canonical object'));
});

test('My Media Library UI includes required organization, filtering, views and multi-select', () => {
  const page = read('src/components/profile/MyMediaLibraryPage.tsx');
  for (const value of ["'image'","'video'","'audio'","'document'","'other'"]) assert.ok(page.includes(value));
  for (const snippet of [
    "setView('grid')", "setView('list')", 'multiple className="hidden"',
    'toggleAllVisible', 'selectedIds', 'moveMediaLibraryItems',
    'deleteMediaLibraryItems', 'createMediaLibraryFolder',
    'renameMediaLibraryFolder', 'renameMediaLibraryItem',
    '<video', '<audio',
  ]) assert.ok(page.includes(snippet), 'Missing Media Library UI feature: ' + snippet);
});

test('Profile routes My Media Library and AI Chat Vyral uploads are indexed automatically', () => {
  const profile = read('src/components/profile/ProfilePage.tsx');
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(profile.includes("import { MyMediaLibraryPage }"));
  assert.ok(profile.includes('<MyMediaLibraryPage searchQuery={pageSearch} />'));
  assert.ok(chat.includes('registerVyralAssetInMediaLibrary'));
  assert.ok(chat.includes('assetId: ingested.assetId'));
  assert.ok(chat.includes('storagePath: ingested.storagePath'));
  assert.ok(chat.includes('**My Media Library:** Added automatically.'));
});
