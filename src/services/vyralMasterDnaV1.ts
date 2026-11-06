export const VYRAL_MASTER_DNA_SCHEMA_ID = 'vyra.vyral-master-dna' as const;
export const VYRAL_MASTER_DNA_SCHEMA_VERSION = 1 as const;

export type VyralMasterDnaEndpoint =
  | { kind: 'asset'; asset_id: string; asset_version_id?: string | null }
  | { kind: 'vyral'; vyral_id: string };

export type VyralMasterDnaAsset = {
  asset_id: string;
  asset_version_id: string;
  role: 'main' | 'supporting';
  purpose: string;
  media_type: string;
  dna_ref: { record_id: string; schema_id: string; schema_version: number; package_prefix?: string | null };
  asset_fingerprint: string;
  reconstruction_claim: 'lossless_decoded' | 'source_file_exact' | 'semantic_only' | 'model_reconstructed' | 'unavailable';
  provenance_ref?: string | null;
  license_ref?: string | null;
};

export type VyralMasterDnaV1 = {
  schema_id: typeof VYRAL_MASTER_DNA_SCHEMA_ID;
  schema_version: typeof VYRAL_MASTER_DNA_SCHEMA_VERSION;
  master_dna_id: string;
  vyral: { vyral_id: string; name: string; owner_ref?: string | null; created_at?: string | null };
  snapshot: { revision: number; created_at: string; parent_master_dna_id?: string | null };
  purpose: { summary: string; intended_uses: string[]; constraints?: string[] };
  main_asset_ids: string[];
  assets: VyralMasterDnaAsset[];
  relationships: Array<{
    relationship_id: string;
    type: string;
    from: VyralMasterDnaEndpoint;
    to: VyralMasterDnaEndpoint;
    rationale: string;
    evidence_ref?: string | null;
  }>;
  reconstruction_profile: {
    overall_claim: 'lossless_decoded' | 'source_file_exact' | 'semantic_only' | 'model_reconstructed' | 'unavailable';
    notes: string[];
    cross_asset_constraints?: Array<{ constraint_id: string; description: string; applies_to_asset_ids?: string[] }>;
  };
  provenance: {
    creator_ref: string | null;
    license_ref: string | null;
    evidence_status: 'verified' | 'partially_verified' | 'creator_attested' | 'unknown';
    lineage_refs?: string[];
  };
  source_resolution: {
    visibility: 'public' | 'unlisted' | 'private';
    canonical_uri: string | null;
    resolution_policy: 'public_metadata' | 'public_assets' | 'authenticated_owner' | 'no_remote_resolution';
    public_revision?: number | null;
  };
  integrity: {
    canonicalization: 'vyra-json-c14n-v1';
    hash_algorithm: 'SHA-256';
    manifest_sha256: string;
    vyral_fingerprint: string;
    fingerprint_version: 1;
  };
  portable_projection: {
    profile: 'compact';
    includes_full_reconstruction_payloads: false;
    resolver_uri: string | null;
    retrieval_policy: 'no_remote_resolution' | 'public_metadata_only' | 'authorized_selective_retrieval';
    max_assets_per_request?: number;
    notes?: string[];
  };
};

export type CreateVyralMasterDnaInput = Omit<VyralMasterDnaV1, 'schema_id' | 'schema_version' | 'integrity'>;

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CLAIMS = ['lossless_decoded', 'source_file_exact', 'semantic_only', 'model_reconstructed', 'unavailable'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Master DNA canonical JSON cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (!isRecord(value)) throw new Error('Master DNA contains a non-JSON value.');
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
};

const sha256 = async (value: string) => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable in this environment.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const validateEndpoint = (endpoint: unknown, vyralId: string, assetMap: Map<string, VyralMasterDnaAsset>) => {
  if (!isRecord(endpoint)) throw new Error('Master DNA relationship endpoint is invalid.');
  if (endpoint.kind === 'vyral') {
    if (endpoint.vyral_id !== vyralId) throw new Error('Master DNA relationship references a different Vyral root.');
    return { kind: 'vyral' as const, vyral_id: vyralId };
  }
  if (endpoint.kind !== 'asset' || !isId(endpoint.asset_id)) throw new Error('Master DNA relationship asset endpoint is invalid.');
  const asset = assetMap.get(endpoint.asset_id);
  if (!asset) throw new Error('Master DNA relationship references an asset outside this snapshot.');
  if (endpoint.asset_version_id != null && endpoint.asset_version_id !== asset.asset_version_id) {
    throw new Error('Master DNA relationship references an asset version outside this snapshot.');
  }
  return { kind: 'asset' as const, asset_id: asset.asset_id, ...(endpoint.asset_version_id == null ? {} : { asset_version_id: asset.asset_version_id }) };
};

function validateStructure(value: unknown): asserts value is VyralMasterDnaV1 {
  if (!isRecord(value) || value.schema_id !== VYRAL_MASTER_DNA_SCHEMA_ID || value.schema_version !== VYRAL_MASTER_DNA_SCHEMA_VERSION) {
    throw new Error('Unsupported or malformed Vyral Master DNA schema.');
  }
  if (!isId(value.master_dna_id) || !isRecord(value.vyral) || !isId(value.vyral.vyral_id) || !isText(value.vyral.name)) {
    throw new Error('Master DNA identity metadata is invalid.');
  }
  if (!isRecord(value.snapshot) || !Number.isSafeInteger(value.snapshot.revision) || Number(value.snapshot.revision) < 1 || !isDate(value.snapshot.created_at)) {
    throw new Error('Master DNA snapshot metadata is invalid.');
  }
  if (!isRecord(value.purpose) || !isText(value.purpose.summary) || !Array.isArray(value.purpose.intended_uses) || value.purpose.intended_uses.length === 0 ||
      !value.purpose.intended_uses.every(isText) || !Array.isArray(value.main_asset_ids) || !Array.isArray(value.assets) ||
      value.assets.length === 0 || !Array.isArray(value.relationships)) {
    throw new Error('Master DNA purpose, asset inventory, or relationships are invalid.');
  }
  const assetMap = new Map<string, VyralMasterDnaAsset>();
  const versionIds = new Set<string>();
  for (const raw of value.assets) {
    if (!isRecord(raw) || !isId(raw.asset_id) || !isId(raw.asset_version_id) ||
        !['main', 'supporting'].includes(String(raw.role)) || !isText(raw.purpose) || !isText(raw.media_type) ||
        !isRecord(raw.dna_ref) || !isId(raw.dna_ref.record_id) || !isText(raw.dna_ref.schema_id) ||
        !Number.isSafeInteger(raw.dna_ref.schema_version) || Number(raw.dna_ref.schema_version) < 1 ||
        typeof raw.asset_fingerprint !== 'string' || !SHA256.test(raw.asset_fingerprint) ||
        !CLAIMS.includes(raw.reconstruction_claim as typeof CLAIMS[number])) {
      throw new Error('Master DNA asset entry is invalid or missing its purpose/DNA reference.');
    }
    if (assetMap.has(raw.asset_id) || versionIds.has(raw.asset_version_id)) throw new Error('Master DNA contains duplicate asset or version IDs.');
    assetMap.set(raw.asset_id, raw as unknown as VyralMasterDnaAsset);
    versionIds.add(raw.asset_version_id);
  }
  const mainIds = new Set<string>();
  for (const id of value.main_asset_ids) {
    if (!isId(id) || mainIds.has(id) || assetMap.get(id)?.role !== 'main') throw new Error('Master DNA main asset list is inconsistent.');
    mainIds.add(id);
  }
  for (const asset of assetMap.values()) {
    if ((asset.role === 'main') !== mainIds.has(asset.asset_id)) throw new Error('Master DNA must list every Main Asset exactly once.');
  }
  const connected = new Set<string>();
  const relationshipIds = new Set<string>();
  for (const raw of value.relationships) {
    if (!isRecord(raw) || !isId(raw.relationship_id) || relationshipIds.has(raw.relationship_id) ||
        !/^[a-z][a-z0-9_]{1,63}$/.test(String(raw.type)) || !isText(raw.rationale)) {
      throw new Error('Master DNA relationship entry is invalid.');
    }
    relationshipIds.add(raw.relationship_id);
    const from = validateEndpoint(raw.from, value.vyral.vyral_id as string, assetMap);
    const to = validateEndpoint(raw.to, value.vyral.vyral_id as string, assetMap);
    if (from.kind === 'asset' && (to.kind === 'vyral' || to.asset_id !== from.asset_id)) connected.add(from.asset_id);
    if (to.kind === 'asset' && (from.kind === 'vyral' || from.asset_id !== to.asset_id)) connected.add(to.asset_id);
  }
  for (const asset of assetMap.values()) {
    if (!connected.has(asset.asset_id)) throw new Error('Every Master DNA asset must have an explicit relationship to an asset or Vyral root.');
  }
  if (!isRecord(value.reconstruction_profile) ||
      !['lossless_decoded', 'source_file_exact', 'semantic_only', 'model_reconstructed', 'unavailable'].includes(String(value.reconstruction_profile.overall_claim)) ||
      !Array.isArray(value.reconstruction_profile.notes) || !value.reconstruction_profile.notes.every((item) => typeof item === 'string')) {
    throw new Error('Master DNA reconstruction profile is invalid.');
  }
  const claimRank: Record<string, number> = {
    unavailable: 0, model_reconstructed: 1, semantic_only: 2, lossless_decoded: 3, source_file_exact: 4,
  };
  const weakestAssetClaim = [...assetMap.values()].reduce((weakest, asset) =>
    claimRank[asset.reconstruction_claim] < claimRank[weakest] ? asset.reconstruction_claim : weakest,
  'source_file_exact' as VyralMasterDnaAsset['reconstruction_claim']);
  if (value.reconstruction_profile.overall_claim !== weakestAssetClaim) {
    throw new Error('Master DNA overall reconstruction claim must not exceed the weakest included asset claim.');
  }
  if (!isRecord(value.provenance) || !['verified', 'partially_verified', 'creator_attested', 'unknown'].includes(String(value.provenance.evidence_status)) ||
      !(value.provenance.creator_ref === null || typeof value.provenance.creator_ref === 'string') ||
      !(value.provenance.license_ref === null || typeof value.provenance.license_ref === 'string')) {
    throw new Error('Master DNA provenance is invalid.');
  }
  if (!isRecord(value.source_resolution) || !['public', 'unlisted', 'private'].includes(String(value.source_resolution.visibility)) ||
      !(value.source_resolution.canonical_uri === null || typeof value.source_resolution.canonical_uri === 'string') ||
      !['public_metadata', 'public_assets', 'authenticated_owner', 'no_remote_resolution'].includes(String(value.source_resolution.resolution_policy))) {
    throw new Error('Master DNA source resolution policy is invalid.');
  }
  if (value.source_resolution.visibility !== 'public' &&
      (value.source_resolution.resolution_policy === 'public_assets' ||
       value.source_resolution.resolution_policy === 'public_metadata' ||
       value.source_resolution.canonical_uri !== null)) {
    throw new Error('Private or unlisted Vyrals cannot expose public metadata, assets, or resolver URIs.');
  }
  if (!isRecord(value.portable_projection) || value.portable_projection.profile !== 'compact' ||
      value.portable_projection.includes_full_reconstruction_payloads !== false ||
      !(value.portable_projection.resolver_uri === null || typeof value.portable_projection.resolver_uri === 'string') ||
      !['no_remote_resolution', 'public_metadata_only', 'authorized_selective_retrieval'].includes(String(value.portable_projection.retrieval_policy))) {
    throw new Error('Master DNA compact portable projection is invalid.');
  }
  if (value.source_resolution.visibility !== 'public' &&
      (value.portable_projection.retrieval_policy === 'public_metadata_only' || value.portable_projection.resolver_uri !== null)) {
    throw new Error('Private or unlisted compact DNA cannot publish metadata-only resolution or a public resolver URI.');
  }
}

export const createVyralMasterDnaV1 = async (input: CreateVyralMasterDnaInput): Promise<VyralMasterDnaV1> => {
  const unsigned = {
    schema_id: VYRAL_MASTER_DNA_SCHEMA_ID,
    schema_version: VYRAL_MASTER_DNA_SCHEMA_VERSION,
    ...input,
  };
  validateStructure({ ...unsigned, integrity: { canonicalization: 'vyra-json-c14n-v1', hash_algorithm: 'SHA-256', manifest_sha256: '0'.repeat(64), vyral_fingerprint: '0'.repeat(64), fingerprint_version: 1 } });
  const manifestSha = await sha256(canonicalize(unsigned));
  const fingerprint = await sha256('vyra:vyral-fingerprint:v1:' + manifestSha);
  return {
    ...unsigned,
    integrity: {
      canonicalization: 'vyra-json-c14n-v1',
      hash_algorithm: 'SHA-256',
      manifest_sha256: manifestSha,
      vyral_fingerprint: fingerprint,
      fingerprint_version: 1,
    },
  };
};

export const validateVyralMasterDnaV1 = async (value: unknown): Promise<VyralMasterDnaV1> => {
  validateStructure(value);
  const { integrity, ...unsigned } = value;
  if (!isRecord(integrity) || integrity.canonicalization !== 'vyra-json-c14n-v1' ||
      integrity.hash_algorithm !== 'SHA-256' || integrity.fingerprint_version !== 1 ||
      typeof integrity.manifest_sha256 !== 'string' || !SHA256.test(integrity.manifest_sha256) ||
      typeof integrity.vyral_fingerprint !== 'string' || !SHA256.test(integrity.vyral_fingerprint)) {
    throw new Error('Master DNA integrity metadata is invalid.');
  }
  const manifestSha = await sha256(canonicalize(unsigned));
  if (manifestSha !== integrity.manifest_sha256) throw new Error('Master DNA manifest digest verification failed.');
  const fingerprint = await sha256('vyra:vyral-fingerprint:v1:' + manifestSha);
  if (fingerprint !== integrity.vyral_fingerprint) throw new Error('Vyral fingerprint verification failed.');
  return value;
};

export const canonicalizeVyralMasterDnaV1 = (value: VyralMasterDnaV1) => {
  const { integrity: _integrity, ...unsigned } = value;
  return canonicalize(unsigned);
};
