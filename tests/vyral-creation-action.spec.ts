import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSameVyralCreateIdentity,
  isVyralCreateApprovalText,
  parseVyralCreatePendingPlan,
  validateVyralCreatePendingAction,
} from '../src/server/vyralCreationAction.ts';

const plan = {
  id: '11111111-1111-4111-8111-111111111111',
  operation: 'vyral.create',
  target: { vyralId: '22222222-2222-4222-8222-222222222222' },
  parameters: { name: 'ORIGIN-02', description: 'A private test Vyral' },
  summary: 'Create Vyral · ORIGIN-02',
  createdAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
};

test('accepts natural Burmese and English approval phrases', () => {
  for (const phrase of ['yes', 'go ahead', 'please do', 'ဆက်လုပ်', 'အေး', 'အတည်ပြု']) {
    assert.equal(isVyralCreateApprovalText(phrase), true, phrase);
  }
  for (const phrase of ['maybe', 'not now', 'delete it', 'ဆက်မလုပ်']) {
    assert.equal(isVyralCreateApprovalText(phrase), false, phrase);
  }
});

test('parses a bounded server-generated Vyral creation plan', () => {
  assert.deepEqual(parseVyralCreatePendingPlan(plan), plan);
});

test('rejects malformed targets, oversized fields, and expired plans', () => {
  assert.equal(parseVyralCreatePendingPlan({ ...plan, target: { vyralId: 'not-a-uuid' } }), null);
  assert.equal(parseVyralCreatePendingPlan({ ...plan, parameters: { name: 'x'.repeat(101), description: '' } }), null);
  assert.equal(parseVyralCreatePendingPlan({ ...plan, expiresAt: new Date(Date.now() - 1000).toISOString() }), null);
  assert.equal(parseVyralCreatePendingPlan({ ...plan, parameters: { name: 'x', description: '', userId: 'attacker' } }), null);
});

test('only reuses an exact same-owner creation draft after an uncertain retry', () => {
  const row = {
    id: plan.target.vyralId, user_id: 'user-1', name: plan.parameters.name,
    description: plan.parameters.description,
    metadata: { creation_source: 'global_ai_chat', creation_draft_id: plan.target.vyralId },
  };
  assert.equal(isSameVyralCreateIdentity(row, 'user-1', plan.target.vyralId, plan.parameters.name, plan.parameters.description), true);
  assert.equal(isSameVyralCreateIdentity(row, 'user-2', plan.target.vyralId, plan.parameters.name, plan.parameters.description), false);
  assert.equal(isSameVyralCreateIdentity({ ...row, name: 'Other' }, 'user-1', plan.target.vyralId, plan.parameters.name, plan.parameters.description), false);
  assert.equal(isSameVyralCreateIdentity({ ...row, metadata: {} }, 'user-1', plan.target.vyralId, plan.parameters.name, plan.parameters.description), false);
});

test('pending action approval is bound to exact owner, session, capability, status and expiry', () => {
  const row = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'user-1',
    session_id: 'chat-session-1',
    capability_id: 'vyral.create',
    status: 'pending',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    plan,
  };
  const expected = { userId: 'user-1', sessionId: 'chat-session-1', actionId: row.id };
  assert.deepEqual(validateVyralCreatePendingAction(row, expected), plan);
  assert.equal(validateVyralCreatePendingAction(row, { ...expected, userId: 'user-2' }), null);
  assert.equal(validateVyralCreatePendingAction(row, { ...expected, sessionId: 'other-chat' }), null);
  assert.equal(validateVyralCreatePendingAction({ ...row, capability_id: 'scene.update' }, expected), null);
  assert.equal(validateVyralCreatePendingAction({ ...row, status: 'approved' }, expected), null);
  assert.equal(validateVyralCreatePendingAction({ ...row, expires_at: new Date(Date.now() - 1000).toISOString() }, expected), null);
  assert.equal(validateVyralCreatePendingAction(row, { ...expected, actionId: '44444444-4444-4444-8444-444444444444' }), null);
});
