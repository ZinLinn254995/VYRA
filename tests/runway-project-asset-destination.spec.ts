import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261116130000_runway_project_asset_destination.sql', import.meta.url), 'utf8');
const endpoint = await readFile(new URL('../supabase/functions/create-runway-media-job/index.ts', import.meta.url), 'utf8');

test('Runway generation jobs have an owner-scoped Project Assets destination', () => {
  assert.match(migration, /add column if not exists target_vyral_id uuid/i);
  assert.match(migration, /foreign key \(target_vyral_id, user_id\)\s+references public\.vyrals \(id, user_id\)/i);
  assert.match(migration, /on delete restrict/i);
});

test('destination RPC only accepts the customer own Project Assets Vyral', () => {
  assert.match(migration, /where id = p_target_vyral_id and user_id = p_user_id/i);
  assert.match(migration, /metadata ->> 'universe_scope' is distinct from 'storyboard'/i);
  assert.match(migration, /metadata ->> 'storyboard_id'/i);
  assert.match(migration, /grant execute on function public\.create_runway_media_job_for_project_asset\(uuid,uuid,text,bigint,uuid\)\s+to service_role/i);
});

test('idempotent job retries cannot move a reserved generation into another Project', () => {
  assert.match(migration, /Generation idempotency key is already bound to another Project/i);
  assert.match(migration, /v_job\.target_vyral_id <> p_target_vyral_id/i);
  assert.match(migration, /create_media_generation_job_and_reserve\(/i);
  assert.match(migration, /set target_vyral_id = p_target_vyral_id/i);
});

test('Runway job creation requires and returns the Project Assets destination', () => {
  assert.match(endpoint, /body\.targetVyralId/);
  assert.match(endpoint, /create_runway_media_job_for_project_asset/);
  assert.match(endpoint, /p_target_vyral_id: body\.targetVyralId/);
  assert.match(endpoint, /targetVyralId: job\.target_vyral_id/);
});
