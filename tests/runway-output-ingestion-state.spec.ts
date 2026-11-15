import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261116140000_runway_output_ingestion_state.sql', import.meta.url),
  'utf8',
);

test('provider success remains separate from Project Asset readiness', () => {
  assert.match(migration, /asset_ingestion_status text not null default 'pending'/);
  assert.match(migration, /'recovery_required'/);
  assert.match(migration, /v_job\.status <> 'succeeded'/);
  assert.match(migration, /v_job\.provider_task_status <> 'succeeded'/);
  assert.match(migration, /when v_remaining = 0 then 'ready'/);
});

test('claims only owner-scoped, Project-bound outputs with expiring leases', () => {
  assert.match(migration, /where id = p_job_id and user_id = p_user_id for update/);
  assert.match(migration, /target_vyral_id/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /provider_output_expired/);
  assert.match(migration, /transfer_retry_limit/);
});

test('requires private owner-prefixed storage and immutable Asset identity on completion', () => {
  assert.match(migration, /p_storage_path !~ \('\^' \|\| p_user_id::text \|\| '\/'\)/);
  assert.match(migration, /p_asset_id is null or p_asset_version_id is null/);
  assert.match(migration, /v_output\.transfer_status = 'ingested'/);
  assert.match(migration, /v_output\.sha256 = p_sha256/);
});

test('restricts both transfer RPCs to the service role', () => {
  assert.match(migration, /grant execute on function public\.claim_runway_output_transfer/);
  assert.match(migration, /grant execute on function public\.record_runway_output_transfer/);
  assert.match(migration, /from public, anon, authenticated/);
});
