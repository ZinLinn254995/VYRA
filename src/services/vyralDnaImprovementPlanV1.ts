export type VyralDnaImprovementPriorityV1 = 'critical' | 'high' | 'medium';
export type VyralDnaImprovementV1 = {
  code: string;
  priority: VyralDnaImprovementPriorityV1;
  target: 'source_binding' | 'source_integrity' | 'schema' | 'provenance' | 'knowledge' | 'payload' | 'reconstruction';
  action: string;
  acceptanceEvidence: string;
};

const RULES: Record<string, VyralDnaImprovementV1> = {
  source_binding_mismatch: {
    code: 'source_binding_mismatch', priority: 'critical', target: 'source_binding',
    action: 'Rebind this DNA record to the exact Asset ID, Version ID, byte length and SHA-256; do not reuse observations from another version.',
    acceptanceEvidence: 'Asset, Version and DNA source identifiers, size and SHA-256 match exactly.',
  },
  source_file_storage_integrity_unverified: {
    code: 'source_file_storage_integrity_unverified', priority: 'critical', target: 'source_integrity',
    action: 'Verify the original stored file bytes against the immutable Asset Version size and SHA-256 before assessing reconstruction.',
    acceptanceEvidence: 'Downloaded source byte length and computed SHA-256 match the pinned Asset Version.',
  },
  dna_schema_invalid: {
    code: 'dna_schema_invalid', priority: 'high', target: 'schema',
    action: 'Repair the DNA record to the declared schema version and rerun deterministic schema validation.',
    acceptanceEvidence: 'Schema validator passes with no missing required fields or invalid field types.',
  },
  reconstruction_payload_integrity_unverified: {
    code: 'reconstruction_payload_integrity_unverified', priority: 'critical', target: 'payload',
    action: 'Regenerate or re-upload the reconstruction payload, then verify every chunk/tile hash, byte length and complete payload coverage.',
    acceptanceEvidence: 'All payload component hashes and aggregate integrity checks pass.',
  },
  declared_reconstruction_payload_missing: {
    code: 'declared_reconstruction_payload_missing', priority: 'high', target: 'payload',
    action: 'Generate the payload required by the declared recovery level, or downgrade the recovery declaration to the level actually supported.',
    acceptanceEvidence: 'Declared recovery level is backed by a present, validated payload.',
  },
  reconstruction_test_snapshot_mismatch: {
    code: 'reconstruction_test_snapshot_mismatch', priority: 'critical', target: 'reconstruction',
    action: 'Discard this test as evidence for the current snapshot and rerun against the exact Asset Version, DNA record and source SHA-256.',
    acceptanceEvidence: 'Test record pins the current Asset Version ID, DNA record ID and source SHA-256.',
  },
  exact_reconstruction_test_failed: {
    code: 'exact_reconstruction_test_failed', priority: 'high', target: 'reconstruction',
    action: 'Compare the failed output with the source using modality-specific metrics; update only DNA fields supported by measured differences, then create a new DNA version.',
    acceptanceEvidence: 'A new-version reconstruction test passes the predeclared exactness criteria; prior DNA and attempt records remain unchanged.',
  },
  reconstruction_test_mode_or_payload_mismatch: {
    code: 'reconstruction_test_mode_or_payload_mismatch', priority: 'high', target: 'reconstruction',
    action: 'Align the declared recovery level, test mode and actual payload type; never use decoded-sample success to claim original-file byte recovery.',
    acceptanceEvidence: 'Test mode equals the declared recovery level and the payload proves that level.',
  },
};

export type VyralDnaImprovementPlanV1 = {
  planVersion: 1;
  sourceAssessmentVersion: number;
  sourceIdentity: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string };
  improvements: VyralDnaImprovementV1[];
  informational: string[];
  safety: string[];
};

/**
 * Convert deterministic assessment findings into a reviewable plan.
 * This is advisory only: it never edits or overwrites canonical DNA.
 */
export const buildVyralDnaImprovementPlanV1 = (assessment: {
  assessmentVersion: number;
  identity: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string };
  blockers: string[];
  limitations: string[];
}): VyralDnaImprovementPlanV1 => {
  const improvements = assessment.blockers
    .map((code) => RULES[code])
    .filter((item): item is VyralDnaImprovementV1 => Boolean(item));
  const informational: string[] = [];
  if (assessment.limitations.includes('provenance_not_independently_verified')) {
    informational.push('Collect independent provenance evidence; creator declarations alone do not establish source history.');
  }
  if (assessment.limitations.includes('no_structured_knowledge_facts')) {
    informational.push('Capture verifiable structured facts at generation or upload time, with observation source and confidence.');
  }
  if (assessment.limitations.includes('decoded_sample_recovery_does_not_restore_original_encoded_file_bytes')) {
    informational.push('Decoded-sample exactness is not original-file byte exactness. Keep the recovery claim explicitly limited.');
  }
  if (assessment.limitations.includes('semantic_description_is_not_binary_reconstruction')) {
    informational.push('Semantic DNA may guide regeneration but does not contain a verified binary reconstruction payload.');
  }
  if (assessment.limitations.includes('source_file_exact_claim_not_test_verified')) {
    informational.push('Do not advertise source-file exact recovery until a byte-exact test passes for this snapshot.');
  }
  return {
    planVersion: 1,
    sourceAssessmentVersion: assessment.assessmentVersion,
    sourceIdentity: { ...assessment.identity },
    improvements,
    informational,
    safety: [
      'This plan is advisory and requires review; it does not mutate Asset DNA.',
      'Any accepted change must create a new immutable DNA version linked to the same or explicitly updated Asset Version.',
      'Reassess and retest the new snapshot; never rewrite historical assessments or reconstruction attempts.',
      'Unknown blocker codes are not silently interpreted or auto-fixed.',
    ],
  };
};
