export const VYRAL_ASSET_DNA_ASSESSMENT_VERSION = 1 as const;

export type VyralAssetDnaRecoveryLevel =
  | 'source_file_exact'
  | 'decoded_samples_exact'
  | 'semantic_only'
  | 'unavailable';

export type VyralAssetDnaAssessmentStatus = 'ready' | 'partial' | 'blocked';

export type VyralAssetDnaAssessmentInput = {
  assetId: string;
  assetVersionId: string;
  sourceSha256: string;
  sourceSizeBytes: number;
  dnaRecordId: string;
  dnaSchemaId: string;
  dnaSchemaVersion: number;
  dnaSource: {
    assetId: string;
    assetVersionId: string;
    sha256: string;
    sizeBytes: number;
  };
  structure: {
    schemaValid: boolean;
    provenanceVerified: boolean;
    knowledgeFactCount: number;
  };
  recovery: {
    declaredLevel: VyralAssetDnaRecoveryLevel;
    payloadPresent: boolean;
    payloadIntegrityVerified: boolean;
    exactTest: {
      status: 'passed' | 'failed' | 'not_run';
      mode: 'source_file_exact' | 'decoded_samples_exact' | null;
      assetVersionId: string;
      dnaRecordId: string;
      sourceSha256: string;
    } | null;
  };
};

export type VyralAssetDnaAssessment = {
  assessmentVersion: typeof VYRAL_ASSET_DNA_ASSESSMENT_VERSION;
  scope: 'asset_dna';
  identity: {
    assetId: string;
    assetVersionId: string;
    sourceSha256: string;
    dnaRecordId: string;
    dnaSchemaId: string;
    dnaSchemaVersion: number;
  };
  status: VyralAssetDnaAssessmentStatus;
  recoveryLevel: VyralAssetDnaRecoveryLevel;
  checks: {
    sourceBinding: 'pass' | 'fail';
    schemaValidity: 'pass' | 'fail';
    provenance: 'pass' | 'incomplete';
    knowledge: 'present' | 'missing';
    payloadIntegrity: 'pass' | 'fail' | 'not_applicable';
    exactReconstruction: 'pass' | 'fail' | 'not_tested';
  };
  blockers: string[];
  limitations: string[];
};

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const isRecoveryLevel = (value: unknown): value is VyralAssetDnaRecoveryLevel =>
  value === 'source_file_exact' || value === 'decoded_samples_exact' ||
  value === 'semantic_only' || value === 'unavailable';

/**
 * Deterministic Asset-DNA readiness assessment.
 * The caller MUST construct this input from owner-authorized, server-verified records.
 * This function does not authenticate evidence or award a collection quality grade.
 */
export const assessVyralAssetDnaV1 = (input: VyralAssetDnaAssessmentInput): VyralAssetDnaAssessment => {
  if (!input || !ID.test(input.assetId) || !ID.test(input.assetVersionId) ||
      !ID.test(input.dnaRecordId) || !ID.test(input.dnaSchemaId) ||
      !Number.isSafeInteger(input.dnaSchemaVersion) || input.dnaSchemaVersion < 1 ||
      !HASH.test(input.sourceSha256) || !Number.isSafeInteger(input.sourceSizeBytes) || input.sourceSizeBytes <= 0) {
    throw new Error('Asset DNA assessment identity is invalid.');
  }
  if (!input.structure || typeof input.structure.schemaValid !== 'boolean' ||
      typeof input.structure.provenanceVerified !== 'boolean' ||
      !Number.isSafeInteger(input.structure.knowledgeFactCount) || input.structure.knowledgeFactCount < 0 ||
      !input.recovery || typeof input.recovery.payloadPresent !== 'boolean' ||
      typeof input.recovery.payloadIntegrityVerified !== 'boolean' ||
      !isRecoveryLevel(input.recovery.declaredLevel)) {
    throw new Error('Asset DNA assessment evidence is malformed.');
  }

  const sourceBinding = input.dnaSource?.assetId === input.assetId &&
    input.dnaSource?.assetVersionId === input.assetVersionId &&
    input.dnaSource?.sha256?.toLowerCase() === input.sourceSha256 &&
    input.dnaSource?.sizeBytes === input.sourceSizeBytes;
  const blockers: string[] = [];
  const limitations: string[] = [];
  if (!sourceBinding) blockers.push('source_binding_mismatch');
  if (!input.structure.schemaValid) blockers.push('dna_schema_invalid');
  if (!input.structure.provenanceVerified) limitations.push('provenance_not_independently_verified');
  if (input.structure.knowledgeFactCount === 0) limitations.push('no_structured_knowledge_facts');

  let payloadIntegrity: VyralAssetDnaAssessment['checks']['payloadIntegrity'] = 'not_applicable';
  if (input.recovery.payloadPresent) {
    payloadIntegrity = input.recovery.payloadIntegrityVerified ? 'pass' : 'fail';
    if (!input.recovery.payloadIntegrityVerified) blockers.push('reconstruction_payload_integrity_unverified');
  } else if (input.recovery.declaredLevel === 'source_file_exact' || input.recovery.declaredLevel === 'decoded_samples_exact') {
    payloadIntegrity = 'fail';
    blockers.push('declared_reconstruction_payload_missing');
  }

  let exactReconstruction: VyralAssetDnaAssessment['checks']['exactReconstruction'] = 'not_tested';
  const test = input.recovery.exactTest;
  if (test) {
    const testPinned = test.assetVersionId === input.assetVersionId &&
      test.dnaRecordId === input.dnaRecordId &&
      test.sourceSha256?.toLowerCase() === input.sourceSha256;
    if (!testPinned) {
      blockers.push('reconstruction_test_snapshot_mismatch');
      exactReconstruction = 'fail';
    } else if (test.status === 'failed') {
      exactReconstruction = 'fail';
      blockers.push('exact_reconstruction_test_failed');
    } else if (test.status === 'passed' && test.mode === input.recovery.declaredLevel &&
        (test.mode === 'source_file_exact' || test.mode === 'decoded_samples_exact') &&
        input.recovery.payloadPresent && input.recovery.payloadIntegrityVerified) {
      exactReconstruction = 'pass';
    } else if (test.status === 'passed') {
      exactReconstruction = 'fail';
      blockers.push('reconstruction_test_mode_or_payload_mismatch');
    }
  }

  if (input.recovery.declaredLevel === 'source_file_exact' && exactReconstruction !== 'pass') {
    limitations.push('source_file_exact_claim_not_test_verified');
  }
  if (input.recovery.declaredLevel === 'decoded_samples_exact') {
    limitations.push('decoded_sample_recovery_does_not_restore_original_encoded_file_bytes');
  }
  if (input.recovery.declaredLevel === 'semantic_only') limitations.push('semantic_description_is_not_binary_reconstruction');
  if (input.recovery.declaredLevel === 'unavailable') limitations.push('no_reconstruction_payload_available');

  const status: VyralAssetDnaAssessmentStatus = blockers.length
    ? 'blocked'
    : limitations.length
      ? 'partial'
      : 'ready';

  return {
    assessmentVersion: VYRAL_ASSET_DNA_ASSESSMENT_VERSION,
    scope: 'asset_dna',
    identity: {
      assetId: input.assetId,
      assetVersionId: input.assetVersionId,
      sourceSha256: input.sourceSha256,
      dnaRecordId: input.dnaRecordId,
      dnaSchemaId: input.dnaSchemaId,
      dnaSchemaVersion: input.dnaSchemaVersion,
    },
    status,
    recoveryLevel: input.recovery.declaredLevel,
    checks: {
      sourceBinding: sourceBinding ? 'pass' : 'fail',
      schemaValidity: input.structure.schemaValid ? 'pass' : 'fail',
      provenance: input.structure.provenanceVerified ? 'pass' : 'incomplete',
      knowledge: input.structure.knowledgeFactCount > 0 ? 'present' : 'missing',
      payloadIntegrity,
      exactReconstruction,
    },
    blockers: [...new Set(blockers)],
    limitations: [...new Set(limitations)],
  };
};
