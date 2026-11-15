import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const worker = readFileSync(
  new URL('../supabase/functions/transfer-runway-media-output/index.ts', import.meta.url),
  'utf8',
);

test('Runway output transfer requires an explicit exact-host allowlist and rejects redirects', () => {
  assert.ok(worker.includes("VYRA_RUNWAY_OUTPUT_HOSTS"));
  assert.ok(worker.includes("allowedHosts.has(url.hostname.toLowerCase())"));
  assert.ok(worker.includes("redirect: 'error'"));
  assert.ok(worker.includes("url.protocol !== 'https:'"));
  assert.ok(worker.includes('url.username || url.password || url.port'));
});

test('transfer is bounded, private and uses short-lived signed storage access', () => {
  assert.ok(worker.includes('MAX_OUTPUT_BYTES = 100 * 1024 * 1024'));
  assert.ok(worker.includes('readBoundedBody'));
  assert.ok(worker.includes('storage.from(BUCKET).upload'));
  assert.ok(worker.includes('upsert: true'));
  assert.ok(worker.includes('createSignedUrl(storagePath, SIGNED_URL_SECONDS)'));
  assert.ok(worker.includes("const BUCKET = 'vyral-assets'"));
  assert.ok(worker.includes('SIGNED_URL_SECONDS = 300'));
});

test('only authenticated owners can claim their output and raw provider URLs are never returned', () => {
  assert.ok(worker.includes("createSupabaseContext(request, { auth: 'user' })"));
  assert.ok(worker.includes("p_user_id: userId, p_job_id: body.jobId"));
  assert.ok(worker.includes("p_status: 'stored'"));
  assert.ok(worker.includes('signedUrl: signed.signedUrl'));
  assert.equal(worker.includes('outputUrl: claim.output_url'), false);
});
