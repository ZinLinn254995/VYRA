export type RuntimeContextSource =
  | 'verified_asset_metadata'
  | 'verified_task_input'
  | 'verified_creator_context';

export type RuntimeContextEvidence = {
  sourceId: string;
  source: RuntimeContextSource;
  verificationStatus: 'verified';
  tags: string[];
};

export type ContextApplicability =
  | { status: 'not_evaluated'; reason: 'missing_decision_tags' | 'missing_runtime_evidence' | 'untrusted_runtime_evidence' | 'invalid_tags' }
  | { status: 'no_match'; matchedTags: string[]; missingTags: string[]; runtimeSourceId: string }
  | { status: 'match'; matchedTags: string[]; missingTags: []; runtimeSourceId: string };

const normalizeTag = (value: string): string => value.trim().normalize('NFC').toLowerCase();
const validTag = (value: string): boolean =>
  value.length >= 1 && value.length <= 64 && /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _-]*$/u.test(value);

/**
 * Deterministic exact-tag applicability check.
 *
 * IMPORTANT: runtime evidence must be loaded and verified by a trusted server
 * path before calling this helper. Do not pass arbitrary model output or
 * untrusted client-provided context as verified evidence.
 */
export function evaluateContextApplicability(
  requiredTags: unknown,
  runtimeEvidence: RuntimeContextEvidence | null | undefined,
): ContextApplicability {
  if (!Array.isArray(requiredTags) || requiredTags.length === 0) {
    return { status: 'not_evaluated', reason: 'missing_decision_tags' };
  }
  if (!runtimeEvidence) return { status: 'not_evaluated', reason: 'missing_runtime_evidence' };
  if (
    typeof runtimeEvidence.sourceId !== 'string' ||
    !runtimeEvidence.sourceId.trim() ||
    !['verified_asset_metadata', 'verified_task_input', 'verified_creator_context'].includes(runtimeEvidence.source) ||
    runtimeEvidence.verificationStatus !== 'verified' ||
    !Array.isArray(runtimeEvidence.tags)
  ) {
    return { status: 'not_evaluated', reason: 'untrusted_runtime_evidence' };
  }

  const normalizeList = (items: unknown[]): string[] | null => {
    if (items.some((item) => typeof item !== 'string')) return null;
    const normalized = (items as string[]).map(normalizeTag);
    if (normalized.some((tag) => !validTag(tag)) || new Set(normalized).size !== normalized.length) return null;
    return normalized;
  };

  const required = normalizeList(requiredTags);
  const runtime = normalizeList(runtimeEvidence.tags);
  if (!required || !runtime) return { status: 'not_evaluated', reason: 'invalid_tags' };

  const runtimeSet = new Set(runtime);
  const matchedTags = required.filter((tag) => runtimeSet.has(tag));
  const missingTags = required.filter((tag) => !runtimeSet.has(tag));
  if (missingTags.length) {
    return { status: 'no_match', matchedTags, missingTags, runtimeSourceId: runtimeEvidence.sourceId };
  }
  return { status: 'match', matchedTags, missingTags: [], runtimeSourceId: runtimeEvidence.sourceId };
}
