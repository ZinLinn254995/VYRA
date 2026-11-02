import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createCreditTransfersRouter } from '../src/server/creditTransfers.js';

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '10000000-0000-4000-8000-000000000002';
const TRANSFER_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_KEY = 'server-only-service-role-key';

async function withApi(
  handler: (baseUrl: string) => Promise<void>,
  fetcher: typeof fetch,
  options: { serviceRoleKey?: string; verifyToken?: (token: string) => Promise<any> } = {},
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createCreditTransfersRouter({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-anon-key',
    serviceRoleKey: options.serviceRoleKey ?? SERVICE_KEY,
    fetcher,
    verifyToken: options.verifyToken ?? (async () => ({ ok: true, user: { id: USER_A } })),
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

test('transfer API derives sender from verified identity and calls the protected atomic RPC', async () => {
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      id: TRANSFER_ID,
      sender_user_id: USER_A,
      recipient_user_id: USER_B,
      amount: 35,
      status: 'completed',
      created_at: '2026-11-03T00:00:00Z',
    });
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/transfers', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderUserId: USER_B,
        recipientUserId: USER_B,
        amount: 35,
        idempotencyKey: 'client-transfer-001',
        note: 'Gift credits',
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { transfer: { id: string; senderUserId: string; amount: number } };
    assert.equal(payload.transfer.id, TRANSFER_ID);
    assert.equal(payload.transfer.senderUserId, USER_A);
    assert.equal(payload.transfer.amount, 35);
  }, fetcher);

  assert.equal(new URL(capturedUrl).pathname, '/rest/v1/rpc/transfer_credits');
  assert.equal(capturedHeaders.get('apikey'), SERVICE_KEY);
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer ' + SERVICE_KEY);
  assert.equal(capturedBody.p_sender_user_id, USER_A);
  assert.equal(capturedBody.p_recipient_user_id, USER_B);
  assert.equal(capturedBody.p_amount, 35);
  assert.equal(capturedBody.p_idempotency_key, 'client-transfer-001');
});

test('transfer API rejects invalid amounts and idempotency keys before a database call', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json({});
  };

  await withApi(async (baseUrl) => {
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '10']) {
      const response = await fetch(baseUrl + '/api/credits/transfers', {
        method: 'POST',
        headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientUserId: USER_B, amount, idempotencyKey: 'valid-key' }),
      });
      assert.equal(response.status, 400);
    }
    const badKey = await fetch(baseUrl + '/api/credits/transfers', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientUserId: USER_B, amount: 10, idempotencyKey: 'contains spaces' }),
    });
    assert.equal(badKey.status, 400);
    assert.equal(called, false);
  }, fetcher);
});

test('transfer API requires authentication before invoking the service role', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json({});
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientUserId: USER_B, amount: 10, idempotencyKey: 'valid-key' }),
    });
    assert.equal(response.status, 401);
    assert.equal(called, false);
  }, fetcher);
});

test('insufficient balance is returned as a conflict without leaking database details', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    code: 'P0001',
    message: 'Insufficient available credits.',
    details: 'private database detail',
  }, { status: 400 });

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/transfers', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientUserId: USER_B, amount: 999, idempotencyKey: 'insufficient-001' }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json() as { error: string };
    assert.match(payload.error, /not enough available credits/i);
    assert.doesNotMatch(payload.error, /private database detail/i);
  }, fetcher);
});

test('transfer history uses the user session and returns only safe transfer fields', async () => {
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return Response.json([{
      id: TRANSFER_ID,
      sender_user_id: USER_A,
      recipient_user_id: USER_B,
      amount: '35',
      status: 'completed',
      created_at: '2026-11-03T00:00:00Z',
      note: 'do not expose arbitrary notes',
      internal_metadata: { private: true },
    }]);
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/transfers', {
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { transfers: Array<Record<string, unknown>> };
    assert.equal(payload.transfers.length, 1);
    assert.equal(payload.transfers[0].amount, '35');
    assert.equal('note' in payload.transfers[0], false);
    assert.equal('internal_metadata' in payload.transfers[0], false);
  }, fetcher);

  const endpoint = new URL(capturedUrl);
  assert.equal(endpoint.pathname, '/rest/v1/credit_transfers');
  assert.equal(endpoint.searchParams.get('select'), 'id,sender_user_id,recipient_user_id,amount,status,created_at');
  assert.match(endpoint.searchParams.get('or') ?? '', new RegExp(USER_A));
  assert.equal(capturedHeaders.get('apikey'), 'public-anon-key');
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer verified-token');
});


test('recipient lookup returns only public username fields and uses the caller session', async () => {
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json([{
      user_id: USER_B,
      username: 'vyra_friend',
      display_name: 'VYRA Friend',
      email: 'must-not-leak@example.invalid',
      private_metadata: { secret: true },
    }]);
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/recipients?query=VYRA', {
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { recipients: Array<Record<string, unknown>> };
    assert.deepEqual(payload.recipients, [{
      userId: USER_B,
      username: 'vyra_friend',
      displayName: 'VYRA Friend',
    }]);
    assert.equal('email' in payload.recipients[0], false);
    assert.equal('private_metadata' in payload.recipients[0], false);
  }, fetcher);

  assert.equal(new URL(capturedUrl).pathname, '/rest/v1/rpc/search_credit_recipients');
  assert.equal(capturedHeaders.get('apikey'), 'public-anon-key');
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer verified-token');
  assert.deepEqual(capturedBody, { p_query: 'vyra' });
});

test('recipient lookup validates short and malformed search queries before database access', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json([]);
  };

  await withApi(async (baseUrl) => {
    for (const query of ['ab', 'contains space', 'bad%', '']) {
      const response = await fetch(baseUrl + '/api/credits/recipients?query=' + encodeURIComponent(query), {
        headers: { Authorization: 'Bearer verified-token' },
      });
      assert.equal(response.status, 400);
    }
    assert.equal(called, false);
  }, fetcher);
});

test('recipient lookup maps database rate limits to HTTP 429', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    code: 'P4290',
    message: 'Recipient lookup rate limit exceeded.',
  }, { status: 400 });

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/recipients?query=vyra', {
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(response.status, 429);
  }, fetcher);
});

test('username updates use the verified user identity and never accept a caller-supplied owner ID', async () => {
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json([{ id: USER_A, username: 'vyra_creator' }]);
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/username', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_B, username: 'VYRA_Creator' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { username: string };
    assert.equal(payload.username, 'vyra_creator');
  }, fetcher);

  const endpoint = new URL(capturedUrl);
  assert.equal(endpoint.pathname, '/rest/v1/profiles');
  assert.equal(endpoint.searchParams.get('id'), 'eq.' + USER_A);
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer verified-token');
  assert.deepEqual(capturedBody, { username: 'vyra_creator' });
});

test('username updates reject invalid names and report uniqueness conflicts', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json({ code: '23505' }, { status: 409 });
  };

  await withApi(async (baseUrl) => {
    for (const username of ['ab', 'contains space', 'invalid-name', 'this_username_is_far_too_long']) {
      const invalid = await fetch(baseUrl + '/api/credits/username', {
        method: 'POST',
        headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      assert.equal(invalid.status, 400);
    }
    assert.equal(called, false);

    const conflict = await fetch(baseUrl + '/api/credits/username', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'taken_name' }),
    });
    assert.equal(conflict.status, 409);
  }, fetcher);
});


test('wallet API returns ledger balances and safe recent activity using the verified session', async () => {
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return Response.json({
      account: { username: 'vyra_creator', displayName: 'VYRA Creator', email: 'private@example.invalid' },
      availableBalance: 1250,
      reservedBalance: 40,
      recentActivity: [{
        id: TRANSFER_ID,
        entryType: 'transfer_credit',
        availableDelta: 50,
        reservedDelta: 0,
        note: 'Incoming gift',
        createdAt: '2026-11-03T00:00:00Z',
        counterpartyUsername: 'vyra_friend',
        counterpartyDisplayName: 'VYRA Friend',
        metadata: { private: true },
      }],
      privateMetadata: { secret: true },
    });
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/wallet', {
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, any>;
    assert.equal(payload.availableBalance, '1250');
    assert.equal(payload.reservedBalance, '40');
    assert.equal(payload.account.username, 'vyra_creator');
    assert.equal(payload.recentActivity[0].counterpartyUsername, 'vyra_friend');
    assert.equal('email' in payload.account, false);
    assert.equal('metadata' in payload.recentActivity[0], false);
    assert.equal('privateMetadata' in payload, false);
  }, fetcher);

  assert.equal(new URL(capturedUrl).pathname, '/rest/v1/rpc/get_credit_wallet');
  assert.equal(capturedHeaders.get('apikey'), 'public-anon-key');
  assert.equal(capturedHeaders.get('Authorization'), 'Bearer verified-token');
});

test('wallet API rejects missing authentication without querying Supabase', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return Response.json({});
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/wallet');
    assert.equal(response.status, 401);
    assert.equal(called, false);
  }, fetcher);
});

test('wallet API rejects malformed ledger snapshots instead of displaying a guessed balance', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    availableBalance: 'not-a-number',
    reservedBalance: '0',
    recentActivity: [],
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/credits/wallet', {
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(response.status, 502);
  }, fetcher);
});
