import { VYRAL_AI_RECONSTRUCTION_GUIDE, VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT } from './vyralPortableReconstruction.ts';
import { buildVyralSystemFilesV1, validateVyralSystemFilesStructureV1, verifyVyralSystemFileIntegrityV1, type VyralSystemFileDescriptorV1 } from './vyralSystemFilesV1.ts';
import { createVyralMasterDnaV1, validateVyralMasterDnaV1, type VyralMasterDnaAsset, type VyralMasterDnaV1 } from './vyralMasterDnaV1.ts';
import { isSafePublicVyralResolverUriV1 } from './vyralResourceResolverV1.ts';
import { reconstructVyralFileDnaV1, validateVyralFileDnaV1Record, type VyralFileDnaRecord, type VyralFileDnaEntry } from './vyralFileDnaV1.ts';
import {
  reconstructVyralDnaV3,
  reconstructVyralDnaV3EncodedFile,
  validateVyralDnaV3Record,
  type VyralDnaV3Record,
  type VyralDnaV3PackageEntry,
} from './vyralDnaV3.ts';

export const VYRAL_PACKAGE_FORMAT = 'application/vnd.vyra.vyral+zip';
export const VYRAL_PACKAGE_VERSION = 1;
export const VYRAL_PACKAGE_MANIFEST = 'manifest.json';

/** Exclude the exact .vyral Asset used as the import container, when that Asset
 * is also listed inside its own exported collection manifest. */
/** Exclude only the exact .vyral Asset used as the import container.
 * Other .vyral files inside the collection remain legitimate Assets and must import normally. */
export const getVyralPackageAssetsForImport = <T extends {
  id?: string;
  name?: string;
  original_filename?: string;
  mime_type?: string;
}>(
  assets: T[],
  containerAssetId?: string,
): T[] => assets.filter((asset) => !containerAssetId || asset.id !== containerAssetId);

export type VyralPackageEntry = { path: string; data: Uint8Array | string };

export type VyralPackageManifest = {
  format: typeof VYRAL_PACKAGE_FORMAT;
  formatVersion: number;
  packageId: string;
  exportedAt: string;
  exportMode?: 'full' | 'dna-only' | 'compact-only';
  blindReconstruction?: boolean;
  exportComponents?: { assets: boolean; fullDna: boolean; compactDna: boolean };
  reconstructionCapabilities?: Record<string, unknown>;
  vyral: Record<string, unknown>;
  folders: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  versions: (Record<string, unknown> & { package_path: string })[];
  dnaRecords: Record<string, unknown>[];
  fingerprints: Record<string, unknown>[];
  visionObservations: Record<string, unknown>[];
  lineage: Record<string, unknown>[];
  reconstructionTests: Record<string, unknown>[];
  masterDna?: VyralMasterDnaV1 | null;
  systemFiles?: VyralSystemFileDescriptorV1[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const localHeaderSignature = 0x04034b50;
const centralHeaderSignature = 0x02014b50;
const endSignature = 0x06054b50;
const MAX_ENTRIES = 5000;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const safePath = (path: string) => {
  if (!path || path.length > 1024 || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.includes(String.fromCharCode(92)) || path.includes(String.fromCharCode(0))) return false;
  const parts = path.split('/');
  return parts.every((part) => part !== '..' && part !== '.' && part.length > 0);
};

const dosDateTime = (date: Date) => ({
  time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
  date: (((Math.max(1980, date.getFullYear()) - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
});

export const createVyralZip = (entries: VyralPackageEntry[]) => {
  if (!entries.length || entries.length > MAX_ENTRIES) throw new Error('VYRAL package must contain between 1 and 5,000 files.');
  const seen = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let totalBytes = 0;
  const stamp = dosDateTime(new Date());

  for (const entry of entries) {
    if (!safePath(entry.path)) throw new Error('Unsafe package path: ' + entry.path);
    if (seen.has(entry.path)) throw new Error('Duplicate package path: ' + entry.path);
    seen.add(entry.path);
    const name = encoder.encode(entry.path);
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    if (name.length > 65535 || data.byteLength > 0xffffffff) throw new Error('Package entry exceeds ZIP format limits: ' + entry.path);
    totalBytes += data.byteLength;
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('VYRAL package exceeds the 256 MB archive limit.');
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, localHeaderSignature, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, centralHeaderSignature, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, endSignature, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  const blobParts: BlobPart[] = [...localParts, ...centralParts, end].map((part) => {
    const buffer = new ArrayBuffer(part.byteLength);
    new Uint8Array(buffer).set(part);
    return buffer;
  });
  return new Blob(blobParts, { type: 'application/vnd.vyra.vyral+zip' });
};

export const readVyralZip = async (source: Blob | ArrayBuffer | Uint8Array) => {
  const bytes = source instanceof Blob
    ? new Uint8Array(await source.arrayBuffer())
    : source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Invalid or oversized VYRAL package.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 22 - 65535);
  let endOffset = -1;
  for (let i = bytes.byteLength - 22; i >= searchStart; i -= 1) {
    if (view.getUint32(i, true) === endSignature) { endOffset = i; break; }
  }
  if (endOffset < 0) throw new Error('ZIP end directory was not found.');
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const commentLength = view.getUint16(endOffset + 20, true);
  if (disk || centralDisk || diskEntries !== entryCount || entryCount > MAX_ENTRIES || endOffset + 22 + commentLength !== bytes.byteLength) throw new Error('Multi-disk, ZIP64 or malformed archives are not supported.');
  if (centralOffset + centralSize > endOffset) throw new Error('ZIP central directory is out of bounds.');

  const files = new Map<string, Uint8Array>();
  const entryRanges: { start: number; end: number; path: string }[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > centralOffset + centralSize || view.getUint32(cursor, true) !== centralHeaderSignature) throw new Error('Malformed ZIP central directory.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (next > centralOffset + centralSize) throw new Error('Malformed ZIP entry metadata.');
    if (flags !== 0x0800) throw new Error('VYRAL ZIP entries must use UTF-8 names without encryption or data descriptors.');
    if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('Multi-disk and ZIP64 entries are not supported.');
    if (method !== 0) throw new Error('This VYRAL package reader currently supports ZIP Store (no-compression) entries only.');
    if (compressedSize !== uncompressedSize) throw new Error('Invalid stored ZIP entry size.');
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!safePath(path) || files.has(path)) throw new Error('Unsafe or duplicate ZIP entry path: ' + path);
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== localHeaderSignature) throw new Error('Invalid local ZIP entry header.');
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localChecksum = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    if (localChecksum !== checksum || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) throw new Error('ZIP local and central size/integrity records do not match.');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== path || localFlags !== flags || localMethod !== method) throw new Error('ZIP local and central entry headers do not match.');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (dataEnd > centralOffset) throw new Error('ZIP entry data is out of bounds.');
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== checksum) throw new Error('ZIP integrity check failed for ' + path);
    files.set(path, data);
    entryRanges.push({ start: localOffset, end: dataEnd, path });
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Unexpected ZIP central directory size.');
  entryRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < entryRanges.length; index += 1) {
    if (entryRanges[index].start < entryRanges[index - 1].end) throw new Error('ZIP entries overlap: ' + entryRanges[index - 1].path + ' and ' + entryRanges[index].path);
  }
  return files;
};

export const validateVyralManifest = (value: unknown): VyralPackageManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('VYRAL manifest must be a JSON object.');
  const manifest = value as Partial<VyralPackageManifest>;
  if (manifest.format !== VYRAL_PACKAGE_FORMAT) throw new Error('This file is not a supported VYRAL package.');
  if (manifest.formatVersion !== VYRAL_PACKAGE_VERSION) throw new Error('Unsupported VYRAL package version: ' + String(manifest.formatVersion));
  if (manifest.blindReconstruction !== undefined &&
      (typeof manifest.blindReconstruction !== 'boolean' || manifest.blindReconstruction === true && manifest.exportMode !== 'dna-only')) {
    throw new Error('Blind reconstruction metadata is valid only for DNA-only packages.');
  }
  if (typeof manifest.packageId !== 'string' || !manifest.packageId.trim() || manifest.packageId.length > 128 || typeof manifest.exportedAt !== 'string' || !Number.isFinite(Date.parse(manifest.exportedAt))) throw new Error('VYRAL package identity metadata is missing or invalid.');
  if (!manifest.vyral || typeof manifest.vyral !== 'object' || typeof manifest.vyral.name !== 'string' || !manifest.vyral.name.trim()) throw new Error('VYRAL collection metadata is invalid.');
  if (manifest.exportComponents !== undefined) {
    const components = manifest.exportComponents;
    if (!components || typeof components !== 'object' ||
        typeof components.assets !== 'boolean' || typeof components.fullDna !== 'boolean' ||
        typeof components.compactDna !== 'boolean' ||
        (!components.assets && !components.fullDna && !components.compactDna) ||
        (manifest.exportMode === 'full' && !components.assets) ||
        (manifest.exportMode === 'dna-only' && (components.assets || !components.fullDna)) ||
        (manifest.exportMode === 'compact-only' && (components.assets || components.fullDna || !components.compactDna)) ||
        (components.compactDna !== Boolean(manifest.masterDna))) {
      throw new Error('VYRAL export component selection does not match its package contents.');
    }
  }
  if (manifest.masterDna !== undefined && manifest.masterDna !== null) {
    if (typeof manifest.masterDna !== 'object' || Array.isArray(manifest.masterDna) ||
        (manifest.masterDna as VyralMasterDnaV1).vyral?.vyral_id !== manifest.vyral.id) {
      throw new Error('VYRAL Master DNA identity does not match the package Vyral.');
    }
  }
  for (const key of ['folders','assets','versions','dnaRecords','fingerprints','visionObservations','lineage','reconstructionTests'] as const) {
    if (!Array.isArray(manifest[key])) throw new Error('VYRAL manifest section is missing or invalid: ' + key);
  }

  const folders = manifest.folders ?? [];
  const assets = manifest.assets ?? [];
  const versions = manifest.versions ?? [];
  if (folders.length > MAX_ENTRIES || assets.length > MAX_ENTRIES || versions.length > MAX_ENTRIES) throw new Error('VYRAL package contains too many folders, assets or versions.');
  const folderIds = new Set<string>();
  const assetIds = new Set<string>();
  const versionIds = new Set<string>();
  const folderParents = new Map<string, string | null>();
  for (const folder of folders) {
    if (typeof folder.id !== 'string' || !folder.id || typeof folder.name !== 'string' || !folder.name.trim()) throw new Error('A VYRAL folder is missing its ID or name.');
    if (folder.parent_id !== undefined && folder.parent_id !== null && typeof folder.parent_id !== 'string') throw new Error('A VYRAL folder parent ID is invalid.');
    if (folderIds.has(folder.id)) throw new Error('Duplicate VYRAL folder identity.');
    folderIds.add(folder.id);
    folderParents.set(folder.id, typeof folder.parent_id === 'string' ? folder.parent_id : null);
  }
  for (const [id, parentId] of folderParents) {
    if (parentId && !folderIds.has(parentId)) throw new Error('A VYRAL folder references a missing parent.');
    const visited = new Set<string>([id]);
    let current = parentId;
    while (current) {
      if (visited.has(current)) throw new Error('The VYRAL folder hierarchy contains a circular reference.');
      visited.add(current);
      current = folderParents.get(current) ?? null;
    }
  }

  for (const asset of assets) {
    if (typeof asset.id !== 'string' || !asset.id || typeof asset.name !== 'string' || !asset.name.trim()) throw new Error('A VYRAL asset is missing its ID or name.');
    if (assetIds.has(asset.id)) throw new Error('Duplicate VYRAL asset identity.');
    assetIds.add(asset.id);
    if (asset.folder_id !== undefined && asset.folder_id !== null && typeof asset.folder_id !== 'string') throw new Error('A VYRAL asset folder ID is invalid.');
    if (typeof asset.folder_id === 'string' && !folderIds.has(asset.folder_id)) throw new Error('A VYRAL asset references a missing folder.');
  }

  const packagePaths = new Set<string>();
  const versionsByAsset = new Map<string, Set<number>>();
  for (const version of versions) {
    if (typeof version.id !== 'string' || !version.id || versionIds.has(version.id)) throw new Error('A VYRAL asset version has a missing or duplicate ID.');
    versionIds.add(version.id);
    if (typeof version.asset_id !== 'string' || !assetIds.has(version.asset_id)) throw new Error('A VYRAL version references a missing asset.');
    if (version.parent_version_id !== undefined && version.parent_version_id !== null && typeof version.parent_version_id !== 'string') throw new Error('A VYRAL version parent ID is invalid.');
    const versionNumber = Number(version.version_number);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw new Error('A VYRAL asset version number is invalid.');
    const assetVersionNumbers = versionsByAsset.get(version.asset_id) ?? new Set<number>();
    if (assetVersionNumbers.has(versionNumber)) throw new Error('Duplicate version number for a VYRAL asset.');
    assetVersionNumbers.add(versionNumber);
    versionsByAsset.set(version.asset_id, assetVersionNumbers);
    if (typeof version.package_path !== 'string' || !safePath(version.package_path) || !version.package_path.startsWith('assets/')) throw new Error('Invalid asset package path.');
    if (packagePaths.has(version.package_path)) throw new Error('Duplicate asset package path.');
    packagePaths.add(version.package_path);
    if (typeof version.sha256 === 'string' && !/^[a-f0-9]{64}$/i.test(version.sha256)) throw new Error('An asset version contains an invalid SHA-256 value.');
  }
  const versionById = new Map(versions.map((version) => [String(version.id), version]));
  for (const version of versions) {
    if (typeof version.parent_version_id === 'string') {
      const parent = versionById.get(version.parent_version_id);
      if (!parent || parent.asset_id !== version.asset_id || Number(parent.version_number) >= Number(version.version_number)) {
        throw new Error('An asset version references an invalid parent version.');
      }
    }
  }
  const dnaIds = new Set<string>();
  for (const record of manifest.dnaRecords ?? []) {
    if (typeof record.id !== 'string' || !record.id || dnaIds.has(record.id)) throw new Error('A VYRAL DNA record has a missing or duplicate ID.');
    dnaIds.add(record.id);
    if (record.scope === 'asset' && (typeof record.asset_id !== 'string' || !assetIds.has(record.asset_id))) throw new Error('An asset DNA record references a missing asset.');
    if (record.scope === 'vyral' && record.asset_id !== null && record.asset_id !== undefined) throw new Error('A VYRAL-level DNA record cannot reference an asset.');
    if (record.scope !== 'asset' && record.scope !== 'vyral') throw new Error('A VYRAL DNA record has an invalid scope.');
  }
  for (const fingerprint of manifest.fingerprints ?? []) {
    if (typeof fingerprint.asset_id !== 'string' || !assetIds.has(fingerprint.asset_id)) throw new Error('A fingerprint references a missing asset.');
    if (typeof fingerprint.asset_version_id === 'string') {
      const version = versionById.get(fingerprint.asset_version_id);
      if (!version || version.asset_id !== fingerprint.asset_id) throw new Error('A fingerprint references an invalid asset version.');
    }
  }
  for (const observation of manifest.visionObservations ?? []) {
    if (typeof observation.asset_id !== 'string' || !assetIds.has(observation.asset_id)) throw new Error('An AI Vision observation references a missing asset.');
    if (typeof observation.asset_version_id === 'string') {
      const version = versionById.get(observation.asset_version_id);
      if (!version || version.asset_id !== observation.asset_id) throw new Error('An AI Vision observation references an invalid asset version.');
    }
  }
  for (const relation of manifest.lineage ?? []) {
    if (typeof relation.parent_asset_id !== 'string' || !assetIds.has(relation.parent_asset_id) || typeof relation.child_asset_id !== 'string' || !assetIds.has(relation.child_asset_id)) {
      throw new Error('An asset lineage record references a missing asset.');
    }
  }
  for (const test of manifest.reconstructionTests ?? []) {
    if (typeof test.asset_id !== 'string' || !assetIds.has(test.asset_id)) throw new Error('A reconstruction test references a missing asset.');
    if (typeof test.dna_record_id === 'string' && !dnaIds.has(test.dna_record_id)) throw new Error('A reconstruction test references a missing DNA record.');
    if (typeof test.asset_version_id === 'string') {
      const version = versionById.get(test.asset_version_id);
      if (!version || version.asset_id !== test.asset_id) throw new Error('A reconstruction test references an invalid asset version.');
    }
  }
  for (const record of manifest.dnaRecords ?? []) {
    if (record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3) {
      const dnaRecord = validateVyralDnaV3Record(record.dna_record);
      if (manifest.exportMode === 'dna-only' && manifest.blindReconstruction === true && dnaRecord.encoded_file_payload) {
        throw new Error('Blind DNA packages must not contain original encoded source-byte payloads.');
      }
      if (manifest.exportMode === 'dna-only' && !dnaRecord.decoded_image.sample_layout) {
        throw new Error('DNA-only packages must declare the canonical decoded-sample byte layout.');
      }
      const expectedRecoveryLevel = dnaRecord.encoded_file_payload ? 'source-file-exact' : 'decoded-samples-exact';
      if (record.id !== dnaRecord.record_id || record.asset_id !== dnaRecord.source.asset_id ||
          record.recovery_level !== expectedRecoveryLevel || !assetIds.has(dnaRecord.source.asset_id)) {
        throw new Error('A VYRA DNA v3 package record has inconsistent identity or recovery metadata.');
      }
      if (manifest.exportMode !== 'dna-only' && manifest.exportMode !== 'compact-only' && !versionById.has(dnaRecord.source.asset_version_id)) {
        throw new Error('A VYRA DNA v3 record references a source version missing from the package.');
      }
    } else if (record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1) {
      const fileDna = validateVyralFileDnaV1Record(record.dna_record);
      if (record.id !== fileDna.record_id || record.asset_id !== fileDna.source.asset_id ||
          !assetIds.has(fileDna.source.asset_id)) {
        throw new Error('A VYRA File DNA package record has inconsistent identity metadata.');
      }
      if (manifest.exportMode === 'dna-only' && manifest.blindReconstruction === true &&
          (fileDna.reconstruction.claim !== 'unavailable' || fileDna.reconstruction.payload_encoding !== 'none' ||
           fileDna.reconstruction.chunks.length !== 0 || record.recovery_level !== 'semantic-only')) {
        throw new Error('Blind DNA packages must exclude all original File DNA binary chunks.');
      }
      if (manifest.exportMode === 'dna-only' && manifest.blindReconstruction !== true &&
          (fileDna.reconstruction.claim !== 'source_file_exact' || record.recovery_level !== 'source-file-exact')) {
        throw new Error('DNA-only packages require lossless source-byte payloads for every non-raster Asset.');
      }
      if (manifest.exportMode !== 'dna-only' && manifest.exportMode !== 'compact-only' && !versionById.has(fileDna.source.asset_version_id)) {
        throw new Error('A VYRA File DNA record references a source version missing from the package.');
      }
    }
  }
  if (manifest.exportMode === 'compact-only') {
    if ((manifest.versions?.length ?? 0) || (manifest.dnaRecords?.length ?? 0) || !manifest.masterDna ||
        (manifest.folders?.length ?? 0) || (manifest.fingerprints?.length ?? 0) || (manifest.visionObservations?.length ?? 0) ||
        (manifest.lineage?.length ?? 0) || (manifest.reconstructionTests?.length ?? 0) || manifest.reconstructionCapabilities !== undefined) {
      throw new Error('A compact-only package must contain only the collection reference and Asset inventory.');
    }
  }
  if (manifest.exportMode === 'dna-only') {
    const capabilities = manifest.reconstructionCapabilities;
    const blind = manifest.blindReconstruction === true;
    if (blind && manifest.blindnessScope !== 'original_encoded_binary_excluded') {
      throw new Error('Blind DNA package must declare the exact scope of excluded source bytes.');
    }
    const dnaRecords = manifest.dnaRecords ?? [];
    const v3Records = dnaRecords.filter((record) =>
      record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3
    );
    const fileRecords = dnaRecords.filter((record) =>
      record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1
    );
    const supportedRecords = [...v3Records, ...fileRecords];
    const expectedDecoded = v3Records.length > 0;
    const expectedEncodedSource = !blind && supportedRecords.length > 0 && supportedRecords.every((record) => record.recovery_level === 'source-file-exact');
    if (!capabilities || capabilities.decoded_sample_stream_reconstructable !== expectedDecoded ||
        capabilities.source_decode_independently_verified !== false ||
        capabilities.encoded_source_bytes_recoverable !== expectedEncodedSource ||
        (blind ? capabilities.binary_source_bytes_reconstructable !== false : (fileRecords.length > 0 ? capabilities.binary_source_bytes_reconstructable !== true : (capabilities.binary_source_bytes_reconstructable !== undefined && capabilities.binary_source_bytes_reconstructable !== false))) ||
        typeof capabilities.color_space_fully_characterized !== 'boolean') {
      throw new Error('DNA-only reconstruction capability boundaries are missing or invalid.');
    }
    const recordCountsByAsset = new Map<string, number>();
    for (const record of supportedRecords) {
      const assetId = String(record.asset_id);
      recordCountsByAsset.set(assetId, (recordCountsByAsset.get(assetId) ?? 0) + 1);
    }
    const recordAssetIds = new Set(recordCountsByAsset.keys());
    const assetsNeedingDna = assets
      .filter((asset) => (recordCountsByAsset.get(String(asset.id)) ?? 0) !== 1)
      .map((asset) => {
        const count = recordCountsByAsset.get(String(asset.id)) ?? 0;
        return String(asset.name || asset.id) + (count > 1 ? ' (' + count + ' records)' : ' (DNA missing)');
      });
    const unsupportedRecordCount = dnaRecords.length - supportedRecords.length;
    const hasLegacyEvidence =
      (manifest.fingerprints ?? []).length !== 0 || (manifest.visionObservations ?? []).length !== 0 ||
      (manifest.lineage ?? []).length !== 0 || (manifest.reconstructionTests ?? []).length !== 0;
    if (supportedRecords.length === 0 || supportedRecords.length !== dnaRecords.length ||
        recordAssetIds.size !== supportedRecords.length || recordAssetIds.size !== assetIds.size ||
        [...assetIds].some((assetId) => !recordAssetIds.has(assetId)) || hasLegacyEvidence) {
      const inventory = assetsNeedingDna.length
        ? ' Assets needing exactly one supported DNA record: ' + assetsNeedingDna.join(', ') + '.'
        : '';
      const unsupported = unsupportedRecordCount > 0
        ? ' Unsupported or legacy DNA records: ' + unsupportedRecordCount + '.'
        : '';
      const evidence = hasLegacyEvidence
        ? ' Version-bound legacy evidence must be omitted.'
        : '';
      throw new Error(
        'DNA-only package is incomplete: ' + supportedRecords.length + ' supported exact reconstruction record(s) for ' +
        assetIds.size + ' Asset(s). Every Asset needs exactly one supported DNA v3 or File DNA v1 record.' +
        inventory + unsupported + evidence +
        ' Export a single supported Asset, or create current-version DNA for every Asset before exporting the whole Vyral.',
      );
    }
  }
  if (manifest.exportMode !== 'dna-only' && manifest.exportMode !== 'compact-only') {
    for (const assetId of assetIds) {
      if (!versionsByAsset.has(assetId)) throw new Error('Every VYRAL asset must include at least one binary version.');
    }
  }
  return manifest as VyralPackageManifest;
};

export const parseVyralManifest = (files: Map<string, Uint8Array>) => {
  const raw = files.get(VYRAL_PACKAGE_MANIFEST);
  if (!raw) throw new Error('The VYRAL package is missing manifest.json.');
  if (raw.byteLength > MAX_MANIFEST_BYTES) throw new Error('VYRAL manifest exceeds the 32 MB limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(raw)); }
  catch { throw new Error('VYRAL manifest is not valid UTF-8 JSON.'); }
  // Older DNA-only exports may still contain legacy DNA rows and evidence
  // tied to binary versions that the package intentionally omits. Those records
  // cannot be carried forward as portable evidence; discard them before applying
  // the strict exact-reconstruction contract. Supported DNA payloads remain
  // mandatory and are still validated one-per-Asset below.
  let candidate = parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).exportMode === 'dna-only') {
    const legacy = parsed as Record<string, unknown>;
    const dnaRecords = Array.isArray(legacy.dnaRecords) ? legacy.dnaRecords : [];
    const normalizedDnaRecords = dnaRecords.flatMap((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
      const entry = record as Record<string, unknown>;
      const payload = entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
        ? entry.payload as Record<string, unknown>
        : {};
      // Earlier VYRA exports stored DNA schema metadata inside the database
      // row's payload. Newer portable manifests store it at the record root.
      // Normalize both shapes before applying the strict one-record-per-Asset rule.
      const dnaRecord = entry.dna_record ?? payload.dna_record;
      const schemaId = entry.dna_schema_id ?? payload.dna_schema_id;
      const schemaVersion = Number(entry.dna_schema_version ?? payload.dna_schema_version);
      if (!dnaRecord || typeof dnaRecord !== 'object' || Array.isArray(dnaRecord)) return [];
      if (!((schemaId === 'vyra.asset-dna' && schemaVersion === 3) ||
            (schemaId === 'vyra.asset-file-dna' && schemaVersion === 1))) return [];
      const dnaValue = dnaRecord as Record<string, unknown>;
      const source = dnaValue.source && typeof dnaValue.source === 'object' && !Array.isArray(dnaValue.source)
        ? dnaValue.source as Record<string, unknown>
        : {};
      const { payload: _legacyPayload, ...base } = entry;
      return [{
        ...base,
        id: typeof dnaValue.record_id === 'string' ? dnaValue.record_id : entry.id,
        asset_id: typeof entry.asset_id === 'string' ? entry.asset_id : source.asset_id,
        dna_schema_id: schemaId,
        dna_schema_version: schemaVersion,
        dna_record: dnaRecord,
        recovery_level: entry.recovery_level ?? payload.recovery_level,
      }];
    });
    candidate = {
      ...legacy,
      dnaRecords: normalizedDnaRecords,
      fingerprints: [],
      visionObservations: [],
      lineage: [],
      reconstructionTests: [],
    };
  }
  const manifest = validateVyralManifest(candidate);
  validateVyralSystemFilesStructureV1(files, manifest as unknown as Record<string, unknown>);
  for (const version of manifest.versions) {
    if (!files.has(version.package_path)) throw new Error('Package media is missing: ' + version.package_path);
  }
  const dnaOnlyExpectedPaths = new Set<string>([VYRAL_PACKAGE_MANIFEST]);
  for (const staticPath of ['README.txt', 'AI_RECONSTRUCTION_GUIDE.md', 'tools/reconstruct_vyral.py']) {
    if (files.has(staticPath)) dnaOnlyExpectedPaths.add(staticPath);
  }
  // Protected System Files are required package metadata, not undeclared extras.
  for (const descriptor of manifest.systemFiles ?? []) {
    if (descriptor.path.startsWith('system/')) dnaOnlyExpectedPaths.add(descriptor.path);
  }
  for (const record of manifest.dnaRecords) {
    if (record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3) {
      const dnaRecord = validateVyralDnaV3Record(record.dna_record);
      for (const tile of dnaRecord.lossless_payload.tiles) {
        if (!files.has(tile.package_path)) throw new Error('DNA v3 package payload is missing: ' + tile.package_path);
        dnaOnlyExpectedPaths.add(tile.package_path);
      }
      for (const chunk of dnaRecord.encoded_file_payload?.chunks ?? []) {
        if (!files.has(chunk.package_path)) throw new Error('DNA v3 exact source-file payload is missing: ' + chunk.package_path);
        dnaOnlyExpectedPaths.add(chunk.package_path);
      }
    } else if (record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1) {
      const fileDna = validateVyralFileDnaV1Record(record.dna_record);
      for (const chunk of fileDna.reconstruction.chunks) {
        if (!files.has(chunk.package_path)) throw new Error('File DNA package payload is missing: ' + chunk.package_path);
        dnaOnlyExpectedPaths.add(chunk.package_path);
      }
    }
  }
  if (manifest.exportMode === 'compact-only') {
    for (const path of files.keys()) {
      if (path !== VYRAL_PACKAGE_MANIFEST && path !== 'README.txt' && path !== 'AI_RECONSTRUCTION_GUIDE.md' && !path.startsWith('system/')) {
        throw new Error('Compact-only package contains an undeclared file: ' + path);
      }
    }
    if (!manifest.masterDna) throw new Error('Compact-only package is missing collection reference data.');
  }
  if (manifest.exportMode === 'dna-only') {
    // A DNA-only archive is a strict portable reconstruction unit: reject any
    // undeclared file, including source media, previews, derivatives or hidden extras.
    for (const path of files.keys()) {
      if (!dnaOnlyExpectedPaths.has(path)) {
        throw new Error('DNA-only package contains an undeclared file: ' + path);
      }
    }
    if (files.size !== dnaOnlyExpectedPaths.size) {
      throw new Error('DNA-only package entry count does not match its manifest.');
    }
  }
  return manifest;
};

/**
 * Builds a DNA-only .vyral archive. The original media version is deliberately
 * omitted; the lossless DNA tiles are retained as first-class package payload.
 * URL/storage/preview/derivative fields are removed recursively from exported metadata.
 */
export type VyralExportComponents = {
  assets: boolean;
  fullDna: boolean;
  compactDna: boolean;
};

/**
 * Projects a validated full package onto the exact components selected by the
 * creator. Asset binaries, full per-Asset reconstruction DNA, and compact
 * collection DNA are independent package components.
 */
const createCompactVyralMasterDnaPackageProjection = async (
  value: VyralMasterDnaV1,
): Promise<VyralMasterDnaV1> => {
  const validated = await validateVyralMasterDnaV1(value);
  const { schema_id, schema_version, integrity, purpose: _purpose, relationships: _relationships, ...unsigned } = validated;
  void schema_id;
  void schema_version;
  void integrity;
  const isPublic = unsigned.source_resolution.visibility === 'public';
  const retrievalPolicy = isPublic
    ? unsigned.portable_projection.retrieval_policy
    : 'no_remote_resolution';
  return createVyralMasterDnaV1({
    ...unsigned,
    vyral: { vyral_id: unsigned.vyral.vyral_id, name: unsigned.vyral.name },
    snapshot: { revision: unsigned.snapshot.revision, created_at: unsigned.snapshot.created_at },
    main_asset_ids: [],
    assets: unsigned.assets.map((asset) => ({
      asset_id: asset.asset_id,
      asset_version_id: asset.asset_version_id,
      media_type: asset.media_type,
      dna_ref: {
        record_id: asset.dna_ref.record_id,
        schema_id: asset.dna_ref.schema_id,
        schema_version: asset.dna_ref.schema_version,
      },
      asset_fingerprint: asset.asset_fingerprint,
      reconstruction_claim: asset.reconstruction_claim,
    })),
    reconstruction_profile: {
      overall_claim: unsigned.reconstruction_profile.overall_claim,
      notes: [],
    },
    provenance: {
      creator_ref: null,
      license_ref: null,
      evidence_status: 'unknown',
    },
    source_resolution: {
      visibility: unsigned.source_resolution.visibility,
      canonical_uri: null,
      resolution_policy: isPublic ? 'public_metadata' : 'no_remote_resolution',
      ...(isPublic && unsigned.source_resolution.public_revision != null
        ? { public_revision: unsigned.source_resolution.public_revision }
        : {}),
    },
    portable_projection: {
      profile: 'compact',
      includes_full_reconstruction_payloads: false,
      resolver_uri: isPublic && retrievalPolicy === 'authorized_selective_retrieval'
        ? unsigned.portable_projection.resolver_uri
        : null,
      retrieval_policy: isPublic ? retrievalPolicy : 'no_remote_resolution',
      ...(unsigned.portable_projection.max_assets_per_request != null
        ? { max_assets_per_request: unsigned.portable_projection.max_assets_per_request }
        : {}),
    },
  });
};

export const selectVyralPackageComponents = async (
  archive: Blob,
  components: VyralExportComponents,
): Promise<Blob> => {
  if (!components.assets && !components.fullDna && !components.compactDna) {
    throw new Error('Choose at least one item to include in the Vyral export.');
  }
  const files = await readVyralZip(archive);
  const manifest = parseVyralManifest(files);
  if (!components.assets && components.fullDna) {
    throw new Error('Full reconstruction data without original Assets must use the dedicated DNA-only export builder.');
  }
  if (components.compactDna && !manifest.masterDna) {
    throw new Error('Compact collection data is not available yet. Update the Vyral collection data and try again.');
  }
  if (components.compactDna && manifest.masterDna) {
    await validateVyralMasterDnaV1(manifest.masterDna);
  }
  const retained = new Set<string>([VYRAL_PACKAGE_MANIFEST]);
  if (files.has('README.txt')) retained.add('README.txt');
  if ((components.fullDna || components.compactDna) && files.has('AI_RECONSTRUCTION_GUIDE.md')) retained.add('AI_RECONSTRUCTION_GUIDE.md');
  if (components.fullDna && files.has('tools/reconstruct_vyral.py')) retained.add('tools/reconstruct_vyral.py');

  if (components.assets) {
    for (const version of manifest.versions) retained.add(version.package_path);
  }
  if (components.fullDna) {
    for (const record of manifest.dnaRecords) {
      if (record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3) {
        const dna = validateVyralDnaV3Record(record.dna_record);
        for (const tile of dna.lossless_payload.tiles) retained.add(tile.package_path);
      } else if (record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1) {
        const dna = validateVyralFileDnaV1Record(record.dna_record);
        for (const chunk of dna.reconstruction.chunks) retained.add(chunk.package_path);
      }
    }
  }

  const projected: VyralPackageManifest = {
    ...manifest,
    exportMode: components.assets ? 'full' : components.fullDna ? 'dna-only' : 'compact-only',
    exportComponents: { ...components },
    folders: components.assets ? manifest.folders : [],
    assets: components.assets ? manifest.assets : [],
    versions: components.assets ? manifest.versions : [],
    dnaRecords: components.fullDna ? manifest.dnaRecords : [],
    fingerprints: components.fullDna ? manifest.fingerprints : [],
    visionObservations: components.fullDna ? manifest.visionObservations : [],
    lineage: components.fullDna ? manifest.lineage : [],
    reconstructionTests: components.fullDna ? manifest.reconstructionTests : [],
    ...(components.compactDna && manifest.masterDna
      ? { masterDna: await createCompactVyralMasterDnaPackageProjection(manifest.masterDna) }
      : { masterDna: null }),
    ...(!components.fullDna ? { reconstructionCapabilities: undefined } : {}),
  };

  if (!components.assets && !components.fullDna && !components.compactDna) {
    throw new Error('The Vyral export has no selected components.');
  }
  if (!components.assets && !components.fullDna && !projected.masterDna) {
    throw new Error('A compact-only export requires collection reference data.');
  }
  const entries: VyralPackageEntry[] = [];
  for (const [path, data] of files) {
    if (path === VYRAL_PACKAGE_MANIFEST) continue;
    if (retained.has(path)) entries.push({ path, data });
  }
  const systemPackage = await buildVyralSystemFilesV1(projected as unknown as Record<string, unknown>, entries);
  projected.systemFiles = systemPackage.descriptors;
  entries.push(...systemPackage.entries);
  entries.push({ path: VYRAL_PACKAGE_MANIFEST, data: JSON.stringify(projected) });
  const output = createVyralZip(entries);
  // Validate the projected manifest and ZIP structure before returning it.
  const projectedFiles = await readVyralZip(output);
  parseVyralManifest(projectedFiles);
  await verifyVyralSystemFileIntegrityV1(projectedFiles);
  return output;
};

const removeNonPortableReferences = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(removeNonPortableReferences);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'resolver_uri') {
      if (child === null || isSafePublicVyralResolverUriV1(child)) result[key] = child;
      continue;
    }
    if (/(url|preview|thumbnail|derivative|storage.?(path|prefix)|file.?path|download|signed)/i.test(key)) continue;
    result[key] = removeNonPortableReferences(child);
  }
  return result;
};

const packageClaimRank: Record<VyralMasterDnaAsset['reconstruction_claim'], number> = {
  unavailable: 0,
  model_reconstructed: 1,
  semantic_only: 2,
  lossless_decoded: 3,
  source_file_exact: 4,
};

const updateMasterDnaClaimsForPackage = async (
  value: VyralMasterDnaV1,
  claimsByAsset: Map<string, VyralMasterDnaAsset['reconstruction_claim']>,
): Promise<VyralMasterDnaV1> => {
  const validated = await validateVyralMasterDnaV1(value);
  const { schema_id, schema_version, integrity, ...unsigned } = validated;
  void schema_id;
  void schema_version;
  void integrity;
  const assets = unsigned.assets.map((asset) => {
    const claim = claimsByAsset.get(asset.asset_id);
    if (!claim) throw new Error('A DNA-only package is missing the reconstruction claim for Asset ' + asset.asset_id + '.');
    return { ...asset, reconstruction_claim: claim };
  });
  const overallClaim = assets.reduce((weakest, asset) =>
    packageClaimRank[asset.reconstruction_claim] < packageClaimRank[weakest]
      ? asset.reconstruction_claim : weakest,
  'source_file_exact' as VyralMasterDnaAsset['reconstruction_claim']);
  const packageClaimNote = 'Reconstruction claims reflect only the exact payloads included in this DNA-only package.';
  return createVyralMasterDnaV1({
    ...unsigned,
    assets,
    reconstruction_profile: {
      ...unsigned.reconstruction_profile,
      overall_claim: overallClaim,
      notes: unsigned.reconstruction_profile.notes.includes(packageClaimNote)
        ? unsigned.reconstruction_profile.notes
        : [...unsigned.reconstruction_profile.notes, packageClaimNote],
    },
  });
};

export const createVyralDnaOnlyPackage = async (
  baseManifest: VyralPackageManifest,
  dnaRecordValues: VyralDnaV3Record | VyralDnaV3Record[],
  payloadEntries: VyralDnaV3PackageEntry[],
) => {
  const inputRecords = Array.isArray(dnaRecordValues) ? dnaRecordValues : [dnaRecordValues];
  if (!inputRecords.length) throw new Error('DNA-only export requires at least one asset DNA v3 record.');
  if (!Array.isArray(payloadEntries)) throw new Error('DNA-only export payload entries must be an array.');

  const records = inputRecords.map((value) => {
    const validated = validateVyralDnaV3Record(value);
    return {
      ...validated,
      decoded_image: {
        ...validated.decoded_image,
        sample_layout: {
          row_order: 'top-to-bottom' as const,
          pixel_order: 'left-to-right' as const,
          channel_order: validated.decoded_image.channel_layout,
          packing: 'interleaved' as const,
          row_stride: 'tightly-packed' as const,
          hash_algorithm: 'SHA-256' as const,
          hash_scope: 'full-decoded-sample-stream' as const,
        },
      },
    };
  });

  const recordIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const record of records) {
    if (recordIds.has(record.record_id) || assetIds.has(record.source.asset_id)) {
      throw new Error('DNA-only export contains duplicate DNA record or asset identities.');
    }
    recordIds.add(record.record_id);
    assetIds.add(record.source.asset_id);
  }

  const payloadByPath = new Map<string, Uint8Array>();
  for (const entry of payloadEntries) {
    if (!entry || typeof entry.path !== 'string' || !(entry.data instanceof Uint8Array)) {
      throw new Error('DNA-only export contains an invalid DNA payload entry.');
    }
    if (payloadByPath.has(entry.path)) throw new Error('DNA-only export contains a duplicate DNA payload path.');
    payloadByPath.set(entry.path, entry.data);
  }
  const declaredPaths = new Set<string>();
  for (const record of records) {
    for (const tile of record.lossless_payload.tiles) {
      if (declaredPaths.has(tile.package_path)) throw new Error('DNA-only export contains a duplicate declared tile path.');
      declaredPaths.add(tile.package_path);
      const bytes = payloadByPath.get(tile.package_path);
      if (!bytes || bytes.byteLength !== tile.byte_length) {
        throw new Error('DNA-only export is missing a correctly sized tile: ' + tile.package_path);
      }
    }
    const recordPayload = new Map(record.lossless_payload.tiles.map((tile) => [tile.package_path, payloadByPath.get(tile.package_path)!]));
    await reconstructVyralDnaV3(record, recordPayload);
    if (record.encoded_file_payload) {
      for (const chunk of record.encoded_file_payload.chunks) {
        if (declaredPaths.has(chunk.package_path)) throw new Error('DNA-only export contains a duplicate declared source-file chunk path.');
        declaredPaths.add(chunk.package_path);
        const bytes = payloadByPath.get(chunk.package_path);
        if (!bytes || bytes.byteLength !== chunk.byte_length) {
          throw new Error('DNA-only export is missing a correctly sized original-file chunk: ' + chunk.package_path);
        }
      }
      const encoded = await reconstructVyralDnaV3EncodedFile(record, payloadByPath);
      if (encoded.byteLength !== record.encoded_file_payload.size_bytes) {
        throw new Error('DNA-only export original-file payload size does not match its source record.');
      }
    }
  }
  if (payloadByPath.size !== declaredPaths.size) {
    throw new Error('DNA-only export contains undeclared DNA payload entries.');
  }

  const portableBase = removeNonPortableReferences(baseManifest) as VyralPackageManifest;
  const selectedAssets = portableBase.assets.filter((asset) => assetIds.has(String(asset.id)));
  if (selectedAssets.length !== records.length) {
    throw new Error('Every DNA-only asset record must map to exactly one asset in the Vyral manifest.');
  }
  if (records.length > 1 && selectedAssets.length !== portableBase.assets.length) {
    throw new Error('A whole-Vyral DNA-only export requires a lossless DNA v3 record for every asset.');
  }
  if (portableBase.masterDna) {
    const masterDna = await validateVyralMasterDnaV1(portableBase.masterDna);
    const masterAssetIds = new Set(masterDna.assets.map((asset) => asset.asset_id));
    if (masterAssetIds.size !== assetIds.size || [...masterAssetIds].some((id) => !assetIds.has(id))) {
      throw new Error('Master DNA inventory does not match the DNA-only asset reconstruction set.');
    }
    const packageClaims = new Map<string, VyralMasterDnaAsset['reconstruction_claim']>(
      records.map((record) => [record.source.asset_id, record.encoded_file_payload ? 'source_file_exact' : 'lossless_decoded'] as const),
    );
    portableBase.masterDna = await updateMasterDnaClaimsForPackage(masterDna, packageClaims);
  }

  const dnaOnlyManifest: VyralPackageManifest = {
    ...portableBase,
    exportMode: 'dna-only',
    folders: [],
    versions: [],
    assets: selectedAssets.map((asset) => ({
      ...asset,
      folder_id: null,
      description_provenance: 'creator_declared',
      description_is_visual_measurement: false,
    })),
    reconstructionCapabilities: {
      decoded_sample_stream_reconstructable: true,
      source_decode_independently_verified: false,
      encoded_source_bytes_recoverable: records.every((record) => Boolean(record.encoded_file_payload)),
      color_space_fully_characterized: records.every((record) => record.decoded_image.color_space !== 'unknown'),
      verification_note: 'Package-level reconstruction capability only; source verification must be established by a separate trusted verifier. Each asset has its own decoded-sample digest.',
    },
    dnaRecords: records.map((record) => ({
      id: record.record_id,
      scope: 'asset',
      asset_id: record.source.asset_id,
      dna_schema_id: 'vyra.asset-dna',
      dna_schema_version: 3,
      recovery_level: record.encoded_file_payload ? 'source-file-exact' : 'decoded-samples-exact',
      dna_record: record,
    })),
    fingerprints: [],
    visionObservations: [],
    lineage: [],
    reconstructionTests: [],
  };
  validateVyralManifest(dnaOnlyManifest);
  const entries: VyralPackageEntry[] = [
    ...[...payloadByPath.entries()].map(([path, data]) => ({ path, data })),
    { path: 'README.txt', data: 'VYRAL DNA-only package. Read AI_RECONSTRUCTION_GUIDE.md and run tools/reconstruct_vyral.py with Python 3 to verify and reconstruct the included Assets.' },
    { path: 'AI_RECONSTRUCTION_GUIDE.md', data: VYRAL_AI_RECONSTRUCTION_GUIDE },
    { path: 'tools/reconstruct_vyral.py', data: VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT },
  ];
  const systemPackage = await buildVyralSystemFilesV1(dnaOnlyManifest as unknown as Record<string, unknown>, entries);
  dnaOnlyManifest.systemFiles = systemPackage.descriptors;
  entries.push(...systemPackage.entries);
  entries.push({ path: VYRAL_PACKAGE_MANIFEST, data: JSON.stringify(dnaOnlyManifest) });
  const archive = createVyralZip(entries);
  const packagedFiles = await readVyralZip(archive);
  parseVyralManifest(packagedFiles);
  await verifyVyralSystemFileIntegrityV1(packagedFiles);
  return archive;
};

export const createVyralAssetDnaOnlyPackage = async (
  baseManifest: VyralPackageManifest,
  dnaRecords: Array<VyralDnaV3Record | VyralFileDnaRecord>,
  payloadEntries: Array<VyralDnaV3PackageEntry | VyralFileDnaEntry>,
  includeCompactDna = true,
  blindReconstruction = false,
) => {
  if (!Array.isArray(dnaRecords) || dnaRecords.length === 0) throw new Error('DNA-only export requires at least one supported Asset DNA record.');
  if (!Array.isArray(payloadEntries)) throw new Error('DNA-only export payload entries must be an array.');
  const recordIds = new Set<string>();
  const assetIds = new Set<string>();
  const normalized: Array<{ schemaId: string; schemaVersion: number; recordId: string; assetId: string; value: VyralDnaV3Record | VyralFileDnaRecord }> = [];
  const payloadByPath = new Map<string, Uint8Array>();
  for (const entry of payloadEntries) {
    if (!entry || typeof entry.path !== 'string' || !(entry.data instanceof Uint8Array) || payloadByPath.has(entry.path)) {
      throw new Error('DNA-only export contains an invalid or duplicate payload entry.');
    }
    payloadByPath.set(entry.path, entry.data);
  }
  const declaredPaths = new Set<string>();
  let hasV3 = false;
  let hasFile = false;
  let hasRasterEncodedSource = false;
  for (const raw of dnaRecords) {
    if ('decoded_image' in raw) {
      const record = validateVyralDnaV3Record(raw);
      hasV3 = true;
      const recordWithLayout: VyralDnaV3Record = {
        ...record,
        ...(blindReconstruction ? { encoded_file_payload: undefined } : {}),
        decoded_image: {
          ...record.decoded_image,
          sample_layout: {
            row_order: 'top-to-bottom',
            pixel_order: 'left-to-right',
            channel_order: record.decoded_image.channel_layout,
            packing: 'interleaved',
            row_stride: 'tightly-packed',
            hash_algorithm: 'SHA-256',
            hash_scope: 'full-decoded-sample-stream',
          },
        },
      };
      for (const tile of recordWithLayout.lossless_payload.tiles) {
        if (declaredPaths.has(tile.package_path)) throw new Error('DNA-only export contains a duplicate declared payload path.');
        declaredPaths.add(tile.package_path);
        const bytes = payloadByPath.get(tile.package_path);
        if (!bytes || bytes.byteLength !== tile.byte_length) throw new Error('DNA-only export is missing a correctly sized DNA v3 tile: ' + tile.package_path);
      }
      const tiles = new Map(recordWithLayout.lossless_payload.tiles.map((tile) => [tile.package_path, payloadByPath.get(tile.package_path)!]));
      await reconstructVyralDnaV3(recordWithLayout, tiles);
      if (recordWithLayout.encoded_file_payload) {
        for (const chunk of recordWithLayout.encoded_file_payload.chunks) {
          if (declaredPaths.has(chunk.package_path)) throw new Error('DNA-only export contains a duplicate encoded source-byte path.');
          declaredPaths.add(chunk.package_path);
          const bytes = payloadByPath.get(chunk.package_path);
          if (!bytes || bytes.byteLength !== chunk.byte_length) throw new Error('DNA-only export is missing a correctly sized encoded source-byte chunk: ' + chunk.package_path);
        }
        const sourceChunks = new Map(recordWithLayout.encoded_file_payload.chunks.map((chunk) => [chunk.package_path, payloadByPath.get(chunk.package_path)!]));
        await reconstructVyralDnaV3EncodedFile(recordWithLayout, sourceChunks);
        hasRasterEncodedSource = true;
      }
      normalized.push({ schemaId: 'vyra.asset-dna', schemaVersion: 3, recordId: record.record_id, assetId: record.source.asset_id, value: recordWithLayout });
    } else {
      const validatedRecord = validateVyralFileDnaV1Record(raw);
      hasFile = true;
      const record: VyralFileDnaRecord = blindReconstruction
        ? { ...validatedRecord, reconstruction: { claim: 'unavailable', payload_encoding: 'none', chunk_size: null, chunks: [] } }
        : validatedRecord;
      if (!blindReconstruction && record.reconstruction.claim !== 'source_file_exact') throw new Error('DNA-only export requires lossless source-byte chunks for each non-raster Asset.');
      for (const chunk of record.reconstruction.chunks) {
        if (declaredPaths.has(chunk.package_path)) throw new Error('DNA-only export contains a duplicate declared payload path.');
        declaredPaths.add(chunk.package_path);
        const bytes = payloadByPath.get(chunk.package_path);
        if (!bytes || bytes.byteLength !== chunk.byte_length) throw new Error('DNA-only export is missing a correctly sized source-byte chunk: ' + chunk.package_path);
      }
      if (!blindReconstruction) {
        const chunks = new Map(record.reconstruction.chunks.map((chunk) => [chunk.package_path, payloadByPath.get(chunk.package_path)!]));
        await reconstructVyralFileDnaV1(record, chunks);
      }
      normalized.push({ schemaId: 'vyra.asset-file-dna', schemaVersion: 1, recordId: record.record_id, assetId: record.source.asset_id, value: record });
    }
    const last = normalized[normalized.length - 1];
    if (recordIds.has(last.recordId) || assetIds.has(last.assetId)) throw new Error('DNA-only export contains duplicate DNA record or Asset identities.');
    recordIds.add(last.recordId);
    assetIds.add(last.assetId);
  }
  if (blindReconstruction) {
    for (const path of [...payloadByPath.keys()]) if (!declaredPaths.has(path)) payloadByPath.delete(path);
  }
  if (payloadByPath.size !== declaredPaths.size) throw new Error('DNA-only export contains undeclared DNA payload entries.');
  const portableBase = removeNonPortableReferences(baseManifest) as VyralPackageManifest;
  if (!includeCompactDna) portableBase.masterDna = null;
  const selectedAssets = portableBase.assets.filter((asset) => assetIds.has(String(asset.id)));
  if (selectedAssets.length !== normalized.length) throw new Error('Every DNA-only record must map to exactly one Asset in the Vyral manifest.');
  if (normalized.length > 1 && selectedAssets.length !== portableBase.assets.length) throw new Error('A whole-Vyral DNA-only export requires a reconstruction record for every Asset.');
  if (portableBase.masterDna) {
    const masterDna = await validateVyralMasterDnaV1(portableBase.masterDna);
    const masterAssetsById = new Map(masterDna.assets.map((asset) => [asset.asset_id, asset]));
    const masterIds = new Set(masterAssetsById.keys());
    if (masterIds.size !== assetIds.size || [...masterIds].some((id) => !assetIds.has(id))) throw new Error('Master DNA inventory does not match the DNA-only Asset set.');
    for (const item of normalized) {
      const masterAsset = masterAssetsById.get(item.assetId);
      if (!masterAsset || masterAsset.dna_ref.record_id !== item.recordId ||
          masterAsset.dna_ref.schema_id !== item.schemaId || masterAsset.dna_ref.schema_version !== item.schemaVersion) {
        throw new Error('Master DNA does not reference the exact portable DNA record for Asset ' + item.assetId + '.');
      }
    }
    const packageClaims = new Map<string, VyralMasterDnaAsset['reconstruction_claim']>();
    for (const item of normalized) {
      packageClaims.set(item.assetId, item.schemaId === 'vyra.asset-file-dna'
        ? (blindReconstruction ? 'semantic_only' : 'source_file_exact')
        : (item.value as VyralDnaV3Record).encoded_file_payload ? 'source_file_exact' : 'lossless_decoded');
    }
    portableBase.masterDna = await updateMasterDnaClaimsForPackage(masterDna, packageClaims);
  }
  const dnaOnlyManifest: VyralPackageManifest = {
    ...portableBase,
    exportMode: 'dna-only',
    ...(blindReconstruction ? { blindReconstruction: true, blindnessScope: 'original_encoded_binary_excluded' } : {}),
    exportComponents: { assets: false, fullDna: true, compactDna: includeCompactDna && Boolean(portableBase.masterDna) },
    folders: [],
    versions: [],
    assets: selectedAssets.map((asset) => ({ ...asset, folder_id: null, description_provenance: 'creator_declared', description_is_visual_measurement: false })),
    reconstructionCapabilities: {
      decoded_sample_stream_reconstructable: hasV3,
      source_decode_independently_verified: false,
      encoded_source_bytes_recoverable: !blindReconstruction && (hasRasterEncodedSource || (!hasV3 && hasFile)),
      binary_source_bytes_reconstructable: !blindReconstruction && (hasRasterEncodedSource || hasFile),
      color_space_fully_characterized: normalized.filter((item) => item.schemaId === 'vyra.asset-dna').every((item) => (item.value as VyralDnaV3Record).decoded_image.color_space !== 'unknown'),
      verification_note: blindReconstruction
        ? 'Blind DNA export: original encoded source bytes are excluded. Raster DNA v3 contains decoded pixel samples; File DNA v1 contains structural facts only and cannot restore original binary bytes.'
        : 'Each Asset has its own exact reconstruction payload: decoded sample streams for raster DNA v3 and original source bytes for File DNA v1. Claims remain per-Asset and do not imply independent source-decoder verification.',
    },
    dnaRecords: normalized.map((item) => ({
      id: item.recordId,
      scope: 'asset',
      asset_id: item.assetId,
      dna_schema_id: item.schemaId,
      dna_schema_version: item.schemaVersion,
      recovery_level: item.schemaId === 'vyra.asset-dna' ? 'decoded-samples-exact' : blindReconstruction ? 'semantic-only' : 'source-file-exact',
      dna_record: item.value,
    })),
    fingerprints: [],
    visionObservations: [],
    lineage: [],
    reconstructionTests: [],
  };
  validateVyralManifest(dnaOnlyManifest);
  const entries: VyralPackageEntry[] = [
    ...[...payloadByPath.entries()].map(([path, data]) => ({ path, data })),
    { path: 'README.txt', data: blindReconstruction
      ? 'VYRAL BINARY-FREE DNA PACKAGE. Original encoded source bytes are excluded. Raster Assets still contain decoded pixel samples; non-raster Assets contain structural DNA only and require modality-specific semantic reconstruction. This is not a blind generative reconstruction test.'
      : 'VYRAL DNA-only package. Read AI_RECONSTRUCTION_GUIDE.md and run tools/reconstruct_vyral.py with Python 3 to verify and reconstruct the included Assets.' },
    { path: 'AI_RECONSTRUCTION_GUIDE.md', data: VYRAL_AI_RECONSTRUCTION_GUIDE },
    { path: 'tools/reconstruct_vyral.py', data: VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT },
  ];
  // DNA-only is still a .vyral package and must carry the protected System Files.
  const systemPackage = await buildVyralSystemFilesV1(dnaOnlyManifest as unknown as Record<string, unknown>, entries);
  dnaOnlyManifest.systemFiles = systemPackage.descriptors;
  entries.push(...systemPackage.entries);
  entries.push({ path: VYRAL_PACKAGE_MANIFEST, data: JSON.stringify(dnaOnlyManifest) });
  const archive = createVyralZip(entries);
  const packagedFiles = await readVyralZip(archive);
  parseVyralManifest(packagedFiles);
  await verifyVyralSystemFileIntegrityV1(packagedFiles);
  return archive;
};

export const reconstructVyralFileDnaFromPackage = async (files: Map<string, Uint8Array>, recordId: string) => {
  const manifest = parseVyralManifest(files);
  const entry = manifest.dnaRecords.find((record) =>
    record.id === recordId && record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1,
  );
  if (!entry) throw new Error('The VYRAL package does not contain the requested File DNA v1 record.');
  const fileDna = validateVyralFileDnaV1Record(entry.dna_record);
  if (fileDna.source.asset_id !== entry.asset_id || !manifest.assets.some((asset) => asset.id === entry.asset_id)) {
    throw new Error('File DNA source Asset identity does not match the package inventory.');
  }
  const sourceVersion = manifest.versions.find((version) => version.id === fileDna.source.asset_version_id);
  if (manifest.exportMode !== 'dna-only' && (
      !sourceVersion || sourceVersion.asset_id !== entry.asset_id ||
      Number(sourceVersion.size_bytes) !== fileDna.file.size_bytes ||
      String(sourceVersion.sha256 ?? '').toLowerCase() !== fileDna.file.sha256.toLowerCase()
    )) {
    throw new Error('File DNA source version does not match the exact package Asset version.');
  }
  const chunks = new Map(fileDna.reconstruction.chunks.map((chunk) => [chunk.package_path, files.get(chunk.package_path)!]));
  return reconstructVyralFileDnaV1(fileDna, chunks);
};

export const reconstructVyralDnaV3FromPackage = async (
  files: Map<string, Uint8Array>,
  recordId: string,
) => {
  const manifest = parseVyralManifest(files);
  const entry = manifest.dnaRecords.find((record) =>
    record.id === recordId && record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3,
  );
  if (!entry) throw new Error('The VYRAL package does not contain the requested DNA v3 record.');
  const dnaRecord = validateVyralDnaV3Record(entry.dna_record);
  const tileFiles = new Map<string, Uint8Array>();
  for (const tile of dnaRecord.lossless_payload.tiles) {
    const bytes = files.get(tile.package_path);
    if (!bytes) throw new Error('DNA v3 package payload is missing: ' + tile.package_path);
    tileFiles.set(tile.package_path, bytes);
  }
  return reconstructVyralDnaV3(dnaRecord, tileFiles);
};

export const reconstructVyralDnaV3EncodedFileFromPackage = async (
  files: Map<string, Uint8Array>,
  recordId: string,
) => {
  const manifest = parseVyralManifest(files);
  const entry = manifest.dnaRecords.find((record) =>
    record.id === recordId && record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3,
  );
  if (!entry) throw new Error('The VYRAL package does not contain the requested DNA v3 record.');
  const dnaRecord = validateVyralDnaV3Record(entry.dna_record);
  if (!dnaRecord.encoded_file_payload) throw new Error('The DNA v3 package does not include exact original encoded-file bytes.');
  const chunkFiles = new Map<string, Uint8Array>();
  for (const chunk of dnaRecord.encoded_file_payload.chunks) {
    const bytes = files.get(chunk.package_path);
    if (!bytes) throw new Error('DNA v3 exact source-file payload is missing: ' + chunk.package_path);
    chunkFiles.set(chunk.package_path, bytes);
  }
  return reconstructVyralDnaV3EncodedFile(dnaRecord, chunkFiles);
};

const pngUint32 = (value: number) => new Uint8Array([
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]);

const pngChunk = (type: string, data: Uint8Array) => {
  const typeBytes = encoder.encode(type);
  const checksumInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  checksumInput.set(typeBytes, 0);
  checksumInput.set(data, typeBytes.byteLength);
  const chunk = new Uint8Array(12 + data.byteLength);
  chunk.set(pngUint32(data.byteLength), 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(pngUint32(crc32(checksumInput)), 8 + data.byteLength);
  return chunk;
};

/**
 * Encodes the exact decoded RGB/RGBA samples as a new PNG container.
 * This deliberately does not claim to recover the original PNG/JPEG bytes.
 */
export const encodeVyralDnaV3PngFromPackage = async (
  files: Map<string, Uint8Array>,
  recordId: string,
) => {
  const reconstruction = await reconstructVyralDnaV3FromPackage(files, recordId);
  const channels = reconstruction.channel_layout === 'RGBA' ? 4 : 3;
  const rowBytes = reconstruction.width * channels;
  const rawLength = reconstruction.height * (rowBytes + 1);
  if (!Number.isSafeInteger(rawLength) || rawLength > 100 * 1024 * 1024) {
    throw new Error('DNA v3 PNG reconstruction exceeds the 100 MB output limit.');
  }

  // PNG filter type 0 preserves each source sample byte without prediction.
  const scanlines = new Uint8Array(rawLength);
  for (let y = 0; y < reconstruction.height; y += 1) {
    const targetStart = y * (rowBytes + 1);
    scanlines[targetStart] = 0;
    const sourceStart = y * rowBytes;
    scanlines.set(reconstruction.samples.subarray(sourceStart, sourceStart + rowBytes), targetStart + 1);
  }

  // A zlib stream of uncompressed DEFLATE blocks keeps the encoder deterministic
  // and avoids browser canvas color-management or alpha-premultiplication changes.
  const deflateParts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < scanlines.byteLength;) {
    const length = Math.min(65535, scanlines.byteLength - offset);
    const finalBlock = offset + length === scanlines.byteLength;
    const header = new Uint8Array([
      finalBlock ? 1 : 0,
      length & 0xff,
      (length >>> 8) & 0xff,
      (~length) & 0xff,
      ((~length) >>> 8) & 0xff,
    ]);
    deflateParts.push(header, scanlines.subarray(offset, offset + length));
    offset += length;
  }
  let adlerA = 1;
  let adlerB = 0;
  for (const value of scanlines) {
    adlerA = (adlerA + value) % 65521;
    adlerB = (adlerB + adlerA) % 65521;
  }
  deflateParts.push(pngUint32(((adlerB << 16) | adlerA) >>> 0));
  const zlibLength = deflateParts.reduce((sum, part) => sum + part.byteLength, 0);
  const zlib = new Uint8Array(zlibLength);
  let zlibOffset = 0;
  for (const part of deflateParts) {
    zlib.set(part, zlibOffset);
    zlibOffset += part.byteLength;
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(pngUint32(reconstruction.width), 0);
  ihdr.set(pngUint32(reconstruction.height), 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib),
    pngChunk('IEND', new Uint8Array()),
  ];
  const pngLength = chunks.reduce((sum, part) => sum + part.byteLength, 0);
  const pngBytes = new Uint8Array(pngLength);
  let pngOffset = 0;
  for (const part of chunks) {
    pngBytes.set(part, pngOffset);
    pngOffset += part.byteLength;
  }
  return { ...reconstruction, pngBytes };
};
