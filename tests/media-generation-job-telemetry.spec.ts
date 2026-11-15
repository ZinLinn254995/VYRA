import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261113080000_media_generation_job_telemetry.sql', import.meta.url), 'utf8');
const createJob = readFileSync(new URL('../supabase/functions/create-runway-media-job/index.ts', import.meta.url), 'utf8');

test('media job lifecycle telemetry supports reserved through terminal outcomes', () => {
  for (const event of ['reserved', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled']) {
    assert.ok(migration.includes("'" + event + "'"), 'missing lifecycle event: ' + event);
  }
  assert.match(migration, /duration_ms integer check \(duration_ms is null or duration_ms >= 0\)/i);
  assert.match(migration, /provider_task_id text/i);
  assert.match(migration, /completed_at >= started_at/i);
});

test('job reservation records a privacy-safe reserved milestone without blocking job creation', () => {
  assert.match(createJob, /from\('media_generation_job_events'\)\.insert\(/);
  assert.match(createJob, /event_type: 'reserved'/);
  assert.match(createJob, /job_id: job\.id/);
  const eventInsert = createJob.match(/from\('media_generation_job_events'\)\.insert\(\{([\s\S]*?)\n    \}\)/)?.[1] ?? '';
  assert.ok(eventInsert, 'missing reserved event payload');
  assert.doesNotMatch(eventInsert, /prompt|request_payload|apiKey|referenceImages/);
  assert.match(createJob, /telemetry must never block a safely reserved job/);
});

test('lifecycle telemetry is server-only', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.media_generation_job_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on public\.media_generation_job_events to service_role/i);
});
