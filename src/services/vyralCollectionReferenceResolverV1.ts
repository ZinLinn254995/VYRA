import {
  canonicalizeVyralPublicProjectionV1,
  isSafePublicVyralResolverUriV1,
} from './vyralResourceResolverV1';
import { reconstructVyralDnaV3, validateVyralDnaV3Record, type VyralDnaV3Record, type VyralDnaV3PackageEntry } from './vyralDnaV3';
import { createVyralFileDnaV1, validateVyralFileDnaV1Record, type VyralFileDnaRecord, type VyralFileDnaEntry } from './vyralFileDnaV1';

type JsonRecord = Record<string, unknown>;

export type PublicCollectionReferenceV1 = {
  resolver_uri: string | null;
  source_vyral_id: string;
  source_revision: number;
  projection_sha256: string;
  compact_snapshot: JsonRecord;
};

export type PublicCollectionAssetReferenceV1 = { assetId: string; assetVersionId: string; mediaType: string };

export type PublicCollectionReferenceCheckV1 =
  | { status: 'current'; revision: number; assetCount: number; assets: PublicCollectionAssetReferenceV1[] }
  | { status: 'newer_revision'; revision: number; assetCount: number; assets: PublicCollectionAssetReferenceV1[] };

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const sha256 = async (value: string | ArrayBuffer): Promise<string> => {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', input);
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
    return { status: 'current', revision: currentRevision, assetCount: liveInventory.length, assets: liveInventory.map((asset) => ({ assetId: String(asset.asset_id), assetVersionId: String(asset.asset_version_id), mediaType: String(asset.media_type ?? 'application/octet-stream') })) };
  }

  const liveInventory = projectionInventory(snapshot);
  if (!liveInventory.length) throw new Error('The latest public collection has no retrievable Assets.');
  return { status: 'newer_revision', revision: currentRevision, assetCount: liveInventory.length, assets: liveInventory.map((asset) => ({ assetId: String(asset.asset_id), assetVersionId: String(asset.asset_version_id), mediaType: String(asset.media_type ?? 'application/octet-stream') })) };
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


export const downloadPublicVyralCollectionAssetV1 = async (
  reference: Pick<PublicCollectionReferenceV1, 'resolver_uri' | 'source_vyral_id'>,
  assetReference: PublicCollectionAssetReferenceV1,
): Promise<File> => {
  if (!reference.resolver_uri || !isSafePublicVyralResolverUriV1(reference.resolver_uri)) {
    throw new Error('This collection reference has no supported public access link.');
  }
  const resolver = new URL(reference.resolver_uri);
  const response = await fetch(reference.resolver_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: 'asset_source',
      vyralId: reference.source_vyral_id,
      assetId: assetReference.assetId,
      assetVersionId: assetReference.assetVersionId,
    }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('The source service returned an unreadable Asset authorization.'); }
  if (!response.ok) {
    const message = record(payload).error;
    throw new Error(typeof message === 'string' ? message : 'The source creator has not authorized this Asset download.');
  }
  const resolvedAsset = record(record(payload).asset);
  const source = record(record(payload).source);
  const signedUrl = source.signedUrl;
  const expectedSha256 = resolvedAsset.sha256;
  const expectedSize = Number(resolvedAsset.sizeBytes);
  if (resolvedAsset.id !== assetReference.assetId ||
      resolvedAsset.versionId !== assetReference.assetVersionId ||
      typeof signedUrl !== 'string' || typeof expectedSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(expectedSha256) ||
      !Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 100 * 1024 * 1024) {
    throw new Error('The source authorization does not match the requested Asset version.');
  }
  let signed: URL;
  try { signed = new URL(signedUrl); }
  catch { throw new Error('The source returned an invalid download authorization.'); }
  if (signed.protocol !== 'https:' || signed.hostname !== resolver.hostname ||
      signed.username || signed.password || signed.hash) {
    throw new Error('The source download authorization points outside its trusted storage host.');
  }
  const download = await fetch(signed, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!download.ok || !download.body) throw new Error('The authorized source Asset could not be downloaded.');
  const declaredDownloadSize = Number(download.headers.get('content-length') ?? expectedSize);
  if (Number.isFinite(declaredDownloadSize) && declaredDownloadSize !== expectedSize) {
    throw new Error('The authorized download size does not match the pinned source version.');
  }
  const reader = download.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloadedSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    downloadedSize += value.byteLength;
    if (downloadedSize > expectedSize || downloadedSize > 100 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('The source download exceeded its verified size limit.');
    }
    chunks.push(value);
  }
  if (downloadedSize !== expectedSize) throw new Error('The downloaded Asset size does not match the source version.');
  const bytes = new Uint8Array(downloadedSize);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const actualSha256 = await sha256(bytes.buffer);
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error('The downloaded Asset failed its SHA-256 integrity check.');
  }
  const filename = typeof resolvedAsset.name === 'string' && resolvedAsset.name.trim()
    ? resolvedAsset.name.trim().slice(0, 240)
    : 'public-asset-' + assetReference.assetId;
  const mimeType = typeof resolvedAsset.mimeType === 'string' && resolvedAsset.mimeType.trim()
    ? resolvedAsset.mimeType.trim()
    : assetReference.mediaType || 'application/octet-stream';
  return new File([bytes], filename, { type: mimeType });
};


export type RetrievedPublicAssetDnaV1 = {
  asset: { id: string; versionId: string; name: string; mimeType: string; sizeBytes: number; sha256: string };
  record: VyralDnaV3Record;
  payloadEntries: VyralDnaV3PackageEntry[];
};

export const retrievePublicVyralAssetDnaV1 = async (
  reference: Pick<PublicCollectionReferenceV1, 'resolver_uri' | 'source_vyral_id'>,
  assetReference: PublicCollectionAssetReferenceV1,
): Promise<RetrievedPublicAssetDnaV1> => {
  if (!reference.resolver_uri || !isSafePublicVyralResolverUriV1(reference.resolver_uri)) {
    throw new Error('This collection reference has no supported public access link.');
  }
  const resolver = new URL(reference.resolver_uri);
  const response = await fetch(reference.resolver_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: 'asset_dna',
      vyralId: reference.source_vyral_id,
      assetId: assetReference.assetId,
      assetVersionId: assetReference.assetVersionId,
    }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('The source service returned an unreadable DNA response.'); }
  if (!response.ok) {
    const message = record(payload).error;
    throw new Error(typeof message === 'string' ? message : 'The source creator has not permitted Asset DNA access.');
  }

  const root = record(payload);
  const asset = record(root.asset);
  const assetDna = record(root.assetDna);
  if (root.status !== 'resolved' || root.access !== 'public' ||
      asset.id !== assetReference.assetId || asset.versionId !== assetReference.assetVersionId ||
      Number(assetDna.schemaVersion) !== 3) {
    throw new Error('The returned Asset DNA does not match the requested public Asset version or supported reconstruction format.');
  }

  const dnaRecord = validateVyralDnaV3Record(assetDna.record);
  if (dnaRecord.source.asset_id !== assetReference.assetId ||
      dnaRecord.source.asset_version_id !== assetReference.assetVersionId ||
      typeof asset.sha256 !== 'string' || dnaRecord.source.sha256.toLowerCase() !== asset.sha256.toLowerCase() ||
      Number(asset.sizeBytes) !== dnaRecord.source.size_bytes ||
      String(asset.mimeType ?? '') !== dnaRecord.source.mime_type) {
    throw new Error('The Asset DNA source binding does not match the authorized Asset version.');
  }

  const tilePayloads = Array.isArray(assetDna.tilePayloads) ? assetDna.tilePayloads : [];
  const tiles = dnaRecord.lossless_payload.tiles;
  if (tilePayloads.length !== tiles.length || !tiles.length || tiles.length > 500) {
    throw new Error('The source did not authorize the complete DNA tile set.');
  }
  const totalBytes = tiles.reduce((sum, tile) => sum + tile.byte_length, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > 32 * 1024 * 1024) {
    throw new Error('The requested DNA reconstruction payload exceeds the supported size limit.');
  }

  const payloadEntries: VyralDnaV3PackageEntry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const authorization = record(tilePayloads[index]);
    if (authorization.packagePath !== tile.package_path ||
        typeof authorization.signedUrl !== 'string' || seen.has(tile.package_path)) {
      throw new Error('The source DNA tile authorization does not match the declared reconstruction payload.');
    }
    seen.add(tile.package_path);
    let signed: URL;
    try { signed = new URL(authorization.signedUrl); }
    catch { throw new Error('The source returned an invalid DNA tile authorization.'); }
    if (signed.protocol !== 'https:' || signed.hostname !== resolver.hostname ||
        signed.username || signed.password || signed.hash ||
        !signed.pathname.startsWith('/storage/v1/object/sign/vyral-assets/')) {
      throw new Error('The DNA tile authorization points outside the trusted VYRA storage endpoint.');
    }

    const tileResponse = await fetch(signed, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!tileResponse.ok || !tileResponse.body) throw new Error('An authorized DNA tile could not be downloaded.');
    const declaredLength = Number(tileResponse.headers.get('content-length') ?? tile.byte_length);
    if (Number.isFinite(declaredLength) && declaredLength !== tile.byte_length) {
      throw new Error('A DNA tile download length does not match its declared record.');
    }
    const reader = tileResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > tile.byte_length) {
        await reader.cancel();
        throw new Error('A DNA tile exceeded its declared byte length.');
      }
      chunks.push(value);
    }
    if (length !== tile.byte_length) throw new Error('A DNA tile is incomplete.');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (await sha256(bytes.buffer) !== tile.sha256.toLowerCase()) {
      throw new Error('A downloaded DNA tile failed its SHA-256 integrity check.');
    }
    payloadEntries.push({ path: tile.package_path, data: bytes });
  }

  await reconstructVyralDnaV3(dnaRecord, new Map(payloadEntries.map((entry) => [entry.path, entry.data])));
  return {
    asset: {
      id: String(asset.id),
      versionId: String(asset.versionId),
      name: typeof asset.name === 'string' ? asset.name : 'Public Asset',
      mimeType: String(asset.mimeType ?? assetReference.mediaType),
      sizeBytes: Number(asset.sizeBytes),
      sha256: String(asset.sha256),
    },
    record: dnaRecord,
    payloadEntries,
  };
};
