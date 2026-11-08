import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  findVyralMasterDnaSnapshotAssetV1,
  hasValidVyralMasterDnaRevisionBindingV1,
  isSafeVyralStoragePathV1,
  isVyralAssetDnaPinnedToVersionV1,
  isPublicVyralResourceAllowedV1,
  isPublicVyralAssetVisibilityAllowedV1,
  isPublicVyralMasterDnaSnapshotAllowedV1,
  isSafePublicVyralResolverUriV1,
  createPublicVyralMasterDnaProjectionV1,
  canonicalizeVyralPublicProjectionV1,
} from '../src/services/vyralResourceResolverV1.ts';
import { verifyPublicVyralCollectionReferenceV1 } from '../src/services/vyralCollectionReferenceResolverV1.ts';

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

test('public Master DNA never exposes a mixed-visibility or AI-restricted Asset inventory', () => {
  const publicAssets = [
    { metadata: { visibility: 'public' }, license_override: { allow_ai_analysis: true } },
    { metadata: { visibility: 'public' }, license_override: {} },
  ];
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('public', publicAssets), true);
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('private', publicAssets), false);
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('public', [
    ...publicAssets, { metadata: { visibility: 'private' }, license_override: {} },
  ]), false);
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('public', [
    ...publicAssets, { metadata: { visibility: 'public' }, license_override: { allow_ai_analysis: false } },
  ]), false);
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('public', [
    ...publicAssets, { metadata: {}, license_override: {} },
  ]), false);
  assert.equal(isPublicVyralMasterDnaSnapshotAllowedV1('public', []), false);
});

test('public resource access follows Vyral visibility and creator AI/download permissions', () => {
  const publicPolicy = { allow_ai_analysis: true, allow_redistribution: true };
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'master', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_dna', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_source', licensePolicy: publicPolicy }), true);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_source', licensePolicy: { allow_ai_analysis: true } }), false);
  assert.equal(isPublicVyralResourceAllowedV1({ visibility: 'public', action: 'asset_dna', licensePolicy: { allow_ai_analysis: false, allow_redistribution: true } }), false);
  assert.equal(isPublicVyralResourceAllowedV1({
    visibility: 'public', action: 'asset_source',
    licensePolicy: { allow_ai_analysis: false, allow_redistribution: true },
  }), true, 'source redistribution permission is independent from AI analysis permission');
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

test('public Master DNA projection omits descriptive Asset metadata and creator-authored context', () => {
  const source = {
    schema_id: 'vyra.vyral-master-dna',
    schema_version: 1,
    master_dna_id: 'vyral-1',
    vyral: { vyral_id: 'vyral-1', name: 'Public Collection', owner_ref: 'private-owner-ref' },
    snapshot: { revision: 3, created_at: '2026-11-08T00:00:00.000Z' },
    purpose: { summary: 'private creator notes', intended_uses: ['private use'] },
    main_asset_ids: ['asset-1'],
    assets: [{
      asset_id: 'asset-1',
      asset_version_id: 'version-1',
      name: 'Confidential source filename',
      asset_type: 'image',
      updated_at: '2026-11-07T00:00:00.000Z',
      role: 'main',
      purpose: 'private asset purpose',
      media_type: 'image/png',
      dna_ref: { record_id: 'dna-1', schema_id: 'vyra.asset-dna', schema_version: 3, package_prefix: 'private/path' },
      asset_fingerprint: digest,
      reconstruction_claim: 'lossless_decoded',
      provenance_ref: 'private-provenance',
      license_ref: 'private-license',
    }],
    relationships: [{ relationship_id: 'rel-1', type: 'derived_from', rationale: 'private relationship rationale' }],
    reconstruction_profile: { overall_claim: 'lossless_decoded', notes: ['private notes'] },
    source_resolution: { visibility: 'public', canonical_uri: 'private-uri', resolution_policy: 'public_assets' },
    provenance: { creator_ref: 'private-creator', license_ref: 'private-license', evidence_status: 'unknown' },
    portable_projection: { profile: 'compact', resolver_uri: 'https://private', retrieval_policy: 'authorized_selective_retrieval', notes: ['private notes'] },
  };
  const projection = createPublicVyralMasterDnaProjectionV1(source);
  const projectedAsset = (projection.assets as Array<Record<string, unknown>>)[0];
  assert.deepEqual(Object.keys(projectedAsset).sort(), [
    'asset_fingerprint', 'asset_id', 'asset_version_id', 'dna_ref', 'media_type', 'reconstruction_claim',
  ]);
  assert.deepEqual(projectedAsset.dna_ref, {
    record_id: 'dna-1', schema_id: 'vyra.asset-dna', schema_version: 3,
  });
  assert.equal('purpose' in projection, false);
  assert.equal('relationships' in projection, false);
  assert.equal('provenance' in projection, false);
  assert.equal('main_asset_ids' in projection, false);
  assert.equal(canonicalizeVyralPublicProjectionV1(projection).includes('Confidential source filename'), false);
  assert.equal(canonicalizeVyralPublicProjectionV1(projection).includes('private relationship rationale'), false);
});


test('live public collection reference verification pins identity, revision, projection digest and Asset inventory', async () => {
  const asset = {
    asset_id: 'asset-1',
    asset_version_id: 'version-1',
    media_type: 'image/png',
    dna_ref: { record_id: 'dna-1', schema_id: 'vyra.asset-dna', schema_version: 3 },
    asset_fingerprint: digest,
    reconstruction_claim: 'lossless_decoded',
  };
  const snapshot = {
    schema_id: 'vyra.vyral-master-dna',
    schema_version: 1,
    vyral: { vyral_id: 'vyral-1', name: 'Public Collection' },
    snapshot: { revision: 4 },
    assets: [asset],
  };
  const projectionSha256 = createHash('sha256').update(canonicalizeVyralPublicProjectionV1(snapshot)).digest('hex');
  const response = {
    status: 'resolved',
    access: 'public',
    vyral: { id: 'vyral-1', name: 'Public Collection' },
    masterDna: {
      schemaId: 'vyra.vyral-master-dna',
      schemaVersion: 1,
      revision: 4,
      snapshot,
      projectionIntegrity: {
        sourceManifestSha256: 'c'.repeat(64),
        projectionSha256,
      },
    },
  };
  const reference = {
    source_vyral_id: 'vyral-1',
    source_revision: 4,
    projection_sha256: 'c'.repeat(64),
    compact_snapshot: {
      assets: [{
        ...asset,
        name: 'Original descriptive name is not in the public projection',
      }],
    },
  };
  assert.deepEqual(await verifyPublicVyralCollectionReferenceV1(response, reference), {
    status: 'current',
    revision: 4,
    assetCount: 1,
    assets: [{ assetId: 'asset-1', assetVersionId: 'version-1', mediaType: 'image/png' }],
  });

  const newerSnapshot = { ...snapshot, snapshot: { revision: 5 } };
  const newerDigest = createHash('sha256').update(canonicalizeVyralPublicProjectionV1(newerSnapshot)).digest('hex');
  const newerResponse = {
    ...response,
    masterDna: {
      ...response.masterDna,
      revision: 5,
      snapshot: newerSnapshot,
      projectionIntegrity: { sourceManifestSha256: 'd'.repeat(64), projectionSha256: newerDigest },
    },
  };
  assert.deepEqual(await verifyPublicVyralCollectionReferenceV1(newerResponse, reference), {
    status: 'newer_revision',
    revision: 5,
    assetCount: 1,
  });

  await assert.rejects(
    verifyPublicVyralCollectionReferenceV1({
      ...response,
      masterDna: {
        ...response.masterDna,
        projectionIntegrity: { ...response.masterDna.projectionIntegrity, projectionSha256: 'e'.repeat(64) },
      },
    }, reference),
    /failed its integrity check/,
  );

  await assert.rejects(
    verifyPublicVyralCollectionReferenceV1({
      ...response,
      vyral: { id: 'another-vyral', name: 'Spoofed' },
    }, reference),
    /collection identity/,
  );

  await assert.rejects(
    verifyPublicVyralCollectionReferenceV1(response, {
      ...reference,
      compact_snapshot: { assets: [{ ...asset, asset_fingerprint: 'f'.repeat(64) }] },
    }),
    /Asset inventory differs/,
  );
});
