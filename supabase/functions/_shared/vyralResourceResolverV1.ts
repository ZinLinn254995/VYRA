export type VyralResolverSnapshotAssetV1 = {
  asset_id?: unknown;
  asset_version_id?: unknown;
  asset_fingerprint?: unknown;
  dna_ref?: { record_id?: unknown; schema_version?: unknown } | null;
};

export type VyralResolverRevisionBindingV1 = {
  schema_id?: unknown;
  schema_version?: unknown;
  manifest_sha256?: unknown;
  vyral_fingerprint?: unknown;
  snapshot?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const SHA256 = /^[a-f0-9]{64}$/i;

export type VyralPublicResolverActionV1 = 'master' | 'asset_dna' | 'asset_source';

export const isPublicVyralAssetVisibilityAllowedV1 = (vyralVisibility: unknown, assetVisibility: unknown): boolean =>
  vyralVisibility === 'public' && assetVisibility === 'public';

/** The complete Master DNA inventory is public only when every Asset is public and AI-analysis eligible. */
export const isPublicVyralMasterDnaSnapshotAllowedV1 = (
  vyralVisibility: unknown,
  assets: unknown,
): boolean => {
  if (vyralVisibility !== 'public' || !Array.isArray(assets) || assets.length === 0) return false;
  return assets.every((value) => {
    const asset = asRecord(value);
    const metadata = asRecord(asset.metadata);
    const license = asRecord(asset.license_override);
    return metadata.visibility === 'public' && license.allow_ai_analysis !== false;
  });
};

export const isPublicVyralResourceAllowedV1 = (input: {
  visibility: unknown;
  action: unknown;
  licensePolicy: unknown;
  assetPolicy?: unknown;
}): boolean => {
  if (input.visibility !== 'public') return false;
  const policy = asRecord(input.licensePolicy);
  const assetPolicy = asRecord(input.assetPolicy);
  if (policy.allow_ai_analysis === false || assetPolicy.allow_ai_analysis === false) return false;
  if (input.action === 'master' || input.action === 'asset_dna') return true;
  return input.action === 'asset_source' &&
    policy.allow_redistribution === true && assetPolicy.allow_redistribution !== false;
};

export const isSafePublicVyralResolverUriV1 = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
      url.port === '' && url.username === '' && url.password === '' &&
      url.pathname === '/functions/v1/resolve-public-vyral-resource' &&
      url.search === '' && url.hash === '';
  } catch {
    return false;
  }
};

/** Requires a canonical, owner-scoped object prefix ending in '/'. */
export const isSafeVyralStoragePathV1 = (path: unknown, prefix: string): path is string => {
  if (typeof path !== 'string' || !prefix.endsWith('/') || !path.startsWith(prefix)) return false;
  const suffix = path.slice(prefix.length);
  if (!suffix || suffix.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return suffix.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
};

export const findVyralMasterDnaSnapshotAssetV1 = (
  snapshotValue: unknown,
  assetId: string,
  versionId: string,
): VyralResolverSnapshotAssetV1 | null => {
  const snapshot = asRecord(snapshotValue);
  if (snapshot.schema_id !== 'vyra.vyral-master-dna' || Number(snapshot.schema_version) !== 1) return null;
  if (!Array.isArray(snapshot.assets)) return null;
  const matches = snapshot.assets.filter((value) => {
    const item = asRecord(value);
    return item.asset_id === assetId && item.asset_version_id === versionId;
  });
  return matches.length === 1 ? matches[0] as VyralResolverSnapshotAssetV1 : null;
};

export const hasValidVyralMasterDnaRevisionBindingV1 = (
  revision: VyralResolverRevisionBindingV1,
): boolean => {
  if (revision.schema_id !== 'vyra.vyral-master-dna' || Number(revision.schema_version) !== 1) return false;
  if (typeof revision.manifest_sha256 !== 'string' || !SHA256.test(revision.manifest_sha256) ||
      typeof revision.vyral_fingerprint !== 'string' || !SHA256.test(revision.vyral_fingerprint)) return false;
  const snapshot = asRecord(revision.snapshot);
  const integrity = asRecord(snapshot.integrity);
  return snapshot.schema_id === revision.schema_id &&
    Number(snapshot.schema_version) === Number(revision.schema_version) &&
    integrity.manifest_sha256 === revision.manifest_sha256 &&
    integrity.vyral_fingerprint === revision.vyral_fingerprint;
};

export const isVyralAssetDnaPinnedToVersionV1 = (input: {
  snapshotAsset: VyralResolverSnapshotAssetV1;
  dnaRecordId: string;
  dnaSchemaVersion: number;
  assetId: string;
  assetVersionId: string;
  assetSha256: string;
  dnaSource: { asset_id?: unknown; asset_version_id?: unknown; sha256?: unknown };
  dnaFileSha256?: unknown;
}): boolean => {
  const ref = asRecord(input.snapshotAsset.dna_ref);
  const dnaSourceSha256 = typeof input.dnaSource.sha256 === 'string'
    ? input.dnaSource.sha256
    : input.dnaFileSha256;
  return ref.record_id === input.dnaRecordId &&
    Number(ref.schema_version) === input.dnaSchemaVersion &&
    typeof input.snapshotAsset.asset_fingerprint === 'string' &&
    SHA256.test(input.snapshotAsset.asset_fingerprint) &&
    input.snapshotAsset.asset_fingerprint.toLowerCase() === input.assetSha256.toLowerCase() &&
    input.dnaSource.asset_id === input.assetId &&
    input.dnaSource.asset_version_id === input.assetVersionId &&
    typeof dnaSourceSha256 === 'string' &&
    dnaSourceSha256.toLowerCase() === input.assetSha256.toLowerCase();
};
