export const VYRAL_FILE_DNA_SCHEMA_ID = 'vyra.asset-file-dna' as const;
export const VYRAL_FILE_DNA_SCHEMA_VERSION = 1 as const;

export type VyralFileDnaChunk = {
  index: number;
  byte_length: number;
  sha256: string;
  package_path: string;
};

export type VyralFileDnaRecord = {
  schema_id: typeof VYRAL_FILE_DNA_SCHEMA_ID;
  schema_version: typeof VYRAL_FILE_DNA_SCHEMA_VERSION;
  record_id: string;
  source: {
    asset_id: string;
    asset_version_id: string;
  };
  file: {
    size_bytes: number;
    mime_type: string;
    extension: string | null;
    format_signature: string;
    sha256: string;
  };
  extractor: { name: string; version: string };
  reconstruction: {
    claim: 'source_file_exact' | 'unavailable';
    payload_encoding: 'raw-chunks-v1' | 'none';
    chunk_size: number | null;
    chunks: VyralFileDnaChunk[];
  };
};

export type VyralFileDnaEntry = { path: string; data: Uint8Array };

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const copyBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const sha256 = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hex = (bytes: Uint8Array, length = 16) =>
  Array.from(bytes.subarray(0, length), (byte) => byte.toString(16).padStart(2, '0')).join('');

const detectSignature = (bytes: Uint8Array): string => {
  if (bytes.length >= 8 && hex(bytes, 8) === '89504e470d0a1a0a') return 'png';
  if (bytes.length >= 3 && hex(bytes, 3) === 'ffd8ff') return 'jpeg';
  if (bytes.length >= 12 && hex(bytes.subarray(0, 4), 4) === '52494646' && hex(bytes.subarray(8, 12), 4) === '57454250') return 'webp';
  if (bytes.length >= 4 && hex(bytes, 4) === '47494638') return 'gif';
  if (bytes.length >= 4 && hex(bytes, 4) === '25504446') return 'pdf';
  if (bytes.length >= 4 && hex(bytes, 4) === '504b0304') return 'zip-container';
  if (bytes.length >= 4 && hex(bytes, 4) === '1f8b0800') return 'gzip';
  if (bytes.length >= 4 && hex(bytes, 4) === '4f676753') return 'ogg-container';
  if (bytes.length >= 4 && hex(bytes, 4) === '664c6143') return 'flac';
  if (bytes.length >= 4 && hex(bytes, 4) === '52494646') return 'riff-container';
  if (bytes.length >= 4 && hex(bytes, 4) === '00000018') return 'iso-bmff-family';
  if (bytes.length >= 4 && hex(bytes, 4) === '2321202f') return 'script-text';
  return 'unknown';
};

const validateSource = (source: unknown) => {
  if (!isObject(source) || typeof source.asset_id !== 'string' || !SAFE_ID.test(source.asset_id) ||
      typeof source.asset_version_id !== 'string' || !SAFE_ID.test(source.asset_version_id)) {
    throw new Error('File DNA source Asset and version IDs are invalid.');
  }
};

export const createVyralFileDnaV1 = async (input: {
  record_id: string;
  source: VyralFileDnaRecord['source'];
  bytes: Uint8Array;
  mime_type: string;
  filename?: string | null;
  extractor?: { name: string; version: string };
  include_payload?: boolean;
  chunk_size?: number;
}): Promise<{ record: VyralFileDnaRecord; entries: VyralFileDnaEntry[] }> => {
  if (!isObject(input) || typeof input.record_id !== 'string' || !SAFE_ID.test(input.record_id)) {
    throw new Error('File DNA record ID is invalid.');
  }
  validateSource(input.source);
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength <= 0) throw new Error('File DNA requires non-empty binary source bytes.');
  if (!isText(input.mime_type) || input.mime_type.length > 255) throw new Error('File DNA MIME type is invalid.');
  const extractor = input.extractor ?? { name: 'vyra-file-dna', version: '1.0.0' };
  if (!isObject(extractor) || !isText(extractor.name) || !isText(extractor.version)) throw new Error('File DNA extractor identity is invalid.');
  const chunkSize = input.chunk_size ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > MAX_CHUNK_SIZE) {
    throw new Error('File DNA chunk size must be between 1 byte and 8 MiB.');
  }

  const entries: VyralFileDnaEntry[] = [];
  const chunks: VyralFileDnaChunk[] = [];
  if (input.include_payload) {
    for (let offset = 0, index = 0; offset < input.bytes.byteLength; offset += chunkSize, index += 1) {
      const data = input.bytes.slice(offset, Math.min(offset + chunkSize, input.bytes.byteLength));
      const packagePath = `dna/file/v1/${input.record_id}/chunks/${index.toString().padStart(8, '0')}.bin`;
      chunks.push({ index, byte_length: data.byteLength, sha256: await sha256(data), package_path: packagePath });
      entries.push({ path: packagePath, data });
    }
  }

  const extension = input.filename?.match(/\.([a-zA-Z0-9]{1,16})$/)?.[1]?.toLowerCase() ?? null;
  const record: VyralFileDnaRecord = {
    schema_id: VYRAL_FILE_DNA_SCHEMA_ID,
    schema_version: VYRAL_FILE_DNA_SCHEMA_VERSION,
    record_id: input.record_id,
    source: { ...input.source },
    file: {
      size_bytes: input.bytes.byteLength,
      mime_type: input.mime_type.trim().toLowerCase(),
      extension,
      format_signature: detectSignature(input.bytes),
      sha256: await sha256(input.bytes),
    },
    extractor: { ...extractor },
    reconstruction: {
      claim: input.include_payload ? 'source_file_exact' : 'unavailable',
      payload_encoding: input.include_payload ? 'raw-chunks-v1' : 'none',
      chunk_size: input.include_payload ? chunkSize : null,
      chunks,
    },
  };
  validateVyralFileDnaV1Record(record);
  return { record, entries };
};

export const validateVyralFileDnaV1Record = (value: unknown): VyralFileDnaRecord => {
  if (!isObject(value) || value.schema_id !== VYRAL_FILE_DNA_SCHEMA_ID || value.schema_version !== VYRAL_FILE_DNA_SCHEMA_VERSION ||
      typeof value.record_id !== 'string' || !SAFE_ID.test(value.record_id)) {
    throw new Error('Unsupported or malformed VYRA File DNA v1 record.');
  }
  validateSource(value.source);
  const file = value.file;
  const extractor = value.extractor;
  const reconstruction = value.reconstruction;
  if (!isObject(file) || !Number.isSafeInteger(file.size_bytes) || Number(file.size_bytes) <= 0 ||
      !isText(file.mime_type) || file.mime_type.length > 255 ||
      !(file.extension === null || (typeof file.extension === 'string' && /^[a-z0-9]{1,16}$/.test(file.extension))) ||
      !isText(file.format_signature) || typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) {
    throw new Error('File DNA integrity and format metadata is invalid.');
  }
  if (!isObject(extractor) || !isText(extractor.name) || !isText(extractor.version)) throw new Error('File DNA extractor metadata is invalid.');
  if (!isObject(reconstruction) || !Array.isArray(reconstruction.chunks)) throw new Error('File DNA reconstruction metadata is invalid.');
  if (reconstruction.claim === 'unavailable' && reconstruction.payload_encoding === 'none' &&
      reconstruction.chunk_size === null && reconstruction.chunks.length === 0) return value as unknown as VyralFileDnaRecord;
  if (reconstruction.claim !== 'source_file_exact' || reconstruction.payload_encoding !== 'raw-chunks-v1' ||
      !Number.isSafeInteger(reconstruction.chunk_size) || Number(reconstruction.chunk_size) <= 0 ||
      Number(reconstruction.chunk_size) > MAX_CHUNK_SIZE || reconstruction.chunks.length === 0) {
    throw new Error('File DNA reconstruction claim does not match its payload declaration.');
  }
  let totalBytes = 0;
  const seen = new Set<string>();
  for (let index = 0; index < reconstruction.chunks.length; index += 1) {
    const chunk = reconstruction.chunks[index];
    if (!isObject(chunk) || chunk.index !== index || !Number.isSafeInteger(chunk.byte_length) ||
        Number(chunk.byte_length) <= 0 || Number(chunk.byte_length) > Number(reconstruction.chunk_size) ||
        typeof chunk.sha256 !== 'string' || !SHA256.test(chunk.sha256)) {
      throw new Error('File DNA chunk metadata is invalid or out of order.');
    }
    const expectedPath = `dna/file/v1/${value.record_id}/chunks/${index.toString().padStart(8, '0')}.bin`;
    if (chunk.package_path !== expectedPath || seen.has(expectedPath)) throw new Error('File DNA chunk path is invalid or duplicated.');
    seen.add(expectedPath);
    totalBytes += Number(chunk.byte_length);
  }
  if (totalBytes !== Number(file.size_bytes) ||
      Number(reconstruction.chunks[reconstruction.chunks.length - 1].byte_length) > Number(reconstruction.chunk_size)) {
    throw new Error('File DNA chunk coverage does not match the original file size.');
  }
  return value as unknown as VyralFileDnaRecord;
};

export const reconstructVyralFileDnaV1 = async (
  value: unknown,
  files: Map<string, Uint8Array>,
): Promise<Uint8Array> => {
  const record = validateVyralFileDnaV1Record(value);
  if (record.reconstruction.claim !== 'source_file_exact') throw new Error('File DNA package does not contain a source-file reconstruction payload.');
  if (!(files instanceof Map)) throw new Error('File DNA reconstruction requires a package file map.');
  const declared = new Set(record.reconstruction.chunks.map((chunk) => chunk.package_path));
  const prefix = `dna/file/v1/${record.record_id}/chunks/`;
  for (const path of files.keys()) {
    if (path.startsWith(prefix) && !declared.has(path)) throw new Error('File DNA package contains an undeclared chunk: ' + path);
  }
  const parts: Uint8Array[] = [];
  for (const chunk of record.reconstruction.chunks) {
    const bytes = files.get(chunk.package_path);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== chunk.byte_length || await sha256(bytes) !== chunk.sha256) {
      throw new Error('File DNA chunk is missing or failed integrity verification: ' + chunk.package_path);
    }
    parts.push(bytes);
  }
  const output = new Uint8Array(record.file.size_bytes);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  if (offset !== output.byteLength || await sha256(output) !== record.file.sha256) {
    throw new Error('Reconstructed source-file bytes do not match the recorded SHA-256.');
  }
  return output;
};
