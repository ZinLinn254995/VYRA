import type {
  VyralMasterDnaV1,
  VyralMasterDnaAsset,
} from './vyralMasterDnaV1.ts';
import type {
  VyralQualityEvidenceClass,
  VyralQualityRuleFinding,
  VyralQualityStandardProfile,
} from './vyralQualityGradingV1.ts';

type SnapshotAsset = VyralMasterDnaAsset & {
  source_sha256: string | null;
};

type FingerprintRecord = {
  id: string;
  asset_id: string;
  asset_version_id: string;
  fingerprint_kind: string;
  algorithm: string;
  value: string;
  metadata: Record<string, unknown>;
};

type ReconstructionRecord = {
  id: string;
  asset_id: string;
  asset_version_id: string;
  dna_record_id: string;
  comparison_mode: string;
  test_status: string;
  exact_match: boolean | null;
  model_id: string;
  created_at: string;
};

type VisionObservationRecord = {
  id: string;
  asset_id: string;
  asset_version_id: string;
  verification_status: string;
  source_sha256: string | null;
};

type EvidenceKey = NonNullable<import('./vyralQualityGradingV1.ts').VyralQualityRule['evidenceKey']>;
type EvidenceSource = FingerprintRecord | ReconstructionRecord | VisionObservationRecord;

const EXPECTED_CLASS: Record<EvidenceKey, VyralQualityEvidenceClass> = {
  'snapshot.integrity': 'deterministic',
  'fingerprint.cryptographic': 'deterministic',
  'reconstruction.byte_exact': 'generation_test',
  'reconstruction.decoded_exact': 'generation_test',
  'vision.corroborated': 'ai_assessment',
};

const TRUSTED_RECONSTRUCTION_VERIFIERS: Record<'byte_exact' | 'decoded_exact', Set<string>> = {
  byte_exact: new Set(['universal-file-dna-v1-readback-verifier']),
  decoded_exact: new Set(['vyral-dna-v3-readback-verifier', 'ORIGIN-01-readback-verifier']),
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const versionKey = (assetId: string, versionId: string) => assetId + ':' + versionId;

const evidenceForRule = (
  key: EvidenceKey,
  assets: SnapshotAsset[],
  fingerprints: FingerprintRecord[],
  reconstructionTests: ReconstructionRecord[],
  visionObservations: VisionObservationRecord[],
  masterDnaRevisionId: string,
): VyralQualityRuleFinding => {
  const refs: string[] = [];
  if (key === 'snapshot.integrity') {
    return {
      ruleId: '', evidenceClass: 'deterministic', status: 'pass',
      evidenceRefs: [masterDnaRevisionId],
      explanation: 'The Master DNA snapshot was loaded from its immutable owner-scoped revision record and validated before evaluation.',
    };
  }
  let failed = false;
  let complete = true;

  for (const asset of assets) {
    const target = versionKey(asset.asset_id, asset.asset_version_id);

    if (key === 'fingerprint.cryptographic') {
      const matches = fingerprints.filter((row) =>
        versionKey(row.asset_id, row.asset_version_id) === target &&
        row.fingerprint_kind === 'cryptographic' &&
        row.algorithm.toLowerCase().replace(/[^a-z0-9]/g, '') === 'sha256' &&
        asset.source_sha256 !== null && row.value === asset.source_sha256 &&
        row.metadata?.verification_status === 'server_verified' &&
        row.metadata?.verified_by === 'verify-vyral-asset' &&
        ['matched', 'baseline_created'].includes(String(row.metadata?.comparison_status)) &&
        Number.isSafeInteger(Number(row.metadata?.actual_size_bytes)) && Number(row.metadata?.actual_size_bytes) >= 0
      );
      if (matches.length > 1) throw new Error(`Ambiguous cryptographic fingerprint evidence for Asset ${asset.asset_id}.`);
      if (matches.length === 0) complete = false;
      else refs.push(matches[0].id);
      continue;
    }

    if (key === 'reconstruction.byte_exact' || key === 'reconstruction.decoded_exact') {
      const mode = key === 'reconstruction.byte_exact' ? 'byte_exact' : 'decoded_exact';
      const matches = reconstructionTests.filter((row) =>
        versionKey(row.asset_id, row.asset_version_id) === target &&
        row.dna_record_id === asset.dna_ref.record_id &&
        row.comparison_mode === mode &&
        TRUSTED_RECONSTRUCTION_VERIFIERS[mode].has(row.model_id)
      );
      if (matches.some((row) => !Number.isFinite(Date.parse(row.created_at)))) {
        throw new Error(`Malformed reconstruction evidence timestamp for Asset ${asset.asset_id}.`);
      }
      // Historical failures must not permanently override a newer successful retest.
      // Resolve the latest result per trusted verifier; equal timestamps are ambiguous.
      const latestByVerifier = new Map<string, ReconstructionRecord>();
      for (const row of matches) {
        const previous = latestByVerifier.get(row.model_id);
        if (!previous || Date.parse(row.created_at) > Date.parse(previous.created_at)) {
          latestByVerifier.set(row.model_id, row);
        } else if (Date.parse(row.created_at) === Date.parse(previous.created_at)) {
          throw new Error(`Ambiguous latest reconstruction evidence for Asset ${asset.asset_id}.`);
        }
      }
      const latest = [...latestByVerifier.values()];
      if (latest.some((row) => row.test_status === 'failed' && row.exact_match === false)) {
        failed = true;
        refs.push(...latest.filter((row) => row.test_status === 'failed' && row.exact_match === false).map((row) => row.id));
        continue;
      }
      const passed = latest.filter((row) => row.test_status === 'passed' && row.exact_match === true);
      if (passed.length === 0) complete = false;
      else refs.push(...passed.map((row) => row.id));
      continue;
    }

    const matches = visionObservations.filter((row) =>
      versionKey(row.asset_id, row.asset_version_id) === target &&
      asset.source_sha256 !== null && row.source_sha256 === asset.source_sha256 &&
      ['corroborated', 'independently_verified'].includes(row.verification_status)
    );
    if (matches.length === 0) complete = false;
    else refs.push(...matches.map((row) => row.id));
  }

  const evidenceClass = EXPECTED_CLASS[key];
  const status = failed ? 'fail' : complete && assets.length > 0 ? 'pass' : 'not_evaluated';
  return {
    ruleId: '',
    evidenceClass,
    status,
    evidenceRefs: refs,
    explanation: status === 'pass'
      ? 'Trusted evidence covers every Asset Version in this immutable snapshot.'
      : status === 'fail'
        ? 'At least one Asset Version has a failed trusted exact-reconstruction test.'
        : 'Trusted evidence is missing for one or more Asset Versions in this snapshot.',
  };
};

/**
 * Build findings only from rows fetched server-side with explicit Vyral, owner,
 * Asset and exact Asset Version filters. This function does not authenticate
 * arbitrary client input; do not expose its row arguments to browsers.
 */
export const buildVyralTrustedEvidenceFindingsV1 = (input: {
  masterDna: VyralMasterDnaV1;
  profile: VyralQualityStandardProfile;
  masterDnaRevisionId: string;
  assetVersions: Array<{ asset_id: string; asset_version_id: string; sha256: string | null }>;
  fingerprints: FingerprintRecord[];
  reconstructionTests: ReconstructionRecord[];
  visionObservations: VisionObservationRecord[];
}): VyralQualityRuleFinding[] => {
  if (!input.masterDnaRevisionId || typeof input.masterDnaRevisionId !== 'string') {
    throw new Error('An immutable Master DNA revision identity is required for trusted evidence.');
  }
  const snapshotAssets = input.masterDna.assets.map((asset): SnapshotAsset => {
    const versions = input.assetVersions.filter((row) =>
      row.asset_id === asset.asset_id && row.asset_version_id === asset.asset_version_id
    );
    if (versions.length !== 1) {
      throw new Error(`Exact immutable Asset Version is missing or ambiguous for Asset ${asset.asset_id}.`);
    }
    if (versions[0].sha256 !== null && !isSha256(versions[0].sha256)) {
      throw new Error(`Exact immutable Asset Version SHA-256 is malformed for Asset ${asset.asset_id}.`);
    }
    return { ...asset, source_sha256: versions[0].sha256 };
  });

  const sources: EvidenceSource[] = [
    ...input.fingerprints,
    ...input.reconstructionTests,
    ...input.visionObservations,
  ];
  const assetVersions = new Set(snapshotAssets.map((asset) => versionKey(asset.asset_id, asset.asset_version_id)));
  for (const row of sources) {
    if (!assetVersions.has(versionKey(row.asset_id, row.asset_version_id))) {
      throw new Error('Trusted evidence contains a row outside the exact Master DNA Asset Version snapshot.');
    }
    if (!row.id || typeof row.id !== 'string') throw new Error('Trusted evidence row is missing its database identity.');
  }

  const findings: VyralQualityRuleFinding[] = [];
  for (const rule of input.profile.rules) {
    if (!rule.evidenceKey) continue;
    if (rule.evidenceClass !== EXPECTED_CLASS[rule.evidenceKey]) {
      throw new Error(`Quality rule ${rule.id} uses an incompatible evidence class for ${rule.evidenceKey}.`);
    }
    const finding = evidenceForRule(
      rule.evidenceKey,
      snapshotAssets,
      input.fingerprints,
      input.reconstructionTests,
      input.visionObservations,
      input.masterDnaRevisionId,
    );
    findings.push({ ...finding, ruleId: rule.id });
  }
  return findings;
};
