import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261116110000_runway_media_task_polling.sql', import.meta.url), 'utf8');
const endpoint = await readFile(new URL('../supabase/functions/poll-runway-media-job/index.ts', import.meta.url), 'utf8');

test('poll claims are service-role-only, owner-scoped and rate-limited to five seconds', () => {
  assert.match(migration, /function public\.claim_runway_media_task_poll\(p_user_id uuid, p_job_id uuid\)/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /where id = p_job_id and user_id = p_user_id\s+for update/i);
  assert.match(migration, /provider_last_polled_at > pg_catalog\.now\(\) - interval '5 seconds'/i);
  assert.match(migration, /grant execute on function public\.claim_runway_media_task_poll\(uuid,uuid\) to service_role/i);
});

test('task snapshots validate accepted task identity and supported states', () => {
  assert.match(migration, /provider_task_id is distinct from p_provider_task_id/i);
  assert.match(migration, /p_status not in \('pending','processing','succeeded','failed','cancelled','unknown'\)/i);
  assert.match(migration, /status = v_new_status/i);
  assert.match(migration, /update public\.provider_attempts[\s\S]*provider_task_status/i);
});

test('signed output URLs are stored only in a service-role-only table', () => {
  assert.match(migration, /create table if not exists public\.media_generation_job_outputs/i);
  assert.match(migration, /alter table public\.media_generation_job_outputs enable row level security/i);
  assert.match(migration, /revoke all on public\.media_generation_job_outputs from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on public\.media_generation_job_outputs to service_role/i);
  assert.match(endpoint, /p_output_urls: snapshot\.outputUrls/);
  assert.doesNotMatch(endpoint, /outputUrls:\s*snapshot\.outputUrls/);
  assert.match(endpoint, /Output references are stored privately/);
});

test('poll endpoint authenticates the owner and never re-submits the provider task', () => {
  assert.match(endpoint, /createSupabaseContext\(request, \{ auth: 'user' \}\)/);
  assert.match(endpoint, /rpc\('claim_runway_media_task_poll'/);
  assert.match(endpoint, /getRunwayTask\(apiKey, taskId\)/);
  assert.match(endpoint, /rpc\('record_runway_media_task_snapshot'/);
  assert.doesNotMatch(endpoint, /submitRunwayTask/);
});
