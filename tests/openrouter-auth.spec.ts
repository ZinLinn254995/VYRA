import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAiRouter } from '../src/server/ai.js';

test('OpenRouter BYOK generation rejects requests without a verified Supabase session', async () => {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter());
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  try {
    const response = await fetch('http://127.0.0.1:' + address.port + '/providers/openrouter/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': 'or-test-key-not-a-real-secret', 'Idempotency-Key': 'req-test-123' },
      body: JSON.stringify({ model: 'openai/test', messages: [{ role: 'user', content: 'Hello' }] }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Sign in to use OpenRouter BYOK generation.' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test('recognizes a Bearer token and asks Supabase to verify it', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalAnon = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-only';
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith('https://auth-test.supabase.co/')) {
      return Response.json({ message: 'invalid token' }, { status: 401 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(baseUrl + '/providers/openrouter/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc.session.token', 'x-openrouter-api-key': 'or-test-key-not-a-real-secret', 'Idempotency-Key': 'req-test-valid-shaped' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Test' }], model: 'openai/test' }),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Your session is invalid or expired. Please sign in again.' });
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalAnon;
  }
});


async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter());
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  try { await run('http://127.0.0.1:' + address.port); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}


test('OpenRouter image, speech, and video endpoints reject unauthenticated requests before contacting the provider', async () => {
  await withServer(async (baseUrl) => {
    const requests: Array<{ path: string; method: string; body?: unknown }> = [
      { path: '/providers/openrouter/test', method: 'POST' },
      { path: '/providers/openrouter/models?capability=text', method: 'GET' },
      { path: '/providers/openrouter/usage/key', method: 'GET' },
      { path: '/providers/openrouter/generation/gen-test-123', method: 'GET' },
      { path: '/providers/openrouter/images/generate', method: 'POST', body: { model: 'test/image', prompt: 'A safe test image' } },
      { path: '/providers/openrouter/audio/speech', method: 'POST', body: { model: 'test/audio', input: 'Hello', voice: 'alloy' } },
      { path: '/providers/openrouter/videos/generate', method: 'POST', body: { model: 'test/video', prompt: 'A safe test video' } },
      { path: '/providers/openrouter/videos/job-test-123', method: 'GET' },
      { path: '/providers/openrouter/videos/job-test-123/content', method: 'GET' },
    ];
    for (const item of requests) {
      const response = await fetch(baseUrl + item.path, {
        method: item.method,
        headers: {
          ...(item.body ? { 'Content-Type': 'application/json' } : {}),
          'x-openrouter-api-key': 'or-test-key-not-a-real-secret',
        },
        ...(item.body ? { body: JSON.stringify(item.body) } : {}),
      });
      assert.equal(response.status, 401, item.method + ' ' + item.path + ' must require a verified session');
      assert.deepEqual(await response.json(), { error: 'Sign in to use OpenRouter media generation.' });
    }
  });
});
