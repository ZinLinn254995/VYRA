import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCreditLedgerEntry, type CreditLedgerEntryType } from '../src/server/creditLedger.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const ENTRY_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_KEY = 'server-only-test-service-role-key';

function entry(entryType: CreditLedgerEntryType, amount: string) {
  const n = BigInt(amount);
  return {
    id: ENTRY_ID,
    user_id: USER_ID,
    generation_job_id: ['reserve', 'commit', 'release'].includes(entryType) ? JOB_ID : null,
    idempotency_key: 'test-' + entryType,
    entry_type: entryType,
    available_delta: entryType === 'reserve' ? (-n).toString()
      : entryType === 'release' || entryType === 'grant' || entryType === 'refund' || entryType === 'adjustment' ? n.toString()
        : '0',
    reserved_delta: entryType === 'reserve' ? n.toString()
      : entryType === 'commit' || entryType === 'release' ? (-n).toString()
        : '0',
    note: 'unit test',
    created_at: '2026-11-03T00:00:00.000Z',
  };
}

test('credit ledger service remains disabled when server-only credentials are absent', async () => {
  const result = await applyCreditLedgerEntry({
    userId: USER_ID,
    idempotencyKey: 'grant-test',
    entryType: 'grant',
    amount: 100,
  }, { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: '' });
  assert.deepEqual(result, { ok: false, reason: 'not_configured' });
});

test('credit ledger service validates IDs, amount, transition requirements and private metadata before network access', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  const base = {
    userId: USER_ID,
    idempotencyKey: 'invalid-input-test',
    entryType: 'reserve' as const,
    amount: 10,
  };
  const cases = [
    { ...base, userId: 'not-a-uuid' },
    { ...base, idempotencyKey: 'has spaces' },
    { ...base, amount: 1.5 },
    { ...base, amount: '-10' },
    { ...base, generationJobId: null },
    { ...base, generationJobId: JOB_ID, metadata: { openRouterApiKey: 'never-store-this' } },
  ];
  for (const input of cases) {
    const result = await applyCreditLedgerEntry(input, {
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: SERVICE_KEY,
      fetcher,
    });
    assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
  }
  assert.equal(calls, 0);
});

test('reserve, commit, release and refund call the server-only RPC with exact integer amounts', async () => {
  const actions: Array<{ entryType: string; amount: string; jobId: string | null }> = [
    { entryType: 'reserve', amount: '25', jobId: JOB_ID },
    { entryType: 'commit', amount: '25', jobId: JOB_ID },
    { entryType: 'release', amount: '25', jobId: JOB_ID },
    { entryType: 'refund', amount: '25', jobId: null },
    { entryType: 'adjustment', amount: '-5', jobId: null },
  ];
  const calls: Array<{ url: URL; headers: Headers; body: Record<string, unknown> }> = [];

  for (const action of actions) {
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        url: new URL(String(input)),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return Response.json(entry(action.entryType as CreditLedgerEntryType, action.amount));
    };
    const result = await applyCreditLedgerEntry({
      userId: USER_ID,
      generationJobId: action.jobId,
      idempotencyKey: 'test-' + action.entryType,
      entryType: action.entryType as CreditLedgerEntryType,
      amount: action.amount,
      note: 'unit test',
    }, {
      supabaseUrl: 'https://vyra-development.supabase.co',
      serviceRoleKey: SERVICE_KEY,
      fetcher,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.entry.entryType, action.entryType);
      assert.equal(result.entry.userId, USER_ID);
      assert.equal(result.entry.idempotencyKey, 'test-' + action.entryType);
    }
  }

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url.pathname, '/rest/v1/rpc/apply_credit_ledger_entry');
    assert.equal(call.headers.get('apikey'), SERVICE_KEY);
    assert.equal(call.headers.get('authorization'), 'Bearer ' + SERVICE_KEY);
    assert.equal(call.body.p_user_id, USER_ID);
    assert.equal(typeof call.body.p_amount, 'string');
  }
  assert.deepEqual(calls.map(call => call.body.p_entry_type), ['reserve', 'commit', 'release', 'refund', 'adjustment']);
  assert.deepEqual(calls.map(call => call.body.p_amount), ['25', '25', '25', '25', '-5']);
});

test('credit ledger service maps insufficient balance and idempotency conflicts without leaking provider details', async () => {
  const responses = [
    { code: 'P0001', message: 'Insufficient available credits.' },
    { code: '23505', message: 'Idempotency key was already used with different parameters.' },
    { code: 'P0001', message: 'Cannot release more credits than are reserved for this job.' },
  ];
  const expected = ['insufficient_balance', 'idempotency_conflict', 'reservation_conflict'];
  for (let i = 0; i < responses.length; i += 1) {
    const result = await applyCreditLedgerEntry({
      userId: USER_ID,
      generationJobId: JOB_ID,
      idempotencyKey: 'error-test-' + i,
      entryType: 'release',
      amount: 10,
    }, {
      supabaseUrl: 'https://vyra-development.supabase.co',
      serviceRoleKey: SERVICE_KEY,
      fetcher: async () => Response.json(responses[i], { status: 400 }),
    });
    assert.deepEqual(result, { ok: false, reason: expected[i] });
  }
});


test('credit ledger service rejects a mismatched database response instead of trusting it', async () => {
  const result = await applyCreditLedgerEntry({
    userId: USER_ID,
    generationJobId: JOB_ID,
    idempotencyKey: 'response-mismatch-test',
    entryType: 'reserve',
    amount: 25,
  }, {
    supabaseUrl: 'https://vyra-development.supabase.co',
    serviceRoleKey: SERVICE_KEY,
    fetcher: async () => Response.json({
      ...entry('reserve', '25'),
      idempotency_key: 'different-request',
      available_delta: '-24',
      reserved_delta: '24',
    }),
  });
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});
