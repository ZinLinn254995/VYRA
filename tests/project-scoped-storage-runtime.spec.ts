import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../src/services/mediaLibraryCloud.ts', import.meta.url), 'utf8');
const projectStorageTab = readFileSync(new URL('../src/components/workspace/StoryboardUniverseTab.tsx', import.meta.url), 'utf8');
const projectStoragePage = readFileSync(new URL('../src/components/profile/MyMediaLibraryPage.tsx', import.meta.url), 'utf8');
const projectStorageCleanup = readFileSync(new URL('../supabase/migrations/20261117020000_project_scoped_media_library_cleanup.sql', import.meta.url), 'utf8');

test('project Storage reads always apply owner and project scope', () => {
  assert.match(service, /const applyProjectScope = \(query: any, projectId\?: string \| null\) => projectId \? query\.eq\('project_id', projectId\)\.is\('universe_id', null\)/);
  assert.match(service, /const applyMediaLibraryScope = \(query: any, universeId\?: string \| null, projectId\?: string \| null\)/);
  assert.match(service, /async function assertStoryboardProject[\s\S]*from\('vyral_storyboards'\)[\s\S]*eq\('user_id', userId\)/);
  assert.match(service, /select\('id,user_id,universe_id,project_id,folder_id/);
});

test('project Storage mutations preserve the project scope', () => {
  for (const functionName of [
    'loadMediaLibrary', 'loadMediaLibraryItemsByIds', 'getMediaLibraryItemSignedUrl',
    'createMediaLibraryFolder', 'renameMediaLibraryFolder', 'deleteMediaLibraryFolder',
    'moveMediaLibraryFolder', 'moveMediaLibraryItems', 'renameMediaLibraryItem',
    'uploadMediaLibraryFiles', 'backfillMediaLibraryThumbnails',
  ]) {
    assert.match(service, new RegExp('export async function ' + functionName + '[\\s\\S]*?(?=\\nexport async function |\\nasync function |$)'));
  }
  assert.match(service, /project_id: projectId \?\? null/);
  assert.match(service, /applyMediaLibraryScope\([\s\S]*?universeId, projectId\)/);
});

test('project file deletion queues only owner-prefixed standalone binaries atomically', () => {
  assert.match(service, /delete_project_media_library_items_and_queue_storage_cleanup/);
  assert.match(projectStorageCleanup, /auth\.uid\(\)/);
  assert.match(projectStorageCleanup, /source_asset_id is not null/);
  assert.match(projectStorageCleanup, /media-library-thumbnails/);
  assert.match(projectStorageCleanup, /insert into public\.media_library_storage_cleanup_jobs[\s\S]*delete from public\.media_library_items/);
  assert.match(projectStorageCleanup, /where user_id = v_user_id\s+and project_id = p_project_id/);
});

test('Project Storage UI no longer creates a Vyral or Universe record', () => {
  assert.match(projectStorageTab, /projectId=\{storyboardId\}/);
  assert.match(projectStoragePage, /projectId\?: string/);
  assert.match(projectStoragePage, /projectId\}\s*\)/);
  assert.doesNotMatch(projectStorageTab, /from\('vyrals'\)|\.insert\(/);
});
