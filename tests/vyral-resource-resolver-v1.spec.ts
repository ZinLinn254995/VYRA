import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findVyralMasterDnaSnapshotAssetV1,
  hasValidVyralMasterDnaRevisionBindingV1,
  isSafeVyralStoragePathV1,
  isVyralAssetDnaPinnedToVersionV1,
  isPublicVyralResourceAllowedV1,
  isPublicVyralAssetVisibilityAllowedV1,
  isSafePublicVyralResolverUriV1,
} from '../src/services/vyralResourceResolverV1.ts';

const ownerPrefix = 'owner-1/vyral-1/asset-1/';
const digest = 'a'.repeat(64);
const snapshotAsset = {
  asset_id: 'asset-1',
  asset_version_id: 'version-1',
  asset_fingerprint: digest,
  dna_ref: { record_id: 'dna-1', schema_version: 3 },
};
const snapshot = {
  schema_id: 'vyra.vyral-master-dna',
  schema_version: 1,
  assets: [snapshotAsset],
};

test('storage object paths stay inside the exact canonical owner/asset prefix', () => {
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix + 'v1/source.png', ownerPrefix), true);
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix + 'dna/tiles/0_0.raw', ownerPrefix), true);
  assert.equal(isSafeVyralStoragePathV1('owner-1/vyral-1/asset-10/file.png', ownerPrefix), false);
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix + '../asset-2/file.png', ownerPrefix), false);
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix + 'dna\\..\\secret', ownerPrefix), false);
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix, ownerPrefix), false);
  assert.equal(isSafeVyralStoragePathV1(ownerPrefix + '/double-leading-slash', ownerPrefix), false);
});

test('Master DNA snapshot lookup requires one exact Asset ID and immutable Version ID match', () => {
  assert.deepEqual(findVyralMasterDnaSnapshotAssetV1(snapshot, 'asset-1', 'version-1'), snapshotAsset);
  assert.equal(findVyralMasterDnaSnapshotAssetV1(snapshot, 'asset-1', 'version-2'), null);
  assert.equal(findVyralMasterDnaSnapshotAssetV1(snapshot, 'asset-2', 'version-1'), null);
  assert.equal(findVyralMasterDnaSnapshotAssetV1({ ...snapshot, assets: [snapshotAsset, snapshotAsset] }, 'asset-1', 'version-1'), null);
  assert.equal(findVyralMasterDnaSnapshotAssetV1({ ...snapshot, schema_version: 2 }, 'asset-1', 'version-1'), null);
});

test('revision response must match the immutable snapshot integrity bindings', () => {
  const revision = {
    schema_id: 'vyra.vyral-master-dna',
    schema_version: 1,
    manifest_sha256: digest,
    vyral_fingerprint: 'b'.repeat(64),
    snapshot: {
      ...snapshot,
      integrity: { manifest_sha256: digest, vyral_fingerprint: 'b'.repeat(64) },
    },
  };
  assert.equal(hasValidVyralMasterDnaRevisionBindingV1(revision), true);
  assert.equal(hasValidVyralMasterDnaRevisionBindingV1({
    ...revision,
    snapshot: { ...revision.snapshot, integrity: { manifest_sha256: 'c'.repeat(64), vyral_fingerprint: 'b'.repeat(64) } },
  }), false);
  assert.equal(hasValidVyralMasterDnaRevisionBindingV1({ ...revision, schema_version: 2 }), false);
});

test('Asset DNA must match the pinned record, schema, source version, and source fingerprint', () => {
  const input = {
    snapshotAsset,
    dnaRecordId: 'dna-1',
    dnaSchemaVersion: 3,
    assetId: 'asset-1',
    assetVersionId: 'version-1',
    assetSha256: digest,
    dnaSource: { asset_id: 'asset-1', asset_version_id: 'version-1', sha256: digest },
  };
  assert.equal(isVyralAssetDnaPinnedToVersionV1(input), true);
  assert.equal(isVyralAssetDnaPinnedToVersionV1({ ...input, assetVersionId: 'version-2' }), false);
  assert.equal(isVyralAssetDnaPinnedToVersionV1({ ...input, dnaRecordId: 'dna-2' }), false);
  assert.equal(isVyralAssetDnaPinnedToVersionV1({ ...input, assetSha256: 'd'.repeat(64) }), false);
  assert.equal(isVyralAssetDnaPinnedToVersionV1({
    ...input,
    dnaSource: { asset_id: 'asset-1', asset_version_id: 'version-1' },
    dnaFileSha256: digest,
  }), true);
  assert.equal(isVyralAssetDnaPinnedToVersionV1({
    ...input,
    dnaSource: { asset_id: 'asset-1', asset_version_id: 'version-1' },
    dnaFileSha256: 'f'.repeat(64),
  }), false);
});


test('public Asset resolution requires both collection and Asset visibility to be public', () => {
  assert.equal(isPublicVyralAssetVisibilityAllowedV1('public', 'public'), true);
  assert.equal(isPublicVyralAssetVisibilityAllowedV1('private', 'public'), false);
  assert.equal(isPublicVyralAssetVisibilityAllowedV1('unlisted', 'public'), false);
  assert.equal(isPublicVyralAssetVisibilityAllowedV1('public', 'private'), false);
  assert.equal(isPublicVyralAssetVisibilityAllowedV1('public', undefined), false);
});

test('public resource access follows Vyral visibility and creator AI/download permissions', () => {
  const publicPolicy = { allow_ai_analysis: true, allow_redistribution: true };
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'master', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_dna', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_source', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_source', licensePolicy: { allow_ai_analysis: true } }), false);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_dna', licensePolicy: { allow_ai_analysis: false, allow_redistribution: true } }), false);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'unlisted', action: 'master', licensePolicy: publicPolicy }), false);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'private', action: 'asset_dna', licensePolicy: publicPolicy }), false);
  assert.equal(isPublicVyralResourceAllowedV1({
    visibility: 'public', action: 'asset_dna', licensePolicy: publicPolicy,
    assetPolicy: { allow_ai_analysis: false },
  }), false);
  assert.equal(isPublicVyralResourceAllowedV1({
    visibility: 'public', action: 'asset_source', licensePolicy: publicPolicy,
    assetPolicy: { allow_redistribution: false },
  }), false);
  assert.equal(isPublicVyralResourceAllowedV1({
    visibility: 'public', action: 'asset_source', licensePolicy: { allow_ai_analysis: true },
    assetPolicy: { allow_redistribution: true },
  }), false);
});

test('portable public resolver URI accepts only the canonical HTTPS Supabase endpoint', () => {
  assert.equal(isSafePublicVyralResolverUriV1('https://wbqheogfoahnjvgkwhxe.supabase.co/functions/v1/resolve-public-vyral-resource'), true);
  assert.equal(isSafePublicVyralResolverUriV1('http://wbqheogfoahnjvgkwhxe.supabase.co/functions/v1/resolve-public-vyral-resource'), false);
  assert.equal(isSafePublicVyralResolverUriV1('https://example.com/functions/v1/resolve-public-vyral-resource'), false);
  assert.equal(isSafePublicVyralResolverUriV1('https://wbqheogfoahnjvgkwhxe.supabase.co/functions/v1/other'), false);
  assert.equal(isSafePublicVyralResolverUriV1('https://wbqheogfoahnjvgkwhxe.supabase.co/functions/v1/resolve-public-vyral-resource?token=secret'), false);
});
