import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiCapabilityCoverage, buildRuntimeAiCapabilityCoverage } from '../src/server/aiCapabilityCoverage.ts';
import { registerAiCapabilityAdapter } from '../src/server/aiCapabilityExecutor.ts';
import { VYRA_AI_CAPABILITIES } from '../src/server/vyraAiCapabilityRegistry.ts';

test('coverage report never treats catalogue entries as implemented', () => {
  const report = buildAiCapabilityCoverage([]);
  assert.equal(report.total, VYRA_AI_CAPABILITIES.length);
  assert.equal(report.connected, 0);
  assert.equal(report.completionPercent, 0);
  assert.equal(report.missingExecutors + report.humanControlled + report.ownerAdminGated, report.total);
});

test('only explicitly supplied connected adapters count as implemented', () => {
  const report = buildAiCapabilityCoverage(['storyboard.list', 'timeline.read']);
  assert.equal(report.connected, 2);
  assert.equal(report.capabilities.find((item) => item.id === 'storyboard.list')?.status, 'executor-connected');
  assert.equal(report.capabilities.find((item) => item.id === 'storyboard.read')?.status, 'executor-missing');
});

test('human-only and owner-admin controls remain separate from missing executors', () => {
  const report = buildAiCapabilityCoverage(['auth.account.delete', 'admin.audit.read']);
  assert.equal(report.capabilities.find((item) => item.id === 'auth.account.delete')?.status, 'human-controlled');
  assert.equal(report.capabilities.find((item) => item.id === 'admin.audit.read')?.status, 'owner-admin-gated');
  assert.equal(report.connected, 0);
});

test('domain summaries reconcile to global totals and unknown IDs are surfaced', () => {
  const report = buildAiCapabilityCoverage(['storyboard.list', 'not.a.real.capability']);
  assert.equal(report.domains.reduce((sum, item) => sum + item.total, 0), report.total);
  assert.equal(report.domains.reduce((sum, item) => sum + item.connected, 0), report.connected);
  assert.deepEqual(report.unknownExecutorIds, ['not.a.real.capability']);
});

test('runtime coverage is sourced from the actual executor registry, not a hand-maintained list', () => {
  registerAiCapabilityAdapter({ capabilityId: 'storyboard.list', validate: () => true, execute: async () => [] });
  const report = buildRuntimeAiCapabilityCoverage();
  assert.equal(report.connected, 1);
  assert.equal(report.capabilities.find((item) => item.id === 'storyboard.list')?.status, 'executor-connected');
  assert.equal(report.capabilities.find((item) => item.id === 'storyboard.read')?.status, 'executor-missing');
});
