import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateVyralLicenseActionV1,
  type VyralLicenseGrantV1,
} from '../src/services/vyralLicensePolicyV1.ts';

const now = '2026-11-07T12:00:00.000Z';
const grant = (overrides: Partial<VyralLicenseGrantV1> = {}): VyralLicenseGrantV1 => ({
  grant_id: 'grant-1',
  asset_id: 'asset-1',
  asset_version_id: 'asset-v1',
  profile: 'basic_use',
  status: 'active',
  grantee_ref: 'buyer-1',
  terms_version: 'terms-1',
  granted_at: '2026-11-01T00:00:00.000Z',
  expires_at: null,
  ...overrides,
});
const assets = [{ asset_id: 'asset-1', asset_version_id: 'asset-v1' }];

test('Basic Usage permits use and generated derivatives but not clone or resale', () => {
  const grants = [grant()];
  for (const action of ['use_asset', 'generate_derivative'] as const) {
    assert.equal(evaluateVyralLicenseActionV1({ action, actor_ref: 'buyer-1', assets, grants, now }).allowed, true);
  }
  for (const action of ['create_clone_branch', 'modify_branch', 'resell_branch'] as const) {
    const result = evaluateVyralLicenseActionV1({ action, actor_ref: 'buyer-1', assets, grants, now });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'invalid_grant');
  }
});

test('Clone Branch permits branch creation and editing but not resale', () => {
  const grants = [grant({ profile: 'clone_branch' })];
  assert.equal(evaluateVyralLicenseActionV1({
    action: 'create_clone_branch', actor_ref: 'buyer-1', assets, grants, now,
  }).allowed, true);
  assert.equal(evaluateVyralLicenseActionV1({
    action: 'modify_branch', actor_ref: 'buyer-1', assets, grants, now,
  }).allowed, true);
  assert.equal(evaluateVyralLicenseActionV1({
    action: 'resell_branch', actor_ref: 'buyer-1', assets, grants, now,
  }).allowed, false);
});

test('Modified Branch + Resale permits resale only with the explicit higher grant', () => {
  const result = evaluateVyralLicenseActionV1({
    action: 'resell_branch', actor_ref: 'buyer-1', assets,
    grants: [grant({ profile: 'modified_branch_resale' })], now,
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.grant_ids, ['grant-1']);
});

test('Multi-asset operations require grants for every exact asset version', () => {
  const result = evaluateVyralLicenseActionV1({
    action: 'generate_derivative',
    actor_ref: 'buyer-1',
    assets: [...assets, { asset_id: 'asset-2', asset_version_id: 'asset-2-v1' }],
    grants: [grant()],
    now,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'missing_asset');
  assert.equal(result.blocking_asset_id, 'asset-2');
});

test('Rejects stale versions, wrong grantees, revoked and expired grants', () => {
  const stale = evaluateVyralLicenseActionV1({
    action: 'use_asset', actor_ref: 'buyer-1', assets,
    grants: [grant({ asset_version_id: 'asset-v0' })], now,
  });
  assert.equal(stale.reason, 'version_mismatch');

  const wrongBuyer = evaluateVyralLicenseActionV1({
    action: 'use_asset', actor_ref: 'buyer-2', assets, grants: [grant()], now,
  });
  assert.equal(wrongBuyer.reason, 'wrong_grantee');

  const revoked = evaluateVyralLicenseActionV1({
    action: 'use_asset', actor_ref: 'buyer-1', assets,
    grants: [grant({ status: 'revoked' })], now,
  });
  assert.equal(revoked.reason, 'revoked');

  const expired = evaluateVyralLicenseActionV1({
    action: 'use_asset', actor_ref: 'buyer-1', assets,
    grants: [grant({ expires_at: '2026-11-06T00:00:00.000Z' })], now,
  });
  assert.equal(expired.reason, 'expired');
});

test('Verified owner bypass is explicit and reports its authorization basis', () => {
  const result = evaluateVyralLicenseActionV1({
    action: 'resell_branch', actor_ref: 'owner-1', assets, grants: [], now, verifiedOwner: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.basis, 'verified_owner');
});
