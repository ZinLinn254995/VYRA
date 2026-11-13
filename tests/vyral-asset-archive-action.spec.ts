import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVyralAssetArchivePendingPlan, validateVyralAssetArchivePendingAction, parseVyralAssetArchiveConfirmation } from '../src/server/vyralAssetArchiveAction.ts';

const now = Date.now();
const plan = {
  id: '33333333-3333-4333-8333-333333333333',
  operation: 'asset.archive',
  target: {
    vyralId: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
    assetId: '11111111-1111-4111-8111-111111111111',
  },
  parameters: {
    assetName: 'Reference image',
    previousStatus: 'ready',
    expectedUpdatedAt: new Date(now - 1000).toISOString(),
    confirmationCode: 'A7K2Q9',
  },
  summary: 'Archive Reference image',
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
};

test('requires the exact ARCHIVE ASSET code phrase, not generic approval', () => {
  assert.equal(parseVyralAssetArchiveConfirmation('ARCHIVE ASSET A7K2Q9'), 'A7K2Q9');
  assert.equal(parseVyralAssetArchiveConfirmation('archive asset a7k2q9'), 'A7K2Q9');
  assert.equal(parseVyralAssetArchiveConfirmation('yes'), null);
  assert.equal(parseVyralAssetArchiveConfirmation('confirm'), null);
  assert.equal(parseVyralAssetArchiveConfirmation('ARCHIVE ASSET A7K2Q8'), 'A7K2Q8');
  assert.equal(parseVyralAssetArchiveConfirmation('ARCHIVE ASSET A7K2Q9 please'), null);
});

test('accepts a bounded archive preview for one ready Asset', () => {
  assert.equal(parseVyralAssetArchivePendingPlan(plan)?.operation, 'asset.archive');
});

test('rejects invalid targets, statuses, confirmation codes and timestamps', () => {
  const badId = structuredClone(plan); badId.target.assetId = 'bad';
  assert.equal(parseVyralAssetArchivePendingPlan(badId), null);
  const badStatus = structuredClone(plan); badStatus.parameters.previousStatus = 'failed';
  assert.equal(parseVyralAssetArchivePendingPlan(badStatus), null);
  const badCode = structuredClone(plan); badCode.parameters.confirmationCode = 'archive';
  assert.equal(parseVyralAssetArchivePendingPlan(badCode), null);
  const badUpdatedAt = structuredClone(plan); badUpdatedAt.parameters.expectedUpdatedAt = 'invalid';
  assert.equal(parseVyralAssetArchivePendingPlan(badUpdatedAt), null);
});

test('rejects expired and overlong archive previews', () => {
  const expired = structuredClone(plan); expired.expiresAt = new Date(now - 1).toISOString();
  assert.equal(parseVyralAssetArchivePendingPlan(expired), null);
  const overlong = structuredClone(plan); overlong.expiresAt = new Date(now + 16 * 60 * 1000).toISOString();
  assert.equal(parseVyralAssetArchivePendingPlan(overlong), null);
});

test('binds archive approval to exact owner, session, capability, action and expiry', () => {
  const row = {
    id: plan.id, user_id: 'owner-1', session_id: 'session-1',
    capability_id: 'asset.archive', status: 'pending',
    expires_at: plan.expiresAt, plan,
  };
  assert.ok(validateVyralAssetArchivePendingAction(row, {
    userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now,
  }));
  assert.equal(validateVyralAssetArchivePendingAction(row, {
    userId: 'owner-2', sessionId: 'session-1', actionId: plan.id, now,
  }), null);
  assert.equal(validateVyralAssetArchivePendingAction(row, {
    userId: 'owner-1', sessionId: 'other', actionId: plan.id, now,
  }), null);
  assert.equal(validateVyralAssetArchivePendingAction({
    ...row, capability_id: 'asset.delete',
  }, { userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now }), null);
  assert.equal(validateVyralAssetArchivePendingAction({
    ...row, expires_at: new Date(now + 4 * 60 * 1000).toISOString(),
  }, { userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now }), null);
});
