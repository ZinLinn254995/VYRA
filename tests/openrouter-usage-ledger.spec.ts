import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginOpenRouterTextUsageJob, finishOpenRouterTextUsageJob } from '../src/server/openRouterUsageLedger.ts';

const keys = ['VYRA_USAGE_LEDGER_ENABLED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
function enableLedger() {
  process.env.VYRA_USAGE_LEDGER_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://ledger-test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-only';
}
function restoreEnv() {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

test('disabled ledger performs no database request', async () => {
  restoreEnv();
  let calls = 0;
  const job = await beginOpenRouterTextUsageJob({ userId: 'user-1', idempotencyKey: 'req-1', model: 'openai/test', messageCount: 1, totalCharacters: 20 }, async () => { calls++; throw new Error('unexpected'); });
  assert.deepEqual(job, { enabled: false });
  assert.equal(calls, 0);
});

test('creates a server-owned BYOK job and provider attempt without persisting prompts', async () => {
  enableLedger();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const replies = [
    Response.json([{ id: 'job-uuid' }], { status: 201 }),
    Response.json([{ id: 'attempt-uuid' }], { status: 201 }),
    new Response(null, { status: 204 }),
  ];
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return replies.shift()!;
  };
  try {
    const job = await beginOpenRouterTextUsageJob({ userId: 'verified-user', idempotencyKey: 'req-abc', model: 'openai/test', messageCount: 2, totalCharacters: 120 }, fetcher);
    assert.equal(job.enabled, true);
    if (!job.enabled) throw new Error('expected enabled ledger job');
    assert.equal(job.id, 'job-uuid');
    assert.equal(job.attemptId, 'attempt-uuid');
    const jobBody = JSON.parse(String(calls[0].init.body));
    assert.equal(jobBody.user_id, 'verified-user');
    assert.equal(jobBody.idempotency_key, 'req-abc');
    assert.equal(jobBody.request_parameters.billing_mode, 'byok');
    assert.equal(JSON.stringify(jobBody).includes('prompt'), false);
    assert.equal(calls[1].url.includes('provider_attempts'), true);
    assert.equal(calls.length, 3);
  } finally { restoreEnv(); }
});

test('records provider-reported zero actual cost and never treats estimates as actual', async () => {
  enableLedger();
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(null, { status: 204 });
  };
  try {
    await finishOpenRouterTextUsageJob({ enabled: true, id: 'job-uuid', userId: 'verified-user', idempotencyKey: 'req-abc', attemptId: 'attempt-uuid' }, {
      status: 'succeeded', model: 'openai/test', usage: { generationId: 'gen_123', promptTokens: 10, completionTokens: 20, totalTokens: 30, costUsd: 0 },
    }, fetcher);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url.includes('provider_attempts'), true);
    assert.equal(calls[1].url.includes('generation_jobs'), true);
    assert.equal(calls[2].url.endsWith('/rpc/record_provider_cost'), true);
    assert.equal((calls[2].body as Record<string, unknown>).p_actual_cost_usd, 0);
    assert.equal((calls[2].body as Record<string, unknown>).p_source, 'provider_usage');
  } finally { restoreEnv(); }
});

test('unknown provider cost is retained as unknown and does not create an actual-cost row', async () => {
  enableLedger();
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => { calls.push(String(input)); return new Response(null, { status: 204 }); };
  try {
    await finishOpenRouterTextUsageJob({ enabled: true, id: 'job-uuid', userId: 'verified-user', idempotencyKey: 'req-unknown', attemptId: 'attempt-uuid' }, {
      status: 'succeeded', model: 'openai/test', usage: { generationId: 'gen_456', costUsd: null },
    }, fetcher);
    assert.equal(calls.length, 2);
    assert.equal(calls.some((url) => url.endsWith('/rpc/record_provider_cost')), false);
  } finally { restoreEnv(); }
});

test('duplicate idempotency key returns a conflict and does not create a provider attempt', async () => {
  enableLedger();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json([], { status: 201 }); };
  try {
    await assert.rejects(
      beginOpenRouterTextUsageJob({ userId: 'verified-user', idempotencyKey: 'req-dup', model: 'openai/test', messageCount: 1, totalCharacters: 10 }, fetcher),
      /USAGE_LEDGER_DUPLICATE_REQUEST/,
    );
    assert.equal(calls, 1);
  } finally { restoreEnv(); }
});
