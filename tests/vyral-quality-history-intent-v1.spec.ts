import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsVyralQualityHistoryV1 } from '../src/services/vyralQualityHistoryIntentV1.ts';

test('recognizes explicit English Vyral history requests', () => {
  assert.equal(requestsVyralQualityHistoryV1('Show my Vyral quality history'), true);
  assert.equal(requestsVyralQualityHistoryV1('Compare previous Vyral grade records'), true);
  assert.equal(requestsVyralQualityHistoryV1('Show history for my Vyral'), true);
});

test('recognizes Burmese Vyral history requests', () => {
  assert.equal(requestsVyralQualityHistoryV1('Vyral ရဲ့ အရည်အသွေး မှတ်တမ်းပြပါ'), true);
  assert.equal(requestsVyralQualityHistoryV1('ဒီ Vyral ရဲ့ အရင်အဆင့်တွေ ပြပါ'), true);
  assert.equal(requestsVyralQualityHistoryV1('ဗိုင်ရယ် မှတ်တမ်းတွေ ပြပေးပါ'), true);
});

test('does not trigger for unrelated history or Vyral messages', () => {
  assert.equal(requestsVyralQualityHistoryV1('Show my Vyral in the workspace'), false);
  assert.equal(requestsVyralQualityHistoryV1('Show my chat history'), false);
  assert.equal(requestsVyralQualityHistoryV1(''), false);
});
