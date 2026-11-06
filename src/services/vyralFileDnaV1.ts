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
  structure?: VyralFileStructure;
  extractor: { name: string; version: string };
  reconstruction: {
    claim: 'source_file_exact' | 'unavailable';
    payload_encoding: 'raw-chunks-v1' | 'none';
    chunk_size: number | null;
    chunks: VyralFileDnaChunk[];
  };
};

export type VyralFileStructureFact = {
  key: string;
  value: string | number | boolean;
  unit?: string;
  evidence: 'container_header' | 'container_index' | 'text_structure' | 'binary_signature';
};
export type VyralFileStructure = {
  profile: 'audio' | 'video' | 'document' | 'model_3d' | 'archive' | 'text' | 'unknown';
  status: 'parsed' | 'partial' | 'signature_only' | 'unknown';
  extractor_version: '1.0.0';
  facts: VyralFileStructureFact[];
  notes: string[];
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

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const detectSignature = (bytes: Uint8Array): string => {
  if (bytes.length >= 8 && hex(bytes, 8) === '89504e470d0a1a0a') return 'png';
  if (bytes.length >= 3 && hex(bytes, 3) === 'ffd8ff') return 'jpeg';
  if (bytes.length >= 12 && hex(bytes.subarray(0, 4), 4) === '52494646') {
    const form = ascii(bytes, 8, 4);
    if (form === 'WEBP') return 'webp';
    if (form === 'WAVE') return 'wav';
    if (form === 'AVI ') return 'avi';
    return 'riff-container';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'FORM') {
    const form = ascii(bytes, 8, 4);
    if (form === 'AIFF' || form === 'AIFC') return 'aiff';
    return 'iff-container';
  }
  if (bytes.length >= 4 && hex(bytes, 4) === '47494638') return 'gif';
  if (bytes.length >= 4 && hex(bytes, 4) === '25504446') return 'pdf';
  if (bytes.length >= 4 && hex(bytes, 4) === '504b0304') return 'zip-container';
  if (bytes.length >= 6 && hex(bytes, 6) === '377abcaf271c') return '7z';
  if (bytes.length >= 7 && ascii(bytes, 0, 7) === 'Rar!\x1a\x07') return 'rar';
  if (bytes.length >= 4 && hex(bytes, 4) === '1f8b0800') return 'gzip';
  if (bytes.length >= 4 && hex(bytes, 4) === '4f676753') return 'ogg-container';
  if (bytes.length >= 4 && hex(bytes, 4) === '664c6143') return 'flac';
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'mp3-id3';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mpeg-audio-frame';
  if (bytes.length >= 8 && ascii(bytes, 4, 4) === 'ftyp') return 'iso-bmff-family';
  if (bytes.length >= 4 && hex(bytes, 4) === '1a45dfa3') return 'matroska-ebml';
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'glTF') return 'glb';
  if (bytes.length >= 4 && hex(bytes, 4) === '53514c69') return 'sqlite';
  if (bytes.length >= 4 && hex(bytes, 4) === '2321202f') return 'script-text';
  return 'unknown';
};

const validateSource = (source: unknown) => {
  if (!isObject(source) || typeof source.asset_id !== 'string' || !SAFE_ID.test(source.asset_id) ||
      typeof source.asset_version_id !== 'string' || !SAFE_ID.test(source.asset_version_id)) {
    throw new Error('File DNA source Asset and version IDs are invalid.');
  }
};

const readAscii = (bytes: Uint8Array, offset: number, length: number) =>
  Array.from(bytes.subarray(offset, offset + length), (byte) => String.fromCharCode(byte)).join('');
const addFact = (facts: VyralFileStructureFact[], key: string, value: string | number | boolean, evidence: VyralFileStructureFact['evidence'], unit?: string) => {
  facts.push({ key, value, evidence, ...(unit ? { unit } : {}) });
};
const readU32LE = (bytes: Uint8Array, offset: number) =>
  offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) : 0;
const readU32BE = (bytes: Uint8Array, offset: number) =>
  offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false) : 0;

const inspectIsoBmff = (bytes: Uint8Array) => {
  const facts: VyralFileStructureFact[] = [];
  const notes: string[] = [];
  const topLevel: string[] = [];
  const handlers: string[] = [];
  const codecs = new Set<string>();
  let movieDuration = 0;
  let movieTimescale = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  let visited = 0;
  let truncated = false;
  const containers = new Set(['moov','trak','mdia','minf','stbl','edts','dinf','udta','mvex','moof','traf','mfra','tref','ipro']);
  const readU64Safe = (offset: number) => {
    if (offset + 8 > bytes.length) return 0;
    const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : 0;
  };
  const walk = (start: number, end: number, depth: number, parent: string) => {
    if (depth > 8 || visited >= 4096) { truncated = true; return; }
    let offset = start;
    while (offset + 8 <= end && visited < 4096) {
      const size32 = readU32BE(bytes, offset);
      const type = readAscii(bytes, offset + 4, 4);
      let header = 8;
      let size = size32;
      if (size32 === 1) { if (offset + 16 > end) { truncated = true; break; } size = readU64Safe(offset + 8); header = 16; }
      else if (size32 === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) { truncated = true; break; }
      visited += 1;
      if (depth === 0) topLevel.push(type);
      const body = offset + header;
      const boxEnd = offset + size;
      if (type === 'mvhd' && body + 20 <= boxEnd) {
        const version = bytes[body];
        const timescaleOffset = body + (version === 1 ? 20 : 12);
        const durationOffset = timescaleOffset + 4;
        movieTimescale = readU32BE(bytes, timescaleOffset);
        movieDuration = version === 1 ? readU64Safe(durationOffset) : readU32BE(bytes, durationOffset);
      } else if (type === 'hdlr' && body + 12 <= boxEnd) {
        const handler = readAscii(bytes, body + 8, 4);
        if (/^[\x20-\x7e]{4}$/.test(handler)) handlers.push(handler);
      } else if (type === 'tkhd' && boxEnd - body >= 8) {
        const width = readU32BE(bytes, boxEnd - 8) / 65536;
        const height = readU32BE(bytes, boxEnd - 4) / 65536;
        if (width > 0 && height > 0 && width <= 100000 && height <= 100000) {
          maxWidth = Math.max(maxWidth, width); maxHeight = Math.max(maxHeight, height);
        }
      } else if (type === 'stsd' && body + 16 <= boxEnd) {
        const count = Math.min(readU32BE(bytes, body + 4), 128);
        let entry = body + 8;
        for (let index = 0; index < count && entry + 8 <= boxEnd; index += 1) {
          const entrySize = readU32BE(bytes, entry);
          const codec = readAscii(bytes, entry + 4, 4);
          if (entrySize < 8 || entry + entrySize > boxEnd) break;
          if (/^[\x20-\x7e]{4}$/.test(codec)) codecs.add(codec);
          entry += entrySize;
        }
      }
      if (containers.has(type)) walk(body, boxEnd, depth + 1, type);
      else if (type === 'meta' && body + 4 <= boxEnd) walk(body + 4, boxEnd, depth + 1, type);
      offset = boxEnd;
    }
    if (offset < end && visited >= 4096) truncated = true;
  };
  walk(0, bytes.length, 0, 'root');
  if (movieTimescale > 0 && movieDuration > 0) {
    addFact(facts, 'duration', Number((movieDuration / movieTimescale).toFixed(3)), 'container_index', 'seconds');
    addFact(facts, 'movie_timescale', movieTimescale, 'container_header');
  }
  if (handlers.length) addFact(facts, 'track_handlers', [...new Set(handlers)].join(','), 'container_index');
  if (codecs.size) addFact(facts, 'sample_entry_codecs', [...codecs].join(','), 'container_index');
  if (maxWidth && maxHeight) {
    addFact(facts, 'video_width', Math.round(maxWidth), 'container_index', 'pixels');
    addFact(facts, 'video_height', Math.round(maxHeight), 'container_index', 'pixels');
  }
  addFact(facts, 'top_level_boxes', topLevel.join(','), 'container_index');
  if (truncated) notes.push('ISO-BMFF metadata walk reached a malformed boundary or its 4096-box/depth safety limit; facts may be partial.');
  notes.push('Container metadata is structural only; compressed audio/video content and individual frames are not decoded.');
  return { facts, notes, partial: truncated || handlers.length === 0 };
};

export const analyzeVyralFileStructureV1 = (bytes: Uint8Array, mimeType: string, filename?: string | null): VyralFileStructure => {
  const mime = mimeType.toLowerCase();
  const extension = filename?.match(/\.([a-zA-Z0-9]{1,16})$/)?.[1]?.toLowerCase() ?? '';
  const signature = detectSignature(bytes);
  const facts: VyralFileStructureFact[] = [];
  const notes: string[] = [];
  let profile: VyralFileStructure['profile'] = 'unknown';
  let status: VyralFileStructure['status'] = 'unknown';
  const setSignature = (kind: VyralFileStructure['profile'], note: string) => {
    profile = kind; status = 'signature_only'; notes.push(note);
  };

  if (signature === 'wav' && bytes.length >= 44) {
    profile = 'audio'; status = 'parsed';
    let offset = 12; let byteRate = 0; let dataBytes = 0;
    while (offset + 8 <= bytes.length) {
      const id = readAscii(bytes, offset, 4); const size = readU32LE(bytes, offset + 4);
      const body = offset + 8;
      if (body + size > bytes.length) { status = 'partial'; notes.push('A RIFF chunk extends beyond the available file bytes.'); break; }
      if (id === 'fmt ' && size >= 16) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + body, size);
        addFact(facts, 'codec_format_code', view.getUint16(0, true), 'container_header');
        addFact(facts, 'channels', view.getUint16(2, true), 'container_header');
        addFact(facts, 'sample_rate', view.getUint32(4, true), 'container_header', 'Hz');
        byteRate = view.getUint32(8, true);
        addFact(facts, 'bits_per_sample', view.getUint16(14, true), 'container_header', 'bits');
      } else if (id === 'data') dataBytes += size;
      offset = body + size + (size % 2);
    }
    if (dataBytes) addFact(facts, 'audio_data_bytes', dataBytes, 'container_index', 'bytes');
    if (byteRate > 0 && dataBytes > 0) addFact(facts, 'duration_estimate', Number((dataBytes / byteRate).toFixed(3)), 'container_index', 'seconds');
    if (!facts.some((fact) => fact.key === 'sample_rate')) { status = 'partial'; notes.push('WAV header was present but its format chunk could not be fully read.'); }
  } else if (signature === 'iso-bmff-family' && bytes.length >= 16) {
    profile = mime.startsWith('audio/') ? 'audio' : 'video'; status = 'partial';
    addFact(facts, 'major_brand', readAscii(bytes, 8, 4).replace(/[^\x20-\x7e]/g, ''), 'container_header');
    const inspected = inspectIsoBmff(bytes);
    facts.push(...inspected.facts);
    notes.push(...inspected.notes);
    status = inspected.partial ? 'partial' : 'parsed';
  } else if (signature === 'mp3-id3' || signature === 'mpeg-audio-frame' || signature === 'flac' || signature === 'ogg-container' || signature === 'aiff') {
    setSignature('audio', 'Audio container signature detected; codec frames and duration are not fully decoded.');
    addFact(facts, 'audio_container', signature, 'binary_signature');
    let audioOffset = 0;
    if (signature === 'mp3-id3' && bytes.length >= 10) {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
      audioOffset = Math.min(bytes.length, 10 + size + ((bytes[5] & 0x10) ? 10 : 0));
      addFact(facts, 'id3_tag_bytes', audioOffset, 'container_header', 'bytes');
    }
    if (signature === 'mp3-id3' || signature === 'mpeg-audio-frame') {
      let frameOffset = -1;
      for (let offset = audioOffset; offset + 4 <= Math.min(bytes.length, audioOffset + 65536); offset += 1) {
        if (bytes[offset] === 0xff && (bytes[offset + 1] & 0xe0) === 0xe0) { frameOffset = offset; break; }
      }
      if (frameOffset >= 0) {
        const b1 = bytes[frameOffset + 1]; const b2 = bytes[frameOffset + 2]; const b3 = bytes[frameOffset + 3];
        const versionBits = (b1 >> 3) & 3; const layerBits = (b1 >> 1) & 3;
        const bitrateIndex = (b2 >> 4) & 15; const sampleIndex = (b2 >> 2) & 3;
        const versionName = versionBits === 3 ? 'MPEG-1' : versionBits === 2 ? 'MPEG-2' : versionBits === 0 ? 'MPEG-2.5' : 'reserved';
        const layerName = layerBits === 3 ? 'Layer I' : layerBits === 2 ? 'Layer II' : layerBits === 1 ? 'Layer III' : 'reserved';
        const mpeg1Bitrates = layerBits === 3
          ? [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,0]
          : layerBits === 2 ? [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0]
          : [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
        const mpeg2Bitrates = layerBits === 3
          ? [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0]
          : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
        const bitrate = (versionBits === 3 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex];
        const baseRates = [44100,48000,32000];
        const sampleRate = baseRates[sampleIndex] ? baseRates[sampleIndex] / (versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4) : 0;
        const channelMode = ['stereo','joint_stereo','dual_channel','mono'][(b3 >> 6) & 3];
        if (versionBits !== 1 && layerBits !== 0 && bitrate > 0 && sampleRate > 0) {
          addFact(facts, 'mpeg_version', versionName, 'container_header');
          addFact(facts, 'mpeg_layer', layerName, 'container_header');
          addFact(facts, 'bitrate', bitrate, 'container_header', 'kbps');
          addFact(facts, 'sample_rate', sampleRate, 'container_header', 'Hz');
          addFact(facts, 'channel_mode', channelMode, 'container_header');
          const audioBytes = bytes.length - frameOffset;
          addFact(facts, 'duration_estimate', Number((audioBytes * 8 / (bitrate * 1000)).toFixed(3)), 'container_index', 'seconds');
          notes.push('MP3 duration is an approximate constant-bitrate estimate; variable-bitrate files may differ.');
          status = 'partial';
        }
      } else notes.push('No valid MPEG audio frame header was found in the first 64 KiB after the ID3 tag.');
    }
  } else if (signature === 'pdf' || mime === 'application/pdf' || extension === 'pdf') {
    profile = 'document'; status = 'partial';
    addFact(facts, 'pdf_header', readAscii(bytes, 0, Math.min(8, bytes.length)), 'container_header');
    const scanLimit = Math.min(bytes.length, 8 * 1024 * 1024);
    let pages = 0;
    for (let index = 0; index + 10 < scanLimit; index += 1) {
      if (bytes[index] !== 0x2f || bytes[index + 1] !== 0x54 || bytes[index + 2] !== 0x79 ||
          bytes[index + 3] !== 0x70 || bytes[index + 4] !== 0x65) continue;
      let cursor = index + 5;
      while (cursor < scanLimit && (bytes[cursor] === 0x20 || bytes[cursor] === 0x09 || bytes[cursor] === 0x0a || bytes[cursor] === 0x0d)) cursor += 1;
      if (bytes[cursor] === 0x2f && bytes[cursor + 1] === 0x50 && bytes[cursor + 2] === 0x61 &&
          bytes[cursor + 3] === 0x67 && bytes[cursor + 4] === 0x65 && bytes[cursor + 5] !== 0x73) pages += 1;
    }
    if (pages) addFact(facts, 'page_object_markers', pages, 'container_index', 'markers');
    if (bytes.length > scanLimit) notes.push('PDF structural scan was limited to the first 8 MiB.');
    notes.push('PDF page markers can be hidden in compressed object streams; this count is a lower-bound structural hint, not a guaranteed page count.');
  } else if (signature === 'glb' && bytes.length >= 20) {
    profile = 'model_3d'; status = 'partial';
    const version = readU32LE(bytes, 4); const declaredLength = readU32LE(bytes, 8);
    addFact(facts, 'glb_version', version, 'container_header');
    addFact(facts, 'declared_file_bytes', declaredLength, 'container_header', 'bytes');
    if (declaredLength === bytes.length) {
      const chunkLength = readU32LE(bytes, 12); const chunkType = readAscii(bytes, 16, 4);
      if (chunkType === 'JSON' && chunkLength <= bytes.length - 20 && chunkLength <= 8 * 1024 * 1024) {
        try {
          const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + chunkLength))) as Record<string, unknown>;
          for (const key of ['nodes','meshes','materials','scenes','animations']) if (Array.isArray(json[key])) addFact(facts, key + '_count', (json[key] as unknown[]).length, 'container_index');
          status = 'parsed';
        } catch { notes.push('The GLB JSON chunk could not be parsed; only its container header was inspected.'); }
      }
    } else notes.push('GLB declared length does not match available bytes.');
  } else if (extension === 'gltf' || mime.includes('gltf+json')) {
    profile = 'model_3d'; status = 'partial';
    try {
      if (bytes.length > 8 * 1024 * 1024) throw new Error('glTF JSON exceeds the structural scan limit.');
      const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
      for (const key of ['nodes','meshes','materials','scenes','animations']) if (Array.isArray(json[key])) addFact(facts, key + '_count', (json[key] as unknown[]).length, 'text_structure');
      status = 'parsed';
    } catch { notes.push('glTF JSON structure could not be parsed.'); }
  } else if (signature === 'matroska-ebml' || signature === 'avi' || (signature === 'riff-container' && mime.startsWith('video/'))) {
    setSignature('video', 'Video container signature detected; tracks, frames and timing are not decoded.');
  } else if (signature === 'zip-container' && (['docx','xlsx','pptx'].includes(extension) || mime.includes('openxmlformats'))) {
    setSignature('document', 'Office Open XML package detected as a ZIP container; document content and embedded objects are not parsed.');
    addFact(facts, 'container_signature', signature, 'binary_signature');
  } else if (['zip-container','7z','rar','gzip','riff-container','iff-container'].includes(signature)) {
    setSignature('archive', 'Archive/container signature detected; member contents are not unpacked or interpreted.');
    addFact(facts, 'container_signature', signature, 'binary_signature');
  } else if (mime.startsWith('text/') || ['txt','md','csv','json','xml','yaml','yml','html','css','js','ts'].includes(extension)) {
    profile = 'text'; status = 'partial';
    try {
      const scanLimit = Math.min(bytes.length, 8 * 1024 * 1024);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, scanLimit));
      const lines = text.split(/\r?\n/);
      if (bytes.length > scanLimit) notes.push('Text structure scan was limited to the first 8 MiB; counts are partial.');
      addFact(facts, 'character_count', Array.from(text).length, 'text_structure');
      addFact(facts, 'line_count', lines.length, 'text_structure');
      addFact(facts, 'word_count', (text.match(/\S+/g) ?? []).length, 'text_structure');
      if (extension === 'md') addFact(facts, 'markdown_heading_count', (text.match(/^\s{0,3}#{1,6}\s+/gm) ?? []).length, 'text_structure');
      if (extension === 'json') {
        try { const parsed = JSON.parse(text) as unknown; if (Array.isArray(parsed)) addFact(facts, 'json_top_level_items', parsed.length, 'text_structure'); else if (parsed && typeof parsed === 'object') addFact(facts, 'json_top_level_keys', Object.keys(parsed as object).length, 'text_structure'); status = bytes.length > scanLimit ? 'partial' : 'parsed'; }
        catch { notes.push('The file is UTF-8 text but does not contain valid JSON.'); }
      } else status = 'parsed';
    } catch { notes.push('Text MIME or extension was supplied, but the bytes are not valid UTF-8; content was not decoded.'); }
  } else {
    status = signature === 'unknown' ? 'unknown' : 'signature_only';
    notes.push('Only conservative binary identity and signature information is available for this format.');
  }
  if (!facts.length && signature !== 'unknown') addFact(facts, 'format_signature', signature, 'binary_signature');
  if (!notes.length) notes.push('Only deterministic structural facts are recorded; no semantic interpretation or inferred asset purpose is included.');
  return { profile, status, extractor_version: '1.0.0', facts, notes };
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
    structure: analyzeVyralFileStructureV1(input.bytes, input.mime_type, input.filename),
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
  if (value.structure !== undefined) {
    const structure = value.structure;
    if (!isObject(structure) || !['audio','video','document','model_3d','archive','text','unknown'].includes(String(structure.profile)) ||
        !['parsed','partial','signature_only','unknown'].includes(String(structure.status)) ||
        structure.extractor_version !== '1.0.0' || !Array.isArray(structure.facts) || structure.facts.length > 128 ||
        !Array.isArray(structure.notes) || structure.notes.length > 32 ||
        !structure.notes.every((note) => typeof note === 'string' && note.length <= 500)) {
      throw new Error('File DNA structural profile is invalid.');
    }
    for (const fact of structure.facts) {
      if (!isObject(fact) || !/^[a-z][a-z0-9_]{1,63}$/.test(String(fact.key)) ||
          !(typeof fact.value === 'string' || typeof fact.value === 'number' && Number.isFinite(fact.value) || typeof fact.value === 'boolean') ||
          !['container_header','container_index','text_structure','binary_signature'].includes(String(fact.evidence)) ||
          (fact.unit !== undefined && (typeof fact.unit !== 'string' || fact.unit.length > 32))) {
        throw new Error('File DNA structural fact is invalid.');
      }
    }
  }
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
