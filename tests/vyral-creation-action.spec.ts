import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSameVyralCreateIdentity,
  isVyralCreateApprovalText,
  parseVyralCreatePendingPlan,
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
