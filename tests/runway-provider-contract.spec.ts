import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRunwayTask,
  isRunwayLiveSubmissionEnabled,
  RUNWAY_API_BASE,
  RUNWAY_API_VERSION,
  submitRunwayTask,
} from '../supabase/functions/_shared/runwayMediaProvider.ts';

const taskId = '17f20503-6c24-4c16-946b-35dbbce2af2f';
const options = {
  apiKey: 'server-only-test-key',
  task: 'video' as const,
  configId: 'vyra-video-standard',
  input: { promptText: 'A cinematic test scene' },
};

test('submits one live Model Router request without dryRun', async () => {
  let called = 0;
  const result = await submitRunwayTask({
    ...options,
    fetchImpl: async (url, init) => {
      called += 1;
      assert.equal(url, RUNWAY_API_BASE + '/generate/video');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['X-Runway-Version'], RUNWAY_API_VERSION);
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer server-only-test-key');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, { configId: options.configId, input: options.input });
      assert.equal('dryRun' in body, false);
      return new Response(JSON.stringify({ id: taskId }), { status: 200, headers: { 'x-request-id': 'req-safe-1' } });
    },
  });
  assert.equal(called, 1);
  assert.deepEqual(result, { outcome: 'accepted', taskId, httpStatus: 200, requestId: 'req-safe-1' });
});

test('classifies 429 as rejected/retryable and ordinary 4xx as definite rejection', async () => {
  const rateLimited = await submitRunwayTask({ ...options, fetchImpl: async () => new Response('{}', { status: 429 }) });
  assert.deepEqual(rateLimited, { outcome: 'rejected', retryable: true, httpStatus: 429, code: 'provider_rate_limited', requestId: null });
  const invalid = await submitRunwayTask({ ...options, fetchImpl: async () => new Response('{}', { status: 400 }) });
  assert.deepEqual(invalid, { outcome: 'rejected', retryable: false, httpStatus: 400, code: 'provider_rejected_request', requestId: null });
});

test('never marks uncertain provider outcomes as safe to retry', async () => {
  const network = await submitRunwayTask({ ...options, fetchImpl: async () => { throw new Error('socket reset'); } });
  assert.deepEqual(network, { outcome: 'unknown', retryable: false, httpStatus: null, code: 'submission_outcome_unknown', requestId: null });
  const server = await submitRunwayTask({ ...options, fetchImpl: async () => new Response('{}', { status: 503 }) });
  assert.equal(server.outcome, 'unknown');
  assert.equal(server.retryable, false);
  const malformed = await submitRunwayTask({ ...options, fetchImpl: async () => new Response('{}', { status: 200 }) });
  assert.equal(malformed.outcome, 'unknown');
  assert.equal(malformed.retryable, false);
});

test('retrieves and normalizes task lifecycle and only exposes HTTPS outputs', async () => {
  const snapshot = await getRunwayTask('server-only-test-key', taskId, async (url, init) => {
    assert.equal(url, RUNWAY_API_BASE + '/tasks/' + taskId);
    assert.equal(init?.method, 'GET');
    return new Response(JSON.stringify({
      id: taskId, status: 'SUCCEEDED', output: ['https://cdn.example/output.mp4', 'http://bad.example/file'],
      createdAt: '2026-11-16T00:00:00.000Z', completedAt: '2026-11-16T00:01:00.000Z',
    }), { status: 200 });
  });
  assert.deepEqual(snapshot, {
    taskId, status: 'succeeded', outputUrls: ['https://cdn.example/output.mp4'], failureCode: null,
    createdAt: '2026-11-16T00:00:00.000Z', completedAt: '2026-11-16T00:01:00.000Z',
  });
});

test('keeps live generation disabled unless both server-side kill switches are enabled', () => {
  const disabled = () => undefined;
  assert.equal(isRunwayLiveSubmissionEnabled(disabled), false);
  assert.equal(isRunwayLiveSubmissionEnabled((name) => name === 'VYRA_MEDIA_GENERATION_ENABLED' ? 'true' : undefined), false);
  assert.equal(isRunwayLiveSubmissionEnabled((name) => name === 'VYRA_RUNWAY_LIVE_SUBMISSION_ENABLED' ? 'true' : undefined), false);
  assert.equal(isRunwayLiveSubmissionEnabled(() => 'true'), true);
});
