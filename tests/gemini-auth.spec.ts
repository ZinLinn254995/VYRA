import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAiRouter } from '../src/server/ai.js';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter());
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  try {
    await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Gemini generation rejects requests without a verified-session bearer token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate a script.' }] }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Sign in to use server-managed Gemini AI.' });
  });
});

test('Gemini health probe remains available without triggering generation', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/health');
    assert.equal(response.status, 200);
    const payload = await response.json() as { status?: string; modelName?: string };
    assert.equal(payload.status, 'preview_mode');
    assert.equal(typeof payload.modelName, 'string');
  });
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
      const response = await fetch(baseUrl + '/ai/chat', {
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
