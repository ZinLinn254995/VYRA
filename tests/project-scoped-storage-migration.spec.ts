import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261117010000_project_scoped_media_library.sql', import.meta.url),
  'utf8',
);

test('project Storage scope is additive and preserves legacy rows', () => {
  assert.match(migration, /add column if not exists project_id uuid references public\.vyral_storyboards\(id\) on delete restrict/i);
  assert.equal((migration.match(/add column if not exists project_id uuid/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /update public\.media_library_(folders|items)\s+set project_id/i);
  assert.match(migration, /project_id stays NULL/i);
});

test('project Storage scope is isolated by owner and project', () => {
  assert.match(migration, /select user_id into project_owner[\s\S]*from public\.vyral_storyboards[\s\S]*where id = new\.project_id/i);
  assert.match(migration, /project_owner is distinct from new\.user_id/i);
  assert.match(migration, /parent_project is distinct from new\.project_id/i);
  assert.match(migration, /folder_project is distinct from new\.project_id/i);
  assert.match(migration, /create index if not exists media_library_items_owner_project_folder_created_idx/i);
});

test('project Storage keeps folder cycle and cross-scope protections', () => {
  assert.match(migration, /with recursive descendants\(id\) as/i);
  assert.match(migration, /a folder cannot be moved into one of its descendants/i);
  assert.match(migration, /a media library folder cannot belong to both a project and a universe/i);
  assert.match(migration, /a media library item cannot belong to both a project and a universe/i);
});

test('deleting a project cannot silently cascade away its Storage index', () => {
  assert.equal((migration.match(/references public\.vyral_storyboards\(id\) on delete restrict/gi) ?? []).length, 2);
});
