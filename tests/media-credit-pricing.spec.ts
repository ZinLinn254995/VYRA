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

test('admin status action accepts only a plain action object', async () => {
  const { validateMediaCreditPricingAdminAction } = await import('../src/services/mediaCreditPricing');
  assert.deepEqual(validateMediaCreditPricingAdminAction({ action: 'status' }), { action: 'status' });
  assert.throws(() => validateMediaCreditPricingAdminAction(null));
  assert.throws(() => validateMediaCreditPricingAdminAction([]));
  assert.throws(() => validateMediaCreditPricingAdminAction({ action: 'unknown' }));
});

test('admin draft action validates the version and decimal rate before database access', async () => {
  const { validateMediaCreditPricingAdminAction } = await import('../src/services/mediaCreditPricing');
  assert.deepEqual(validateMediaCreditPricingAdminAction({
    action: 'create_draft', version: 'media-v1.1', creditsPerUsd: '99.125',
  }), {
    action: 'create_draft', version: 'media-v1.1', creditsPerUsd: '99.125',
  });
  for (const input of [
    { action: 'create_draft', version: 'x', creditsPerUsd: '10' },
    { action: 'create_draft', version: 'media-v1', creditsPerUsd: '0' },
    { action: 'create_draft', version: 'media-v1', creditsPerUsd: '1.123456789' },
    { action: 'create_draft', version: 'media-v1', creditsPerUsd: '1e6' },
    { action: 'create_draft', version: 'media-v1', creditsPerUsd: 100 },
  ]) assert.throws(() => validateMediaCreditPricingAdminAction(input));
});

test('admin activation requires explicit confirmation and a valid policy UUID', async () => {
  const { validateMediaCreditPricingAdminAction } = await import('../src/services/mediaCreditPricing');
  const policyId = 'c5afacb6-174a-498a-88f2-476b24f08e87';
  assert.deepEqual(validateMediaCreditPricingAdminAction({
    action: 'activate', policyId, confirmed: true,
  }), { action: 'activate', policyId, confirmed: true });
  assert.throws(() => validateMediaCreditPricingAdminAction({
    action: 'activate', policyId, confirmed: false,
  }));
  assert.throws(() => validateMediaCreditPricingAdminAction({
    action: 'activate', policyId: 'not-a-uuid', confirmed: true,
  }));
  assert.throws(() => validateMediaCreditPricingAdminAction({
    action: 'activate', policyId, confirmed: 'true',
  }));
});


test('only current owner and admin roles pass the pricing administration allowlist', async () => {
  const { isMediaCreditPricingAdminRole } = await import('../src/services/mediaCreditPricing');
  assert.equal(isMediaCreditPricingAdminRole('owner'), true);
  assert.equal(isMediaCreditPricingAdminRole('admin'), true);
  for (const role of ['member', 'user', 'moderator', '', null, undefined, { role: 'admin' }]) {
    assert.equal(isMediaCreditPricingAdminRole(role), false);
  }
});
