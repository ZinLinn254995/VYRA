import {
  canonicalizeVyralPublicProjectionV1,
  isSafePublicVyralResolverUriV1,
} from './vyralResourceResolverV1';

type JsonRecord = Record<string, unknown>;

export type PublicCollectionReferenceV1 = {
  resolver_uri: string | null;
  source_vyral_id: string;
  source_revision: number;
  projection_sha256: string;
  compact_snapshot: JsonRecord;
};

export type PublicCollectionReferenceCheckV1 =
  | { status: 'current'; revision: number; assetCount: number }
  | { status: 'newer_revision'; revision: number; assetCount: number };

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const projectionInventory = (snapshotValue: unknown): JsonRecord[] => {
  const snapshot = record(snapshotValue);
  if (!Array.isArray(snapshot.assets)) return [];
  return snapshot.assets.map((value) => {
    const asset = record(value);
    const dnaRef = record(asset.dna_ref);
    return {
      asset_id: asset.asset_id,
      asset_version_id: asset.asset_version_id,
      media_type: asset.media_type,
      dna_ref: {
        record_id: dnaRef.record_id,
        schema_id: dnaRef.schema_id,
        schema_version: dnaRef.schema_version,
      },
      asset_fingerprint: asset.asset_fingerprint,
      reconstruction_claim: asset.reconstruction_claim,
    };
  });
};

/** Validate the live public projection against the immutable imported collection reference. */
export const verifyPublicVyralCollectionReferenceV1 = async (
  responseValue: unknown,
  reference: Pick<PublicCollectionReferenceV1, 'source_vyral_id' | 'source_revision' | 'projection_sha256' | 'compact_snapshot'>,
): Promise<PublicCollectionReferenceCheckV1> => {
  const response = record(responseValue);
  const vyral = record(response.vyral);
  const masterDna = record(response.masterDna);
  const snapshot = record(masterDna.snapshot);
  const projectionIntegrity = record(masterDna.projectionIntegrity);
  const snapshotVyral = record(snapshot.vyral);
  const snapshotMeta = record(snapshot.snapshot);

  if (response.status !== 'resolved' || response.access !== 'public' ||
      vyral.id !== reference.source_vyral_id ||
      masterDna.schemaId !== 'vyra.vyral-master-dna' || Number(masterDna.schemaVersion) !== 1 ||
      snapshot.schema_id !== 'vyra.vyral-master-dna' || Number(snapshot.schema_version) !== 1 ||
      snapshotVyral.vyral_id !== reference.source_vyral_id ||
      !Number.isSafeInteger(masterDna.revision) || Number(masterDna.revision) < 1 ||
      Number(snapshotMeta.revision) !== Number(masterDna.revision)) {
    throw new Error('The public collection response does not match the imported collection identity.');
  }

  const currentRevision = Number(masterDna.revision);
  if (currentRevision < reference.source_revision) {
    throw new Error('The public collection revision is older than the imported reference. Refresh is unavailable.');
  }

  const projectionSha256 = projectionIntegrity.projectionSha256;
  const sourceManifestSha256 = projectionIntegrity.sourceManifestSha256;
  if (typeof projectionSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(projectionSha256) ||
      typeof sourceManifestSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sourceManifestSha256)) {
    throw new Error('The public collection integrity proof is missing or invalid.');
  }
  const calculatedProjectionSha256 = await sha256(canonicalizeVyralPublicProjectionV1(snapshot));
  if (calculatedProjectionSha256 !== projectionSha256.toLowerCase()) {
    throw new Error('The public collection projection failed its integrity check.');
  }

  if (currentRevision === reference.source_revision) {
    if (sourceManifestSha256.toLowerCase() !== reference.projection_sha256.toLowerCase()) {
      throw new Error('The source revision digest differs from the imported reference.');
    }
    const importedSnapshot = record(reference.compact_snapshot);
    const importedInventory = projectionInventory(importedSnapshot);
    const liveInventory = projectionInventory(snapshot);
    if (!importedInventory.length || importedInventory.length !== liveInventory.length ||
        canonicalizeVyralPublicProjectionV1(importedInventory) !== canonicalizeVyralPublicProjectionV1(liveInventory)) {
      throw new Error('The live Asset inventory differs from the imported collection reference.');
    }
    return { status: 'current', revision: currentRevision, assetCount: liveInventory.length };
  }

  const liveInventory = projectionInventory(snapshot);
  if (!liveInventory.length) throw new Error('The latest public collection has no retrievable Assets.');
  return { status: 'newer_revision', revision: currentRevision, assetCount: liveInventory.length };
};

export const checkPublicVyralCollectionReferenceV1 = async (
  reference: PublicCollectionReferenceV1,
): Promise<PublicCollectionReferenceCheckV1> => {
  if (!reference.resolver_uri || !isSafePublicVyralResolverUriV1(reference.resolver_uri)) {
    throw new Error('This collection reference has no supported public access link.');
  }
  const response = await fetch(reference.resolver_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'master', vyralId: reference.source_vyral_id }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The public collection service returned an unreadable response.');
  }
  if (!response.ok) {
    const message = record(payload).error;
    if (response.status === 403 || response.status === 404) {
      throw new Error(typeof message === 'string' ? message : 'The source collection is no longer publicly accessible.');
    }
    if (response.status === 409) {
      throw new Error(typeof message === 'string' ? message : 'The source collection is not ready for public access.');
    }
    throw new Error(typeof message === 'string' ? message : 'Could not check public collection access.');
  }
  return verifyPublicVyralCollectionReferenceV1(payload, reference);
};
