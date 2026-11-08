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

export type VyralQualityEvidenceKeyV1 =
  | 'snapshot.integrity'
  | 'fingerprint.cryptographic'
  | 'reconstruction.byte_exact'
  | 'reconstruction.decoded_exact'
  | 'vision.corroborated';

export type VyralQualityRule = {
  id: string;
  evidenceKey?: VyralQualityEvidenceKeyV1;
  title: string;
  category: 'universal' | 'asset_type' | 'purpose' | 'workflow';
  evidenceClass: VyralQualityEvidenceClass;
  weight: number;
  required: boolean;
  hardGate?: boolean;
  appliesTo?: {
    assetTypes?: string[];
    purposes?: string[];
    workflowTypes?: string[];
  };
};

export type VyralQualityRuleFinding = {
  ruleId: string;
  evidenceClass: VyralQualityEvidenceClass;
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
  gradeBands: Record<VyralQualityGrade, { min: number; max: number }>;
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
  missingApplicableEvidence: string[];
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'] as const;

const EVIDENCE_KEY_CLASS: Record<VyralQualityEvidenceKeyV1, VyralQualityEvidenceClass> = {
  'snapshot.integrity': 'deterministic',
  'fingerprint.cryptographic': 'deterministic',
  'reconstruction.byte_exact': 'generation_test',
  'reconstruction.decoded_exact': 'generation_test',
  'vision.corroborated': 'ai_assessment',
};
const EVIDENCE_KEYS = new Set<string>(Object.keys(EVIDENCE_KEY_CLASS));

const validSelectorList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 &&
  value.every((entry) => isText(entry) && entry.trim().length <= 128);

const hasOnlySelector = (
  appliesTo: unknown,
  expected: 'assetTypes' | 'purposes' | 'workflowTypes',
): boolean => {
  if (!isRecord(appliesTo)) return false;
  const keys = Object.keys(appliesTo);
  return keys.length === 1 && keys[0] === expected && validSelectorList(appliesTo[expected]);
};

const validateRuleScope = (rule: VyralQualityRule): boolean => {
  if (rule.category === 'universal') {
    return rule.appliesTo === undefined;
  }
  if (rule.category === 'asset_type') return hasOnlySelector(rule.appliesTo, 'assetTypes');
  if (rule.category === 'purpose') return hasOnlySelector(rule.appliesTo, 'purposes');
  if (rule.category === 'workflow') return hasOnlySelector(rule.appliesTo, 'workflowTypes');
  return false;
};

const resolveAndValidateGradeBands = (bands: VyralQualityStandardProfile['gradeBands']) => {
  if (!isRecord(bands) || GRADE_ORDER.some((grade) => !(grade in bands))) {
    throw new Error('Every versioned quality standard must explicitly define all six grade bands.');
  }
  const resolved = bands as Record<VyralQualityGrade, { min: number; max: number }>;
  for (const grade of GRADE_ORDER) {
    const band = resolved[grade];
    if (!isRecord(band) || !Number.isFinite(band.min) || !Number.isFinite(band.max) ||
        band.min < 0 || band.max > 100 || band.min >= band.max) {
      throw new Error(`Invalid score range for grade ${grade}.`);
    }
  }
  if (resolved.S.max !== 100 || resolved.F.min !== 0) {
    throw new Error('Grade bands must cover the complete 0–100 score range.');
  }
  for (let index = 0; index < GRADE_ORDER.length - 1; index += 1) {
    const higher = resolved[GRADE_ORDER[index]];
    const lower = resolved[GRADE_ORDER[index + 1]];
    if (higher.min !== lower.max) {
      throw new Error('Grade bands must be contiguous and non-overlapping.');
    }
  }
  return resolved;
};

/** Shared thresholds belong to the higher grade: all upper bounds are exclusive except S. */
const gradeFor = (score: number, bands: ReturnType<typeof resolveAndValidateGradeBands>): VyralQualityGrade => {
  for (const grade of GRADE_ORDER) {
    const band = bands[grade];
    if (score >= band.min && (score < band.max || (grade === 'S' && score <= band.max))) return grade;
  }
  throw new Error('Score falls outside the validated grade bands.');
};

export const evaluateVyralQualityV1 = (input: EvaluateVyralQualityInput): VyralQualityEvaluation => {
  const { profile } = input;
  if (!isText(input.vyralId) || !SHA256.test(input.snapshotFingerprint)) {
    throw new Error('Quality evaluation must pin a Vyral ID and a lowercase SHA-256 snapshot fingerprint.');
  }
  if (!isText(profile.id) || !isText(profile.name) || !Number.isSafeInteger(profile.version) || profile.version < 1 ||
      !['general', 'asset_type', 'purpose', 'workflow'].includes(profile.scope)) {
    throw new Error('Quality standard identity, scope, and positive version are required.');
  }
  const gradeBands = resolveAndValidateGradeBands(profile.gradeBands);
  if (!Array.isArray(profile.rules) || profile.rules.length === 0 || !Array.isArray(input.findings)) {
    throw new Error('A quality standard must define rules and receive rule findings.');
  }

  if (profile.rules.length > 200) {
    throw new Error('A versioned quality standard cannot contain more than 200 rules.');
  }
  const ruleMap = new Map<string, VyralQualityRule>();
  let configuredWeight = 0;
  for (const rule of profile.rules) {
    if (!isText(rule.id) || !RULE_ID.test(rule.id) || !isText(rule.title) ||
        !Number.isFinite(rule.weight) || rule.weight < 0 || rule.weight > 100 ||
        !['universal', 'asset_type', 'purpose', 'workflow'].includes(rule.category) ||
        !validateRuleScope(rule) ||
        !['deterministic', 'creator_declared', 'ai_assessment', 'generation_test'].includes(rule.evidenceClass) ||
        typeof rule.required !== 'boolean' || (rule.hardGate !== undefined && typeof rule.hardGate !== 'boolean') ||
        (rule.evidenceKey !== undefined && (!EVIDENCE_KEYS.has(rule.evidenceKey) || EVIDENCE_KEY_CLASS[rule.evidenceKey] !== rule.evidenceClass)) ||
        (rule.hardGate && (!rule.required || rule.evidenceClass !== 'deterministic'))) {
      throw new Error('Quality standard contains an invalid rule definition.');
    }
    if (ruleMap.has(rule.id)) throw new Error(`Duplicate quality rule ID: ${rule.id}`);
    configuredWeight += rule.weight;
    ruleMap.set(rule.id, rule);
  }
  if (configuredWeight <= 0) {
    throw new Error('A quality standard must assign positive total weight to its rules.');
  }

  const findingMap = new Map<string, VyralQualityRuleFinding>();
  for (const finding of input.findings) {
    if (!isText(finding.ruleId) || !ruleMap.has(finding.ruleId)) {
      throw new Error('Quality findings contain an unknown rule ID.');
    }
    if (findingMap.has(finding.ruleId)) throw new Error(`Duplicate finding for quality rule: ${finding.ruleId}`);
    if (finding.evidenceClass !== ruleMap.get(finding.ruleId)!.evidenceClass) {
      throw new Error(`Evidence class does not match the standard for quality rule: ${finding.ruleId}`);
    }
    if (!['pass', 'partial', 'fail', 'not_applicable', 'not_evaluated'].includes(finding.status)) {
      throw new Error('Quality finding contains an invalid status.');
    }
    const refs = finding.evidenceRefs ?? [];
    if (!Array.isArray(refs) || !refs.every(isText) || new Set(refs).size !== refs.length) {
      throw new Error('Quality evidence references must be non-empty and unique strings.');
    }
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
  const missingApplicableEvidence = applicable
    .filter((rule) => rule.status === 'not_evaluated')
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
    : missingApplicableEvidence.length > 0 || score === null
      ? 'incomplete_evidence'
      : 'graded';

  return {
    engineVersion: VYRAL_QUALITY_ENGINE_VERSION,
    vyralId: input.vyralId,
    snapshotFingerprint: input.snapshotFingerprint,
    standard: { id: profile.id, version: profile.version, name: profile.name, scope: profile.scope },
    status,
    score: status === 'graded' ? score : null,
    grade: status === 'graded' && score !== null ? gradeFor(score, gradeBands) : null,
    hardGateFailures,
    missingRequiredEvidence,
    missingApplicableEvidence,
    rules,
  };
};
