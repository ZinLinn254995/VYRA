import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesVyralAssetUploadFile,
  parseVyralAssetUploadPendingPlan,
  validateVyralAssetUploadPendingAction,
} from '../src/server/vyralAssetUploadAction.ts';

const now = Date.now();
const plan = {
  id: '11111111-1111-4111-8111-111111111111',
  operation: 'asset.upload',
  target: { vyralId: '22222222-2222-4222-8222-222222222222' },
  parameters: {
    clientDraftId: '33333333-3333-4333-8333-333333333333',
    fileName: 'scene-reference.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
  },
  summary: 'Upload scene-reference.png to ORIGIN-01',
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
};

test('parses a bounded owner-scoped Asset upload preview plan', () => {
  assert.deepEqual(parseVyralAssetUploadPendingPlan(plan), plan);
});

test('rejects expired, overlong, malformed, or path-like upload plans', () => {
  assert.equal(parseVyralAssetUploadPendingPlan({ ...plan, expiresAt: new Date(now - 1).toISOString() }), null);
  assert.equal(parseVyralAssetUploadPendingPlan({ ...plan, parameters: { ...plan.parameters, sizeBytes: 100 * 1024 * 1024 + 1 } }), null);
  assert.equal(parseVyralAssetUploadPendingPlan({ ...plan, parameters: { ...plan.parameters, fileName: '../private.png' } }), null);
  assert.equal(parseVyralAssetUploadPendingPlan({ ...plan, parameters: { ...plan.parameters, mimeType: 'not-a-mime' } }), null);
  assert.equal(parseVyralAssetUploadPendingPlan({ ...plan, parameters: { ...plan.parameters, clientDraftId: 'not-a-uuid' } }), null);
});

test('pending upload action must match exact owner, chat session, action and capability', () => {
  const row = {
    id: plan.id,
    user_id: 'owner-1',
    session_id: 'session-1',
    capability_id: 'asset.upload',
    status: 'pending',
    expires_at: plan.expiresAt,
    plan,
  };
  const expected = { userId: 'owner-1', sessionId: 'session-1', actionId: plan.id, now };
  assert.deepEqual(validateVyralAssetUploadPendingAction(row, expected), plan);
  assert.equal(validateVyralAssetUploadPendingAction(row, { ...expected, userId: 'other-owner' }), null);
  assert.equal(validateVyralAssetUploadPendingAction(row, { ...expected, sessionId: 'other-session' }), null);
  assert.equal(validateVyralAssetUploadPendingAction(row, { ...expected, actionId: '44444444-4444-4444-8444-444444444444' }), null);
  assert.equal(validateVyralAssetUploadPendingAction({ ...row, status: 'approved' }, expected), null);
});

test('browser-selected bytes must match the reviewed file metadata exactly', () => {
  const parsed = parseVyralAssetUploadPendingPlan(plan)!;
  assert.equal(matchesVyralAssetUploadFile(parsed, { name: 'scene-reference.png', size: 2048, type: 'image/png' }), true);
  assert.equal(matchesVyralAssetUploadFile(parsed, { name: 'scene-reference.png', size: 2049, type: 'image/png' }), false);
  assert.equal(matchesVyralAssetUploadFile(parsed, { name: 'other.png', size: 2048, type: 'image/png' }), false);
});
