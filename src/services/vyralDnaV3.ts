export const VYRAL_DNA_V3_SCHEMA_ID = 'vyra.asset-dna' as const;
export const VYRAL_DNA_V3_SCHEMA_VERSION = 3 as const;

export type VyralDnaV3ChannelLayout = 'RGB' | 'RGBA';
export type VyralDnaV3AlphaMode = 'none' | 'straight' | 'premultiplied' | 'unknown';

export type VyralDnaV3Tile = {
  x: number;
  y: number;
  width: number;
  height: number;
  byte_length: number;
  sha256: string;
  package_path: string;
};

export type VyralDnaV3Record = {
  schema_id: typeof VYRAL_DNA_V3_SCHEMA_ID;
  schema_version: typeof VYRAL_DNA_V3_SCHEMA_VERSION;
  record_id: string;
  source: {
    asset_id: string;
    asset_version_id: string;
    sha256: string;
    size_bytes: number;
    mime_type: string;
  };
  extractor: { name: string; version: string };
  decoded_image: {
    width: number;
    height: number;
    sample_format: 'uint8';
    channel_layout: VyralDnaV3ChannelLayout;
    color_space: string;
    icc_profile_sha256: string | null;
    alpha_mode: VyralDnaV3AlphaMode;
    decoder_contract: { name: string; version: string; color_management: string };
    decoded_samples_sha256: string;
  };
  lossless_payload: {
    encoding: 'raw-tiled-v1';
    tile_width: number;
    tile_height: number;
    tiles: VyralDnaV3Tile[];
  };
};

export type VyralDnaV3PackageEntry = { path: string; data: Uint8Array };

export type CreateVyralDnaV3Input = {
  record_id: string;
  source: VyralDnaV3Record['source'];
  extractor: VyralDnaV3Record['extractor'];
  width: number;
  height: number;
  channel_layout: VyralDnaV3ChannelLayout;
  color_space: string;
  icc_profile_sha256: string | null;
  alpha_mode: VyralDnaV3AlphaMode;
  decoder_contract: VyralDnaV3Record['decoded_image']['decoder_contract'];
  tile_width?: number;
  tile_height?: number;
  decoded_samples: Uint8Array;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const assertPositiveInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`DNA v3 ${label} must be a positive safe integer.`);
};

const copyBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const sha256Hex = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable in this environment.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
};

const channelCount = (layout: VyralDnaV3ChannelLayout) => layout === 'RGBA' ? 4 : 3;

const validateSource = (value: unknown) => {
  if (!isObject(value) ||
      typeof value.asset_id !== 'string' || !SAFE_ID_PATTERN.test(value.asset_id) ||
      typeof value.asset_version_id !== 'string' || !SAFE_ID_PATTERN.test(value.asset_version_id)) {
    throw new Error('DNA v3 source asset and version IDs are invalid.');
  }
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256) ||
      !Number.isSafeInteger(value.size_bytes) || Number(value.size_bytes) <= 0 ||
      !isNonEmptyString(value.mime_type)) {
    throw new Error('DNA v3 source integrity metadata is invalid.');
  }
};

const validateAlphaLayout = (layout: unknown, alphaMode: unknown) => {
  if (layout !== 'RGB' && layout !== 'RGBA') throw new Error('DNA v3 sample format or channel layout is unsupported.');
  if (!['none', 'straight', 'premultiplied', 'unknown'].includes(String(alphaMode))) {
    throw new Error('DNA v3 alpha mode is unsupported.');
  }
  if (layout === 'RGB' && alphaMode !== 'none' && alphaMode !== 'unknown') {
    throw new Error('RGB DNA v3 samples cannot declare an alpha channel mode.');
  }
  if (layout === 'RGBA' && alphaMode === 'none') {
    throw new Error('RGBA DNA v3 samples must declare an alpha interpretation.');
  }
};

export const createVyralDnaV3 = async (input: CreateVyralDnaV3Input): Promise<{ record: VyralDnaV3Record; entries: VyralDnaV3PackageEntry[] }> => {
  if (!isObject(input)) throw new Error('DNA v3 input must be an object.');
  if (typeof input.record_id !== 'string' || !SAFE_ID_PATTERN.test(input.record_id)) throw new Error('DNA v3 record ID is invalid.');
  validateSource(input.source);
  assertPositiveInteger(input.width, 'width');
  assertPositiveInteger(input.height, 'height');
  const tileWidth = input.tile_width ?? 128;
  const tileHeight = input.tile_height ?? 128;
  assertPositiveInteger(tileWidth, 'tile width');
  assertPositiveInteger(tileHeight, 'tile height');
  validateAlphaLayout(input.channel_layout, input.alpha_mode);
  if (!isNonEmptyString(input.color_space)) throw new Error('DNA v3 color space must be explicit.');
  if (!isObject(input.extractor) || !isNonEmptyString(input.extractor.name) || !isNonEmptyString(input.extractor.version)) {
    throw new Error('DNA v3 extractor identity is required.');
  }
  if (!isObject(input.decoder_contract) || !isNonEmptyString(input.decoder_contract.name) ||
      !isNonEmptyString(input.decoder_contract.version) || !isNonEmptyString(input.decoder_contract.color_management)) {
    throw new Error('DNA v3 decoder contract must be explicit.');
  }
  if (input.icc_profile_sha256 !== null && (typeof input.icc_profile_sha256 !== 'string' || !SHA256_PATTERN.test(input.icc_profile_sha256))) {
    throw new Error('DNA v3 ICC profile SHA-256 is invalid.');
  }
  if (!(input.decoded_samples instanceof Uint8Array)) throw new Error('DNA v3 decoded samples must be a Uint8Array.');
  const channels = channelCount(input.channel_layout);
  const expectedBytes = input.width * input.height * channels;
  if (!Number.isSafeInteger(expectedBytes) || input.decoded_samples.byteLength !== expectedBytes) {
    throw new Error('DNA v3 decoded sample byte length does not match image dimensions and channel layout.');
  }

  const entries: VyralDnaV3PackageEntry[] = [];
  const tiles: VyralDnaV3Tile[] = [];
  const rowBytes = input.width * channels;
  for (let y = 0; y < input.height; y += tileHeight) {
    for (let x = 0; x < input.width; x += tileWidth) {
      const width = Math.min(tileWidth, input.width - x);
      const height = Math.min(tileHeight, input.height - y);
      const tile = new Uint8Array(width * height * channels);
      for (let row = 0; row < height; row += 1) {
        const sourceStart = (y + row) * rowBytes + x * channels;
        tile.set(input.decoded_samples.subarray(sourceStart, sourceStart + width * channels), row * width * channels);
      }
      const packagePath = `dna/v3/${input.record_id}/tiles/${x}_${y}.raw`;
      tiles.push({ x, y, width, height, byte_length: tile.byteLength, sha256: await sha256Hex(tile), package_path: packagePath });
      entries.push({ path: packagePath, data: tile });
    }
  }

  const record: VyralDnaV3Record = {
    schema_id: VYRAL_DNA_V3_SCHEMA_ID,
    schema_version: VYRAL_DNA_V3_SCHEMA_VERSION,
    record_id: input.record_id,
    source: { ...input.source },
    extractor: { ...input.extractor },
    decoded_image: {
      width: input.width,
      height: input.height,
      sample_format: 'uint8',
      channel_layout: input.channel_layout,
      color_space: input.color_space,
      icc_profile_sha256: input.icc_profile_sha256,
      alpha_mode: input.alpha_mode,
      decoder_contract: { ...input.decoder_contract },
      decoded_samples_sha256: await sha256Hex(input.decoded_samples),
    },
    lossless_payload: { encoding: 'raw-tiled-v1', tile_width: tileWidth, tile_height: tileHeight, tiles },
  };
  validateVyralDnaV3Record(record);
  return { record, entries };
};

export const validateVyralDnaV3Record = (value: unknown): VyralDnaV3Record => {
  if (!isObject(value)) throw new Error('DNA v3 record must be an object.');
  const record = value as unknown as VyralDnaV3Record;
  if (record.schema_id !== VYRAL_DNA_V3_SCHEMA_ID || record.schema_version !== VYRAL_DNA_V3_SCHEMA_VERSION) {
    throw new Error('Unsupported VYRA DNA schema or version.');
  }
  if (typeof record.record_id !== 'string' || !SAFE_ID_PATTERN.test(record.record_id)) throw new Error('DNA v3 record ID is invalid.');
  validateSource(record.source);

  const decoded = record.decoded_image;
  if (!isObject(decoded)) throw new Error('DNA v3 decoded image metadata is missing or invalid.');
  assertPositiveInteger(decoded.width, 'width');
  assertPositiveInteger(decoded.height, 'height');
  if (decoded.sample_format !== 'uint8') throw new Error('DNA v3 sample format or channel layout is unsupported.');
  validateAlphaLayout(decoded.channel_layout, decoded.alpha_mode);
  if (!isNonEmptyString(decoded.color_space) || typeof decoded.decoded_samples_sha256 !== 'string' ||
      !SHA256_PATTERN.test(decoded.decoded_samples_sha256)) {
    throw new Error('DNA v3 color space or decoded sample digest is invalid.');
  }
  if (decoded.icc_profile_sha256 !== null &&
      (typeof decoded.icc_profile_sha256 !== 'string' || !SHA256_PATTERN.test(decoded.icc_profile_sha256))) {
    throw new Error('DNA v3 ICC profile digest is invalid.');
  }
  if (!isObject(record.extractor) || !isNonEmptyString(record.extractor.name) || !isNonEmptyString(record.extractor.version) ||
      !isObject(decoded.decoder_contract) || !isNonEmptyString(decoded.decoder_contract.name) ||
      !isNonEmptyString(decoded.decoder_contract.version) || !isNonEmptyString(decoded.decoder_contract.color_management)) {
    throw new Error('DNA v3 extraction and decoder provenance is incomplete.');
  }

  const payload = record.lossless_payload;
  if (!isObject(payload) || payload.encoding !== 'raw-tiled-v1') throw new Error('DNA v3 lossless payload encoding is unsupported.');
  assertPositiveInteger(payload.tile_width, 'tile width');
  assertPositiveInteger(payload.tile_height, 'tile height');
  if (!Array.isArray(payload.tiles) || payload.tiles.length === 0) throw new Error('DNA v3 must contain at least one lossless tile.');
  const channels = channelCount(decoded.channel_layout);
  const expectedTileCount = Math.ceil(decoded.width / payload.tile_width) * Math.ceil(decoded.height / payload.tile_height);
  if (!Number.isSafeInteger(expectedTileCount) || payload.tiles.length !== expectedTileCount) {
    throw new Error('DNA v3 tile count does not cover the declared image grid.');
  }
  const seen = new Set<string>();
  for (const tileValue of payload.tiles as unknown[]) {
    if (!isObject(tileValue)) throw new Error('DNA v3 tile metadata is missing or invalid.');
    const tile = tileValue as unknown as VyralDnaV3Tile;
    if (!Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) || tile.x < 0 || tile.y < 0) {
      throw new Error('DNA v3 tile coordinates are invalid.');
    }
    if (!Number.isSafeInteger(tile.width) || !Number.isSafeInteger(tile.height) || tile.width <= 0 || tile.height <= 0) {
      throw new Error('DNA v3 tile dimensions are invalid.');
    }
    if (tile.x % payload.tile_width !== 0 || tile.y % payload.tile_height !== 0) throw new Error('DNA v3 tiles must align to the declared tile grid.');
    const expectedWidth = Math.min(payload.tile_width, decoded.width - tile.x);
    const expectedHeight = Math.min(payload.tile_height, decoded.height - tile.y);
    if (expectedWidth <= 0 || expectedHeight <= 0 || tile.width !== expectedWidth || tile.height !== expectedHeight) {
      throw new Error('DNA v3 tile is outside image bounds or has invalid edge dimensions.');
    }
    const expectedLength = tile.width * tile.height * channels;
    if (!Number.isSafeInteger(expectedLength) || tile.byte_length !== expectedLength ||
        typeof tile.sha256 !== 'string' || !SHA256_PATTERN.test(tile.sha256)) {
      throw new Error('DNA v3 tile byte length or SHA-256 is invalid.');
    }
    const expectedPath = `dna/v3/${record.record_id}/tiles/${tile.x}_${tile.y}.raw`;
    if (tile.package_path !== expectedPath) throw new Error('DNA v3 tile package path is invalid.');
    if (seen.has(tile.package_path)) throw new Error('DNA v3 contains a duplicate tile path.');
    seen.add(tile.package_path);
  }
  return record;
};

export const reconstructVyralDnaV3 = async (value: unknown, files: Map<string, Uint8Array>) => {
  const record = validateVyralDnaV3Record(value);
  if (!(files instanceof Map)) throw new Error('DNA v3 reconstruction requires a package file map.');
  const width = record.decoded_image.width;
  const height = record.decoded_image.height;
  const channels = channelCount(record.decoded_image.channel_layout);
  const outputLength = width * height * channels;
  if (!Number.isSafeInteger(outputLength)) throw new Error('DNA v3 reconstructed image exceeds safe byte limits.');
  const output = new Uint8Array(outputLength);
  const rowBytes = width * channels;
  const declaredPaths = new Set(record.lossless_payload.tiles.map((tile) => tile.package_path));
  const tilePrefix = `dna/v3/${record.record_id}/tiles/`;
  for (const path of files.keys()) {
    if (path.startsWith(tilePrefix) && !declaredPaths.has(path)) throw new Error('DNA v3 package contains an undeclared tile: ' + path);
  }
  for (const tile of record.lossless_payload.tiles) {
    const bytes = files.get(tile.package_path);
    if (!(bytes instanceof Uint8Array)) throw new Error('DNA v3 tile is missing or is not binary data: ' + tile.package_path);
    if (bytes.byteLength !== tile.byte_length || await sha256Hex(bytes) !== tile.sha256) {
      throw new Error('DNA v3 tile integrity check failed: ' + tile.package_path);
    }
    for (let row = 0; row < tile.height; row += 1) {
      const targetStart = (tile.y + row) * rowBytes + tile.x * channels;
      const sourceStart = row * tile.width * channels;
      output.set(bytes.subarray(sourceStart, sourceStart + tile.width * channels), targetStart);
    }
  }
  if (await sha256Hex(output) !== record.decoded_image.decoded_samples_sha256) {
    throw new Error('DNA v3 reconstructed decoded-sample digest does not match.');
  }
  return {
    samples: output,
    width,
    height,
    channel_layout: record.decoded_image.channel_layout,
    decoded_samples_sha256: record.decoded_image.decoded_samples_sha256,
  };
};
