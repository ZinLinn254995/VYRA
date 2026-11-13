import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVyralAssetRenamePendingPlan,
  validateVyralAssetRenamePendingAction,
} from '../src/server/vyralAssetRenameAction.ts';

const now = Date.now();
const plan = {
  id: '11111111-1111-4111-8111-111111111111',
  operation: 'asset.rename',
  target: {
    vyralId: '22222222-2222-4222-8222-222222222222',
    assetId: '33333333-3333-4333-8333-333333333333',
  },
  parameters: {
    previousName: 'IMG_0042.png',
    nextName: 'Red Circle Reference',
    expectedUpdatedAt: new Date(now - 2000).toISOString(),
  },
  summary: 'Rename IMG_0042.png to Red Circle Reference',
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
};

test('parses a bounded, optimistic-concurrency Asset rename plan', () => {
  assert.deepEqual(parseVyralAssetRenamePendingPlan(plan), plan);
});

test('rejects unsafe names, same-name no-ops, malformed IDs and expired plans', () => {
  assert.equal(parseVyralAssetRenamePendingPlan({ ...plan, expiresAt: new Date(now - 1).toISOString() }), null);
  assert.equal(parseVyralAssetRenamePendingPlan({ ...plan, parameters: { ...plan.parameters, nextName: '../private' } }), null);
  assert.equal(parseVyralAssetRenamePendingPlan({ ...plan, parameters: { ...plan.parameters, nextName: 'IMG_0042.png' } }), null);
  assert.equal(parseVyralAssetRenamePendingPlan({ ...plan, target: { ...plan.target, assetId: 'bad' } }), null);
});

test('requires exact owner, session, pending status and action identity', () => {
  const row = {
    id: plan.id, user_id: 'owner-1', session_id: 'session-1',
    capability_id: 'asset.update_metadata', status: 'pending',
    expires_at: plan.expiresAt, plan,
  };
  const expected = { userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now };
  assert.deepEqual(validateVyralAssetRenamePendingAction(row, expected), plan);
  assert.equal(validateVyralAssetRenamePendingAction(row, { ...expected, userId: 'owner-2' }), null);
  assert.equal(validateVyralAssetRenamePendingAction(row, { ...expected, sessionId: 'session-2' }), null);
  assert.equal(validateVyralAssetRenamePendingAction({ ...row, status: 'approved' }, expected), null);
});
