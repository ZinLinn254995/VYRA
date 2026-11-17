import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContextApplicability } from '../src/services/vyralContextApplicability.ts';

test('requires every exact tag', () => {
  const evidence = { sourceId: 'e1', source: 'verified_task_input' as const, verificationStatus: 'verified' as const, tags: ['front view', 'daylight'] };
  assert.equal(evaluateContextApplicability(['front view', 'daylight'], evidence).status, 'match');
  assert.equal(evaluateContextApplicability(['front view', 'night'], evidence).status, 'no_match');
});

test('does not evaluate without verified runtime evidence', () => {
  assert.deepEqual(evaluateContextApplicability(['front view'], null), { status: 'not_evaluated', reason: 'missing_runtime_evidence' });
});

test('supports Myanmar tags', () => {
  const evidence = { sourceId: 'e2', source: 'verified_task_input' as const, verificationStatus: 'verified' as const, tags: ['မြန်မာ အလင်းရောင်'] };
  assert.equal(evaluateContextApplicability(['မြန်မာ အလင်းရောင်'], evidence).status, 'match');
});
