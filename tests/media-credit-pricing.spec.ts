import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRequiredMediaCredits, validateMediaCreditPolicyDraft } from '../src/services/mediaCreditPricing';

test('calculates exact ceiling without floating point drift', () => {
  assert.equal(calculateRequiredMediaCredits('0.005', '1000'), 5n);
  assert.equal(calculateRequiredMediaCredits('0.001', '100'), 1n);
  assert.equal(calculateRequiredMediaCredits('1.25', '2.4'), 3n);
  assert.equal(calculateRequiredMediaCredits('1.00000001', '1'), 2n);
});

test('validates positive versioned policy drafts', () => {
  assert.deepEqual(validateMediaCreditPolicyDraft({ version: 'v1.0', creditsPerUsd: '125.25' }), {
    version: 'v1.0', creditsPerUsd: '125.25', roundingMode: 'ceil',
  });
  assert.throws(() => validateMediaCreditPolicyDraft({ version: 'x', creditsPerUsd: '10' }));
  assert.throws(() => validateMediaCreditPolicyDraft({ version: 'v1', creditsPerUsd: '0' }));
  assert.throws(() => validateMediaCreditPolicyDraft({ version: 'v1', creditsPerUsd: '1.123456789' }));
});

test('rejects invalid or zero cost inputs', () => {
  assert.throws(() => calculateRequiredMediaCredits('0', '100'));
  assert.throws(() => calculateRequiredMediaCredits('0.01', '0'));
  assert.throws(() => calculateRequiredMediaCredits('1e-3', '100'));
});
