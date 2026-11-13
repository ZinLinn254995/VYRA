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
  handler: (baseUrl: string, clientFetch: typeof fetch) => Promise<void>,
  fetcher: typeof fetch,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    VYRA_USAGE_LEDGER_ENABLED: process.env.VYRA_USAGE_LEDGER_ENABLED,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  globalThis.fetch = fetcher;
  process.env.VYRA_USAGE_LEDGER_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://vyra-dev.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'development-public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.GEMINI_API_KEY = 'server-only-gemini-test-key';

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createAiRouter());
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start.');

  try {
    await handler('http://127.0.0.1:' + address.port, originalFetch);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function request(baseUrl: string, clientFetch: typeof fetch, headers: Record<string, string> = {}) {
  return clientFetch(baseUrl + '/providers/openrouter/chat', {
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

  await withApi(async (baseUrl, clientFetch) => {
    const response = await request(baseUrl, clientFetch);
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

  await withApi(async (baseUrl, clientFetch) => {
    const response = await request(baseUrl, clientFetch, { Authorization: 'Bearer verified-development-session' });
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

  await withApi(async (baseUrl, clientFetch) => {
    const response = await request(baseUrl, clientFetch, { Authorization: 'Bearer verified-development-session' });
    assert.equal(response.status, 409);
    const payload = await response.json() as { error: string };
    assert.match(payload.error, /already recorded/i);
    assert.equal(providerCalls, 0);
  }, fetcher);
});


test('ledger-enabled mode blocks untracked image generation instead of bypassing usage accounting', async () => {
  let providerCalls = 0;
  const fetcher: typeof fetch = async () => {
    providerCalls += 1;
    return Response.json({});
  };

  await withApi(async (baseUrl, clientFetch) => {
    const response = await clientFetch(baseUrl + '/providers/openrouter/images/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': OPENROUTER_KEY },
      body: JSON.stringify({ model: 'image-model', prompt: 'A sunrise over the sea' }),
    });
    assert.equal(response.status, 503);
    const payload = await response.json() as { code: string; capability: string };
    assert.equal(payload.code, 'USAGE_LEDGER_CAPABILITY_UNSUPPORTED');
    assert.equal(payload.capability, 'image');
    assert.equal(providerCalls, 0);
  }, fetcher);
});

test('metadata suggestion task stays disabled until it is connected to the OpenAI provider', async () => {
  let providerCalls = 0;
  let ledgerCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.pathname.startsWith('/rest/v1/')) ledgerCalls += 1;
    if (url.pathname.includes('gemini') || url.hostname.includes('google')) providerCalls += 1;
    return Response.json({});
  };

  await withApi(async (baseUrl, clientFetch) => {
    const response = await clientFetch(baseUrl + '/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified-development-session' },
      body: JSON.stringify({
        task: 'suggest_details',
        detailsScope: 'asset',
        messages: [{ role: 'user', content: 'Suggest metadata for an image Asset.' }],
      }),
    });
    assert.equal(response.status, 501);
    const payload = await response.json() as { code: string; provider: string };
    assert.equal(payload.code, 'AI_TASK_NOT_ENABLED');
    assert.equal(payload.provider, 'openai');
  }, fetcher);

  assert.equal(providerCalls, 0);
  assert.equal(ledgerCalls, 0);
});

test('metadata suggestions reject unsupported scopes before reporting the task as disabled', async () => {
  let providerCalls = 0;
  let ledgerCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.pathname.startsWith('/rest/v1/')) ledgerCalls += 1;
    if (url.pathname.includes('gemini') || url.hostname.includes('google')) providerCalls += 1;
    return Response.json({});
  };

  await withApi(async (baseUrl, clientFetch) => {
    const response = await clientFetch(baseUrl + '/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified-development-session' },
      body: JSON.stringify({
        task: 'suggest_details',
        detailsScope: 'admin_override',
        messages: [{ role: 'user', content: 'Suggest details.' }],
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: string }).error, 'Choose a supported metadata scope.');
  }, fetcher);

  assert.equal(providerCalls, 0);
  assert.equal(ledgerCalls, 0);
});

test('text AI Chat remains available with usage ledger enabled and routes only to OpenAI', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.pathname === '/functions/v1/vyra-openai-chat') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer verified-development-session');
      return Response.json({ text: 'OpenAI chat response', provider: 'openai' });
    }
    if (url.pathname.includes('gemini') || url.hostname.includes('google')) {
      throw new Error('Gemini must never be called by AI Chat.');
    }
    throw new Error('Unexpected endpoint: ' + url.pathname);
  };

  await withApi(async (baseUrl, clientFetch) => {
    const response = await clientFetch(baseUrl + '/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified-development-session' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Write a short script.' }] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { text: string; provider: string };
    assert.equal(payload.text, 'OpenAI chat response');
    assert.equal(payload.provider, 'openai');
  }, fetcher);

  assert.ok(calls.includes('/functions/v1/vyra-openai-chat'));
  assert.equal(calls.some((path) => path.includes('gemini')), false);
});

test('AI Chat does not invoke any provider for image, document or audio inspection until OpenAI multimodal is enabled', async () => {
  let providerCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    providerCalls += 1;
    return Response.json({});
  };

  await withApi(async (baseUrl, clientFetch) => {
    const response = await clientFetch(baseUrl + '/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified-development-session' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Describe this image.' }],
        visionImages: [{ mimeType: 'image/jpeg', data: 'aGVsbG8=' }],
      }),
    });
    assert.equal(response.status, 501);
    assert.equal((await response.json() as { code: string }).code, 'OPENAI_MULTIMODAL_NOT_ENABLED');
  }, fetcher);

  assert.equal(providerCalls, 0);
});
