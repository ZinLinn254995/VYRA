import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeAiCapability,
  hasAiCapabilityAdapter,
  listRegisteredAiCapabilityAdapterIds,
  registerAiCapabilityAdapter,
} from '../src/server/aiCapabilityExecutor.ts';

const events: Array<{ outcome: string; reason?: string }> = [];
const authority = (overrides: Record<string, unknown> = {}) => ({
  userAuthenticated: true,
  isOwnerOrAdmin: false,
  verifyApproval: async () => false,
  verifyOwner: async () => true,
  audit: async (event: { outcome: string; reason?: string }) => { events.push(event); },
  ...overrides,
});

test('catalogue entry without adapter cannot be executed or claimed successful', async () => {
  const result = await executeAiCapability({
    capabilityId: 'storyboard.analyze', userId: 'user-1', requestId: 'request-0001', input: {},
  }, authority());
  assert.deepEqual(result, {
    ok: false, code: 'NO_EXECUTOR',
    message: 'This capability is recognized but its secure VYRA executor is not connected yet.',
  });
});

test('unknown capability fails closed before any adapter or owner operation', async () => {
  const result = await executeAiCapability({
    capabilityId: 'database.raw_sql', userId: 'user-1', requestId: 'request-0002', input: {},
  }, authority());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'UNKNOWN_CAPABILITY');
});

test('human-only action cannot be enabled by an approval or admin flag', async () => {
  const result = await executeAiCapability({
    capabilityId: 'auth.account.delete', userId: 'user-1', requestId: 'request-0003', input: {},
    approval: { requestId: 'request-0003', approvedAt: new Date().toISOString(), confirmationToken: 'x' },
  }, authority({ isOwnerOrAdmin: true, verifyApproval: async () => true }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'HUMAN_ONLY');
});

test('approval-required capability cannot execute without server-verified approval', async () => {
  const result = await executeAiCapability({
    capabilityId: 'scene.update', userId: 'user-1', requestId: 'request-0004', input: { sceneId: 's1' },
  }, authority());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'APPROVAL_REQUIRED');
});

test('registered executor requires approval, ownership, validation and audit before success', async () => {
  registerAiCapabilityAdapter({
    capabilityId: 'workspace.organize',
    validate: (input) => typeof input.view === 'string',
    execute: async (input) => ({ view: input.view }),
  });
  assert.equal(hasAiCapabilityAdapter('workspace.organize'), true);
  const result = await executeAiCapability({
    capabilityId: 'workspace.organize', userId: 'user-1', requestId: 'request-0005', input: { view: 'recent' },
  }, authority());
  assert.equal(result.ok, true);
  assert.deepEqual(events.slice(-2).map((event) => event.outcome), ['started', 'succeeded']);
});

test('failed owner verification prevents adapter execution', async () => {
  const result = await executeAiCapability({
    capabilityId: 'workspace.organize', userId: 'user-1', requestId: 'request-0006', input: { view: 'recent' },
  }, authority({ verifyOwner: async () => false }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'EXECUTION_FAILED');
});

test('duplicate adapter registration and unknown adapter registration are rejected', () => {
  assert.throws(() => registerAiCapabilityAdapter({
    capabilityId: 'workspace.organize', validate: () => true, execute: async () => null,
  }));
  assert.throws(() => registerAiCapabilityAdapter({
    capabilityId: 'database.raw_sql', validate: () => true, execute: async () => null,
  }));
});

test('registered executor inventory is a sorted snapshot of actual adapters', () => {
  assert.deepEqual(listRegisteredAiCapabilityAdapterIds(), ['workspace.organize']);
  registerAiCapabilityAdapter({ capabilityId: 'storyboard.list', validate: () => true, execute: async () => [] });
  assert.deepEqual(listRegisteredAiCapabilityAdapterIds(), ['storyboard.list', 'workspace.organize']);
});

test('executor passes authenticated server runtime dependencies only to the adapter context', async () => {
  registerAiCapabilityAdapter({
    capabilityId: 'storyboard.read',
    validate: () => true,
    execute: async (_input, context) => ({ runtimeMarker: (context.runtime as { marker?: string })?.marker ?? null }),
  });
  const result = await executeAiCapability({
    capabilityId: 'storyboard.read', userId: 'user-1', requestId: 'request-0007', input: { title: 'Owned' },
  }, authority(), new Date('2026-01-01T00:00:00.000Z'), { marker: 'server-only' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, { runtimeMarker: 'server-only' });
});
