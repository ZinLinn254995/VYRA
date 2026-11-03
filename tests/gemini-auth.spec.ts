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
