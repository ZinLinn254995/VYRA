import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySupabaseAccessToken } from '../src/server/supabaseAuth.js';

test('fails closed when Supabase is not configured', async () => {
  const result = await verifySupabaseAccessToken('token', { supabaseUrl: '', supabaseAnonKey: '' });
  assert.deepEqual(result, { ok: false, reason: 'not_configured' });
});

test('rejects malformed tokens without calling Supabase', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => { called = true; return new Response('{}'); };
  const result = await verifySupabaseAccessToken('has spaces', {
    supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-key', fetcher,
  });
  assert.deepEqual(result, { ok: false, reason: 'missing_token' });
  assert.equal(called, false);
});

test('verifies identity using the Supabase Auth user endpoint', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  let authHeader = '';
  const fetcher: typeof fetch = async (_input, init) => {
    authHeader = new Headers(init?.headers).get('Authorization') ?? '';
    return Response.json({ id, email: 'creator@example.com', app_metadata: { private: true } });
  };
  const result = await verifySupabaseAccessToken('valid-token', {
    supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-key', fetcher,
  });
  assert.equal(authHeader, 'Bearer valid-token');
  assert.deepEqual(result, { ok: true, user: { id, email: 'creator@example.com' } });
});

test('rejects expired tokens and provider failures', async () => {
  const options = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-key' };
  const expired = await verifySupabaseAccessToken('expired', { ...options, fetcher: async () => new Response('{}', { status: 401 }) });
  const unavailable = await verifySupabaseAccessToken('valid-token', { ...options, fetcher: async () => new Response('{}', { status: 503 }) });
  assert.deepEqual(expired, { ok: false, reason: 'invalid_token' });
  assert.deepEqual(unavailable, { ok: false, reason: 'provider_unavailable' });
});
