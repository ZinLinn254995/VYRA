import type { UniverseKnowledgeRecord } from './universeConsistencyResolver.ts';

export interface AssetDnaKnowledgeSource {
  assetId: string;
  assetVersionId: string;
  assetDnaRecordId: string;
  revision: number;
  sourceSha256: string;
  payload: unknown;
}

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Projects only source-version-pinned Asset DNA facts into Universe Knowledge.
 * Creator-confirmed observations remain creator-declared evidence; they are
 * never upgraded to independently verified visual facts by this adapter.
 */
export function buildUniverseKnowledgeFromAssetDna(
  source: AssetDnaKnowledgeSource,
): UniverseKnowledgeRecord[] {
  if (!source.assetId.trim() || !source.assetVersionId.trim() ||
      !source.assetDnaRecordId.trim() || !Number.isInteger(source.revision) ||
      source.revision < 1 || !/^[a-f0-9]{64}$/i.test(source.sourceSha256)) {
    throw new Error('Asset DNA source identity, revision, or SHA-256 is invalid.');
  }
  const wrapper = isRecord(source.payload) ? source.payload : {};
  const dna = isRecord(wrapper.dna_record) ? wrapper.dna_record : wrapper;
  if (dna.schema_id !== 'vyra.asset-semantic-dna' || dna.schema_version !== 1) {
    throw new Error('A supported Asset Semantic DNA v1 record is required.');
  }
  const dnaSource = isRecord(dna.source) ? dna.source : {};
  if (dnaSource.asset_id !== source.assetId ||
      dnaSource.asset_version_id !== source.assetVersionId ||
      typeof dnaSource.sha256 !== 'string' ||
      dnaSource.sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
    throw new Error('Asset DNA is not bound to the exact canonical Asset version and SHA-256.');
  }

  const records: UniverseKnowledgeRecord[] = [];
  const identity = isRecord(dna.identity) ? dna.identity : {};
  const description = isRecord(dna.creator_description) ? dna.creator_description : {};
  const technical = isRecord(dna.technical_metadata) ? dna.technical_metadata : {};
  const base = {
    subjectId: source.assetId,
    scope: 'asset' as const,
    appliesToAssetIds: [source.assetId],
    sourceAssetIds: [source.assetId],
    revision: source.revision,
  };
  const add = (
    suffix: string,
    predicate: string,
    value: unknown,
    evidenceClass: UniverseKnowledgeRecord['evidenceClass'],
    strength: UniverseKnowledgeRecord['strength'] = 'preferred',
  ) => {
    if (value === null || value === undefined || value === '') return;
    records.push({
      ...base,
      id: source.assetDnaRecordId + ':' + suffix,
      predicate,
      value,
      evidenceClass,
      status: 'accepted',
      strength,
    });
  };

  add('identity-name', 'identity.name', text(identity.name), 'deterministic', 'preferred');
  add('identity-type', 'identity.asset_type', text(identity.asset_type), 'deterministic', 'preferred');
  if (description.evidence_status === 'creator_declared') {
    add('creator-description', 'creator.description', text(description.text), 'creator_declared', 'preferred');
  }

  const technicalFacts: Array<[string, unknown]> = [
    ['technical.width', technical.width],
    ['technical.height', technical.height],
    ['technical.color_space', technical.color_space],
    ['technical.channel_layout', technical.channel_layout],
    ['technical.decoded_samples_sha256', technical.decoded_samples_sha256],
  ];
  for (const [predicate, value] of technicalFacts) {
    if (value !== null && value !== undefined) add(predicate, predicate, value, 'deterministic', 'flexible');
  }

  const observations = Array.isArray(dna.creator_confirmed_observations)
    ? dna.creator_confirmed_observations
    : [];
  for (const raw of observations) {
    if (!isRecord(raw) || !isRecord(raw.evidence)) continue;
    if (raw.source_asset_version_id !== source.assetVersionId ||
        typeof raw.source_sha256 !== 'string' ||
        raw.source_sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
      throw new Error('Creator-confirmed observation is not pinned to the exact source Asset version.');
    }
    const observationId = text(raw.observation_id);
    const taskKind = text(raw.task_kind);
    if (!observationId || !taskKind) throw new Error('Creator-confirmed observation identity is incomplete.');
    add('observation-' + observationId, 'observation.' + taskKind, raw.evidence, 'creator_declared', 'preferred');
  }

  return records;
}
