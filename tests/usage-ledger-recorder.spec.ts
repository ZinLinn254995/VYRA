import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginOpenRouterTextJob,
  finishOpenRouterTextJob,
} from '../src/server/usageLedger.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_KEY = 'server-only-test-service-role-key';

test('creates one authenticated OpenRouter text job and a provider attempt without storing prompt text', async () => {
  const calls: Array<{ url: URL; method: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url, method: init?.method || 'GET', headers, body });

    if (url.pathname === '/rest/v1/generation_jobs') {
      return Response.json([{ id: JOB_ID, status: 'pending' }], { status: 201 });
    }
    if (url.pathname === '/rest/v1/provider_attempts') {
      return Response.json([{ id: ATTEMPT_ID, status: 'submitted' }], { status: 201 });
    }
    throw new Error('Unexpected endpoint: ' + url.pathname);
  };

  const result = await beginOpenRouterTextJob({
    userId: USER_ID,
    idempotencyKey: 'chat-request-001',
    model: 'openai/gpt-4.1-mini',
    messageCount: 4,
    inputCharacters: 820,
  }, {
    supabaseUrl: 'https://vyra-dev.supabase.co',
    serviceRoleKey: SERVICE_KEY,
    fetcher,
  });

  assert.deepEqual(result, { ok: true, job: { jobId: JOB_ID, attemptId: ATTEMPT_ID } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get('on_conflict'), 'user_id,idempotency_key');
  assert.match(calls[0].headers.get('Prefer') || '', /resolution=ignore-duplicates/);
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer ' + SERVICE_KEY);
  assert.equal(calls[0].body.user_id, USER_ID);
  assert.equal(calls[0].body.idempotency_key, 'chat-request-001');
  assert.equal(calls[0].body.capability, 'text');
  assert.equal(calls[0].body.estimate_status, 'unavailable');
  assert.deepEqual(calls[0].body.request_parameters, { messageCount: 4, inputCharacters: 820 });
  assert.equal('prompt' in calls[0].body, false);
  assert.equal(calls[1].body.generation_job_id, JOB_ID);
  assert.equal(calls[1].body.provider, 'openrouter');
  assert.equal(calls[1].body.status, 'submitted');
});

test('does not submit a second provider attempt when the idempotency key already exists', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return Response.json([], { status: 201 });
  };

  const result = await beginOpenRouterTextJob({
    userId: USER_ID,
    idempotencyKey: 'chat-request-duplicate',
    model: 'openai/gpt-4.1-mini',
    messageCount: 1,
    inputCharacters: 40,
  }, {
    supabaseUrl: 'https://vyra-dev.supabase.co',
    serviceRoleKey: SERVICE_KEY,
    fetcher,
  });

  assert.deepEqual(result, { ok: false, reason: 'duplicate' });
  assert.equal(calls, 1);
});

test('records provider-reported cost and settles the job without persisting prompt content', async () => {
  const calls: Array<{ url: URL; method: string; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url, method: init?.method || 'GET', body });
    return new Response(null, { status: 204 });
  };

  const ok = await finishOpenRouterTextJob({
    userId: USER_ID,
    job: { jobId: JOB_ID, attemptId: ATTEMPT_ID },
    status: 'succeeded',
    model: 'openai/gpt-4.1-mini',
    generationId: 'gen-real-123',
    usage: {
      promptTokens: 10,
      completionTokens: 25,
      totalTokens: 35,
      costUsd: 0.00125,
      generationId: 'gen-real-123',
      prompt: 'must never be persisted',
      apiKey: 'must never be persisted',
    },
  }, {
    supabaseUrl: 'https://vyra-dev.supabase.co',
    serviceRoleKey: SERVICE_KEY,
    fetcher,
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.pathname, '/rest/v1/rpc/record_provider_cost');
  assert.equal(calls[0].body.p_user_id, USER_ID);
  assert.equal(calls[0].body.p_generation_job_id, JOB_ID);
  assert.equal(calls[0].body.p_provider_attempt_id, ATTEMPT_ID);
  assert.equal(calls[0].body.p_actual_cost_usd, 0.00125);
  assert.equal(calls[0].body.p_provider_generation_id, 'gen-real-123');
  assert.deepEqual(calls[0].body.p_usage, { promptTokens: 10, completionTokens: 25, totalTokens: 35 });
  assert.equal(calls[1].url.pathname, '/rest/v1/provider_attempts');
  assert.equal(calls[1].body.status, 'succeeded');
  assert.deepEqual(calls[1].body.usage, {
    promptTokens: 10,
    completionTokens: 25,
    totalTokens: 35,
    costUsd: 0.00125,
  });
  assert.equal(calls[2].url.pathname, '/rest/v1/generation_jobs');
  assert.equal(calls[2].body.status, 'succeeded');
});

test('keeps unknown provider cost absent and records an uncertain job status', async () => {
  const calls: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url, body });
    return new Response(null, { status: 204 });
  };

  const ok = await finishOpenRouterTextJob({
    userId: USER_ID,
    job: { jobId: JOB_ID, attemptId: ATTEMPT_ID },
    status: 'unknown',
    model: 'openai/gpt-4.1-mini',
    usage: { costUsd: null, prompt: 'never persist this' },
  }, {
    supabaseUrl: 'https://vyra-dev.supabase.co',
    serviceRoleKey: SERVICE_KEY,
    fetcher,
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((call) => call.url.pathname === '/rest/v1/rpc/record_provider_cost'), false);
  assert.equal(calls[0].body.status, 'unknown');
  assert.deepEqual(calls[0].body.usage, {});
  assert.equal(calls[1].body.status, 'unknown');
});
