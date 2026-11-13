import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAiCapabilityPolicy,
  mayAiPerformCapability,
  summarizeAiCapabilityCoverage,
  VYRA_AI_CAPABILITIES,
} from '../src/server/vyraAiCapabilityRegistry.ts';

test('catalogues broad app-wide AI capabilities without granting unimplemented execution', () => {
  const summary = summarizeAiCapabilityCoverage();
  assert.ok(summary.total >= 80);
  assert.ok(summary.domains.length >= 12);
  assert.ok(getAiCapabilityPolicy('timeline.move_clip'));
  assert.ok(getAiCapabilityPolicy('timeline.add_transition'));
  assert.ok(getAiCapabilityPolicy('timeline.add_clip'));
  assert.equal(getAiCapabilityPolicy('timeline.attach_video')?.access, 'approval-required');
  assert.equal(getAiCapabilityPolicy('scene.duplicate')?.access, 'approval-required');
  assert.equal(getAiCapabilityPolicy('scene.delete')?.risk, 'destructive');
  assert.ok(getAiCapabilityPolicy('asset.verify'));
  assert.ok(getAiCapabilityPolicy('generation.video'));
  assert.ok(getAiCapabilityPolicy('marketplace.publish_listing'));
  for (const id of ['storyboard.propose_update', 'scene.propose_update', 'scene.propose_mutation', 'scene.propose_reorder', 'timeline.propose_edit', 'timeline.propose_transition', 'vyral.propose_create']) {
    assert.equal(getAiCapabilityPolicy(id)?.access, 'autonomous', id);
  }
});

test('autonomous read capability is available only to authenticated users', () => {
  assert.deepEqual(mayAiPerformCapability('storyboard.read', { userAuthenticated: false }),
    { allowed: false, reason: 'authentication-required' });
  assert.deepEqual(mayAiPerformCapability('storyboard.read', { userAuthenticated: true }),
    { allowed: true, reason: 'allowed' });
});

test('reversible and billable actions require approval before execution', () => {
  assert.deepEqual(mayAiPerformCapability('scene.update', { userAuthenticated: true }),
    { allowed: false, reason: 'approval-required' });
  assert.deepEqual(mayAiPerformCapability('scene.update', { userAuthenticated: true, approvalGranted: true }),
    { allowed: true, reason: 'allowed' });
  assert.deepEqual(mayAiPerformCapability('vyral.create', { userAuthenticated: true }),
    { allowed: false, reason: 'approval-required' });
  assert.deepEqual(mayAiPerformCapability('vyral.create', { userAuthenticated: true, approvalGranted: true }),
    { allowed: true, reason: 'allowed' });
  assert.deepEqual(mayAiPerformCapability('generation.video', { userAuthenticated: true }),
    { allowed: false, reason: 'approval-required' });
});

test('human-controlled and privileged operations remain unavailable to ordinary AI actions', () => {
  for (const id of ['auth.password.change', 'auth.account.delete', 'marketplace.withdraw', 'platform.production.deploy']) {
    assert.equal(mayAiPerformCapability(id, { userAuthenticated: true, isOwnerOrAdmin: true, approvalGranted: true }).allowed, false, id);
  }
  assert.deepEqual(mayAiPerformCapability('admin.provider_key.manage', { userAuthenticated: true }),
    { allowed: false, reason: 'owner-admin-only' });
  assert.deepEqual(mayAiPerformCapability('admin.provider_key.manage', { userAuthenticated: true, isOwnerOrAdmin: true }),
    { allowed: true, reason: 'allowed' });
});

test('unknown capabilities fail closed and the registry has no duplicate IDs', () => {
  assert.deepEqual(mayAiPerformCapability('database.run_arbitrary_sql', { userAuthenticated: true, approvalGranted: true }),
    { allowed: false, reason: 'unknown-capability' });
  const ids = VYRA_AI_CAPABILITIES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});
