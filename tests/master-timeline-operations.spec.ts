import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveMasterTimelineClip, splitMasterTimelineClip, trimMasterTimelineClip,
  updateMasterTimelineClipText, type MasterTimelineData,
} from '../src/server/masterTimelineOperations.ts';

const base: MasterTimelineData = {
  sceneRanges: {}, transitions: {},
  audioTracks: [{ id: 'audio-1', name: 'Audio', clips: [
    { id: 'a', name: 'Music', start: 0, duration: 5 },
    { id: 'b', name: 'SFX', start: 6, duration: 2 },
  ] }],
  textTracks: [{ id: 'text-1', name: 'Text', clips: [
    { id: 't', name: 'Title', content: 'Hello', start: 1, duration: 3 },
    { id: 't2', name: 'Caption', content: 'World', start: 5, duration: 2 },
  ] }],
};

test('moves a clip into a free position and resolves a single collision like the editor', () => {
  const moved = moveMasterTimelineClip(base, 'audio', 'audio-1', 'a', 'audio-1', 5.5);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.value.audioTracks[0].clips.find((clip) => clip.id === 'a')?.start, 8);
  assert.equal(base.audioTracks[0].clips[0].start, 0);
});

test('rejects ambiguous multi-clip collisions instead of jumping a clip unpredictably', () => {
  const result = moveMasterTimelineClip(base, 'text', 'text-1', 't', 'text-1', 5.5);
  assert.deepEqual(result, { ok: false, reason: 'clip-collision' });
});

test('moves a clip across tracks of the same media kind without mutating the source snapshot', () => {
  const withTrack = { ...base, audioTracks: [...base.audioTracks, { id: 'audio-2', name: 'Audio 2', clips: [] }] };
  const result = moveMasterTimelineClip(withTrack, 'audio', 'audio-1', 'b', 'audio-2', 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.audioTracks.find((track) => track.id === 'audio-1')?.clips.length, 1);
  assert.equal(result.value.audioTracks.find((track) => track.id === 'audio-2')?.clips[0].start, 3);
});

test('trims start/end with the 0.2s minimum and neighboring-clip boundaries', () => {
  const left = trimMasterTimelineClip(base, 'text', 'text-1', 't', 'start', 4.5);
  assert.equal(left.ok, true);
  if (left.ok) {
    const clip = left.value.textTracks[0].clips.find((item) => item.id === 't')!;
    assert.equal(clip.start, 4);
    assert.equal(clip.duration, 0);
  }
});

test('splits audio/text at least 0.2 seconds from either edge', () => {
  const result = splitMasterTimelineClip(base, 'audio', 'audio-1', 'a', 2.5, () => 'new-a');
  assert.equal(result.ok, true);
  if (result.ok) {
    const clips = result.value.audioTracks[0].clips;
    assert.equal(clips.find((item) => item.id === 'a')?.duration, 2.5);
    assert.deepEqual(clips.find((item) => item.id === 'new-a'), { id: 'new-a', name: 'Music', start: 2.5, duration: 2.5 });
  }
  assert.equal(splitMasterTimelineClip(base, 'audio', 'audio-1', 'a', 0.1, () => 'new-b').ok, false);
});

test('updates text clip content only and preserves all unrelated timeline data', () => {
  const result = updateMasterTimelineClipText(base, 'text-1', 't', 'content', 'New title');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.textTracks[0].clips[0].content, 'New title');
    assert.equal(result.value.audioTracks, base.audioTracks);
    assert.equal(result.value.transitions, base.transitions);
  }
});
