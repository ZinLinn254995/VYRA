import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');

test('Project AI Chat exposes media creation without changing global chat composer behavior', () => {
  assert.ok(chat.includes("import { generateRunwayProjectMedia } from '../../services/runwayProjectGeneration'"));
  assert.ok(chat.includes('{storyboardId && ('));
  assert.ok(chat.includes('Create media'));
  assert.ok(chat.includes('Generate in this Project'));
  assert.ok(chat.includes("targetVyralId: storyboardUniverseId"));
  assert.ok(chat.includes('input: { promptText: prompt }'));
});

test('media generation requires a creator-set budget and explicit quote approval', () => {
  assert.ok(chat.includes('Maximum budget (USD)'));
  assert.ok(chat.includes('const budget = Number(mediaBudgetUsd)'));
  assert.ok(chat.includes('requestApproval: async (quote)'));
  assert.ok(chat.includes('window.confirm(details)'));
  assert.ok(chat.includes('Credits are reserved only after approval.'));
});

test('Project media progress distinguishes ready, pending and reconciliation states', () => {
  assert.ok(chat.includes("result.status === 'ready'"));
  assert.ok(chat.includes("result.status === 'submitted_pending'"));
  assert.ok(chat.includes("result.status === 'reconciliation_required'"));
  assert.ok(chat.includes('passed DNA / Fingerprint verification'));
});

test('media polling is aborted when the chat component unmounts', () => {
  assert.ok(chat.includes('mediaRequestControllerRef.current?.abort()'));
});
