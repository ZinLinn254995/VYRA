import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectRenderManifest, getProjectRenderSourceKey } from '../src/services/projectRenderManifest.ts';

const baseInput = () => ({
  projectId: 'project-1',
  createdAt: '2026-11-17T10:00:00.000Z',
  scenes: [{ id: 'scene-1', title: 'Opening', duration: 12 }],
  timeline: {
    sceneRanges: { 'scene-1': { sourceIn: 0, sourceOut: 12 } },
    sceneInstances: [{
      id: 'instance-1', sceneId: 'scene-1', sourceIn: 0, sourceOut: 12,
      projectFileId: 'scene-video-1', assetMimeType: 'video/mp4',
    }],
    videoTracks: [{ id: 'video-1', name: 'Video', visible: true, clips: [{
      id: 'clip-video-1', name: 'Shot', start: 1, duration: 5, sourceIn: 2, sourceOut: 7,
      projectFileId: 'file-video-1', assetMimeType: 'video/mp4', mediaKind: 'video',
    }] }],
    audioTracks: [{ id: 'audio-1', volume: 0.5, clips: [{
      id: 'clip-audio-1', start: 0, duration: 8, sourceIn: 1,
      assetId: 'legacy-audio', assetVersionId: 'legacy-audio-v3', assetMimeType: 'audio/mpeg',
    }] }],
    textTracks: [{ id: 'text-1', clips: [{ id: 'title-1', content: 'Hello', start: 0, duration: 3 }] }],
    transitions: { 'scene-1:scene-2': { effect: 'crossfade', duration: 0.5 } },
  },
});

test('creates a versioned render snapshot with stable Project File and legacy Asset identities', () => {
  const manifest = createProjectRenderManifest(baseInput());
  assert.equal(manifest.schema, 'vyra.project-render-manifest');
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.videoTracks[0].clips[0].source, { kind: 'project-file', projectFileId: 'file-video-1', mimeType: 'video/mp4' });
  assert.deepEqual(manifest.audioTracks[0].clips[0].source, { kind: 'legacy-asset', assetId: 'legacy-audio', assetVersionId: 'legacy-audio-v3', mimeType: 'audio/mpeg' });
  assert.equal(manifest.textTracks[0].clips[0].content, 'Hello');
  assert.equal(manifest.transitions['scene-1:scene-2'].duration, 0.5);
});

test('does not retain signed URLs, object URLs, editor-only waveform data, or mutate source timeline', () => {
  const input = baseInput();
  const clip = input.timeline.videoTracks[0].clips[0] as typeof input.timeline.videoTracks[0]['clips'][0] & { waveform: number[]; url: string };
  clip.waveform = [0.2, 0.8];
  clip.url = 'blob:temporary-editor-url';
  const before = JSON.stringify(input);
  const manifest = createProjectRenderManifest(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(manifest).includes('blob:'), false);
  assert.equal(JSON.stringify(manifest).includes('waveform'), false);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.videoTracks[0].clips[0]), true);
});

test('rejects clips without stable source identity and invalid source trim ranges', () => {
  const input = baseInput();
  input.timeline.videoTracks[0].clips[0].projectFileId = undefined as never;
  input.timeline.videoTracks[0].clips[0].assetId = undefined as never;
  input.timeline.videoTracks[0].clips[0].assetVersionId = undefined as never;
  assert.throws(() => createProjectRenderManifest(input), /missing-source/);
  const invalid = baseInput();
  invalid.timeline.audioTracks[0].clips[0].sourceOut = 0.5;
  assert.throws(() => createProjectRenderManifest(invalid), /invalid-timing/);
});

test('rejects invalid timeline tracks, scene ranges, transitions, and scene durations', () => {
  const invalid = baseInput();
  invalid.timeline.videoTracks[0].clips[0].start = -1;
  invalid.timeline.sceneRanges['scene-1'].sourceOut = 0;
  invalid.timeline.transitions['bad'] = { effect: '', duration: -1 };
  invalid.scenes[0].duration = 0;
  assert.throws(() => createProjectRenderManifest(invalid));
});

test('keeps Project File identity keys distinct from legacy immutable Asset versions', () => {
  assert.equal(getProjectRenderSourceKey({ kind: 'project-file', projectFileId: 'same-id' }), 'project-file:same-id');
  assert.equal(getProjectRenderSourceKey({ kind: 'legacy-asset', assetId: 'asset', assetVersionId: 'v1' }), 'legacy-asset:asset:v1');
});
