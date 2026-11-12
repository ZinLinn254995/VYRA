import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeGlobalChatActionExecution,
  getGlobalChatActionRisk,
  validateGlobalChatActionPlan,
  type GlobalChatActionPlan,
} from '../src/server/globalChatActionPlanner.ts';

const now = new Date('2026-11-13T00:02:00.000Z');
const context = {
  activeVyralId: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  activeStoryboardId: '11111111-1111-4111-8111-111111111111',
  activeSceneId: '22222222-2222-4222-8222-222222222222',
};
const basePlan: GlobalChatActionPlan = {
  id: '33333333-3333-4333-8333-333333333333',
  operation: 'storyboard.update',
  target: { storyboardId: context.activeStoryboardId },
  parameters: { field: 'title', value: 'A better title', expectedUpdatedAt: '2026-11-13T00:00:00.000Z' },
  summary: 'Update the active storyboard title',
  createdAt: '2026-11-13T00:01:00.000Z',
  expiresAt: '2026-11-13T00:05:00.000Z',
};

test('classifies operation risk from the server allowlist, not from model claims', () => {
  assert.equal(getGlobalChatActionRisk('storyboard.list'), 'read');
  assert.equal(getGlobalChatActionRisk('storyboard.update'), 'reversible-write');
  assert.equal(getGlobalChatActionRisk('storyboard.delete'), 'destructive');
  assert.equal(getGlobalChatActionRisk('media.generate'), 'billable');
});

test('accepts bounded plans with explicit targets while requiring server-side ownership checks', () => {
  assert.deepEqual(validateGlobalChatActionPlan(basePlan, context, now), {
    ok: true, risk: 'reversible-write', requiresApproval: true, operation: 'storyboard.update',
  });
  const explicitOtherTarget = { ...basePlan, target: { storyboardId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
  assert.equal(validateGlobalChatActionPlan(explicitOtherTarget, context, now).ok, true);
  const validation = validateGlobalChatActionPlan(explicitOtherTarget, context, now);
  assert.deepEqual(authorizeGlobalChatActionExecution(explicitOtherTarget, validation, null, false, now),
    { ok: false, reason: 'owner-not-verified' });
  assert.deepEqual(validateGlobalChatActionPlan({ ...basePlan, target: undefined }, context, now),
    { ok: false, reason: 'missing-target' });
});

test('rejects unsupported operations, untrusted extra parameters and expired plans', () => {
  assert.deepEqual(validateGlobalChatActionPlan({
    ...basePlan, operation: 'database.execute' as never,
  }, context, now), { ok: false, reason: 'unsupported-operation' });
  assert.deepEqual(validateGlobalChatActionPlan({
    ...basePlan, parameters: { ...basePlan.parameters, sql: 'delete from users' } as Record<string, string | number | boolean | null>,
  }, context, now), { ok: false, reason: 'invalid-parameters' });
  assert.deepEqual(validateGlobalChatActionPlan({
    ...basePlan, expiresAt: '2026-11-13T00:01:00.000Z',
  }, context, now), { ok: false, reason: 'plan-expired' });
});

test('requires an active Vyral for asset uploads and the matching active scene for scene edits', () => {
  const upload: GlobalChatActionPlan = {
    ...basePlan, operation: 'asset.upload',
    target: { vyralId: context.activeVyralId },
    parameters: { fileToken: 'temporary-file-token', fileName: 'ref.png', mimeType: 'image/png', sizeBytes: 1024 },
  };
  assert.equal(validateGlobalChatActionPlan(upload, context, now).ok, true);
  assert.deepEqual(validateGlobalChatActionPlan({ ...upload, target: undefined }, context, now),
    { ok: false, reason: 'missing-target' });
  const sceneEdit: GlobalChatActionPlan = {
    ...basePlan, operation: 'scene.update',
    target: { storyboardId: context.activeStoryboardId, sceneId: context.activeSceneId },
    parameters: { field: 'title', value: 'Opening', expectedUpdatedAt: '2026-11-13T00:00:00.000Z' },
  };
  assert.equal(validateGlobalChatActionPlan(sceneEdit, context, now).ok, true);
});

test('read-only actions need no approval but still require server ownership verification', () => {
  const read: GlobalChatActionPlan = { ...basePlan, operation: 'storyboard.read', parameters: {} };
  const validation = validateGlobalChatActionPlan(read, context, now);
  assert.equal(validation.ok, true);
  assert.deepEqual(authorizeGlobalChatActionExecution(read, validation, null, false, now),
    { ok: false, reason: 'owner-not-verified' });
  assert.equal(authorizeGlobalChatActionExecution(read, validation, null, true, now).ok, true);
});

test('reversible writes require approval bound to the exact pending plan', () => {
  const validation = validateGlobalChatActionPlan(basePlan, context, now);
  assert.deepEqual(authorizeGlobalChatActionExecution(basePlan, validation, null, true, now),
    { ok: false, reason: 'approval-required' });
  assert.deepEqual(authorizeGlobalChatActionExecution(basePlan, validation,
    { kind: 'reversible', planId: '44444444-4444-4444-8444-444444444444', approvedAt: '2026-11-13T00:01:30.000Z' },
    true, now), { ok: false, reason: 'approval-mismatch' });
  assert.equal(authorizeGlobalChatActionExecution(basePlan, validation,
    { kind: 'reversible', planId: basePlan.id, approvedAt: '2026-11-13T00:01:30.000Z' },
    true, now).ok, true);
});

test('destructive and billable operations require their own specific approvals', () => {
  const deletion: GlobalChatActionPlan = { ...basePlan, operation: 'storyboard.delete', parameters: { expectedUpdatedAt: '2026-11-13T00:00:00.000Z' } };
  const deleteValidation = validateGlobalChatActionPlan(deletion, context, now);
  assert.deepEqual(authorizeGlobalChatActionExecution(deletion, deleteValidation,
    { kind: 'reversible', planId: deletion.id, approvedAt: '2026-11-13T00:01:30.000Z' }, true, now),
  { ok: false, reason: 'approval-invalid' });
  assert.equal(authorizeGlobalChatActionExecution(deletion, deleteValidation,
    { kind: 'destructive', planId: deletion.id, challenge: 'DELETE', confirmedAt: '2026-11-13T00:01:30.000Z' },
    true, now).ok, true);

  const generation: GlobalChatActionPlan = {
    ...basePlan, operation: 'media.generate', parameters: {
      task: 'video', prompt: 'A short film', quality: 'standard', quoteId: 'quote-1', maxCredits: 20,
    },
  };
  const generationValidation = validateGlobalChatActionPlan(generation, context, now);
  assert.equal(authorizeGlobalChatActionExecution(generation, generationValidation,
    { kind: 'billable', planId: generation.id, quoteId: 'quote-1', maxCredits: 20, confirmedAt: '2026-11-13T00:01:30.000Z' },
    true, now).ok, true);
  assert.equal(authorizeGlobalChatActionExecution(generation, generationValidation,
    { kind: 'billable', planId: generation.id, quoteId: 'quote-2', maxCredits: 20, confirmedAt: '2026-11-13T00:01:30.000Z' },
    true, now).ok, false);
});
