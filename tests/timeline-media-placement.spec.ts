import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeTimelineVideoRows, placeTimelineMediaClip, type TimelineMediaClipPlacement, type TimelineMediaTrackRow } from '../src/services/timelineMediaPlacement';

const clip = (id: string, start: number, duration: number, mime = 'video/mp4'): TimelineMediaClipPlacement => ({
  id, name: id, start, duration, assetId: 'asset-' + id, assetVersionId: 'version-' + id, assetMimeType: mime,
});
const idFactory = () => { let id = 0; return () => 'track-' + (++id); };

test('places visual media in the shared Scenes row', () => {
  const tracks: TimelineMediaTrackRow[] = [{ id: 'video-1', name: 'Video 1', clips: [clip('existing', 0, 4)] }];
  const result = placeTimelineMediaClip(tracks, clip('new', 5, 3), 'video', idFactory());
  assert.equal(result.createdTrack, false);
  assert.equal(result.trackId, 'video-1');
  assert.deepEqual(result.tracks[0].clips.map((item) => item.id), ['existing', 'new']);
});

test('keeps overlapping Video clips on the single shared visual row', () => {
  const tracks: TimelineMediaTrackRow[] = [{ id: 'video-1', name: 'Video', clips: [clip('existing', 4, 5)] }];
  const result = placeTimelineMediaClip(tracks, clip('new', 6, 2), 'video', idFactory());
  assert.equal(result.createdTrack, false);
  assert.equal(result.rowIndex, 0);
  assert.equal(result.trackId, 'video-1');
  assert.equal(result.tracks.length, 1);
  assert.deepEqual(result.tracks[0].clips.map((item) => item.id), ['existing', 'new']);
});

test('uses the same Video layer for Image clips', () => {
  const tracks: TimelineMediaTrackRow[] = [];
  const result = placeTimelineMediaClip(tracks, clip('image', 0, 5, 'image/png'), 'image', idFactory());
  assert.equal(result.tracks[0].name, 'Scenes');
});

test('keeps Audio placement independent from Video rows', () => {
  const tracks: TimelineMediaTrackRow[] = [];
  const result = placeTimelineMediaClip(tracks, clip('audio', 0, 8, 'audio/mpeg'), 'audio', idFactory());
  assert.equal(result.tracks[0].name, 'Audio 1');
});

test('rejects a MIME type that does not match the requested layer', () => {
  assert.throws(() => placeTimelineMediaClip([], clip('wrong', 0, 2, 'image/png'), 'video', idFactory()), /video Asset Version/);
});

test('rejects invalid timeline intervals', () => {
  assert.throws(() => placeTimelineMediaClip([], clip('invalid', -1, 2), 'video', idFactory()), /valid non-negative values/);
});


test('merges Director and uploaded Video/Image clips into one shared Video row when intervals do not overlap', () => {
  const director = [clip('director-1', 0, 4), clip('director-2', 4, 3)];
  const uploaded: TimelineMediaTrackRow[] = [
    { id: 'uploaded-1', name: 'Video 1', clips: [clip('image-1', 7, 5, 'image/png')] },
  ];
  const rows = mergeTimelineVideoRows(director, uploaded);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Scenes');
  assert.deepEqual(rows[0].clips.map((item) => item.id), ['director-1', 'director-2', 'image-1']);
});

test('keeps overlapping Director and uploaded Video/Image clips in exactly one row', () => {
  const director = [clip('director-1', 0, 5)];
  const uploaded: TimelineMediaTrackRow[] = [
    { id: 'uploaded-1', name: 'Video 1', clips: [clip('manual-video', 3, 2), clip('image', 4, 3, 'image/png')] },
  ];
  const rows = mergeTimelineVideoRows(director, uploaded);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Scenes');
  assert.deepEqual(rows[0].clips.map((item) => item.id), ['director-1', 'manual-video', 'image']);
});


test('bottom timeline toolbar exposes Image and Video sample actions that append placeholders to Scenes', () => {
  const editor = readFileSync(resolve(process.cwd(), 'src/components/workspace/MasterTimelineEditor.tsx'), 'utf8');
  assert.match(editor, /\{ label: 'Image', Icon: ImageIcon \}/);
  assert.match(editor, /\{ label: 'Video', Icon: Video \}/);
  assert.match(editor, /const addSampleVisualClip = \(mediaKind: 'image' \| 'video'\)/);
  assert.match(editor, /isPlaceholder: true/);
  assert.match(editor, /name: 'Scenes'/);
  assert.match(editor, /relative h-16 py-2/);
  assert.doesNotMatch(editor, /data-video-track-id=\{track\.id\} className="relative flex h-16 items-center gap-0 border-b/);
  assert.match(editor, /selectedVisualClipId === clip\.id/);
  assert.match(editor, /data-timeline-video-clip-id=\{clip\.id\}/);
  assert.match(editor, /Adjust start point/);
  assert.match(editor, /Adjust end point/);
  assert.match(editor, /const snapTrimPointToPlayhead = \(time: number\)/);
  assert.equal([...editor.matchAll(/snapTrimPointToPlayhead\(/g)].length, 7);
  assert.match(editor, /return Math\.abs\(time - playheadTime\) \* scale <= 10 \? playheadTime : time/);
  assert.match(editor, /updateVisualClipTiming\(clip, nextClipStart, nextClipDuration, nextSourceIn, nextSourceOut, rippleClipStarts, rippleDelta\)/);
  assert.match(editor, /data-trim-handle="true"/);
  assert.match(editor, /ring-2 ring-\[var\(--vyra-accent-primary\)\]/);
  assert.match(editor, /border-\[var\(--vyra-accent-primary\)\]\/50 bg-\[var\(--vyra-accent-primary\)\]\/10/);
  assert.match(editor, /position: 'absolute', left: clip\.start \* pixelsPerSecond/);
  assert.match(editor, /edge === 'left'\s*\? item\.start \+ item\.duration <= edgeBoundary/);
  assert.match(editor, /edge === 'left'\s*\? item\.start \+ item\.duration <= edgeBoundary \+ 0\.0001\s*:\s*item\.start >= edgeBoundary - 0\.0001/);
  assert.match(editor, /rippleIds\.has\(item\.id\) \? \{ \.\.\.item, start: rippleClipStarts\[item\.id\] \+ rippleDelta \}/);
  assert.doesNotMatch(editor, /normalizeTimelineOrigin/);
  assert.match(editor, /sourceStartBoundary = isImage \? Number\.NEGATIVE_INFINITY : initialStart - initialSourceIn/);
  assert.match(editor, /const normalizeScenesOrigin = \(\)/);
  assert.match(editor, /const normalizeAudioTrackOrigin = \(trackId: string\)/);
  assert.match(editor, /const normalizeTextTrackOrigin = \(trackId: string\)/);
  assert.match(editor, /if \(edge === 'left'\) normalizeAudioTrackOrigin\(track\.id\)/);
  assert.match(editor, /normalizeTextTrackOrigin\(track\.id\)/);
  assert.match(editor, /sourceStartBoundary = initialStart - Number\(handle\.dataset\.initialSourceIn \|\| 0\)/);
  assert.doesNotMatch(editor, /normalizeAudioTrackOrigin\(track\.id\).*Adjust text end/);
  assert.doesNotMatch(editor, /audioTracks: shiftTracks\(value\?\.audioTracks/);
  assert.doesNotMatch(editor, /textTracks: shiftTracks\(value\?\.textTracks/);
  assert.match(editor, /Transition controls follow the real timeline boundary/);
  assert.doesNotMatch(editor, /effect: 'dissolve', duration: 0\.5/);
  assert.match(editor, /label === 'Image' \? \(\) => addSampleVisualClip\('image'\) : label === 'Video' \? \(\) => addSampleVisualClip\('video'\)/);
});
