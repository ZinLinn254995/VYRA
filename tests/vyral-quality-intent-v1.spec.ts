import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsVyralQualityEvaluationV1 } from '../src/services/vyralQualityIntentV1.ts';

test('recognizes explicit English Vyral quality requests', () => {
  assert.equal(requestsVyralQualityEvaluationV1('Please evaluate my Vyral quality.'), true);
  assert.equal(requestsVyralQualityEvaluationV1('Grade this Vyral'), true);
  assert.equal(requestsVyralQualityEvaluationV1('Check quality of this collection'), false);
});

test('recognizes natural Burmese Vyral quality requests', () => {
  assert.equal(requestsVyralQualityEvaluationV1('Vyral ရဲ့ အရည်အသွေး စစ်ပေးပါ'), true);
  assert.equal(requestsVyralQualityEvaluationV1('ဒီ Vyral ကို အဆင့်သတ်မှတ်ပေးပါ'), true);
  assert.equal(requestsVyralQualityEvaluationV1('ဗိုင်ရယ် အရည်အသွေး အကဲဖြတ်ပေးပါ'), true);
});

test('does not trigger from an unrelated Vyral mention', () => {
  assert.equal(requestsVyralQualityEvaluationV1('Open my Vyral in the workspace'), false);
  assert.equal(requestsVyralQualityEvaluationV1('What does quality mean?'), false);
  assert.equal(requestsVyralQualityEvaluationV1(''), false);
});
