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
  extractor: {
    name: string;
    version: string;
  };
  decoded_image: {
    width: number;
    height: number;
    sample_format: 'uint8';
    channel_layout: VyralDnaV3ChannelLayout;
    color_space: string;
    icc_profile_sha256: string | null;
    alpha_mode: VyralDnaV3AlphaMode;
    decoder_contract: {
      name: string;
      version: string;
      color_management: string;
    };
    decoded_samples_sha256: string;
  };
  lossless_payload: {
    encoding: 'raw-tiled-v1';
    tile_width: number;
    tile_height: number;
    tiles: VyralDnaV3Tile[];
  };
};

export type VyralDnaV3PackageEntry = {
  path: string;
  data: Uint8Array;
};

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

const validateSource = (source: VyralDnaV3Record['source']) => {
  if (!source || !SAFE_ID_PATTERN.test(source.asset_id) || !SAFE_ID_PATTERN.test(source.asset_version_id)) throw new Error('DNA v3 source asset and version IDs are invalid.');
  if (!SHA256_PATTERN.test(source.sha256) || !Number.isSafeInteger(source.size_bytes) || source.size_bytes <= 0 || !source.mime_type.trim()) {
    throw new Error('DNA v3 source integrity metadata is invalid.');
  }
};

export const createVyralDnaV3 = async (input: CreateVyralDnaV3Input): Promise<{ record: VyralDnaV3Record; entries: VyralDnaV3PackageEntry[] }> => {
  if (!SAFE_ID_PATTERN.test(input.record_id)) throw new Error('DNA v3 record ID is invalid.');
  validateSource(input.source);
  assertPositiveInteger(input.width, 'width');
  assertPositiveInteger(input.height, 'height');
  const tileWidth = input.tile_width ?? 128;
  const tileHeight = input.tile_height ?? 128;
  assertPositiveInteger(tileWidth, 'tile width');
  assertPositiveInteger(tileHeight, 'tile height');
  if (!input.color_space.trim()) throw new Error('DNA v3 color space must be explicit.');
  if (!input.extractor.name.trim() || !input.extractor.version.trim()) throw new Error('DNA v3 extractor identity is required.');
  if (!input.decoder_contract.name.trim() || !input.decoder_contract.version.trim() || !input.decoder_contract.color_management.trim()) {
    throw new Error('DNA v3 decoder contract must be explicit.');
  }
  if (input.icc_profile_sha256 !== null && !SHA256_PATTERN.test(input.icc_profile_sha256)) throw new Error('DNA v3 ICC profile SHA-256 is invalid.');
  if (input.channel_layout === 'RGB' && input.alpha_mode !== 'none' && input.alpha_mode !== 'unknown') throw new Error('RGB DNA v3 samples cannot declare an alpha channel mode.');
  if (input.channel_layout === 'RGBA' && input.alpha_mode === 'none') throw new Error('RGBA DNA v3 samples must declare an alpha interpretation.');
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DNA v3 record must be an object.');
  const record = value as VyralDnaV3Record;
  if (record.schema_id !== VYRAL_DNA_V3_SCHEMA_ID || record.schema_version !== VYRAL_DNA_V3_SCHEMA_VERSION) throw new Error('Unsupported VYRA DNA schema or version.');
  if (!SAFE_ID_PATTERN.test(record.record_id)) throw new Error('DNA v3 record ID is invalid.');
  validateSource(record.source);
  assertPositiveInteger(record.decoded_image?.width, 'width');
  assertPositiveInteger(record.decoded_image?.height, 'height');
  if (record.decoded_image.sample_format !== 'uint8' || !['RGB', 'RGBA'].includes(record.decoded_image.channel_layout)) throw new Error('DNA v3 sample format or channel layout is unsupported.');
  if (!record.decoded_image.color_space?.trim() || !SHA256_PATTERN.test(record.decoded_image.decoded_samples_sha256)) throw new Error('DNA v3 color space or decoded sample digest is invalid.');
  if (record.decoded_image.icc_profile_sha256 !== null && !SHA256_PATTERN.test(record.decoded_image.icc_profile_sha256)) throw new Error('DNA v3 ICC profile digest is invalid.');
  if (!record.extractor?.name?.trim() || !record.extractor?.version?.trim() || !record.decoded_image.decoder_contract?.name?.trim() || !record.decoded_image.decoder_contract?.version?.trim() || !record.decoded_image.decoder_contract?.color_management?.trim()) {
    throw new Error('DNA v3 extraction and decoder provenance is incomplete.');
  }
  const payload = record.lossless_payload;
  if (payload?.encoding !== 'raw-tiled-v1') throw new Error('DNA v3 lossless payload encoding is unsupported.');
  assertPositiveInteger(payload.tile_width, 'tile width');
  assertPositiveInteger(payload.tile_height, 'tile height');
  if (!Array.isArray(payload.tiles) || payload.tiles.length === 0) throw new Error('DNA v3 must contain at least one lossless tile.');
  const channels = channelCount(record.decoded_image.channel_layout);
  const expectedTileCount = Math.ceil(record.decoded_image.width / payload.tile_width) * Math.ceil(record.decoded_image.height / payload.tile_height);
  if (payload.tiles.length !== expectedTileCount) throw new Error('DNA v3 tile count does not cover the declared image grid.');
  const seen = new Set<string>();
  for (const tile of payload.tiles) {
    if (!Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) || tile.x < 0 || tile.y < 0) throw new Error('DNA v3 tile coordinates are invalid.');
    if (!Number.isSafeInteger(tile.width) || !Number.isSafeInteger(tile.height) || tile.width <= 0 || tile.height <= 0) throw new Error('DNA v3 tile dimensions are invalid.');
    if (tile.x % payload.tile_width !== 0 || tile.y % payload.tile_height !== 0) throw new Error('DNA v3 tiles must align to the declared tile grid.');
    const expectedWidth = Math.min(payload.tile_width, record.decoded_image.width - tile.x);
    const expectedHeight = Math.min(payload.tile_height, record.decoded_image.height - tile.y);
    if (expectedWidth <= 0 || expectedHeight <= 0 || tile.width !== expectedWidth || tile.height !== expectedHeight) throw new Error('DNA v3 tile is outside image bounds or has invalid edge dimensions.');
    const expectedLength = tile.width * tile.height * channels;
    if (tile.byte_length !== expectedLength || !SHA256_PATTERN.test(tile.sha256)) throw new Error('DNA v3 tile byte length or SHA-256 is invalid.');
    if (tile.package_path !== `dna/v3/${record.record_id}/tiles/${tile.x}_${tile.y}.raw`) throw new Error('DNA v3 tile package path is invalid.');
    if (seen.has(tile.package_path)) throw new Error('DNA v3 contains a duplicate tile path.');
    seen.add(tile.package_path);
  }
  return record;
};

export const reconstructVyralDnaV3 = async (value: unknown, files: Map<string, Uint8Array>) => {
  const record = validateVyralDnaV3Record(value);
  const width = record.decoded_image.width;
  const height = record.decoded_image.height;
  const channels = channelCount(record.decoded_image.channel_layout);
  const output = new Uint8Array(width * height * channels);
  const rowBytes = width * channels;
  for (const tile of record.lossless_payload.tiles) {
    const bytes = files.get(tile.package_path);
    if (!bytes) throw new Error('DNA v3 tile is missing: ' + tile.package_path);
    if (bytes.byteLength !== tile.byte_length || await sha256Hex(bytes) !== tile.sha256) throw new Error('DNA v3 tile integrity check failed: ' + tile.package_path);
    for (let row = 0; row < tile.height; row += 1) {
      const targetStart = (tile.y + row) * rowBytes + tile.x * channels;
      const sourceStart = row * tile.width * channels;
      output.set(bytes.subarray(sourceStart, sourceStart + tile.width * channels), targetStart);
    }
  }
  if (await sha256Hex(output) !== record.decoded_image.decoded_samples_sha256) throw new Error('DNA v3 reconstructed decoded-sample digest does not match.');
  return { samples: output, width, height, channel_layout: record.decoded_image.channel_layout, decoded_samples_sha256: record.decoded_image.decoded_samples_sha256 };
};
