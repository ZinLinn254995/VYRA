import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterTimelineVideoPlaybackPlan } from '../src/server/masterTimelineVideoPlayback.ts';

const scenes = [
  { id: 'scene-a', duration: 5 },
  { id: 'scene-b', duration: 8 },
  { id: 'scene-c', duration: 4 },
];
const instances = [
  { id: 'instance-a', sceneId: 'scene-a', sourceIn: 0, sourceOut: 99, videoSourceIn: 1, videoSourceOut: 6, assetId: 'asset-a', assetVersionId: 'version-a', assetMimeType: 'video/mp4' },
  { id: 'instance-b', sceneId: 'scene-b', sourceIn: 0, sourceOut: 99, videoSourceIn: 2, videoSourceOut: 12, assetId: 'asset-b', assetVersionId: 'version-b', assetMimeType: 'video/webm' },
  { id: 'instance-c', sceneId: 'scene-c', sourceIn: 0, sourceOut: 99, videoSourceIn: 0, videoSourceOut: 4, assetId: 'asset-c', assetVersionId: 'version-c', assetMimeType: 'video/mp4' },
];

test('plans ordered Scene video sources against contiguous Master Timeline timing', () => {
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, instances, 0);
  assert.deepEqual(plan.map((item) => ({
    sceneId: item.sceneId,
    start: item.timelineStartSeconds,
    delay: item.delaySeconds,
    offset: item.sourceOffsetSeconds,
    duration: item.durationSeconds,
    playbackStart: item.playbackStartSeconds,
    playbackEnd: item.playbackEndSeconds,
  })), [
    { sceneId: 'scene-a', start: 0, delay: 0, offset: 1, duration: 5, playbackStart: 0, playbackEnd: 5 },
    { sceneId: 'scene-b', start: 5, delay: 5, offset: 2, duration: 8, playbackStart: 5, playbackEnd: 13 },
    { sceneId: 'scene-c', start: 13, delay: 13, offset: 0, duration: 4, playbackStart: 13, playbackEnd: 17 },
  ]);
});

test('seeks into the active Scene and schedules following video sources', () => {
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, instances, 7);
  assert.deepEqual(plan.map((item) => ({
    sceneId: item.sceneId,
    delay: item.delaySeconds,
    offset: item.sourceOffsetSeconds,
    duration: item.durationSeconds,
    playbackStart: item.playbackStartSeconds,
    playbackEnd: item.playbackEndSeconds,
  })), [
    { sceneId: 'scene-b', delay: 0, offset: 4, duration: 6, playbackStart: 7, playbackEnd: 13 },
    { sceneId: 'scene-c', delay: 6, offset: 0, duration: 4, playbackStart: 13, playbackEnd: 17 },
  ]);
});

test('orders instances by their explicit order and ignores non-video or unverified references', () => {
  const reordered = [instances[1], { ...instances[0], assetMimeType: 'audio/mpeg' }, instances[2]];
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, reordered, 0);
  assert.deepEqual(plan.map((item) => item.sceneId), ['scene-b', 'scene-c']);
  assert.equal(plan[0].timelineStartSeconds, 0);
  assert.equal(plan[1].timelineStartSeconds, 13);
});

test('rejects invalid playheads and malformed or missing immutable source references', () => {
  assert.deepEqual(buildMasterTimelineVideoPlaybackPlan(scenes, instances, -1), []);
  assert.deepEqual(buildMasterTimelineVideoPlaybackPlan(scenes, instances, Number.NaN), []);
  const malformed = [
    { ...instances[0], assetVersionId: '' },
    { ...instances[1], videoSourceOut: 1 },
    { ...instances[2], assetMimeType: 'application/octet-stream' },
  ];
  assert.deepEqual(buildMasterTimelineVideoPlaybackPlan(scenes, malformed, 0), []);
});

test('does not schedule a Scene that has already ended at the playhead', () => {
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, instances, 13);
  assert.deepEqual(plan.map((item) => item.sceneId), ['scene-c']);
  assert.equal(plan[0].sourceOffsetSeconds, 0);
  assert.equal(plan[0].delaySeconds, 0);
});


test('does not mistake render source ranges for attached Video source ranges', () => {
  const withoutVideoRange = [{ ...instances[0], videoSourceIn: undefined, videoSourceOut: undefined }];
  assert.deepEqual(buildMasterTimelineVideoPlaybackPlan([scenes[0]], withoutVideoRange, 0), []);
});

test('deduplicates repeated Scene instances without replaying a Scene twice', () => {
  const duplicated = [instances[1], instances[1], instances[0], instances[2]];
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, duplicated, 0);
  assert.deepEqual(plan.map((item) => item.sceneId), ['scene-b', 'scene-a', 'scene-c']);
  assert.deepEqual(plan.map((item) => item.playbackStartSeconds), [0, 8, 13]);
});

test('plays multiple generated shot Assets in order inside one Master Timeline Scene', () => {
  const shotInstance = [{
    id: 'scene-shot-sequence',
    sceneId: 'scene-a',
    sourceIn: 0,
    sourceOut: 5,
    videoClips: [
      { id: 'shot-1', name: 'Shot 1', start: 0, duration: 2, sourceIn: 0, sourceOut: 2, assetId: 'shot-asset-1', assetVersionId: 'shot-version-1', assetMimeType: 'video/mp4' },
      { id: 'shot-2', name: 'Shot 2', start: 2, duration: 3, sourceIn: 0, sourceOut: 3, assetId: 'shot-asset-2', assetVersionId: 'shot-version-2', assetMimeType: 'video/webm' },
    ],
  }];
  const plan = buildMasterTimelineVideoPlaybackPlan([scenes[0]], shotInstance, 0);
  assert.deepEqual(plan.map((item) => ({
    instanceId: item.instanceId,
    assetId: item.assetId,
    start: item.timelineStartSeconds,
    end: item.timelineEndSeconds,
    delay: item.delaySeconds,
    offset: item.sourceOffsetSeconds,
    duration: item.durationSeconds,
    playbackStart: item.playbackStartSeconds,
    playbackEnd: item.playbackEndSeconds,
  })), [
    { instanceId: 'scene-shot-sequence:shot-1', assetId: 'shot-asset-1', start: 0, end: 2, delay: 0, offset: 0, duration: 2, playbackStart: 0, playbackEnd: 2 },
    { instanceId: 'scene-shot-sequence:shot-2', assetId: 'shot-asset-2', start: 2, end: 5, delay: 2, offset: 0, duration: 3, playbackStart: 2, playbackEnd: 5 },
  ]);
});

test('seeks into the correct generated shot without replaying earlier shots', () => {
  const shotInstance = [{
    id: 'scene-shot-sequence', sceneId: 'scene-a', sourceIn: 0, sourceOut: 5,
    videoClips: [
      { id: 'shot-1', start: 0, duration: 2, assetId: 'shot-asset-1', assetVersionId: 'shot-version-1', assetMimeType: 'video/mp4' },
      { id: 'shot-2', start: 2, duration: 3, assetId: 'shot-asset-2', assetVersionId: 'shot-version-2', assetMimeType: 'video/mp4' },
    ],
  }];
  const plan = buildMasterTimelineVideoPlaybackPlan([scenes[0]], shotInstance, 2.5);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].instanceId, 'scene-shot-sequence:shot-2');
  assert.equal(plan[0].sourceOffsetSeconds, 0.5);
  assert.equal(plan[0].playbackStartSeconds, 2.5);
  assert.equal(plan[0].playbackEndSeconds, 5);
});

test('ignores malformed or non-video generated shot clips without falling back to a stale Scene render', () => {
  const shotInstance = [{
    ...instances[0],
    videoClips: [
      { id: 'bad', start: 0, duration: 2, assetId: 'asset-bad', assetVersionId: '', assetMimeType: 'video/mp4' },
      { id: 'audio', start: 2, duration: 3, assetId: 'asset-audio', assetVersionId: 'version-audio', assetMimeType: 'audio/mpeg' },
    ],
  }];
  assert.deepEqual(buildMasterTimelineVideoPlaybackPlan([scenes[0]], shotInstance, 0), []);
});
