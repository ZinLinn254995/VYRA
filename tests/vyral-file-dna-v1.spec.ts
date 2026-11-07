import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVyralFileStructureV1, createVyralFileDnaV1, reconstructVyralFileDnaV1, validateVyralFileDnaV1Record } from '../src/services/vyralFileDnaV1.ts';

const source = { asset_id: 'asset-1', asset_version_id: 'version-1' };
const sample = new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]);

test('File DNA records deterministic binary identity and reconstructs exact bytes from lossless chunks', async () => {
  const { record, entries } = await createVyralFileDnaV1({
    record_id: 'file-dna-test', source, bytes: sample, mime_type: 'application/zip',
    filename: 'archive.ZIP', include_payload: true, chunk_size: 8,
  });
  assert.equal(record.file.format_signature, 'zip-container');
  assert.equal(record.file.extension, 'zip');
  assert.equal(record.reconstruction.claim, 'source_file_exact');
  assert.equal(entries.length, 3);
  const restored = await reconstructVyralFileDnaV1(record, new Map(entries.map((entry) => [entry.path, entry.data])));
  assert.deepEqual(restored, sample);
});

test('Hash-only File DNA verifies identity metadata but never claims reconstruction', async () => {
  const { record, entries } = await createVyralFileDnaV1({
    record_id: 'file-dna-hash', source, bytes: sample, mime_type: 'application/octet-stream',
  });
  assert.equal(entries.length, 0);
  assert.equal(record.reconstruction.claim, 'unavailable');
  await assert.rejects(() => reconstructVyralFileDnaV1(record, new Map()), /does not contain a source-file reconstruction payload/);
});

test('File DNA rejects altered, missing, truncated and undeclared chunks', async () => {
  const { record, entries } = await createVyralFileDnaV1({
    record_id: 'file-dna-verify', source, bytes: sample, mime_type: 'application/octet-stream',
    include_payload: true, chunk_size: 8,
  });
  const missing = new Map(entries.slice(1).map((entry) => [entry.path, entry.data]));
  await assert.rejects(() => reconstructVyralFileDnaV1(record, missing), /missing or failed integrity/);
  const alteredEntries = entries.map((entry) => ({ ...entry, data: entry.data.slice() }));
  alteredEntries[0].data[0] ^= 0xff;
  await assert.rejects(() => reconstructVyralFileDnaV1(record, new Map(alteredEntries.map((entry) => [entry.path, entry.data]))), /missing or failed integrity/);
  const extra = new Map(entries.map((entry) => [entry.path, entry.data]));
  extra.set('dna/file/v1/file-dna-verify/chunks/extra.bin', new Uint8Array([1]));
  await assert.rejects(() => reconstructVyralFileDnaV1(record, extra), /undeclared chunk/);
  assert.throws(() => validateVyralFileDnaV1Record({
    ...record, reconstruction: { ...record.reconstruction, chunks: record.reconstruction.chunks.slice(1) },
  }), /chunk metadata|chunk coverage/);
});

test('File DNA validates source identity and prevents false exact claims', async () => {
  const { record } = await createVyralFileDnaV1({
    record_id: 'file-dna-claims', source, bytes: sample, mime_type: 'application/octet-stream',
  });
  assert.throws(() => validateVyralFileDnaV1Record({
    ...record, reconstruction: { claim: 'source_file_exact', payload_encoding: 'none', chunk_size: null, chunks: [] },
  }), /reconstruction claim does not match/);
  await assert.rejects(() => createVyralFileDnaV1({
    record_id: 'file-dna-empty', source, bytes: new Uint8Array(), mime_type: 'application/octet-stream',
  }), /non-empty binary/);
});


test('File DNA detects conservative container signatures for audio, video, 3D and archives', async () => {
  const cases: Array<{ bytes: Uint8Array; expected: string; mime: string; filename: string }> = [
    { bytes: new Uint8Array([0x49,0x44,0x33,3,0,0]), expected: 'mp3-id3', mime: 'audio/mpeg', filename: 'voice.mp3' },
    { bytes: new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x41,0x56,0x45]), expected: 'wav', mime: 'audio/wav', filename: 'voice.wav' },
    { bytes: new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70]), expected: 'iso-bmff-family', mime: 'video/mp4', filename: 'clip.mp4' },
    { bytes: new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0]), expected: 'glb', mime: 'model/gltf-binary', filename: 'scene.glb' },
    { bytes: new Uint8Array([0x37,0x7a,0xbc,0xaf,0x27,0x1c]), expected: '7z', mime: 'application/x-7z-compressed', filename: 'bundle.7z' },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    const { record } = await createVyralFileDnaV1({
      record_id: 'signature-' + index,
      source: { asset_id: 'asset-' + index, asset_version_id: 'version-' + index },
      bytes: item.bytes, mime_type: item.mime, filename: item.filename,
    });
    assert.equal(record.file.format_signature, item.expected);
  }
});

test('File DNA records bounded deterministic structural facts for WAV, PDF, JSON and GLB assets', async () => {
  const wav = new Uint8Array(44 + 192000);
  wav.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(wav.buffer).setUint32(4, wav.length - 8, true);
  wav.set(new TextEncoder().encode('WAVEfmt '), 8);
  new DataView(wav.buffer).setUint32(16, 16, true);
  new DataView(wav.buffer).setUint16(20, 1, true);
  new DataView(wav.buffer).setUint16(22, 2, true);
  new DataView(wav.buffer).setUint32(24, 48000, true);
  new DataView(wav.buffer).setUint32(28, 192000, true);
  new DataView(wav.buffer).setUint16(32, 4, true);
  new DataView(wav.buffer).setUint16(34, 16, true);
  wav.set(new TextEncoder().encode('data'), 36);
  new DataView(wav.buffer).setUint32(40, 192000, true);
  const audio = analyzeVyralFileStructureV1(wav, 'audio/wav', 'voice.wav');
  assert.equal(audio.profile, 'audio');
  assert.equal(audio.status, 'parsed');
  assert.equal(audio.facts.find((fact) => fact.key === 'channels')?.value, 2);
  assert.equal(audio.facts.find((fact) => fact.key === 'sample_rate')?.value, 48000);
  assert.equal(audio.facts.find((fact) => fact.key === 'duration_estimate')?.value, 1);

  const mp4 = new Uint8Array([0,0,0,16,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0,0,0,0]);
  const video = analyzeVyralFileStructureV1(mp4, 'video/mp4', 'clip.mp4');
  assert.equal(video.profile, 'video');
  assert.equal(video.facts.find((fact) => fact.key === 'major_brand')?.value, 'isom');
  assert.equal(video.facts.find((fact) => fact.key === 'top_level_boxes')?.value, 'ftyp');
  const box = (type: string, payload: Uint8Array) => {
    const result = new Uint8Array(8 + payload.length);
    new DataView(result.buffer).setUint32(0, result.length, false);
    result.set(new TextEncoder().encode(type), 4);
    result.set(payload, 8);
    return result;
  };
  const join = (...parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
  };
  const mvhdPayload = new Uint8Array(20);
  new DataView(mvhdPayload.buffer).setUint32(12, 1000, false);
  new DataView(mvhdPayload.buffer).setUint32(16, 90000, false);
  const hdlrPayload = new Uint8Array(12);
  hdlrPayload.set(new TextEncoder().encode('vide'), 8);
  const tkhdPayload = new Uint8Array(84);
  new DataView(tkhdPayload.buffer).setUint32(76, 1920 * 65536, false);
  new DataView(tkhdPayload.buffer).setUint32(80, 1080 * 65536, false);
  const stsdPayload = new Uint8Array(16);
  new DataView(stsdPayload.buffer).setUint32(4, 1, false);
  new DataView(stsdPayload.buffer).setUint32(8, 8, false);
  stsdPayload.set(new TextEncoder().encode('avc1'), 12);
  const nestedMp4 = join(
    box('ftyp', new TextEncoder().encode('isom\u0000\u0000\u0000\u0000')),
    box('moov', join(
      box('mvhd', mvhdPayload),
      box('trak', join(
        box('tkhd', tkhdPayload),
        box('mdia', join(
          box('hdlr', hdlrPayload),
          box('minf', box('stbl', box('stsd', stsdPayload))),
        )),
      )),
    )),
  );
  const nestedVideo = analyzeVyralFileStructureV1(nestedMp4, 'video/mp4', 'movie.mp4');
  assert.equal(nestedVideo.facts.find((fact) => fact.key === 'duration')?.value, 90);
  assert.equal(nestedVideo.facts.find((fact) => fact.key === 'track_handlers')?.value, 'vide');
  assert.equal(nestedVideo.facts.find((fact) => fact.key === 'sample_entry_codecs')?.value, 'avc1');
  assert.equal(nestedVideo.facts.find((fact) => fact.key === 'video_width')?.value, 1920);
  assert.equal(nestedVideo.facts.find((fact) => fact.key === 'video_height')?.value, 1080);

  const avi = analyzeVyralFileStructureV1(new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x41,0x56,0x49,0x20]), 'video/x-msvideo', 'clip.avi');
  assert.equal(avi.profile, 'video');
  assert.equal(avi.status, 'signature_only');
  const office = analyzeVyralFileStructureV1(new Uint8Array([0x50,0x4b,0x03,0x04,0,0]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'brief.docx');
  assert.equal(office.profile, 'document');
  assert.equal(office.status, 'signature_only');

  const mp3 = new Uint8Array(1024);
  mp3.set([0x49,0x44,0x33,3,0,0,0,0,0,0], 0);
  mp3.set([0xff,0xfb,0x90,0x64], 10);
  const mp3Structure = analyzeVyralFileStructureV1(mp3, 'audio/mpeg', 'voice.mp3');
  assert.equal(mp3Structure.profile, 'audio');
  assert.equal(mp3Structure.facts.find((fact) => fact.key === 'bitrate')?.value, 128);
  assert.equal(mp3Structure.facts.find((fact) => fact.key === 'sample_rate')?.value, 44100);
  assert.equal(mp3Structure.facts.find((fact) => fact.key === 'channel_mode')?.value, 'joint_stereo');

  const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Pages >> endobj');
  const document = analyzeVyralFileStructureV1(pdf, 'application/pdf', 'brief.pdf');
  assert.equal(document.profile, 'document');
  assert.equal(document.facts.find((fact) => fact.key === 'page_object_markers')?.value, 1);
  assert.ok(document.notes.some((note) => note.includes('lower-bound')));

  const json = new TextEncoder().encode(JSON.stringify({ nodes: [{ name: 'root' }], meshes: [{ primitives: [] }], materials: [] }));
  const model = analyzeVyralFileStructureV1(json, 'application/json', 'scene.gltf');
  assert.equal(model.profile, 'model_3d');
  assert.equal(model.facts.find((fact) => fact.key === 'nodes_count')?.value, 1);
  assert.equal(model.facts.find((fact) => fact.key === 'meshes_count')?.value, 1);

  const text = new TextEncoder().encode('# Heading\nsecond line\n');
  const structure = analyzeVyralFileStructureV1(text, 'text/markdown', 'notes.md');
  assert.equal(structure.profile, 'text');
  assert.equal(structure.facts.find((fact) => fact.key === 'line_count')?.value, 3);
  assert.equal(structure.facts.find((fact) => fact.key === 'markdown_heading_count')?.value, 1);
});

test('File DNA embeds structural metadata but never stores document text or semantic guesses', async () => {
  const bytes = new TextEncoder().encode('{"title":"private content","items":[1,2,3]}');
  const { record } = await createVyralFileDnaV1({
    record_id: 'file-dna-structure', source, bytes, mime_type: 'application/json', filename: 'metadata.json',
  });
  assert.equal(record.structure?.profile, 'text');
  assert.equal(record.structure?.facts.find((fact) => fact.key === 'json_top_level_keys')?.value, 2);
  assert.equal(JSON.stringify(record.structure).includes('private content'), false);
  assert.throws(() => validateVyralFileDnaV1Record({
    ...record,
    structure: { profile: 'audio', status: 'parsed', extractor_version: '1.0.0', facts: [{ key: 'bad key', value: 1, evidence: 'container_header' }], notes: [] },
  }), /structural fact is invalid/);
});

