import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createPricingRouter } from '../src/server/pricing.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OPENROUTER_KEY = 'or-test-key-not-a-real-secret';

test('OpenRouter live pricing estimates require a verified VYRA session before provider lookup', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalAnon = process.env.SUPABASE_ANON_KEY;
  let providerCalls = 0;

  process.env.SUPABASE_URL = 'https://pricing-auth-test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-only';
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER_ID });
    if (url.hostname === 'openrouter.ai') providerCalls += 1;
    return originalFetch(input, init);
  }) as typeof fetch;

  const app = express();
  app.use(express.json());
  app.use(createPricingRouter());
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');

  try {
    const baseUrl = 'http://127.0.0.1:' + address.port;
    const missingSession = await originalFetch(baseUrl + '/providers/openrouter/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': OPENROUTER_KEY },
      body: JSON.stringify({ capability: 'text', model: 'openai/gpt-4.1-mini', parameters: {} }),
    });
    assert.equal(missingSession.status, 401);
    assert.deepEqual(await missingSession.json(), {
      error: 'Sign in to VYRA before requesting a live pricing estimate.',
    });

    const invalidCapability = await originalFetch(baseUrl + '/providers/openrouter/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': OPENROUTER_KEY,
        Authorization: 'Bearer valid-test-session-token',
      },
      body: JSON.stringify({ capability: 'unknown', model: 'openai/gpt-4.1-mini', parameters: {} }),
    });
    assert.equal(invalidCapability.status, 400);

    const invalidModel = await originalFetch(baseUrl + '/providers/openrouter/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': OPENROUTER_KEY,
        Authorization: 'Bearer valid-test-session-token',
      },
      body: JSON.stringify({ capability: 'video', model: 'not-a-model-id', parameters: {} }),
    });
    assert.equal(invalidModel.status, 400);
    assert.equal(providerCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalAnon;
  }
});
