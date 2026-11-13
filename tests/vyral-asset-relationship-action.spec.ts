import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVyralAssetRelationshipPendingPlan, validateVyralAssetRelationshipPendingAction } from '../src/server/vyralAssetRelationshipAction.ts';

const ids = {
  vyral: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  relation: 'c5afacb6-174a-498a-88f2-476b24f08e87',
  from: '11111111-1111-4111-8111-111111111111',
  to: '22222222-2222-4222-8222-222222222222',
  action: '33333333-3333-4333-8333-333333333333',
};
const now = Date.now();
const base = {
  id: ids.action,
  operation: 'asset.relationship.add',
  target: { vyralId: ids.vyral, relationshipId: ids.relation },
  parameters: { relationship: {
    relationshipType: 'inspired_by', fromKind: 'asset', fromAssetId: ids.from,
    toKind: 'asset', toAssetId: ids.to, rationale: 'Shares visual inspiration.',
    evidenceRef: null,
  } },
  summary: 'Link two related Assets',
  createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
};

test('accepts a bounded semantic Asset relationship proposal', () => {
  assert.equal(parseVyralAssetRelationshipPendingPlan(base)?.operation, 'asset.relationship.add');
});

test('rejects self-links, invalid relation types, missing rationale and mismatched endpoint kinds', () => {
  const self = structuredClone(base); self.parameters.relationship.toAssetId = ids.from;
  assert.equal(parseVyralAssetRelationshipPendingPlan(self), null);
  const badType = structuredClone(base); badType.parameters.relationship.relationshipType = 'Invalid-Type';
  assert.equal(parseVyralAssetRelationshipPendingPlan(badType), null);
  const noRationale = structuredClone(base); noRationale.parameters.relationship.rationale = '';
  assert.equal(parseVyralAssetRelationshipPendingPlan(noRationale), null);
  const badEndpoint = structuredClone(base); badEndpoint.parameters.relationship.fromKind = 'vyral';
  assert.equal(parseVyralAssetRelationshipPendingPlan(badEndpoint), null);
});

test('rejects expired or overlong pending plans', () => {
  const expired = structuredClone(base); expired.expiresAt = new Date(now - 1).toISOString();
  assert.equal(parseVyralAssetRelationshipPendingPlan(expired), null);
  const overlong = structuredClone(base); overlong.expiresAt = new Date(now + 16 * 60 * 1000).toISOString();
  assert.equal(parseVyralAssetRelationshipPendingPlan(overlong), null);
});

test('binds pending action to exact owner, session, action and capability', () => {
  const row = {
    id: ids.action, user_id: 'owner-1', session_id: 'session-1',
    capability_id: 'asset.add_relationship', status: 'pending',
    expires_at: base.expiresAt, plan: base,
  };
  assert.ok(validateVyralAssetRelationshipPendingAction(row, {
    userId: 'owner-1', sessionId: 'session-1', actionId: ids.action, now,
  }));
  assert.equal(validateVyralAssetRelationshipPendingAction(row, {
    userId: 'owner-2', sessionId: 'session-1', actionId: ids.action, now,
  }), null);
  assert.equal(validateVyralAssetRelationshipPendingAction(row, {
    userId: 'owner-1', sessionId: 'other-session', actionId: ids.action, now,
  }), null);
  assert.equal(validateVyralAssetRelationshipPendingAction({
    ...row, capability_id: 'asset.remove_relationship',
  }, { userId: 'owner-1', sessionId: 'session-1', actionId: ids.action, now }), null);
  assert.equal(validateVyralAssetRelationshipPendingAction({
    ...row, expires_at: new Date(now + 4 * 60 * 1000).toISOString(),
  }, { userId: 'owner-1', sessionId: 'session-1', actionId: ids.action, now }), null);
});
