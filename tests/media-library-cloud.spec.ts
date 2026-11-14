import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('Media Library database is cloud-backed and owner-isolated', () => {
  const migration = read('supabase/migrations/20261114100000_media_library_cloud.sql');
  for (const table of ['media_library_folders', 'media_library_items']) {
    assert.match(migration, new RegExp('create table if not exists public\\.' + table));
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'));
    assert.match(migration, new RegExp(table + '_select_own'));
    assert.match(migration, new RegExp(table + '_insert_own'));
    assert.match(migration, new RegExp(table + '_update_own'));
    assert.match(migration, new RegExp(table + '_delete_own'));
  }
  assert.match(migration, /enforce_media_library_item_owner_refs/);
  assert.match(migration, /enforce_media_library_folder_parent_owner/);
  assert.match(migration, /source_asset_id uuid references public\\.vyral_assets\\(id\\) on delete cascade/);
  assert.match(migration, /on public\\.media_library_items\\(user_id, source_asset_id\\)/);
});

test('Media Library service supports private cloud upload, preview, folders, moves and safe deletion', () => {
  const service = read('src/services/mediaLibraryCloud.ts');
  assert.match(service, /MAX_FILE_BYTES = 100 \\* 1024 \\* 1024/);
  assert.match(service, /storage\\.from\\('vyral-assets'\\)\\.upload/);
  assert.match(service, /userId \\+ '\\/media-library\\/'/);
  assert.match(service, /createSignedUrl/);
  assert.match(service, /createMediaLibraryFolder/);
  assert.match(service, /renameMediaLibraryFolder/);
  assert.match(service, /deleteMediaLibraryFolder/);
  assert.match(service, /moveMediaLibraryItems/);
  assert.match(service, /deleteMediaLibraryItems/);
  assert.match(service, /registerVyralAssetInMediaLibrary/);
  assert.match(service, /onConflict: 'user_id,source_asset_id'/);
  assert.match(service, /if \\(insertError\\) \\{/);
});

test('My Media Library UI includes required organization, filtering, views and multi-select', () => {
  const page = read('src/components/profile/MyMediaLibraryPage.tsx');
  for (const value of ['image','video','audio','document','other']) assert.ok(page.includes("'" + value + "'"));
  assert.match(page, /setView\\('grid'\\)/);
  assert.match(page, /setView\\('list'\\)/);
  assert.match(page, /multiple className="hidden"/);
  assert.match(page, /toggleAllVisible/);
  assert.match(page, /selectedIds/);
  assert.match(page, /moveMediaLibraryItems/);
  assert.match(page, /deleteMediaLibraryItems/);
  assert.match(page, /createMediaLibraryFolder/);
  assert.match(page, /renameMediaLibraryFolder/);
  assert.match(page, /renameMediaLibraryItem/);
  assert.match(page, /<video/);
  assert.match(page, /<audio/);
});

test('Profile routes My Media Library and AI Chat Vyral uploads are indexed automatically', () => {
  const profile = read('src/components/profile/ProfilePage.tsx');
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.match(profile, /import \\{ MyMediaLibraryPage \\}/);
  assert.match(profile, /<MyMediaLibraryPage searchQuery=\\{pageSearch\\} \\/>/);
  assert.match(chat, /registerVyralAssetInMediaLibrary/);
  assert.match(chat, /assetId: ingested\\.assetId/);
  assert.match(chat, /storagePath: ingested\\.storagePath/);
  assert.match(chat, /My Media Library:\\*\\* Added automatically/);
});
