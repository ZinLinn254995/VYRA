import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsVyralAssetDnaAssessmentV1 } from '../src/services/vyralAssetDnaAssessmentIntentV1.ts';

test('recognizes explicit English Asset DNA quality and reconstruction requests', () => {
  assert.equal(requestsVyralAssetDnaAssessmentV1('Assess this Asset DNA quality'), true);
  assert.equal(requestsVyralAssetDnaAssessmentV1('Check Asset DNA reconstruction readiness'), true);
});

test('recognizes Burmese Asset DNA assessment requests', () => {
  assert.equal(requestsVyralAssetDnaAssessmentV1('ဒီ Asset ရဲ့ DNA အရည်အသွေး စစ်ပေးပါ'), true);
  assert.equal(requestsVyralAssetDnaAssessmentV1('Asset DNA ကို ပြန်တည်ဆောက်နိုင်မနိုင် စစ်ပေးပါ'), true);
});

test('does not confuse Vyral collection quality with one Asset DNA assessment', () => {
  assert.equal(requestsVyralAssetDnaAssessmentV1('Evaluate Vyral quality'), false);
  assert.equal(requestsVyralAssetDnaAssessmentV1('Check the quality of my video'), false);
  assert.equal(requestsVyralAssetDnaAssessmentV1(''), false);
});
