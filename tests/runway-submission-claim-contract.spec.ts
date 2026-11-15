import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261116100000_runway_media_submission_claim.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');

test('Runway submission claim is service-role-only and locks the job row', () => {
  assert.match(migration, /function public\.claim_runway_media_job\(p_user_id uuid, p_job_id uuid\)/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /where id = p_job_id and user_id = p_user_id\s+for update/i);
  assert.match(migration, /if v_job\.status <> 'pending' then\s+return jsonb_build_object\('claimed', false/i);
});

test('claim marks uncertain submission before any provider request and never auto-reclaims it', () => {
  assert.match(migration, /status = 'submitted',[\s\S]*provider_submission_outcome = 'unknown'/i);
  assert.match(migration, /cannot be claimed again automatically/i);
  assert.match(migration, /grant execute on function public\.claim_runway_media_job\(uuid,uuid\) to service_role/i);
});

test('submission results are owner-scoped, validated and idempotent', () => {
  assert.match(migration, /function public\.record_runway_media_submission\(/i);
  assert.match(migration, /p_outcome not in \('accepted','rejected','unknown'\)/i);
  assert.match(migration, /provider_task_id is not distinct from p_provider_task_id/i);
  assert.match(migration, /provider_submission_outcome = 'accepted'/i);
  assert.match(migration, /provider_submission_outcome = 'rejected'/i);
  assert.match(migration, /provider_submission_outcome = 'unknown'/i);
  assert.match(migration, /grant execute on function public\.record_runway_media_submission\(uuid,uuid,text,text,text,integer,text\) to service_role/i);
});

test('provider task IDs and submitted lifecycle events are unique per job', () => {
  assert.match(migration, /generation_jobs_runway_task_unique/i);
  assert.match(migration, /media_generation_job_events_one_submitted/i);
});
