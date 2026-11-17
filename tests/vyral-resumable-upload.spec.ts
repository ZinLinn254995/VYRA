import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadVyralAssetResumably } from '../src/services/vyralResumableUpload';

const makeDb = () => ({
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'public-test-key',
  auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }) },
});

test('uploads large assets in 6 MiB TUS chunks using the direct Storage hostname', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; size: number }> = [];
  let offset = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const bodySize = init?.body instanceof Blob ? init.body.size : 0;
    requests.push({ url, method, size: bodySize });
    if (method === 'POST') return new Response(null, { status: 201, headers: { Location: '/storage/v1/upload/resumable/test-upload' } });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(offset) } });
    if (method === 'PATCH') {
      assert.equal(new Headers(init?.headers).get('Upload-Offset'), String(offset));
      offset += bodySize;
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
    }
    throw new Error('Unexpected request method: ' + method);
  }) as typeof fetch;

  try {
    const file = new File([new Uint8Array(6 * 1024 * 1024 + 17)], 'large-video.mp4', { type: 'video/mp4', lastModified: 123 });
    await uploadVyralAssetResumably(makeDb(), 'user/universe/asset/v1/asset.mp4', file, 'video/mp4');
    const patches = requests.filter((request) => request.method === 'PATCH');
    assert.deepEqual(patches.map((request) => request.size), [6 * 1024 * 1024, 17]);
    assert.ok(requests.every((request) => request.url.startsWith('https://example.storage.supabase.co/')));
    assert.equal(offset, file.size);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reconciles a lost chunk response with the server offset before retrying', async () => {
  const originalFetch = globalThis.fetch;
  let offset = 0;
  let patchCalls = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') return new Response(null, { status: 201, headers: { Location: '/storage/v1/upload/resumable/lost-response' } });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(offset) } });
    if (method === 'PATCH') {
      patchCalls += 1;
      const size = (init?.body as Blob).size;
      offset += size;
      if (patchCalls === 1) throw new Error('Connection dropped after server accepted the chunk.');
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
    }
    throw new Error('Unexpected request method: ' + method);
  }) as typeof fetch;

  try {
    const file = new File([new Uint8Array(128)], 'small.bin', { type: 'application/octet-stream', lastModified: 456 });
    await uploadVyralAssetResumably(makeDb(), 'user/universe/asset/v1/asset.bin', file, file.type);
    assert.equal(offset, file.size);
    assert.equal(patchCalls, 1, 'accepted bytes must not be uploaded twice');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
