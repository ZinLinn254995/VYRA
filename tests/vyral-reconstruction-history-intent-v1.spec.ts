import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsVyralReconstructionHistoryV1 } from '../src/services/vyralReconstructionHistoryIntentV1.ts';

test('recognizes English ORIGIN-01 reconstruction evidence requests', () => {
  assert.equal(requestsVyralReconstructionHistoryV1('Show ORIGIN-01 reconstruction attempts'), true);
  assert.equal(requestsVyralReconstructionHistoryV1('Compare Vyral blind reconstruction test results'), true);
  assert.equal(requestsVyralReconstructionHistoryV1('Show my Vyral reconstruction history'), true);
});

test('recognizes Burmese reconstruction evidence requests', () => {
  assert.equal(requestsVyralReconstructionHistoryV1('ORIGIN-01 စမ်းသပ်မှု မှတ်တမ်းတွေ နှိုင်းယှဉ်ပေးပါ'), true);
  assert.equal(requestsVyralReconstructionHistoryV1('Vyral ပြန်လည်တည်ဆောက်မှု မှတ်တမ်းပြပါ'), true);
});

test('does not trigger for unrelated messages', () => {
  assert.equal(requestsVyralReconstructionHistoryV1('Show my Vyral workspace'), false);
  assert.equal(requestsVyralReconstructionHistoryV1('Compare two videos'), false);
  assert.equal(requestsVyralReconstructionHistoryV1(''), false);
});
