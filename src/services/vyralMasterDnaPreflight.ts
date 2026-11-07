export type MasterDnaPreflightAsset = {
  asset_id: string;
  role?: string | null;
  purpose?: string | null;
  has_latest_version: boolean;
  has_matching_dna: boolean;
};

export type MasterDnaPreflightRelationship = {
  from_kind: 'asset' | 'vyral';
  from_asset_id: string | null;
  to_kind: 'asset' | 'vyral';
  to_asset_id: string | null;
};

export type MasterDnaPreflightBlocker = {
  code:
    | 'missing_vyral_purpose'
    | 'missing_intended_uses'
    | 'missing_main_asset'
    | 'needs_classification'
    | 'missing_asset_version'
    | 'missing_asset_dna'
    | 'missing_asset_relationship';
  asset_id?: string;
  message: string;
};

export const preflightVyralMasterDna = (input: {
  vyralPurpose?: string | null;
  intendedUses?: unknown;
  assets: MasterDnaPreflightAsset[];
  relationships: MasterDnaPreflightRelationship[];
}): MasterDnaPreflightBlocker[] => {
  const blockers: MasterDnaPreflightBlocker[] = [];
  if (typeof input.vyralPurpose !== 'string' || !input.vyralPurpose.trim()) {
    blockers.push({ code: 'missing_vyral_purpose', message: 'Add a purpose describing what this Vyral represents.' });
  }
  if (!Array.isArray(input.intendedUses) || input.intendedUses.length === 0 ||
      !input.intendedUses.every((item) => typeof item === 'string' && item.trim())) {
    blockers.push({ code: 'missing_intended_uses', message: 'Add at least one intended use for this Vyral.' });
  }
  if (!input.assets.some((asset) => asset.role === 'main')) {
    blockers.push({ code: 'missing_main_asset', message: 'Designate at least one Asset as Main.' });
  }

  const connected = new Set<string>();
  for (const relationship of input.relationships) {
    if (relationship.from_kind === 'asset' && relationship.from_asset_id) connected.add(relationship.from_asset_id);
    if (relationship.to_kind === 'asset' && relationship.to_asset_id) connected.add(relationship.to_asset_id);
  }

  for (const asset of input.assets) {
    if (!['main', 'supporting'].includes(String(asset.role)) ||
        typeof asset.purpose !== 'string' || !asset.purpose.trim()) {
      blockers.push({
        code: 'needs_classification',
        asset_id: asset.asset_id,
        message: 'Set this Asset as Main or Supporting and explain its purpose.',
      });
    }
    if (!asset.has_latest_version) {
      blockers.push({ code: 'missing_asset_version', asset_id: asset.asset_id, message: 'This Asset has no immutable source version.' });
    }
    if (!asset.has_matching_dna) {
      blockers.push({ code: 'missing_asset_dna', asset_id: asset.asset_id, message: 'Generate or recover this Asset’s DNA for its latest version.' });
    }
    if (!connected.has(asset.asset_id)) {
      blockers.push({ code: 'missing_asset_relationship', asset_id: asset.asset_id, message: 'Connect this Asset to the Vyral root or another Asset, with a reason.' });
    }
  }
  return blockers;
};
