import {
  reconstructVyralDnaV3,
  validateVyralDnaV3Record,
  type VyralDnaV3Record,
  type VyralDnaV3PackageEntry,
} from './vyralDnaV3.ts';

export const VYRAL_PACKAGE_FORMAT = 'application/vnd.vyra.vyral+zip';
export const VYRAL_PACKAGE_VERSION = 1;
export const VYRAL_PACKAGE_MANIFEST = 'manifest.json';

export type VyralPackageEntry = { path: string; data: Uint8Array | string };

export type VyralPackageManifest = {
  format: typeof VYRAL_PACKAGE_FORMAT;
  formatVersion: number;
  packageId: string;
  exportedAt: string;
  exportMode?: 'full' | 'dna-only';
  vyral: Record<string, unknown>;
  folders: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  versions: (Record<string, unknown> & { package_path: string })[];
  dnaRecords: Record<string, unknown>[];
  fingerprints: Record<string, unknown>[];
  visionObservations: Record<string, unknown>[];
  lineage: Record<string, unknown>[];
  reconstructionTests: Record<string, unknown>[];
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
  if (typeof manifest.packageId !== 'string' || !manifest.packageId.trim() || manifest.packageId.length > 128 || typeof manifest.exportedAt !== 'string' || !Number.isFinite(Date.parse(manifest.exportedAt))) throw new Error('VYRAL package identity metadata is missing or invalid.');
  if (!manifest.vyral || typeof manifest.vyral !== 'object' || typeof manifest.vyral.name !== 'string' || !manifest.vyral.name.trim()) throw new Error('VYRAL collection metadata is invalid.');
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
      if (record.id !== dnaRecord.record_id || record.asset_id !== dnaRecord.source.asset_id ||
          record.recovery_level !== 'decoded-samples-exact' || !assetIds.has(dnaRecord.source.asset_id)) {
        throw new Error('A VYRA DNA v3 package record has inconsistent identity or recovery metadata.');
      }
      if (manifest.exportMode !== 'dna-only' && !versionById.has(dnaRecord.source.asset_version_id)) {
        throw new Error('A VYRA DNA v3 record references a source version missing from the package.');
      }
    }
  }
  if (manifest.exportMode !== 'dna-only') {
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
  const manifest = validateVyralManifest(parsed);
  for (const version of manifest.versions) {
    if (!files.has(version.package_path)) throw new Error('Package media is missing: ' + version.package_path);
  }
  for (const record of manifest.dnaRecords) {
    if (record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3) {
      const dnaRecord = validateVyralDnaV3Record(record.dna_record);
      for (const tile of dnaRecord.lossless_payload.tiles) {
        if (!files.has(tile.package_path)) throw new Error('DNA v3 package payload is missing: ' + tile.package_path);
      }
    }
  }
  return manifest;
};

/**
 * Builds a DNA-only .vyral archive. The original media version is deliberately
 * omitted; the lossless DNA tiles are retained as first-class package payload.
 * URL/storage/preview/derivative fields are removed recursively from exported metadata.
 */
const removeNonPortableReferences = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(removeNonPortableReferences);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(url|preview|thumbnail|derivative|storage.?path|file.?path|download|signed)/i.test(key)) continue;
    result[key] = removeNonPortableReferences(child);
  }
  return result;
};

export const createVyralDnaOnlyPackage = (
  baseManifest: VyralPackageManifest,
  dnaRecordValue: VyralDnaV3Record,
  payloadEntries: VyralDnaV3PackageEntry[],
) => {
  const dnaRecord = validateVyralDnaV3Record(dnaRecordValue);
  if (!Array.isArray(payloadEntries) || payloadEntries.length !== dnaRecord.lossless_payload.tiles.length) {
    throw new Error('DNA-only export requires every declared v3 tile payload exactly once.');
  }
  const payloadByPath = new Map<string, Uint8Array>();
  for (const entry of payloadEntries) {
    if (!entry || typeof entry.path !== 'string' || !(entry.data instanceof Uint8Array)) {
      throw new Error('DNA-only export contains an invalid DNA payload entry.');
    }
    if (payloadByPath.has(entry.path)) throw new Error('DNA-only export contains a duplicate DNA payload path.');
    payloadByPath.set(entry.path, entry.data);
  }
  for (const tile of dnaRecord.lossless_payload.tiles) {
    const bytes = payloadByPath.get(tile.package_path);
    if (!bytes || bytes.byteLength !== tile.byte_length) throw new Error('DNA-only export is missing a correctly sized tile: ' + tile.package_path);
  }
  if (payloadByPath.size !== dnaRecord.lossless_payload.tiles.length) {
    throw new Error('DNA-only export contains undeclared DNA payload entries.');
  }

  const portableBase = removeNonPortableReferences(baseManifest) as VyralPackageManifest;
  const dnaOnlyManifest: VyralPackageManifest = {
    ...portableBase,
    exportMode: 'dna-only',
    versions: [],
    dnaRecords: [
      ...portableBase.dnaRecords.filter((record) => record.id !== dnaRecord.record_id),
      {
        id: dnaRecord.record_id,
        scope: 'asset',
        asset_id: dnaRecord.source.asset_id,
        dna_schema_id: 'vyra.asset-dna',
        dna_schema_version: 3,
        recovery_level: 'decoded-samples-exact',
        dna_record: dnaRecord,
      },
    ],
  };
  validateVyralManifest(dnaOnlyManifest);
  const entries: VyralPackageEntry[] = [
    ...payloadEntries.map((entry) => ({ path: entry.path, data: entry.data })),
    { path: VYRAL_PACKAGE_MANIFEST, data: JSON.stringify(dnaOnlyManifest) },
  ];
  return createVyralZip(entries);
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
