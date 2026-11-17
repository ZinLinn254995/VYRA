import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectRenderManifest, type ProjectRenderManifestInput } from '../src/services/projectRenderManifest.ts';
import { buildProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner.ts';

const input = (): ProjectRenderManifestInput => ({
  projectId: 'project-render-1',
  createdAt: '2026-11-17T10:00:00.000Z',
  scenes: [
    { id: 'scene-a', title: 'Opening', duration: 8 },
    { id: 'scene-b', title: 'Ending', duration: 6 },
  ],
  timeline: {
    sceneRanges: {
      'scene-a': { sourceIn: 2, sourceOut: 10 },
      'scene-b': { sourceIn: 0, sourceOut: 6 },
    },
    sceneInstances: [
      { id: 'instance-a', sceneId: 'scene-a', sourceIn: 0, sourceOut: 8,
        videoClips: [{ id: 'scene-video', start: 1, duration: 4, sourceIn: 3, sourceOut: 7,
          projectFileId: 'scene-file', assetMimeType: 'video/mp4', mediaKind: 'video' }] },
      { id: 'instance-b', sceneId: 'scene-b', sourceIn: 0, sourceOut: 6,
        projectFileId: 'scene-b-file', assetMimeType: 'video/webm', videoSourceIn: 1, videoSourceOut: 5 },
    ],
    videoTracks: [
      { id: 'video-track', name: 'Overlay', visible: true, clips: [
        { id: 'image-clip', start: 2, duration: 3, sourceIn: 1, sourceOut: 4,
          projectFileId: 'image-file', assetMimeType: 'image/png', mediaKind: 'image' },
        { id: 'video-clip', start: 4, duration: 5, sourceIn: 2, sourceOut: 7,
          assetId: 'legacy-video', assetVersionId: 'v4', assetMimeType: 'video/mp4', mediaKind: 'video' },
      ] },
    ],
    audioTracks: [
      { id: 'music', volume: 0.4, clips: [
        { id: 'music-a', start: 0, duration: 10, sourceIn: 2, sourceOut: 12,
          projectFileId: 'music-file', assetMimeType: 'audio/mpeg', mediaKind: 'audio' },
        { id: 'music-b', start: 5, duration: 4, sourceIn: 0, projectFileId: 'music-file',
          assetMimeType: 'audio/mpeg', mediaKind: 'audio' },
      ] },
      { id: 'muted', muted: true, clips: [
        { id: 'muted-a', start: 0, duration: 3, projectFileId: 'muted-file', assetMimeType: 'audio/mpeg' },
      ] },
    ],
    textTracks: [
      { id: 'titles', visible: true, clips: [
        { id: 'title-a', content: 'Hello', start: 1, duration: 2 },
        { id: 'title-b', content: 'Goodbye', start: 12, duration: 2 },
      ] },
      { id: 'hidden-titles', visible: false, clips: [
        { id: 'hidden', content: 'Do not render', start: 0, duration: 4 },
      ] },
    ],
    transitions: {
      'scene-a:scene-b': { effect: 'crossfade', duration: 0.75 },
    },
  },
});

test('builds a renderer-neutral schedule for scenes, image/video, audio, text and transitions', () => {
  const plan = buildProjectRenderCompositionPlan(createProjectRenderManifest(input()));
  assert.equal(plan.schema, 'vyra.project-render-composition-plan');
  assert.equal(plan.durationSeconds, 14);
  assert.deepEqual(plan.scenes.map((scene) => [scene.sceneId, scene.startSeconds, scene.endSeconds]), [
    ['scene-a', 0, 8], ['scene-b', 8, 14],
  ]);
  assert.equal(plan.visuals.find((item) => item.clipId === 'scene-video')?.layer, 0);
  assert.equal(plan.visuals.find((item) => item.clipId === 'image-clip')?.layer, 1);
  assert.equal(plan.visuals.find((item) => item.clipId === 'video-clip')?.layer, 1);
  assert.deepEqual(plan.visuals.map((item) => [item.kind, item.clipId, item.startSeconds, item.endSeconds]), [
    ['video', 'scene-video', 1, 5],
    ['image', 'image-clip', 2, 5],
    ['video', 'video-clip', 4, 9],
    ['video', 'instance-b', 8, 12],
  ]);
  assert.deepEqual(plan.audio.map((item) => [item.clipId, item.startSeconds, item.endSeconds, item.gain]), [
    ['music-a', 0, 10, 0.4], ['music-b', 5, 9, 0.4],
  ]);
  assert.deepEqual(plan.text.map((item) => [item.content, item.startSeconds, item.endSeconds]), [
    ['Hello', 1, 3], ['Goodbye', 12, 14],
  ]);
  assert.deepEqual(plan.transitions, [{ key: 'scene-a:scene-b', effect: 'crossfade', durationSeconds: 0.75 }]);
});

test('maps source trims exactly and clips scene media at the scene boundary', () => {
  const plan = buildProjectRenderCompositionPlan(createProjectRenderManifest(input()));
  const sceneVideo = plan.visuals.find((item) => item.clipId === 'scene-video')!;
  assert.equal(sceneVideo.sourceInSeconds, 3);
  assert.equal(sceneVideo.sourceOutSeconds, 7);
  assert.equal(sceneVideo.endSeconds, 5);
  const image = plan.visuals.find((item) => item.clipId === 'image-clip')!;
  assert.equal(image.sourceInSeconds, 1);
  assert.equal(image.sourceOutSeconds, 4);
  const sceneB = plan.visuals.find((item) => item.clipId === 'instance-b')!;
  assert.equal(sceneB.sourceInSeconds, 1);
  assert.equal(sceneB.sourceOutSeconds, 5);
});

test('deduplicates required sources without conflating Project Files and legacy Asset versions', () => {
  const plan = buildProjectRenderCompositionPlan(createProjectRenderManifest(input()));
  const keys = plan.requiredSources.map((source) => source.kind === 'project-file'
    ? 'project-file:' + source.projectFileId
    : 'legacy-asset:' + source.assetId + ':' + source.assetVersionId);
  assert.equal(keys.filter((key) => key === 'project-file:music-file').length, 1);
  assert.ok(keys.includes('legacy-asset:legacy-video:v4'));
  assert.ok(keys.includes('project-file:scene-file'));
  assert.ok(keys.includes('project-file:scene-b-file'));
  assert.ok(!keys.includes('project-file:muted-file'));
});

test('returns a deeply frozen detached plan and rejects unsupported manifest versions', () => {
  const manifest = createProjectRenderManifest(input());
  const plan = buildProjectRenderCompositionPlan(manifest);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.visuals[0]), true);
  assert.throws(() => buildProjectRenderCompositionPlan({ ...manifest, version: 2 } as never), /supported immutable/);
});


test('never schedules audio-only sources as visual video layers', () => {
  const value = input();
  value.timeline.videoTracks![0].clips.push({
    id: 'audio-mislabeled-visual', start: 0, duration: 3,
    projectFileId: 'audio-only-file', assetMimeType: 'audio/mpeg', mediaKind: 'audio',
  });
  value.timeline.sceneInstances![0].videoClips!.push({
    id: 'scene-audio-source', start: 0, duration: 2,
    projectFileId: 'scene-audio-file', assetMimeType: 'audio/aac', mediaKind: 'audio',
  });
  const plan = buildProjectRenderCompositionPlan(createProjectRenderManifest(value));
  assert.ok(!plan.visuals.some((item) => item.clipId === 'audio-mislabeled-visual'));
  assert.ok(!plan.visuals.some((item) => item.clipId === 'scene-audio-source'));
  assert.ok(!plan.requiredSources.some((source) =>
    source.kind === 'project-file' && ['audio-only-file', 'scene-audio-file'].includes(source.projectFileId)));
});
