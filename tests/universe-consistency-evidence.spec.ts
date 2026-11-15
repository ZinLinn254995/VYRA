import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCreatorConfirmedFieldEvidence } from '../src/services/universeConsistencyEvidence.ts';

const source = {
  fieldPath: 'appearance.eye_color',
  sourceVersionId: 'version-1',
  sourceSha256: 'a'.repeat(64),
};

test('coalesces repeated creator confirmations of the same field value', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    { ...source, acceptedValue: 'blue', evidenceId: 'evidence-1', observationId: 'observation-1', createdAt: '2026-01-01T00:00:00Z' },
    { ...source, acceptedValue: 'blue', evidenceId: 'evidence-2', observationId: 'observation-2', createdAt: '2026-01-02T00:00:00Z' },
  ]);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].acceptedValue, 'blue');
  assert.deepEqual(result.resolved[0].evidenceIds, ['evidence-2', 'evidence-1']);
  assert.equal(result.conflicts.length, 0);
});

test('does not silently choose between conflicting creator-confirmed values', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    { ...source, acceptedValue: 'blue', evidenceId: 'evidence-1', observationId: 'observation-1' },
    { ...source, acceptedValue: 'green', evidenceId: 'evidence-2', observationId: 'observation-2' },
  ]);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].status, 'unresolved_conflict');
  assert.deepEqual(new Set(result.conflicts[0].candidates.map((item) => item.value)), new Set(['blue', 'green']));
});

test('preserves distinct temporal states instead of misclassifying them as a conflict', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    { ...source, acceptedValue: { value: 'healthy', effective_at: 'episode-1' }, evidenceId: 'evidence-1', observationId: 'observation-1' },
    { ...source, acceptedValue: { value: 'injured', effective_at: 'episode-2' }, evidenceId: 'evidence-2', observationId: 'observation-2' },
  ]);
  assert.equal(result.resolved.length, 2);
  assert.equal(result.conflicts.length, 0);
});

test('canonical JSON key ordering avoids false conflicts', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    { ...source, acceptedValue: { color: 'blue', style: 'matte' }, evidenceId: 'evidence-1', observationId: 'observation-1' },
    { ...source, acceptedValue: { style: 'matte', color: 'blue' }, evidenceId: 'evidence-2', observationId: 'observation-2' },
  ]);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.conflicts.length, 0);
});
