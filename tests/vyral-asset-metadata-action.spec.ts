import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVyralAssetMetadataPendingPlan, validateVyralAssetMetadataPendingAction } from '../src/server/vyralAssetMetadataAction.ts';

const now = Date.now();
const plan = {
  id: '11111111-1111-4111-8111-111111111111',
  operation: 'asset.update_metadata',
  target: { vyralId: '22222222-2222-4222-8222-222222222222', assetId: '33333333-3333-4333-8333-333333333333' },
  parameters: {
    previous: { title: 'IMG_0042.png', description: '', organization: { category: 'Uncategorized', tags: [] } },
    next: { title: 'Dragon Character', description: 'A red dragon character reference.', category: 'Character', tags: ['dragon', 'fantasy'], keywords: ['red dragon'], altText: 'A red dragon standing upright.' },
    expectedUpdatedAt: new Date(now - 2000).toISOString(),
  },
  summary: 'Update Asset metadata for Dragon Character',
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
};

test('accepts a bounded partial Asset metadata update', () => {
  assert.deepEqual(parseVyralAssetMetadataPendingPlan(plan), plan);
});

test('rejects invalid metadata fields, unsafe labels, and expired plans', () => {
  assert.equal(parseVyralAssetMetadataPendingPlan({ ...plan, expiresAt: new Date(now - 1).toISOString() }), null);
  assert.equal(parseVyralAssetMetadataPendingPlan({ ...plan, parameters: { ...plan.parameters, next: { title: '../bad' } } }), null);
  assert.equal(parseVyralAssetMetadataPendingPlan({ ...plan, parameters: { ...plan.parameters, next: { tags: ['ok', '../bad'] } } }), null);
  assert.equal(parseVyralAssetMetadataPendingPlan({ ...plan, parameters: { ...plan.parameters, next: { asset_type: 'video' } } }), null);
  assert.equal(parseVyralAssetMetadataPendingPlan({ ...plan, parameters: { ...plan.parameters, next: { description: 'x'.repeat(2001) } } }), null);
});

test('requires exact owner, session, action and pending state', () => {
  const row = { id: plan.id, user_id: 'owner-1', session_id: 'session-1', capability_id: 'asset.update_metadata', status: 'pending', expires_at: plan.expiresAt, plan };
  const expected = { userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now };
  assert.deepEqual(validateVyralAssetMetadataPendingAction(row, expected), plan);
  assert.equal(validateVyralAssetMetadataPendingAction(row, { ...expected, userId: 'owner-2' }), null);
  assert.equal(validateVyralAssetMetadataPendingAction(row, { ...expected, sessionId: 'session-2' }), null);
  assert.equal(validateVyralAssetMetadataPendingAction({ ...row, status: 'approved' }, expected), null);
});
