export type MasterDnaPreflightAsset = {
  asset_id: string;
  has_latest_version: boolean;
  has_matching_dna: boolean;
};

export type MasterDnaPreflightBlocker = {
  code: 'missing_asset_version' | 'missing_asset_dna';
  asset_id: string;
  message: string;
};

/**
 * Validity is determined by the canonical Asset inventory and each Asset's own
 * version and a supported exact-reconstruction DNA record for that same version.
 * Creator context, roles and relationships are optional metadata.
 */
export const preflightVyralMasterDna = (input: {
  assets: MasterDnaPreflightAsset[];
}): MasterDnaPreflightBlocker[] => {
  const blockers: MasterDnaPreflightBlocker[] = [];
  for (const asset of input.assets) {
    if (!asset.has_latest_version) {
      blockers.push({ code: 'missing_asset_version', asset_id: asset.asset_id, message: 'This Asset has no immutable source version.' });
    }
    if (!asset.has_matching_dna) {
      blockers.push({ code: 'missing_asset_dna', asset_id: asset.asset_id, message: 'Generate or recover this Asset’s DNA for its latest version.' });
    }
  }
  return blockers;
};
