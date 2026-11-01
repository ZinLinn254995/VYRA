import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import {
  createCustomerProjectsRouter,
  sanitizePortableProjectData,
} from '../src/server/customerProjects.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';

async function withApi(
  handler: (baseUrl: string) => Promise<void>,
  fetcher: typeof fetch,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createCustomerProjectsRouter({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-key',
    fetcher,
    verifyToken: async () => ({ ok: true, user: { id: USER_ID, email: 'creator@example.com' } }),
  }));
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start.');
  try {
    await handler('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('portable project sanitizer removes device media and credential fields', () => {
  const result = sanitizePortableProjectData({
    topic: 'A science short',
    apiKey: 'never-upload',
    scenes: [{
      narration: 'Hello',
      generatedVideoId: 'device-indexeddb-id',
      mediaUrl: 'blob:http://localhost/device-file',
      visualPrompt: 'A bright lab',
    }],
    coverImage: 'data:image/png;base64,AAAA',
  });
  assert.deepEqual(result, {
    topic: 'A science short',
    scenes: [{ narration: 'Hello', visualPrompt: 'A bright lab' }],
  });
});

test('project import assigns ownership from verified identity and upserts by local id', async () => {
  let capturedUrl = '';
  let capturedBody: Array<Record<string, unknown>> = [];
  let capturedAuthorization = '';
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return Response.json([{ id: 'cloud-1', local_id: 'local-1' }], { status: 201 });
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/projects/import', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [{
          localId: 'local-1',
          title: 'First project',
          status: 'draft',
          projectData: { topic: 'Space', apiKey: 'must-not-leave-device' },
        }],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imported, 1);
  }, fetcher);

  const endpoint = new URL(capturedUrl);
  assert.equal(endpoint.pathname, '/rest/v1/projects');
  assert.equal(endpoint.searchParams.get('on_conflict'), 'user_id,local_id');
  assert.equal(capturedAuthorization, 'Bearer verified-token');
  assert.equal(capturedBody[0].user_id, USER_ID);
  assert.equal(capturedBody[0].local_id, 'local-1');
  assert.deepEqual(capturedBody[0].project_data, { topic: 'Space' });
});

test('project import rejects invalid batches before storage is called', async () => {
  let storageCalled = false;
  const fetcher: typeof fetch = async () => {
    storageCalled = true;
    return Response.json([]);
  };
  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/projects/import', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [{ localId: '', title: 'Invalid', projectData: {} }] }),
    });
    assert.equal(response.status, 400);
    assert.equal(storageCalled, false);
  }, fetcher);
});

test('cloud project routes require a bearer token', async () => {
  let storageCalled = false;
  const fetcher: typeof fetch = async () => {
    storageCalled = true;
    return Response.json([]);
  };
  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/projects');
    assert.equal(response.status, 401);
    assert.equal(storageCalled, false);
  }, fetcher);
});

test('project import returns a safe Supabase diagnostic when storage rejects the backup', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    code: '42501',
    message: 'new row violates row-level security policy',
    details: 'policy check failed',
  }, { status: 403 });

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/projects/import', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [{
          localId: 'local-1',
          title: 'First project',
          status: 'draft',
          projectData: { topic: 'Space' },
        }],
      }),
    });
    assert.equal(response.status, 403);
    const payload = await response.json() as { error: string };
    assert.match(payload.error, /42501/);
    assert.match(payload.error, /row-level security policy/);
    assert.match(payload.error, /local projects have not been changed/);
  }, fetcher);
});
