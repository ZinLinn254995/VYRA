export type VyralReconstructionAttemptV1 = {
  id: string;
  model_provider?: string | null;
  model_id?: string | null;
  model_version?: string | null;
  test_status?: string | null;
  exact_match?: boolean | null;
  similarity_score?: number | null;
  blindness_status?: string | null;
  prompt_sha256?: string | null;
  tool_access?: Record<string, unknown> | null;
  attempt_evidence?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type VyralReconstructionEvidenceSummaryV1 = {
  totalAttempts: number;
  exactMatches: number;
  failed: number;
  inconclusive: number;
  bestSimilarity: number | null;
  evidenceGaps: string[];
  interpretation: string[];
  nextActions: string[];
};

/**
 * Summarize recorded attempts without turning similarity into an exact pass,
 * treating missing metadata as success, or modifying canonical DNA.
 */
export const summarizeVyralReconstructionEvidenceV1 = (
  attempts: VyralReconstructionAttemptV1[],
): VyralReconstructionEvidenceSummaryV1 => {
  const exactMatches = attempts.filter((item) => item.exact_match === true).length;
  const failed = attempts.filter((item) => item.test_status === 'failed').length;
  const inconclusive = attempts.filter((item) => item.test_status === 'inconclusive').length;
  const similarities = attempts
    .map((item) => item.similarity_score)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
  const bestSimilarity = similarities.length ? Math.max(...similarities) : null;
  const evidenceGaps = new Set<string>();

  if (attempts.length === 0) evidenceGaps.add('no_reconstruction_attempts');
  if (attempts.some((item) => !item.model_version)) evidenceGaps.add('model_version_missing');
  if (attempts.some((item) => !item.prompt_sha256)) evidenceGaps.add('prompt_hash_missing');
  if (attempts.some((item) => !item.tool_access || Object.keys(item.tool_access).length === 0)) evidenceGaps.add('tool_access_missing');
  if (attempts.some((item) => item.blindness_status !== 'independently_verified')) evidenceGaps.add('blindness_not_independently_verified');
  if (attempts.some((item) => {
    const evidence = item.attempt_evidence && typeof item.attempt_evidence === 'object' ? item.attempt_evidence : {};
    const blindness = evidence.blindness && typeof evidence.blindness === 'object' ? evidence.blindness as Record<string, unknown> : {};
    const packageAudit = blindness.packageAudit && typeof blindness.packageAudit === 'object' ? blindness.packageAudit as Record<string, unknown> : {};
    return blindness.scope !== 'semantic_only_no_media_payload' ||
      packageAudit.status !== 'passed' ||
      packageAudit.acceptedAsSemanticOnly !== true ||
      packageAudit.originalBinaryPayloadEntries !== 0 ||
      typeof packageAudit.packageSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(packageAudit.packageSha256);
  })) evidenceGaps.add('semantic_package_audit_missing_or_invalid');
  if (attempts.length > 0 && attempts.length < 3) evidenceGaps.add('fewer_than_three_attempts');

  const interpretation = [
    'Exact match is counted only when the comparator explicitly records exact_match=true.',
    'Similarity is a separate metric and cannot promote a failed or non-exact attempt to a pass.',
    'Creator attestation is not independent proof that the original Asset was withheld.',
    'Evidence summaries do not modify Asset DNA or Master DNA.',
  ];
  const nextActions: string[] = [];
  if (attempts.length === 0) {
    nextActions.push('Run at least three isolated DNA-only reconstruction attempts and record each output.');
  } else {
    if (evidenceGaps.has('model_version_missing')) nextActions.push('Record the exact model version for every new attempt.');
    if (evidenceGaps.has('prompt_hash_missing')) nextActions.push('Record the SHA-256 hash of the exact reconstruction prompt.');
    if (evidenceGaps.has('tool_access_missing')) nextActions.push('Record whether browsing, file access, code execution, and external retrieval were available.');
    if (evidenceGaps.has('semantic_package_audit_missing_or_invalid')) nextActions.push('Attach the semantic-only package audit SHA-256 and zero-binary-entry report to every attempt.');
    if (evidenceGaps.has('blindness_not_independently_verified')) nextActions.push('Use an independently controlled clean-session protocol to verify that the original Asset was not exposed.');
    if (evidenceGaps.has('fewer_than_three_attempts')) nextActions.push('Collect at least three independent attempts before drawing a model-level conclusion.');
    if (exactMatches < attempts.length) nextActions.push('Inspect failed outputs by modality and improve only the DNA fields linked to measured errors; preserve the prior DNA version.');
  }
  return {
    totalAttempts: attempts.length,
    exactMatches,
    failed,
    inconclusive,
    bestSimilarity,
    evidenceGaps: [...evidenceGaps],
    interpretation,
    nextActions,
  };
};
