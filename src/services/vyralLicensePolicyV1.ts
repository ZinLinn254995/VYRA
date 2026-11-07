/**
 * Deterministic Vyral license evaluation.
 * Evaluates explicit, version-pinned grants; it does not establish copyright
 * ownership, create a license, or replace server-side authorization.
 */
export type VyralLicenseProfileV1 = 'basic_use' | 'clone_branch' | 'modified_branch_resale';
export type VyralLicenseActionV1 = 'use_asset' | 'generate_derivative' | 'create_clone_branch' | 'modify_branch' | 'resell_branch';

export type VyralLicenseGrantV1 = {
  grant_id: string;
  asset_id: string;
  asset_version_id: string;
  profile: VyralLicenseProfileV1;
  status: 'active' | 'revoked' | 'expired';
  grantee_ref: string;
  terms_version: string;
  granted_at: string;
  expires_at: string | null;
};

export type VyralLicenseAssetRefV1 = { asset_id: string; asset_version_id: string };

export type VyralLicenseDecisionV1 = {
  allowed: boolean;
  action: VyralLicenseActionV1;
  basis: 'verified_owner' | 'explicit_grant' | 'denied';
  reason: 'owner_rights' | 'all_assets_covered' | 'missing_asset' | 'version_mismatch' |
    'wrong_grantee' | 'revoked' | 'expired' | 'not_yet_valid' | 'invalid_grant';
  blocking_asset_id?: string;
  grant_ids: string[];
};

const PROFILE_ACTIONS: Record<VyralLicenseProfileV1, readonly VyralLicenseActionV1[]> = {
  basic_use: ['use_asset', 'generate_derivative'],
  clone_branch: ['use_asset', 'generate_derivative', 'create_clone_branch', 'modify_branch'],
  modified_branch_resale: [
    'use_asset', 'generate_derivative', 'create_clone_branch', 'modify_branch', 'resell_branch',
  ],
};
const isDate = (value: string) => Number.isFinite(Date.parse(value));

/**
 * Every asset in an operation must have an active grant for its exact immutable
 * version, the requesting grantee, and the requested action. verifiedOwner
 * must come only from a trusted server-side ownership check.
 */
export const evaluateVyralLicenseActionV1 = (input: {
  action: VyralLicenseActionV1;
  actor_ref: string;
  assets: VyralLicenseAssetRefV1[];
  grants: VyralLicenseGrantV1[];
  now: string;
  verifiedOwner?: boolean;
}): VyralLicenseDecisionV1 => {
  const denied = (
    reason: VyralLicenseDecisionV1['reason'],
    blocking_asset_id?: string,
  ): VyralLicenseDecisionV1 => ({
    allowed: false, action: input.action, basis: 'denied', reason,
    ...(blocking_asset_id ? { blocking_asset_id } : {}), grant_ids: [],
  });

  if (!input.actor_ref.trim() || !isDate(input.now) || input.assets.length === 0) {
    return denied('invalid_grant');
  }
  if (input.verifiedOwner === true) {
    return {
      allowed: true, action: input.action, basis: 'verified_owner',
      reason: 'owner_rights', grant_ids: [],
    };
  }

  const nowMs = Date.parse(input.now);
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const asset of input.assets) {
    if (!asset.asset_id || !asset.asset_version_id || seen.has(asset.asset_id)) {
      return denied('invalid_grant', asset.asset_id);
    }
    seen.add(asset.asset_id);

    const candidates = input.grants.filter((grant) => grant.asset_id === asset.asset_id);
    if (!candidates.length) return denied('missing_asset', asset.asset_id);
    const exactVersion = candidates.filter((grant) => grant.asset_version_id === asset.asset_version_id);
    if (!exactVersion.length) return denied('version_mismatch', asset.asset_id);
    const forActor = exactVersion.filter((grant) => grant.grantee_ref === input.actor_ref);
    if (!forActor.length) return denied('wrong_grantee', asset.asset_id);
    const active = forActor.filter((grant) => grant.status === 'active');
    if (!active.length) {
      return denied(forActor.some((grant) => grant.status === 'revoked') ? 'revoked' : 'expired', asset.asset_id);
    }

    const valid = active.find((grant) =>
      isDate(grant.granted_at) &&
      Date.parse(grant.granted_at) <= nowMs &&
      Boolean(grant.terms_version.trim()) &&
      (grant.expires_at === null || (
        isDate(grant.expires_at) && Date.parse(grant.expires_at) > nowMs
      )) &&
      PROFILE_ACTIONS[grant.profile]?.includes(input.action)
    );
    if (!valid) {
      const notYetValid = active.some((grant) =>
        isDate(grant.granted_at) && Date.parse(grant.granted_at) > nowMs
      );
      if (notYetValid) return denied('not_yet_valid', asset.asset_id);
      const expired = active.some((grant) =>
        grant.expires_at !== null && isDate(grant.expires_at) && Date.parse(grant.expires_at) <= nowMs
      );
      return denied(expired ? 'expired' : 'invalid_grant', asset.asset_id);
    }
    selected.push(valid.grant_id);
  }

  return {
    allowed: true, action: input.action, basis: 'explicit_grant',
    reason: 'all_assets_covered', grant_ids: selected,
  };
};
