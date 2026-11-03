import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createAiRouter } from '../src/server/ai.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_KEY = 'server-only-test-service-role-key';
const OPENROUTER_KEY = 'or-test-key-not-a-real-secret';

async function withApi(
  handler: (baseUrl: string) => Promise<void>,
  fetcher: typeof fetch,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    VYRA_USAGE_LEDGER_ENABLED: process.env.VYRA_USAGE_LEDGER_ENABLED,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  globalThis.fetch = fetcher;
  process.env.VYRA_USAGE_LEDGER_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://vyra-dev.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'development-public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createAiRouter());
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start.');

  try {
    await handler('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function request(baseUrl: string, headers: Record<string, string> = {}) {
  return fetch(baseUrl + '/providers/openrouter/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openrouter-api-key': OPENROUTER_KEY,
      'Idempotency-Key': 'chat-test-request-001',
      ...headers,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4.1-mini',
      messages: [{ role: 'user', content: 'Explain solar energy.' }],
    }),
  });
}

test('ledger-enabled OpenRouter chat requires a verified Supabase session before provider submission', async () => {
  let providerCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes('openrouter.ai')) providerCalls += 1;
    return Response.json({ id: USER_ID });
  };

  await withApi(async (baseUrl) => {
    const response = await request(baseUrl);
    assert.equal(response.status, 401);
    assert.equal(providerCalls, 0);
  }, fetcher);
});

test('ledger-enabled OpenRouter chat records job, provider usage and actual cost before returning success', async () => {
  const calls: Array<{ url: URL; method: string; body: Record<string, unknown>; headers: Headers }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const headers = new Headers(init?.headers);
    calls.push({ url, method, body, headers });

    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.pathname === '/rest/v1/generation_jobs' && method === 'POST') {
      return Response.json([{ id: JOB_ID }], { status: 201 });
    }
    if (url.pathname === '/rest/v1/provider_attempts' && method === 'POST') {
      return Response.json([{ id: ATTEMPT_ID }], { status: 201 });
    }
    if (url.pathname === '/api/v1/chat/completions') {
      return Response.json({
        id: 'gen-openrouter-001',
        model: 'openai/gpt-4.1-mini',
        choices: [{ message: { content: 'Solar energy converts sunlight into electricity.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22, cost: 0.00031 },
      });
    }
    if (url.pathname === '/rest/v1/rpc/record_provider_cost') return Response.json({ id: 'cost-record-id' });
    if (url.pathname === '/rest/v1/provider_attempts' && method === 'PATCH') return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/generation_jobs' && method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error('Unexpected test endpoint: ' + method + ' ' + url.pathname);
  };

  await withApi(async (baseUrl) => {
    const response = await request(baseUrl, { Authorization: 'Bearer verified-development-session' });
    assert.equal(response.status, 200);
    const payload = await response.json() as { text: string; generationId: string; usage: { costUsd: number } };
    assert.match(payload.text, /Solar energy/);
    assert.equal(payload.generationId, 'gen-openrouter-001');
    assert.equal(payload.usage.costUsd, 0.00031);
  }, fetcher);

  const job = calls.find((call) => call.url.pathname === '/rest/v1/generation_jobs' && call.method === 'POST');
  assert.ok(job);
  assert.equal(job.body.user_id, USER_ID);
  assert.equal(job.body.idempotency_key, 'chat-test-request-001');
  assert.equal(job.body.capability, 'text');
  assert.deepEqual(job.body.request_parameters, { messageCount: 1, inputCharacters: 21 });
  assert.equal('prompt' in job.body, false);
  assert.equal(job.headers.get('Authorization'), 'Bearer ' + SERVICE_KEY);

  const attempt = calls.find((call) => call.url.pathname === '/rest/v1/provider_attempts' && call.method === 'POST');
  assert.ok(attempt);
  assert.equal(attempt.body.generation_job_id, JOB_ID);

  const cost = calls.find((call) => call.url.pathname === '/rest/v1/rpc/record_provider_cost');
  assert.ok(cost);
  assert.equal(cost.body.p_actual_cost_usd, 0.00031);
  assert.equal(cost.body.p_provider_generation_id, 'gen-openrouter-001');

  const jobUpdate = calls.find((call) => call.url.pathname === '/rest/v1/generation_jobs' && call.method === 'PATCH');
  assert.ok(jobUpdate);
  assert.equal(jobUpdate.body.status, 'succeeded');
});

test('duplicate generation idempotency key blocks a second OpenRouter submission', async () => {
  let providerCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.pathname === '/rest/v1/generation_jobs') return Response.json([], { status: 201 });
    if (url.hostname === 'openrouter.ai') providerCalls += 1;
    return Response.json({});
  };

  await withApi(async (baseUrl) => {
    const response = await request(baseUrl, { Authorization: 'Bearer verified-development-session' });
    assert.equal(response.status, 409);
    const payload = await response.json() as { error: string };
    assert.match(payload.error, /already recorded/i);
    assert.equal(providerCalls, 0);
  }, fetcher);
});
