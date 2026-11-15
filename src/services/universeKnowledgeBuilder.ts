import type { UniverseKnowledgeRecord } from './universeConsistencyResolver.ts';
import { validateVyralSemanticDnaV1 } from './vyralSemanticDnaV1.ts';
import { validateVyralDnaV3Record } from './vyralDnaV3.ts';
import { validateVyralFileDnaV1Record } from './vyralFileDnaV1.ts';

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
 * Projects supported, source-version-pinned Asset DNA into Universe Knowledge.
 * Semantic observations remain creator-declared; binary/container measurements
 * remain deterministic facts. This adapter never upgrades evidence strength.
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
  const rawDna = isRecord(wrapper.dna_record) ? wrapper.dna_record : wrapper;
  const schemaId = rawDna.schema_id;
  const records: UniverseKnowledgeRecord[] = [];
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

  if (schemaId === 'vyra.asset-semantic-dna') {
    const dna = validateVyralSemanticDnaV1(rawDna);
    if (dna.source.asset_id !== source.assetId ||
        dna.source.asset_version_id !== source.assetVersionId ||
        dna.source.sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
      throw new Error('Asset DNA is not bound to the exact canonical Asset version and SHA-256.');
    }
    add('identity-name', 'identity.name', text(dna.identity.name), 'creator_declared');
    add('identity-type', 'identity.asset_type', text(dna.identity.asset_type), 'creator_declared');
    if (dna.creator_description.evidence_status === 'creator_declared') {
      add('creator-description', 'creator.description', text(dna.creator_description.text), 'creator_declared');
    }
    const technicalFacts: Array<[string, unknown]> = [
      ['technical.width', dna.technical_metadata.width],
      ['technical.height', dna.technical_metadata.height],
      ['technical.color_space', dna.technical_metadata.color_space],
      ['technical.channel_layout', dna.technical_metadata.channel_layout],
      ['technical.decoded_samples_sha256', dna.technical_metadata.decoded_samples_sha256],
    ];
    for (const [predicate, value] of technicalFacts) {
      if (value !== null && value !== undefined) add(predicate, predicate, value, 'deterministic', 'flexible');
    }
    for (const observation of dna.creator_confirmed_observations) {
      if (observation.source_asset_version_id !== source.assetVersionId ||
          observation.source_sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
        throw new Error('Creator-confirmed observation is not pinned to the exact source Asset version.');
      }
      add(
        'observation-' + observation.observation_id,
        'observation.' + observation.task_kind,
        observation.evidence,
        'creator_declared',
        'preferred',
      );
    }
    return records;
  }

  if (schemaId === 'vyra.asset-dna') {
    const dna = validateVyralDnaV3Record(rawDna);
    if (dna.source.asset_id !== source.assetId ||
        dna.source.asset_version_id !== source.assetVersionId ||
        dna.source.sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
      throw new Error('Asset DNA is not bound to the exact canonical Asset version and SHA-256.');
    }
    add('decoded-width', 'technical.width', dna.decoded_image.width, 'deterministic', 'flexible');
    add('decoded-height', 'technical.height', dna.decoded_image.height, 'deterministic', 'flexible');
    add('decoded-channel-layout', 'technical.channel_layout', dna.decoded_image.channel_layout, 'deterministic', 'flexible');
    add('decoded-color-space', 'technical.color_space', dna.decoded_image.color_space, 'deterministic', 'flexible');
    add('decoded-samples-sha256', 'technical.decoded_samples_sha256', dna.decoded_image.decoded_samples_sha256, 'deterministic', 'flexible');
    add('lossless-tile-count', 'reconstruction.lossless_tile_count', dna.lossless_payload.tiles.length, 'deterministic', 'flexible');
    add('extractor', 'provenance.extractor', dna.extractor, 'deterministic', 'flexible');
    if (dna.encoded_file_payload) {
      add('encoded-source-chunk-count', 'reconstruction.encoded_source_chunk_count', dna.encoded_file_payload.chunks.length, 'deterministic', 'flexible');
    }
    return records;
  }

  if (schemaId === 'vyra.asset-file-dna') {
    const dna = validateVyralFileDnaV1Record(rawDna);
    if (dna.source.asset_id !== source.assetId ||
        dna.source.asset_version_id !== source.assetVersionId ||
        dna.file.sha256.toLowerCase() !== source.sourceSha256.toLowerCase()) {
      throw new Error('File DNA is not bound to the exact canonical Asset version and SHA-256.');
    }
    add('file-signature', 'file.format_signature', dna.file.format_signature, 'deterministic', 'flexible');
    add('file-mime-type', 'file.mime_type', dna.file.mime_type, 'deterministic', 'flexible');
    add('file-extension', 'file.extension', dna.file.extension, 'deterministic', 'flexible');
    if (dna.structure) {
      add('structure-profile', 'file.structure.profile', dna.structure.profile, 'deterministic', 'flexible');
      add('structure-status', 'file.structure.status', dna.structure.status, 'deterministic', 'flexible');
      for (const fact of dna.structure.facts) {
        add('structure-fact-' + fact.key, 'file.structure.' + fact.key, fact.value, 'deterministic', 'flexible');
      }
    }
    return records;
  }

  throw new Error('Unsupported Asset DNA schema; no Universe Knowledge was derived.');
}
