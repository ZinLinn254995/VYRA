import type { VyralMasterDnaV1 } from './vyralMasterDnaV1.ts';
import { buildVyralCreatorInventoryContextV1 } from './vyralCreatorInventoryContextV1.ts';
import { resolveVyralQualityApplicabilityV1 } from './vyralQualityApplicabilityV1.ts';
import {
  evaluateVyralQualityV1,
  type VyralQualityRuleFinding,
  type VyralQualityStandardProfile,
} from './vyralQualityGradingV1.ts';

export type EvaluateVyralSnapshotQualityInputV1 = {
  masterDna: VyralMasterDnaV1;
  profile: VyralQualityStandardProfile;
  evidenceFindings: VyralQualityRuleFinding[];
  workflowType?: string | null;
};

export const evaluateVyralSnapshotQualityV1 = (input: EvaluateVyralSnapshotQualityInputV1) => {
  const { masterDna, profile } = input;
  if (!masterDna?.vyral?.vyral_id || !/^[a-f0-9]{64}$/.test(masterDna.integrity?.vyral_fingerprint ?? '')) {
    throw new Error('A verified Master DNA snapshot with a SHA-256 fingerprint is required.');
  }
  if (!Array.isArray(masterDna.assets) || masterDna.assets.length === 0) {
    throw new Error('A non-empty Master DNA Asset inventory is required.');
  }

  const inventory = buildVyralCreatorInventoryContextV1({
    assets: masterDna.assets.map((asset) => ({
      id: asset.asset_id,
      name: asset.name ?? null,
      asset_type: asset.asset_type ?? null,
      mime_type: asset.media_type,
    })),
    purpose: masterDna.purpose ?? null,
    relationships: masterDna.relationships ?? [],
  });

  const purposes = [
    ...(masterDna.purpose?.summary ? [masterDna.purpose.summary] : []),
    ...(masterDna.purpose?.intended_uses ?? []),
  ];
  const applicability = resolveVyralQualityApplicabilityV1(profile, {
    assetTypes: Object.keys(inventory.typeCounts),
    purposes,
    workflowType: input.workflowType ?? null,
  });

  const applicable = new Set(applicability.applicableRuleIds);
  const notApplicable = new Set(applicability.notApplicableRuleIds);
  const seen = new Set<string>();
  for (const finding of input.evidenceFindings) {
    if (seen.has(finding.ruleId)) throw new Error(`Duplicate evidence finding for rule: ${finding.ruleId}`);
    seen.add(finding.ruleId);
    if (notApplicable.has(finding.ruleId)) {
      throw new Error(`Evidence cannot override a contextually not-applicable rule: ${finding.ruleId}`);
    }
    if (applicable.has(finding.ruleId) && finding.status === 'not_applicable') {
      throw new Error(`Applicable rule cannot be manually marked not applicable: ${finding.ruleId}`);
    }
  }

  const evaluation = evaluateVyralQualityV1({
    vyralId: masterDna.vyral.vyral_id,
    snapshotFingerprint: masterDna.integrity.vyral_fingerprint,
    profile,
    findings: [...applicability.seededFindings, ...input.evidenceFindings],
  });

  return {
    snapshot: {
      masterDnaId: masterDna.master_dna_id,
      revision: masterDna.snapshot.revision,
      fingerprint: masterDna.integrity.vyral_fingerprint,
    },
    inventory,
    applicability,
    evaluation,
  };
};
