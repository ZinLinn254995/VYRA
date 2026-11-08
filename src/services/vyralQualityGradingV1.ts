export const VYRAL_QUALITY_ENGINE_VERSION = 1 as const;

export type VyralQualityEvidenceClass =
  | 'deterministic'
  | 'creator_declared'
  | 'ai_assessment'
  | 'generation_test';

export type VyralQualityRuleStatus =
  | 'pass'
  | 'partial'
  | 'fail'
  | 'not_applicable'
  | 'not_evaluated';

export type VyralQualityGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export type VyralQualityRule = {
  id: string;
  title: string;
  category: 'universal' | 'asset_type' | 'purpose' | 'workflow';
  evidenceClass: VyralQualityEvidenceClass;
  weight: number;
  required: boolean;
  hardGate?: boolean;
};

export type VyralQualityRuleFinding = {
  ruleId: string;
  status: VyralQualityRuleStatus;
  evidenceRefs?: string[];
  explanation?: string;
  recommendation?: string;
};

export type VyralQualityStandardProfile = {
  id: string;
  version: number;
  name: string;
  scope: 'general' | 'asset_type' | 'purpose' | 'workflow';
  rules: VyralQualityRule[];
  gradeBands?: Partial<Record<VyralQualityGrade, { min: number; max: number }>>;
};

export type EvaluateVyralQualityInput = {
  vyralId: string;
  snapshotFingerprint: string;
  profile: VyralQualityStandardProfile;
  findings: VyralQualityRuleFinding[];
};

export type VyralQualityEvaluation = {
  engineVersion: typeof VYRAL_QUALITY_ENGINE_VERSION;
  vyralId: string;
  snapshotFingerprint: string;
  standard: { id: string; version: number; name: string; scope: VyralQualityStandardProfile['scope'] };
  status: 'graded' | 'incomplete_evidence' | 'blocked';
  score: number | null;
  grade: VyralQualityGrade | null;
  hardGateFailures: string[];
  missingRequiredEvidence: string[];
  rules: Array<VyralQualityRule & {
    status: VyralQualityRuleStatus;
    evidenceRefs: string[];
    explanation: string | null;
    recommendation: string | null;
    awardedPoints: number | null;
  }>;
};

const SHA256 = /^[a-f0-9]{64}$/;
const RULE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const DEFAULT_BANDS: Record<VyralQualityGrade, { min: number; max: number }> = {
  S: { min: 95, max: 100 },
  A: { min: 90, max: 94.999999 },
  B: { min: 80, max: 89.999999 },
  C: { min: 70, max: 79.999999 },
  D: { min: 50, max: 69.999999 },
  F: { min: 0, max: 49.999999 },
};

const gradeFor = (score: number, bands: VyralQualityStandardProfile['gradeBands']): VyralQualityGrade => {
  const resolved = { ...DEFAULT_BANDS, ...(bands ?? {}) };
  for (const grade of ['S', 'A', 'B', 'C', 'D', 'F'] as const) {
    const band = resolved[grade];
    if (band && score >= band.min && score <= band.max) return grade;
  }
  return 'F';
};

export const evaluateVyralQualityV1 = (input: EvaluateVyralQualityInput): VyralQualityEvaluation => {
  const { profile } = input;
  if (!isText(input.vyralId) || !SHA256.test(input.snapshotFingerprint)) {
    throw new Error('Quality evaluation must pin a Vyral ID and a lowercase SHA-256 snapshot fingerprint.');
  }
  if (!isText(profile.id) || !isText(profile.name) || !Number.isSafeInteger(profile.version) || profile.version < 1) {
    throw new Error('Quality standard identity and positive version are required.');
  }
  if (!Array.isArray(profile.rules) || profile.rules.length === 0 || !Array.isArray(input.findings)) {
    throw new Error('A quality standard must define rules and receive rule findings.');
  }

  const ruleMap = new Map<string, VyralQualityRule>();
  for (const rule of profile.rules) {
    if (!isText(rule.id) || !RULE_ID.test(rule.id) || !isText(rule.title) ||
        !Number.isFinite(rule.weight) || rule.weight < 0 || rule.weight > 100 ||
        !['universal', 'asset_type', 'purpose', 'workflow'].includes(rule.category) ||
        !['deterministic', 'creator_declared', 'ai_assessment', 'generation_test'].includes(rule.evidenceClass) ||
        typeof rule.required !== 'boolean' || (rule.hardGate && !rule.required)) {
      throw new Error('Quality standard contains an invalid rule definition.');
    }
    if (ruleMap.has(rule.id)) throw new Error(`Duplicate quality rule ID: ${rule.id}`);
    ruleMap.set(rule.id, rule);
  }

  const findingMap = new Map<string, VyralQualityRuleFinding>();
  for (const finding of input.findings) {
    if (!isText(finding.ruleId) || !ruleMap.has(finding.ruleId)) {
      throw new Error('Quality findings contain an unknown rule ID.');
    }
    if (findingMap.has(finding.ruleId)) throw new Error(`Duplicate finding for quality rule: ${finding.ruleId}`);
    if (!['pass', 'partial', 'fail', 'not_applicable', 'not_evaluated'].includes(finding.status)) {
      throw new Error('Quality finding contains an invalid status.');
    }
    const refs = finding.evidenceRefs ?? [];
    if (!Array.isArray(refs) || !refs.every(isText)) throw new Error('Quality evidence references must be non-empty strings.');
    if (['pass', 'partial', 'fail'].includes(finding.status) && refs.length === 0) {
      throw new Error(`Quality rule ${finding.ruleId} requires evidence for a scored finding.`);
    }
    findingMap.set(finding.ruleId, finding);
  }

  const rules = profile.rules.map((rule) => {
    const finding = findingMap.get(rule.id);
    const status = finding?.status ?? 'not_evaluated';
    const evidenceRefs = [...(finding?.evidenceRefs ?? [])];
    const awardedPoints = status === 'pass' ? rule.weight
      : status === 'partial' ? rule.weight * 0.5
      : status === 'fail' ? 0
      : null;
    return {
      ...rule,
      status,
      evidenceRefs,
      explanation: finding?.explanation?.trim() || null,
      recommendation: finding?.recommendation?.trim() || null,
      awardedPoints,
    };
  });

  const applicable = rules.filter((rule) => rule.status !== 'not_applicable');
  const missingRequiredEvidence = applicable
    .filter((rule) => rule.required && rule.status === 'not_evaluated')
    .map((rule) => rule.id);
  const hardGateFailures = applicable
    .filter((rule) => rule.hardGate && rule.status === 'fail')
    .map((rule) => rule.id);

  const scored = applicable.filter((rule) => rule.awardedPoints !== null && rule.weight > 0);
  const totalWeight = scored.reduce((sum, rule) => sum + rule.weight, 0);
  const earned = scored.reduce((sum, rule) => sum + (rule.awardedPoints ?? 0), 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 10000) / 100 : null;

  const status = hardGateFailures.length > 0
    ? 'blocked'
    : missingRequiredEvidence.length > 0 || score === null
      ? 'incomplete_evidence'
      : 'graded';

  return {
    engineVersion: VYRAL_QUALITY_ENGINE_VERSION,
    vyralId: input.vyralId,
    snapshotFingerprint: input.snapshotFingerprint,
    standard: { id: profile.id, version: profile.version, name: profile.name, scope: profile.scope },
    status,
    score: status === 'graded' ? score : null,
    grade: status === 'graded' && score !== null ? gradeFor(score, profile.gradeBands) : null,
    hardGateFailures,
    missingRequiredEvidence,
    rules,
  };
};
