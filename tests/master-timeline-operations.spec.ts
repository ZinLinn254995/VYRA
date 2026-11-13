import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMasterTimelineAudioAssetClip, addMasterTimelineTextClip, cloneMasterTimelineClip, deleteMasterTimelineClip, moveMasterTimelineClip, splitMasterTimelineClip, trimMasterTimelineClip,
  updateMasterTimelineClipText, updateMasterTimelineTransition, type MasterTimelineData,
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
  assert.equal(splitMasterTimelineClip(base, 'audio', 'audio-1', 'a', 2.5, () => 't').ok, false);
});

test('adds an owner-verified Audio Asset reference on a new Audio track without mutating source data', () => {
  const result = addMasterTimelineAudioAssetClip(base, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'audio/mpeg', 'Soundtrack.mp3', 0, 12);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const clip = result.value.audioTracks.find((track) => track.id === '10000000-0000-4000-8000-000000000001')?.clips[0];
  assert.deepEqual(clip, {
    id: '20000000-0000-4000-8000-000000000001', name: 'Soundtrack.mp3', content: 'Soundtrack.mp3',
    start: 0, duration: 12, waveform: [], assetId: '30000000-0000-4000-8000-000000000001',
    assetVersionId: '40000000-0000-4000-8000-000000000001', assetMimeType: 'audio/mpeg',
  });
  assert.equal(base.audioTracks.length, 1);
  assert.equal(addMasterTimelineAudioAssetClip(base, '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'bad', '40000000-0000-4000-8000-000000000001', 'audio/mpeg', 'Bad', 0, 2).ok, false);
  assert.equal(addMasterTimelineAudioAssetClip(base, '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'image/png', 'Bad', 0, 2).ok, false);
  assert.equal(addMasterTimelineAudioAssetClip(base, '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'audio/mpeg', 'Bad', 0, 0.1).ok, false);
});

test('adds an AI-authored Text clip on a new Text track without mutating existing tracks', () => {
  const result = addMasterTimelineTextClip(base, 'text-new', 'text-new-clip', 'Opening title', 'A new beginning', 2.5, 4);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const created = result.value.textTracks.find((track) => track.id === 'text-new');
  assert.equal(created?.name, 'Text');
  assert.deepEqual(created?.clips[0], { id: 'text-new-clip', name: 'Opening title', content: 'A new beginning', start: 2.5, duration: 4 });
  assert.equal(base.textTracks.length, 1);
  assert.equal(result.value.audioTracks, base.audioTracks);
  assert.equal(addMasterTimelineTextClip(base, 'text-new', 'bad', 'Title', 'Copy', -1, 3).ok, false);
  assert.equal(addMasterTimelineTextClip(base, 'text-new', 'bad', 'Title', 'Copy', 0, 0.1).ok, false);
  assert.equal(addMasterTimelineTextClip(base, 'text-1', 'bad', 'Title', 'Copy', 0, 3).ok, false);
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


test('sets only supported transitions and preserves the editor default duration', () => {
  const timeline = { ...base, transitions: {} };
  const result = updateMasterTimelineTransition(timeline, 'scene-a:scene-b', 'dissolve', ['scene-a:scene-b']);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.transitions['scene-a:scene-b'], { effect: 'dissolve', duration: 0.5 });
  assert.equal(updateMasterTimelineTransition(timeline, 'scene-a:scene-b', 'spin', ['scene-a:scene-b']).ok, false);
  assert.equal(updateMasterTimelineTransition(timeline, 'scene-a:scene-c', 'fade', ['scene-a:scene-b']).ok, false);
});

test('changes an existing transition without changing its duration and removes it with None', () => {
  const timeline = { ...base, transitions: { 'scene-a:scene-b': { effect: 'fade', duration: 0.8 } } };
  const changed = updateMasterTimelineTransition(timeline, 'scene-a:scene-b', 'wipe', ['scene-a:scene-b']);
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.deepEqual(changed.value.transitions['scene-a:scene-b'], { effect: 'wipe', duration: 0.8 });
  const removed = updateMasterTimelineTransition(changed.value, 'scene-a:scene-b', null, ['scene-a:scene-b']);
  assert.equal(removed.ok, true);
  if (removed.ok) assert.equal(Object.hasOwn(removed.value.transitions, 'scene-a:scene-b'), false);
  assert.deepEqual(timeline.transitions['scene-a:scene-b'], { effect: 'fade', duration: 0.8 });
});


test('clones audio and text clips at the end of their own track without changing the source', () => {
  const audio = cloneMasterTimelineClip(base, 'audio', 'audio-1', 'a', () => 'audio-copy');
  assert.equal(audio.ok, true);
  if (audio.ok) {
    const copy = audio.value.audioTracks[0].clips.find((clip) => clip.id === 'audio-copy');
    assert.deepEqual(copy, { id: 'audio-copy', name: 'Music', start: 8, duration: 5 });
    assert.equal(audio.value.audioTracks[0].clips.find((clip) => clip.id === 'a')?.start, 0);
  }
  const text = cloneMasterTimelineClip(base, 'text', 'text-1', 't', () => 'text-copy');
  assert.equal(text.ok, true);
  if (text.ok) {
    const copy = text.value.textTracks[0].clips.find((clip) => clip.id === 'text-copy');
    assert.deepEqual(copy, { id: 'text-copy', name: 'Title', content: 'Hello', start: 7, duration: 3 });
  }
});

test('rejects clone IDs that already exist in either media kind', () => {
  assert.equal(cloneMasterTimelineClip(base, 'audio', 'audio-1', 'a', () => 't').ok, false);
});


test('deletes only the selected Audio/Text clip and removes an empty track like the editor', () => {
  const audio = deleteMasterTimelineClip(base, 'audio', 'audio-1', 'a');
  assert.equal(audio.ok, true);
  if (audio.ok) {
    assert.deepEqual(audio.value.audioTracks[0].clips.map((clip) => clip.id), ['b']);
    assert.equal(audio.value.textTracks, base.textTracks);
  }
  const text = deleteMasterTimelineClip(base, 'text', 'text-1', 't');
  assert.equal(text.ok, true);
  if (text.ok) assert.deepEqual(text.value.textTracks[0].clips.map((clip) => clip.id), ['t2']);
  const last = deleteMasterTimelineClip({ ...base, textTracks: [{ ...base.textTracks[0], clips: [base.textTracks[0].clips[0]] }] }, 'text', 'text-1', 't');
  assert.equal(last.ok, true);
  if (last.ok) assert.deepEqual(last.value.textTracks, []);
  assert.equal(deleteMasterTimelineClip(base, 'audio', 'missing-track', 'a').ok, false);
  assert.equal(deleteMasterTimelineClip(base, 'audio', 'audio-1', 'missing-clip').ok, false);
  assert.equal(base.audioTracks[0].clips.length, 2);
});
