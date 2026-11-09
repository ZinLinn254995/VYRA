export const VYRAL_SEMANTIC_DNA_SCHEMA_ID = 'vyra.asset-semantic-dna' as const;
export const VYRAL_SEMANTIC_DNA_SCHEMA_VERSION = 1 as const;

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const cleanText = (value: unknown, max = 4000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const sanitizeSemanticEvidence = (value: unknown): Record<string, unknown> => {
  const forbiddenKeys = new Set([
    'image', 'image_url', 'image_uri', 'image_data', 'media', 'media_url', 'media_uri',
    'binary', 'binary_data', 'payload', 'raw_payload', 'encoded', 'encoded_bytes',
    'base64', 'data_url', 'bytes', 'file_bytes', 'file_data', 'storage_path',
    'signed_url', 'download_url', 'source_url', 'asset_url', 'tile', 'tiles',
    'samples', 'decoded_samples', 'pixel_buffer', 'audio_buffer', 'video_frames',
  ]);
  let nodes = 0;
  const visit = (item: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 2048 || depth > 8) throw new Error('Semantic DNA evidence exceeds the safe structured-data limits.');
    if (item === null || typeof item === 'boolean' || typeof item === 'number') {
      if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Semantic DNA evidence contains a non-finite number.');
      return item;
    }
    if (typeof item === 'string') {
      const text = item.trim();
      if (text.length > 4000 || /^data:/i.test(text) || /https?:\\/\\//i.test(text)) {
        throw new Error('Semantic DNA evidence cannot contain data URLs, remote media references, or oversized strings.');
      }
      return text;
    }
    if (Array.isArray(item)) {
      if (item.length > 128) throw new Error('Semantic DNA evidence contains an oversized list.');
      return item.map((child) => visit(child, depth + 1));
    }
    if (!isObject(item)) throw new Error('Semantic DNA evidence must be JSON-compatible structured data.');
    const entries = Object.entries(item);
    if (entries.length > 128) throw new Error('Semantic DNA evidence contains too many fields.');
    const output: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (forbiddenKeys.has(normalizedKey)) {
        throw new Error('Semantic DNA evidence cannot include media payloads or source-file references.');
      }
      output[key.slice(0, 128)] = visit(child, depth + 1);
    }
    return output;
  };
  const clean = visit(value, 0);
  if (!isObject(clean) || new TextEncoder().encode(JSON.stringify(clean)).byteLength > 32 * 1024) {
    throw new Error('Semantic DNA evidence must be an object no larger than 32 KiB.');
  }
  return clean;
};

export type VyralSemanticDnaObservation = {
  observation_id: string;
  review_id: string;
  task_kind: string;
  source_asset_version_id: string;
  source_sha256: string;
  evidence: Record<string, unknown>;
};

export type VyralSemanticDnaV1 = {
  schema_id: typeof VYRAL_SEMANTIC_DNA_SCHEMA_ID;
  schema_version: typeof VYRAL_SEMANTIC_DNA_SCHEMA_VERSION;
  record_id: string;
  source: {
    asset_id: string;
    asset_version_id: string;
    sha256: string;
    size_bytes: number;
    mime_type: string;
  };
  identity: {
    name: string;
    asset_type: string;
    original_filename: string | null;
  };
  creator_description: {
    text: string | null;
    evidence_status: 'creator_declared' | 'missing';
  };
  technical_metadata: {
    width: number | null;
    height: number | null;
    color_space: string | null;
    channel_layout: string | null;
    decoded_samples_sha256: string | null;
  };
  creator_confirmed_observations: VyralSemanticDnaObservation[];
  context: {
    vyral_name: string;
    vyral_description: string | null;
    purpose: string | null;
    intended_uses: string[];
  };
  reconstruction: {
    mode: 'semantic_generation';
    status: 'partial' | 'blocked';
    exact_binary_recovery: false;
    decoded_sample_payload_included: false;
    evidence_count: number;
    missing_information: string[];
    limitations: string[];
  };
};

export type CreateVyralSemanticDnaInput = {
  recordId: string;
  asset: {
    id: string;
    name: string;
    asset_type: string;
    original_filename?: string | null;
    description?: string | null;
    mime_type: string;
  };
  source: { assetVersionId: string; sha256: string; sizeBytes: number };
  technicalMetadata?: {
    width?: number | null;
    height?: number | null;
    colorSpace?: string | null;
    channelLayout?: string | null;
    decodedSamplesSha256?: string | null;
  };
  confirmedObservations?: Array<{
    observationId: string;
    reviewId: string;
    decision: string;
    taskKind: string;
    assetVersionId: string;
    sourceSha256: string;
    evidence: unknown;
  }>;
  context: {
    vyralName: string;
    vyralDescription?: string | null;
    purpose?: string | null;
    intendedUses?: string[];
  };
};

export const createVyralSemanticDnaV1 = (input: CreateVyralSemanticDnaInput): VyralSemanticDnaV1 => {
  if (!isObject(input) || !isObject(input.asset) || !isObject(input.source) || !isObject(input.context)) {
    throw new Error('Semantic DNA input must contain Asset, source, and Vyral context objects.');
  }
  if (!ID.test(input.recordId) || !ID.test(input.asset.id) || !ID.test(input.source.assetVersionId) ||
      !SHA256.test(input.source.sha256) || !Number.isSafeInteger(input.source.sizeBytes) || input.source.sizeBytes <= 0 ||
      !cleanText(input.asset.name, 255) || !cleanText(input.asset.asset_type, 64) ||
      !cleanText(input.asset.mime_type, 255) || !cleanText(input.context.vyralName, 255)) {
    throw new Error('Semantic DNA identity or source binding is invalid.');
  }
  const description = cleanText(input.asset.description);
  const technical = input.technicalMetadata ?? {};
  const nullableDimension = (value: number | null | undefined) =>
    value == null ? null : Number.isSafeInteger(value) && value > 0 ? value : (() => { throw new Error('Semantic DNA image dimensions must be positive integers.'); })();
  const observations: VyralSemanticDnaObservation[] = [];
  for (const raw of input.confirmedObservations ?? []) {
    if (raw.decision !== 'creator_confirmed') continue;
    if (!ID.test(raw.observationId) || !ID.test(raw.reviewId) || raw.assetVersionId !== input.source.assetVersionId ||
        raw.sourceSha256.toLowerCase() !== input.source.sha256.toLowerCase() || !isObject(raw.evidence)) {
      throw new Error('Creator-confirmed semantic evidence must be pinned to the exact source Asset Version and SHA-256.');
    }
    observations.push({
      observation_id: raw.observationId,
      review_id: raw.reviewId,
      task_kind: cleanText(raw.taskKind, 64) || 'unknown',
      source_asset_version_id: raw.assetVersionId,
      source_sha256: raw.sourceSha256.toLowerCase(),
      evidence: sanitizeSemanticEvidence(raw.evidence),
    });
  }
  const missing: string[] = [];
  if (!description) missing.push('creator_description');
  if (!observations.length) missing.push('creator_confirmed_visual_observations');
  if (input.asset.asset_type === 'image' && (technical.width == null || technical.height == null)) missing.push('image_dimensions');
  if (input.asset.asset_type === 'image' && !technical.colorSpace) missing.push('color_space');
  if (input.asset.asset_type === 'image' && !observations.length) missing.push('measured_visual_attributes');
  const evidenceCount = (description ? 1 : 0) + observations.length;
  return {
    schema_id: VYRAL_SEMANTIC_DNA_SCHEMA_ID,
    schema_version: VYRAL_SEMANTIC_DNA_SCHEMA_VERSION,
    record_id: input.recordId,
    source: {
      asset_id: input.asset.id,
      asset_version_id: input.source.assetVersionId,
      sha256: input.source.sha256.toLowerCase(),
      size_bytes: input.source.sizeBytes,
      mime_type: input.asset.mime_type.toLowerCase(),
    },
    identity: {
      name: cleanText(input.asset.name, 255),
      asset_type: cleanText(input.asset.asset_type, 64),
      original_filename: cleanText(input.asset.original_filename, 255) || null,
    },
    creator_description: {
      text: description || null,
      evidence_status: description ? 'creator_declared' : 'missing',
    },
    technical_metadata: {
      width: nullableDimension(technical.width),
      height: nullableDimension(technical.height),
      color_space: cleanText(technical.colorSpace, 64) || null,
      channel_layout: cleanText(technical.channelLayout, 32) || null,
      decoded_samples_sha256: technical.decodedSamplesSha256 && SHA256.test(technical.decodedSamplesSha256)
        ? technical.decodedSamplesSha256.toLowerCase()
        : null,
    },
    creator_confirmed_observations: observations,
    context: {
      vyral_name: cleanText(input.context.vyralName, 255),
      vyral_description: cleanText(input.context.vyralDescription) || null,
      purpose: cleanText(input.context.purpose, 2000) || null,
      intended_uses: (input.context.intendedUses ?? []).map((item) => cleanText(item, 255)).filter(Boolean).slice(0, 32),
    },
    reconstruction: {
      mode: 'semantic_generation',
      status: evidenceCount > 0 ? 'partial' : 'blocked',
      exact_binary_recovery: false,
      decoded_sample_payload_included: false,
      evidence_count: evidenceCount,
      missing_information: [...new Set(missing)],
      limitations: [
        'This record contains descriptive DNA only; it contains no original binary bytes or decoded pixel samples.',
        'Creator-declared descriptions are not independently measured visual facts.',
        'A semantic generation cannot claim pixel-exact or source-byte-exact recovery.',
      ],
    },
  };
};

export const validateVyralSemanticDnaV1 = (value: unknown): VyralSemanticDnaV1 => {
  if (!isObject(value) || value.schema_id !== VYRAL_SEMANTIC_DNA_SCHEMA_ID ||
      value.schema_version !== VYRAL_SEMANTIC_DNA_SCHEMA_VERSION || !isObject(value.source) ||
      !isObject(value.identity) || !isObject(value.creator_description) ||
      !isObject(value.technical_metadata) || !Array.isArray(value.creator_confirmed_observations) ||
      !isObject(value.context) || !isObject(value.reconstruction)) {
    throw new Error('Unsupported or malformed VYRA Semantic DNA v1 record.');
  }
  if (!ID.test(String(value.record_id)) || !ID.test(String(value.source.asset_id)) ||
      !ID.test(String(value.source.asset_version_id)) || !SHA256.test(String(value.source.sha256)) ||
      !Number.isSafeInteger(value.source.size_bytes) || Number(value.source.size_bytes) <= 0 ||
      value.reconstruction.mode !== 'semantic_generation' ||
      value.reconstruction.exact_binary_recovery !== false ||
      value.reconstruction.decoded_sample_payload_included !== false ||
      !['partial','blocked'].includes(String(value.reconstruction.status)) ||
      !Array.isArray(value.reconstruction.missing_information) ||
      !Array.isArray(value.reconstruction.limitations)) {
    throw new Error('Semantic DNA source binding or non-recovery guarantees are invalid.');
  }
  for (const observation of value.creator_confirmed_observations) {
    if (!isObject(observation) || !ID.test(String(observation.observation_id)) ||
        !ID.test(String(observation.review_id)) || observation.source_asset_version_id !== value.source.asset_version_id ||
        observation.source_sha256 !== value.source.sha256 || !isObject(observation.evidence)) {
      throw new Error('Semantic DNA contains creator evidence that is not pinned to its source.');
    }
    sanitizeSemanticEvidence(observation.evidence);
  }
  const descriptionText = value.creator_description.text;
  if (descriptionText !== null && (typeof descriptionText !== 'string' || descriptionText.length > 4000 || /^data:/i.test(descriptionText) || /https?:\\/\\//i.test(descriptionText))) {
    throw new Error('Semantic DNA description cannot contain media URLs or oversized payload text.');
  }
  return value as unknown as VyralSemanticDnaV1;
};
