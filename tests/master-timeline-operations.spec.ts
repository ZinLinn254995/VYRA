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

test('restores a same-track drop to its original time when the destination gap is too small', () => {
  const crowded = { ...base, textTracks: [{ ...base.textTracks[0], clips: [...base.textTracks[0].clips, { id: 't3', name: 'Third', start: 8, duration: 1 }] }] };
  const result = moveMasterTimelineClip(crowded, 'text', 'text-1', 't', 'text-1', 5.5);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.textTracks[0].clips.find((clip) => clip.id === 't')?.start, 1);
});

test('restores a cross-track drop to its exact source track and time when multiple clips collide', () => {
  const crowded = { ...base, audioTracks: [...base.audioTracks, { id: 'audio-2', name: 'Audio 2', clips: [
    { id: 'c', name: 'C', start: 2, duration: 1 }, { id: 'd', name: 'D', start: 4, duration: 1 },
  ] }] };
  const result = moveMasterTimelineClip(crowded, 'audio', 'audio-1', 'b', 'audio-2', 2.5);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.audioTracks.find((track) => track.id === 'audio-1')?.clips.find((clip) => clip.id === 'b')?.start, 6);
    assert.equal(result.value.audioTracks.find((track) => track.id === 'audio-2')?.clips.length, 2);
  }
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
    assert.equal(clip.start, 3.8);
    assert.ok(Math.abs(clip.duration - 0.2) < 1e-9);
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
