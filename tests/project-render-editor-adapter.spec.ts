import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectRenderManifestInputFromEditor } from '../src/services/projectRenderEditorAdapter.ts';

test('maps live Editor timeline fields and excludes editor-only runtime state', () => {
  const result = createProjectRenderManifestInputFromEditor({
    projectId: 'project-1',
    scenes: [{ id: 'scene-1', title: 'Opening', duration: 5 }],
    timeline: {
      sceneRanges: { 'scene-1': { sourceIn: 0, sourceOut: 5 } },
      sceneInstances: [{
        id: 'instance-1', sceneId: 'scene-1', sourceIn: 0, sourceOut: 5,
        projectFileId: 'scene-video', assetMimeType: 'video/mp4',
        videoClips: [{
          id: 'scene-clip', name: 'Scene clip', start: 0, duration: 5,
          projectFileId: 'scene-video', assetMimeType: 'video/mp4', mediaKind: 'video',
          waveform: [0.1, 0.2], uploadPending: true,
        }],
      }],
      videoTracks: [{
        id: 'video-track', name: 'Video', visible: true,
        clips: [{
          id: 'clip-1', name: 'Overlay', start: 1, duration: 2,
          projectFileId: 'overlay-file', assetMimeType: 'video/mp4', mediaKind: 'video',
          waveform: [0.4], uploadPending: true,
        }],
      }],
      transitions: { 'scene-1:scene-2': { effect: 'fade', duration: 0.5 } },
      audioTracks: [{
        id: 'audio-track', name: 'Audio', muted: false, volume: 0.75,
        clips: [{
          id: 'audio-1', name: 'Music', start: 0, duration: 5,
          assetId: 'audio-asset', assetVersionId: 'audio-v1',
          assetMimeType: 'audio/mpeg', mediaKind: 'audio',
        }],
      }],
      textTracks: [{
        id: 'text-track', name: 'Text', visible: true,
        clips: [{ id: 'text-1', name: 'Title', start: 0, duration: 2, content: 'Hello' }],
      }],
    },
  });

  assert.equal(result.projectId, 'project-1');
  assert.deepEqual(result.scenes, [{ id: 'scene-1', title: 'Opening', duration: 5 }]);
  assert.equal(result.timeline.videoTracks?.[0].clips[0].projectFileId, 'overlay-file');
  assert.equal(result.timeline.audioTracks?.[0].volume, 0.75);
  assert.equal(result.timeline.textTracks?.[0].clips[0].content, 'Hello');
  assert.equal(result.timeline.sceneInstances?.[0].videoClips?.[0].projectFileId, 'scene-video');
  assert.equal('waveform' in result.timeline.videoTracks![0].clips[0], false);
  assert.equal('uploadPending' in result.timeline.videoTracks![0].clips[0], false);
  assert.equal('waveform' in result.timeline.sceneInstances![0].videoClips![0], false);
});

test('rejects an empty Project ID before reading Editor timeline data', () => {
  assert.throws(() => createProjectRenderManifestInputFromEditor({
    projectId: ' ',
    scenes: [],
    timeline: { sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [] },
  }), /Project ID/);
});
