import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterTimelineAudioPlaybackPlan } from '../src/server/masterTimelineAudioPlayback.ts';

const audio = (id: string, start: number, duration: number, sourceIn = 0) => ({
  id, start, duration, sourceIn,
  assetId: `asset-${id}`, assetVersionId: `version-${id}`,
});

test('creates a multi-track schedule with future delays and active source offsets', () => {
  const plan = buildMasterTimelineAudioPlaybackPlan({
    audioTracks: [
      { id: 'music', volume: 0.65, clips: [audio('music-a', 0, 20, 2)] },
      { id: 'sfx', volume: 1.5, clips: [audio('sfx-a', 8, 3, 0.5)] },
    ],
  }, 10);
  assert.deepEqual(plan, [
    {
      trackId: 'music', clipId: 'music-a', assetId: 'asset-music-a',
      assetVersionId: 'version-music-a', delaySeconds: 0,
      sourceOffsetSeconds: 12, durationSeconds: 10, gain: 0.65,
    },
    {
      trackId: 'sfx', clipId: 'sfx-a', assetId: 'asset-sfx-a',
      assetVersionId: 'version-sfx-a', delaySeconds: 0,
      sourceOffsetSeconds: 2.5, durationSeconds: 1, gain: 1,
    },
  ]);
});

test('keeps future clips scheduled relative to the playhead', () => {
  const plan = buildMasterTimelineAudioPlaybackPlan({
    audioTracks: [{ id: 'music', clips: [audio('later', 12, 4, 1)] }],
  }, 7);
  assert.equal(plan[0]?.delaySeconds, 5);
  assert.equal(plan[0]?.sourceOffsetSeconds, 1);
  assert.equal(plan[0]?.durationSeconds, 4);
});

test('respects muted and zero-volume tracks without mutating timeline data', () => {
  const timeline = {
    audioTracks: [
      { id: 'muted', muted: true, clips: [audio('a', 0, 10)] },
      { id: 'silent', volume: 0, clips: [audio('b', 0, 10)] },
      { id: 'audible', volume: 0.25, clips: [audio('c', 0, 10)] },
    ],
  };
  const plan = buildMasterTimelineAudioPlaybackPlan(timeline, 2);
  assert.deepEqual(plan.map((item) => item.clipId), ['c']);
  assert.equal(plan[0]?.gain, 0.25);
  assert.equal(timeline.audioTracks[2].clips[0].start, 0);
});

test('excludes expired, placeholder, and malformed clips and rejects invalid playheads', () => {
  const plan = buildMasterTimelineAudioPlaybackPlan({
    audioTracks: [{
      id: 'track',
      clips: [
        audio('expired', 0, 2),
        { id: 'placeholder', start: 0, duration: 10 },
        { ...audio('bad', 0, 10), sourceIn: -1 },
        { ...audio('bad-duration', 0, Number.NaN) },
      ],
    }],
  }, 3);
  assert.deepEqual(plan, []);
  assert.deepEqual(buildMasterTimelineAudioPlaybackPlan({ audioTracks: [] }, -1), []);
});
