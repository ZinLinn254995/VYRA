export const VYRAL_PACKAGE_FORMAT = 'application/vnd.vyra.vyral+zip';
export const VYRAL_PACKAGE_VERSION = 1;
export const VYRAL_PACKAGE_MANIFEST = 'manifest.json';

export type VyralPackageEntry = { path: string; data: Uint8Array | string };

export type VyralPackageManifest = {
  format: typeof VYRAL_PACKAGE_FORMAT;
  formatVersion: number;
  packageId: string;
  exportedAt: string;
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
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
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
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('VYRAL package exceeds the 512 MB archive limit.');
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
  return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.vyra.vyral+zip' });
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
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (next > centralOffset + centralSize) throw new Error('Malformed ZIP entry metadata.');
    if (flags & 0x0009) throw new Error('Encrypted ZIP entries and data descriptors are not supported.');
    if (method !== 0) throw new Error('This VYRAL package reader currently supports ZIP Store (no-compression) entries only.');
    if (compressedSize !== uncompressedSize) throw new Error('Invalid stored ZIP entry size.');
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!safePath(path) || files.has(path)) throw new Error('Unsafe or duplicate ZIP entry path: ' + path);
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== localHeaderSignature) throw new Error('Invalid local ZIP entry header.');
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
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
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Unexpected ZIP central directory size.');
  return files;
};

export const validateVyralManifest = (value: unknown): VyralPackageManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('VYRAL manifest must be a JSON object.');
  const manifest = value as Partial<VyralPackageManifest>;
  if (manifest.format !== VYRAL_PACKAGE_FORMAT) throw new Error('This file is not a supported VYRAL package.');
  if (manifest.formatVersion !== VYRAL_PACKAGE_VERSION) throw new Error('Unsupported VYRAL package version: ' + String(manifest.formatVersion));
  if (typeof manifest.packageId !== 'string' || typeof manifest.exportedAt !== 'string') throw new Error('VYRAL package identity metadata is missing.');
  if (!manifest.vyral || typeof manifest.vyral !== 'object' || typeof manifest.vyral.name !== 'string') throw new Error('VYRAL collection metadata is invalid.');
  for (const key of ['folders','assets','versions','dnaRecords','fingerprints','visionObservations','lineage','reconstructionTests'] as const) {
    if (!Array.isArray(manifest[key])) throw new Error('VYRAL manifest section is missing or invalid: ' + key);
  }
  const packagePaths = new Set<string>();
  for (const version of manifest.versions ?? []) {
    if (typeof version.package_path !== 'string' || !safePath(version.package_path) || !version.package_path.startsWith('assets/')) throw new Error('Invalid asset package path.');
    if (packagePaths.has(version.package_path)) throw new Error('Duplicate asset package path.');
    packagePaths.add(version.package_path);
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
  return manifest;
};
