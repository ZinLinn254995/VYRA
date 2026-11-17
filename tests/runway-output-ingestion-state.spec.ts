import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261116140000_runway_output_ingestion_state.sql', import.meta.url),
  'utf8',
);

test('provider success remains separate from Project Asset readiness', () => {
  for (const value of [
    "asset_ingestion_status text not null default 'pending'",
    "'recovery_required'",
    "v_job.status <> 'succeeded'",
    "v_job.provider_task_status <> 'succeeded'",
    "when v_remaining = 0 then 'ready'",
  ]) assert.ok(migration.includes(value), value);
});

test('claims only owner-scoped, Project-bound outputs with expiring leases', () => {
  for (const value of [
    'where id = p_job_id and user_id = p_user_id for update',
    'target_vyral_id',
    "interval '10 minutes'",
    'provider_output_expired',
    'transfer_retry_limit',
  ]) assert.ok(migration.includes(value), value);
});

test('requires private owner-prefixed storage and immutable Asset identity on completion', () => {
  for (const value of [
    "p_storage_path !~ ('^' || p_user_id::text || '/')",
    'p_asset_id is null or p_asset_version_id is null',
    "v_output.transfer_status = 'ingested'",
    'v_output.sha256 = p_sha256',
  ]) assert.ok(migration.includes(value), value);
});

test('restricts both transfer RPCs to the service role', () => {
  for (const value of [
    'grant execute on function public.claim_runway_output_transfer',
    'grant execute on function public.record_runway_output_transfer',
    'from public, anon, authenticated',
  ]) assert.ok(migration.includes(value), value);
});
