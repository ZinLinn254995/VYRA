import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const quoteSource = readFileSync(new URL('../supabase/functions/quote-runway-media/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261113070000_media_provider_preflight_telemetry.sql', import.meta.url), 'utf8');

test('Runway quote preflight records measured provider latency and every outcome', () => {
  assert.match(quoteSource, /const preflightStartedAt = performance\.now\(\)/);
  assert.match(quoteSource, /duration_ms: Math\.max\(0, Math\.round\(performance\.now\(\) - preflightStartedAt\)\)/);
  for (const outcome of ['succeeded', 'provider_error', 'invalid_response', 'network_error']) {
    assert.ok(quoteSource.includes("'" + outcome + "'"), 'missing outcome: ' + outcome);
  }
  assert.match(quoteSource, /provider_request_id: providerRequestId\?\.slice\(0, 160\)/);
  const telemetryInsert = quoteSource.match(/from\('media_provider_preflight_events'\)\.insert\(\{([\s\S]*?)\n      \}\)/)?.[1] ?? '';
  assert.ok(telemetryInsert, 'missing telemetry insert payload');
  assert.doesNotMatch(telemetryInsert, /promptText|referenceImages|request_payload|apiKey/);
});

test('provider telemetry is inaccessible to anonymous and authenticated clients', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.media_provider_preflight_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on public\.media_provider_preflight_events to service_role/i);
  assert.match(migration, /duration_ms integer not null check \(duration_ms >= 0\)/i);
});
