const SHA256 = /^[a-f0-9]{64}$/i;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const MAX_CHUNK_SIZE = 8 * 1024 * 1024;

type FileDnaRecord = {
  schema_id?: unknown;
  schema_version?: unknown;
  record_id?: unknown;
  source?: { asset_id?: unknown; asset_version_id?: unknown };
  file?: { size_bytes?: unknown; mime_type?: unknown; sha256?: unknown };
  reconstruction?: { claim?: unknown; chunk_size?: unknown };
};

const digestHex = async (bytes: Uint8Array): Promise<string> => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
};

/**
 * Independently verifies that a stored immutable source can be represented by
 * File DNA v1 chunks and reconstructed byte-for-byte without model inference.
 * The payload is transient: the original source remains in protected Storage,
 * while portable exports materialize the chunks when explicitly requested.
 */
export const verifyVyralFileDnaSourceV1 = async (input: {
  record: FileDnaRecord;
  assetId: string;
  versionId: string;
  sourceBytes: Uint8Array;
  expectedSha256: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
}) => {
  const { record, sourceBytes } = input;
  if (record.schema_id !== 'vyra.asset-file-dna' || Number(record.schema_version) !== 1 ||
      record.source?.asset_id !== input.assetId || record.source?.asset_version_id !== input.versionId) {
    throw new Error('File DNA identity does not match the exact Asset version.');
  }
  const expectedHash = String(input.expectedSha256 ?? '').toLowerCase();
  const recordHash = String(record.file?.sha256 ?? '').toLowerCase();
  const expectedSize = Number(input.expectedSizeBytes);
  if (!SHA256.test(expectedHash) || recordHash !== expectedHash ||
      Number(record.file?.size_bytes) !== expectedSize ||
      sourceBytes.byteLength !== expectedSize ||
      String(record.file?.mime_type ?? '').toLowerCase() !== String(input.expectedMimeType ?? '').toLowerCase()) {
    throw new Error('File DNA metadata does not match the immutable source version.');
  }
  const sourceHash = await digestHex(sourceBytes);
  if (sourceHash !== expectedHash) throw new Error('Stored source bytes failed the immutable SHA-256 check.');

  const declaredChunkSize = record.reconstruction?.chunk_size;
  const chunkSize = declaredChunkSize == null ? DEFAULT_CHUNK_SIZE : Number(declaredChunkSize);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new Error('File DNA declares an unsupported reconstruction chunk size.');
  }
  const reconstructed = new Uint8Array(sourceBytes.byteLength);
  const chunkHashes: string[] = [];
  let offset = 0;
  let chunkIndex = 0;
  while (offset < sourceBytes.byteLength) {
    const end = Math.min(sourceBytes.byteLength, offset + chunkSize);
    const chunk = sourceBytes.slice(offset, end);
    const chunkHash = await digestHex(chunk);
    const expectedChunkLength = end - offset;
    if (chunk.byteLength !== expectedChunkLength || !SHA256.test(chunkHash)) {
      throw new Error('A File DNA reconstruction chunk failed its length or hash check.');
    }
    reconstructed.set(chunk, offset);
    chunkHashes.push(chunkHash);
    offset = end;
    chunkIndex += 1;
    if (chunkIndex > 10000) throw new Error('File DNA exceeds the supported reconstruction chunk count.');
  }
  const reconstructedHash = await digestHex(reconstructed);
  if (reconstructed.byteLength !== sourceBytes.byteLength || reconstructedHash !== expectedHash) {
    throw new Error('File DNA byte-exact reconstruction did not match the original source.');
  }
  let byteForByteEqual = true;
  for (let index = 0; index < sourceBytes.byteLength; index += 1) {
    if (sourceBytes[index] !== reconstructed[index]) {
      byteForByteEqual = false;
      break;
    }
  }
  if (!byteForByteEqual) throw new Error('File DNA reconstruction differs from the original source bytes.');

  return {
    status: 'passed' as const,
    comparisonMode: 'byte_exact' as const,
    exactMatch: true as const,
    similarityScore: 1,
    sha256: reconstructedHash,
    sizeBytes: reconstructed.byteLength,
    chunkSize,
    chunkCount: chunkHashes.length,
    chunkHashes,
    byteForByteEqual,
  };
};
