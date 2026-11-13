import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterTimelineVideoPlaybackPlan } from '../src/server/masterTimelineVideoPlayback';

const scenes = [
  { id: 'scene-a', duration: 5 },
  { id: 'scene-b', duration: 8 },
  { id: 'scene-c', duration: 4 },
];
const instances = [
  { id: 'instance-a', sceneId: 'scene-a', sourceIn: 1, sourceOut: 6, assetId: 'asset-a', assetVersionId: 'version-a', assetMimeType: 'video/mp4' },
  { id: 'instance-b', sceneId: 'scene-b', sourceIn: 2, sourceOut: 12, assetId: 'asset-b', assetVersionId: 'version-b', assetMimeType: 'video/webm' },
  { id: 'instance-c', sceneId: 'scene-c', sourceIn: 0, sourceOut: 4, assetId: 'asset-c', assetVersionId: 'version-c', assetMimeType: 'video/mp4' },
];

test('plans ordered Scene video sources against contiguous Master Timeline timing', () => {
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, instances, 0);
  assert.deepEqual(plan.map((item) => ({
    sceneId: item.sceneId,
    start: item.timelineStartSeconds,
    delay: item.delaySeconds,
    offset: item.sourceOffsetSeconds,
    duration: item.durationSeconds,
  })), [
    { sceneId: 'scene-a', start: 0, delay: 0, offset: 1, duration: 5 },
    { sceneId: 'scene-b', start: 5, delay: 5, offset: 2, duration: 7 },
    { sceneId: 'scene-c', start: 13, delay: 13, offset: 0, duration: 4 },
  ]);
});

test('seeks into the active Scene and schedules following video sources', () => {
  const plan = buildMasterTimelineVideoPlaybackPlan(scenes, instances, 7);
  assert.deepEqual(plan.map((item) => ({
    sceneId: item.sceneId,
    delay: item.delaySeconds,
    offset: item.sourceOffsetSeconds,
    duration: item.durationSeconds,
  })), [
    { sceneId: 'scene-b', delay: 0, offset: 4, duration: 6 },
    { sceneId: 'scene-c', delay: 6, offset: 0, duration: 4 },
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
    { ...instances[1], sourceOut: 1 },
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
