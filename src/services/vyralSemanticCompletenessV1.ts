export const VYRAL_SEMANTIC_COMPLETENESS_VERSION = 1 as const;

export type SemanticEvidenceClassV1 =
  | 'ai_observed'
  | 'creator_confirmed'
  | 'system_measured'
  | 'independently_verified';

export type SemanticFieldStatusV1 = 'verified' | 'provisional' | 'missing' | 'not_applicable';

export type SemanticObservationV1 = {
  sourceVersionId: string;
  sourceSha256: string;
  evidenceClass: SemanticEvidenceClassV1;
  fields: Record<string, unknown>;
  evidenceRef: string;
};

export type SemanticCompletenessInputV1 = {
  assetType: string;
  sourceVersionId: string;
  sourceSha256: string;
  observations: SemanticObservationV1[];
};

export type SemanticCompletenessResultV1 = {
  version: typeof VYRAL_SEMANTIC_COMPLETENESS_VERSION;
  profile: 'raster_image_core_v1' | 'generic_semantic_core_v1';
  status: 'complete' | 'partial' | 'blocked';
  requiredFieldCount: number;
  verifiedFieldCount: number;
  provisionalFieldCount: number;
  missingFieldCount: number;
  coveragePercent: number;
  fields: Array<{
    key: string;
    status: SemanticFieldStatusV1;
    evidenceRefs: string[];
  }>;
  ignoredObservationCount: number;
  limitations: string[];
};

const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_IMAGE_FIELDS = [
  'subject',
  'composition',
  'geometry',
  'spatial_layout',
  'color_palette',
  'background',
  'style',
  'text_presence',
] as const;
const REQUIRED_GENERIC_FIELDS = ['subject', 'purpose', 'structure', 'key_attributes'] as const;
const TRUSTED_EVIDENCE = new Set<SemanticEvidenceClassV1>([
  'creator_confirmed', 'system_measured', 'independently_verified',
]);
const ALIASES: Record<string, string> = {
  subject: 'subject', identity: 'subject', object: 'subject', main_subject: 'subject',
  composition: 'composition', arrangement: 'composition', visual_composition: 'composition',
  geometry: 'geometry', shape: 'geometry', shapes: 'geometry',
  spatial_layout: 'spatial_layout', position: 'spatial_layout', placement: 'spatial_layout', layout: 'spatial_layout',
  color: 'color_palette', colors: 'color_palette', primary_colors: 'color_palette', color_palette: 'color_palette',
  background: 'background', background_color: 'background',
  style: 'style', art_style: 'style', visual_style: 'style',
  text_presence: 'text_presence', text: 'text_presence', typography: 'text_presence',
  purpose: 'purpose', intended_purpose: 'purpose',
  structure: 'structure', document_structure: 'structure',
  key_attributes: 'key_attributes', attributes: 'key_attributes', key_features: 'key_attributes',
};
const normalizeKey = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0 && value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return false;
};

/**
 * Deterministic, source-version-bound semantic coverage assessment.
 * AI observations count as provisional only; only trusted evidence classes can satisfy a required field.
 * This evaluates evidence coverage, not whether a model's interpretation is factually correct.
 */
export const assessVyralSemanticCompletenessV1 = (
  input: SemanticCompletenessInputV1,
): SemanticCompletenessResultV1 => {
  if (!input || typeof input.assetType !== 'string' || !input.assetType.trim() ||
      typeof input.sourceVersionId !== 'string' || !input.sourceVersionId.trim() ||
      typeof input.sourceSha256 !== 'string' || !SHA256.test(input.sourceSha256.toLowerCase()) ||
      !Array.isArray(input.observations)) {
    throw new Error('Semantic completeness assessment identity is invalid.');
  }
  const image = input.assetType.toLowerCase() === 'image' ||
    input.assetType.toLowerCase().startsWith('image/');
  const required = image ? REQUIRED_IMAGE_FIELDS : REQUIRED_GENERIC_FIELDS;
  const evidenceByField = new Map<string, { verified: string[]; provisional: string[]; notApplicable: string[] }>();
  for (const key of required) evidenceByField.set(key, { verified: [], provisional: [], notApplicable: [] });

  let ignoredObservationCount = 0;
  for (const observation of input.observations) {
    if (!observation || observation.sourceVersionId !== input.sourceVersionId ||
        observation.sourceSha256.toLowerCase() !== input.sourceSha256.toLowerCase() ||
        typeof observation.evidenceRef !== 'string' || !observation.evidenceRef.trim() ||
        !observation.fields || typeof observation.fields !== 'object' || Array.isArray(observation.fields) ||
        !['ai_observed', 'creator_confirmed', 'system_measured', 'independently_verified'].includes(observation.evidenceClass)) {
      ignoredObservationCount += 1;
      continue;
    }
    for (const [rawKey, rawValue] of Object.entries(observation.fields)) {
      const canonical = ALIASES[normalizeKey(rawKey)];
      if (!canonical || !evidenceByField.has(canonical)) continue;
      const target = evidenceByField.get(canonical)!;
      const fieldValue = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) &&
        Object.hasOwn(rawValue, 'value')
        ? (rawValue as Record<string, unknown>).value
        : rawValue;
      if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue) &&
          (fieldValue as Record<string, unknown>).status === 'not_applicable' &&
          TRUSTED_EVIDENCE.has(observation.evidenceClass)) {
        target.notApplicable.push(observation.evidenceRef);
        continue;
      }
      if (!hasMeaningfulValue(fieldValue)) continue;
      if (TRUSTED_EVIDENCE.has(observation.evidenceClass)) target.verified.push(observation.evidenceRef);
      else target.provisional.push(observation.evidenceRef);
    }
  }

  const fields = [...evidenceByField.entries()].map(([key, evidence]) => ({
    key,
    status: evidence.verified.length ? 'verified' as const
      : evidence.notApplicable.length ? 'not_applicable' as const
        : evidence.provisional.length ? 'provisional' as const : 'missing' as const,
    evidenceRefs: [...new Set([...evidence.verified, ...evidence.notApplicable, ...evidence.provisional])],
  }));
  const verifiedFieldCount = fields.filter((field) => field.status === 'verified' || field.status === 'not_applicable').length;
  const provisionalFieldCount = fields.filter((field) => field.status === 'provisional').length;
  const missingFieldCount = fields.filter((field) => field.status === 'missing').length;
  const coveragePercent = Math.round((verifiedFieldCount / required.length) * 10000) / 100;
  const status = verifiedFieldCount === required.length ? 'complete'
    : verifiedFieldCount + provisionalFieldCount === 0 ? 'blocked' : 'partial';

  return {
    version: VYRAL_SEMANTIC_COMPLETENESS_VERSION,
    profile: image ? 'raster_image_core_v1' : 'generic_semantic_core_v1',
    status,
    requiredFieldCount: required.length,
    verifiedFieldCount,
    provisionalFieldCount,
    missingFieldCount,
    coveragePercent,
    fields,
    ignoredObservationCount,
    limitations: [
      'Coverage measures evidence presence and source binding, not semantic truth or reconstruction accuracy.',
      'AI-only observations remain provisional and cannot complete a required field.',
      'Not-applicable declarations require trusted evidence and remain visible in the field report.',
    ],
  };
};
