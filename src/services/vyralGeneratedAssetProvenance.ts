export type VyralGeneratedAssetTask = 'image' | 'video' | 'audio' | 'video-edit';

export type VyralGeneratedAssetProvenanceInput = {
  generationJobId: string;
  task: VyralGeneratedAssetTask;
  provider: string;
  model: string;
  requestFingerprint: string;
  promptSha256: string;
  generationId?: string | null;
  quoteId?: string | null;
  actualCostUsd?: number | null;
};

export type VyralGeneratedAssetProvenance = {
  schema: 'vyra.generated-asset-provenance';
  schemaVersion: 1;
  generationJobId: string;
  task: VyralGeneratedAssetTask;
  provider: string;
  model: string;
  requestFingerprint: string;
  promptSha256: string;
  generationId: string | null;
  quoteId: string | null;
  actualCostUsd: number | null;
};

export type VyralGeneratedAssetMetadata = {
  upload_source: 'media_generation';
  hash_algorithm: 'SHA-256';
  visibility: 'private';
  generation_provenance: VyralGeneratedAssetProvenance;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const SAFE_MODEL_ID = /^[a-z0-9][a-z0-9._:/-]{0,159}$/i;
const SAFE_GENERATION_ID = /^[a-z0-9][a-z0-9._:-]{0,199}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates the immutable provenance attached to a generated Vyral Asset.
 * Raw prompts, credentials, and provider responses are intentionally excluded;
 * the prompt digest is linked to the source-bound DNA/observation record.
 */
export function buildVyralGeneratedAssetMetadata(
  input: VyralGeneratedAssetProvenanceInput,
): VyralGeneratedAssetMetadata {
  if (!isRecord(input)) throw new Error('Generated Asset provenance must be an object.');
  if (!UUID.test(input.generationJobId)) throw new Error('Generation job ID must be a UUID.');
  if (!['image', 'video', 'audio', 'video-edit'].includes(input.task)) {
    throw new Error('Generated Asset task is not supported.');
  }
  if (typeof input.provider !== 'string' || !SAFE_PROVIDER_ID.test(input.provider.trim())) {
    throw new Error('Provider identifier is invalid.');
  }
  if (typeof input.model !== 'string' || !SAFE_MODEL_ID.test(input.model.trim())) {
    throw new Error('Model identifier is invalid.');
  }
  if (typeof input.requestFingerprint !== 'string' || !SHA256.test(input.requestFingerprint)) {
    throw new Error('Request fingerprint must be a SHA-256 digest.');
  }
  if (typeof input.promptSha256 !== 'string' || !SHA256.test(input.promptSha256)) {
    throw new Error('Prompt digest must be a SHA-256 digest.');
  }
  const generationId = input.generationId ?? null;
  if (generationId !== null && (typeof generationId !== 'string' || !SAFE_GENERATION_ID.test(generationId))) {
    throw new Error('Provider generation ID is invalid.');
  }
  const quoteId = input.quoteId ?? null;
  if (quoteId !== null && (typeof quoteId !== 'string' || !UUID.test(quoteId))) {
    throw new Error('Media quote ID must be a UUID.');
  }
  const actualCostUsd = input.actualCostUsd ?? null;
  if (actualCostUsd !== null && (typeof actualCostUsd !== 'number' || !Number.isFinite(actualCostUsd) || actualCostUsd < 0)) {
    throw new Error('Actual provider cost must be a finite non-negative USD amount.');
  }

  return {
    upload_source: 'media_generation',
    hash_algorithm: 'SHA-256',
    visibility: 'private',
    generation_provenance: {
      schema: 'vyra.generated-asset-provenance',
      schemaVersion: 1,
      generationJobId: input.generationJobId,
      task: input.task,
      provider: input.provider.trim(),
      model: input.model.trim(),
      requestFingerprint: input.requestFingerprint.toLowerCase(),
      promptSha256: input.promptSha256.toLowerCase(),
      generationId,
      quoteId,
      actualCostUsd,
    },
  };
}

/** Build the database row's lineage fields without inventing a parent Asset. */
export function buildVyralGeneratedAssetLineage(input: {
  generationJobId: string;
  parentAssetId?: string | null;
  childAssetId: string;
  relationKind?: 'generated_from' | 'edited_from' | 'derived_from' | 'variant_of';
}) {
  if (!UUID.test(input.generationJobId) || !UUID.test(input.childAssetId)) {
    throw new Error('Generation lineage requires valid job and child Asset UUIDs.');
  }
  if (input.parentAssetId != null && (!UUID.test(input.parentAssetId) || input.parentAssetId === input.childAssetId)) {
    throw new Error('Generation lineage parent Asset ID is invalid.');
  }
  if (input.parentAssetId == null) return null;
  return {
    parent_asset_id: input.parentAssetId,
    child_asset_id: input.childAssetId,
    relation_kind: input.relationKind ?? 'generated_from',
    generation_job_id: input.generationJobId,
  } as const;
}
