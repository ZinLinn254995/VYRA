import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUsageCapability,
  isValidIdempotencyKey,
  normalizeActualProviderCost,
  normalizeProviderUsage,
  isUsageLedgerServerEnabled,
  resolveLedgerOwnerId,
} from '../src/server/usageLedgerContract.ts';

test('accepts only the four supported generation capabilities', () => {
  for (const value of ['text', 'image', 'audio', 'video']) assert.equal(isUsageCapability(value), true);
  for (const value of ['chat', 'music', '', null, {}, 1]) assert.equal(isUsageCapability(value), false);
});

test('validates idempotency keys without silently rewriting them', () => {
  assert.equal(isValidIdempotencyKey('job:abc-123_1.0'), true);
  assert.equal(isValidIdempotencyKey(''), false);
  assert.equal(isValidIdempotencyKey('contains spaces'), false);
  assert.equal(isValidIdempotencyKey('x'.repeat(161)), false);
});

test('keeps missing or malformed actual provider costs unknown and accepts zero', () => {
  assert.equal(normalizeActualProviderCost(0), 0);
  assert.equal(normalizeActualProviderCost(0.00125), 0.00125);
  for (const value of [undefined, null, -1, NaN, Infinity, '0.1', {}, false]) {
    assert.equal(normalizeActualProviderCost(value), null);
  }
});

test('allowlists provider usage metadata and drops unsafe/unrecognized fields', () => {
  assert.deepEqual(normalizeProviderUsage({
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    costUsd: 0,
    generationId: 'gen_123-abc',
    apiKey: 'must-not-survive',
    prompt: 'must-not-survive',
    raw: { secret: true },
  }), {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    costUsd: 0,
    generationId: 'gen_123-abc',
  });
  assert.deepEqual(normalizeProviderUsage({
    promptTokens: -1,
    completionTokens: 1.5,
    totalTokens: Number.MAX_SAFE_INTEGER + 1,
    costUsd: '0.1',
    generationId: 'bad id',
  }), { costUsd: null, generationId: null });
  assert.deepEqual(normalizeProviderUsage(null), { costUsd: null, generationId: null });
});

test('requires explicit feature flag and all server-only Supabase credentials', () => {
  const complete = {
    VYRA_USAGE_LEDGER_ENABLED: 'true',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only',
  };
  assert.equal(isUsageLedgerServerEnabled(complete), true);
  assert.equal(isUsageLedgerServerEnabled({ ...complete, VYRA_USAGE_LEDGER_ENABLED: 'false' }), false);
  assert.equal(isUsageLedgerServerEnabled({ ...complete, SUPABASE_SERVICE_ROLE_KEY: '' }), false);
  assert.equal(isUsageLedgerServerEnabled({ SUPABASE_URL: complete.SUPABASE_URL }), false);
});

test('derives ledger ownership only from the verified server identity', () => {
  assert.equal(resolveLedgerOwnerId('verified-user-id', 'attacker-user-id'), 'verified-user-id');
  assert.equal(resolveLedgerOwnerId('verified-user-id'), 'verified-user-id');
});
