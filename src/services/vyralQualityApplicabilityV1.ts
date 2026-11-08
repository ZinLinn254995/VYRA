import type {
  VyralQualityRule,
  VyralQualityRuleFinding,
  VyralQualityStandardProfile,
} from './vyralQualityGradingV1.ts';

export type VyralQualityApplicabilityContextV1 = {
  assetTypes?: string[];
  purpose?: string | null;
  workflowType?: string | null;
};

export type VyralQualityApplicabilityV1 = {
  applicableRuleIds: string[];
  notApplicableRuleIds: string[];
  seededFindings: VyralQualityRuleFinding[];
};

const normalize = (value: string) => value.trim().toLowerCase();
const validSelectorList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 &&
  value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);

const matchesAny = (selectors: string[], values: string[]) => {
  const normalized = new Set(values.map(normalize));
  return selectors.some((selector) => normalized.has(normalize(selector)));
};

/**
 * Resolves category-scoped rules against declared Vyral context.
 * Non-applicable rules are explicitly seeded as N/A; applicable rules remain
 * unevaluated until evidence is supplied to the deterministic evaluator.
 */
export const resolveVyralQualityApplicabilityV1 = (
  profile: VyralQualityStandardProfile,
  context: VyralQualityApplicabilityContextV1,
): VyralQualityApplicabilityV1 => {
  if (!profile || !Array.isArray(profile.rules) || profile.rules.length === 0) {
    throw new Error('A quality profile with rules is required.');
  }
  const assetTypes = context.assetTypes ?? [];
  if (!Array.isArray(assetTypes) || !assetTypes.every((value) => typeof value === 'string' && value.trim())) {
    throw new Error('Asset types must be non-empty strings.');
  }
  const applicableRuleIds: string[] = [];
  const notApplicableRuleIds: string[] = [];
  const seededFindings: VyralQualityRuleFinding[] = [];

  for (const rule of profile.rules) {
    const scoped = rule as VyralQualityRule & {
      appliesTo?: { assetTypes?: string[]; purposes?: string[]; workflowTypes?: string[] };
    };
    let applies = true;
    if (rule.category === 'asset_type') {
      if (!validSelectorList(scoped.appliesTo?.assetTypes)) {
        throw new Error(`Asset-type rule ${rule.id} must declare appliesTo.assetTypes.`);
      }
      applies = matchesAny(scoped.appliesTo.assetTypes, assetTypes);
    } else if (rule.category === 'purpose') {
      if (!validSelectorList(scoped.appliesTo?.purposes)) {
        throw new Error(`Purpose rule ${rule.id} must declare appliesTo.purposes.`);
      }
      applies = typeof context.purpose === 'string' &&
        matchesAny(scoped.appliesTo.purposes, [context.purpose]);
    } else if (rule.category === 'workflow') {
      if (!validSelectorList(scoped.appliesTo?.workflowTypes)) {
        throw new Error(`Workflow rule ${rule.id} must declare appliesTo.workflowTypes.`);
      }
      applies = typeof context.workflowType === 'string' &&
        matchesAny(scoped.appliesTo.workflowTypes, [context.workflowType]);
    }

    if (applies) {
      applicableRuleIds.push(rule.id);
      continue;
    }
    notApplicableRuleIds.push(rule.id);
    seededFindings.push({
      ruleId: rule.id,
      evidenceClass: rule.evidenceClass,
      status: 'not_applicable',
      evidenceRefs: [],
      explanation: 'The selected Vyral context does not match this rule scope.',
    });
  }

  return { applicableRuleIds, notApplicableRuleIds, seededFindings };
};
