import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMasterTimelineTextOverlay } from '../src/server/masterTimelineTextOverlay.ts';

const tracks = [
  { id: 'text-a', clips: [
    { id: 'a1', content: 'Opening title', start: 0, duration: 3 },
    { id: 'a2', content: 'Next title', start: 3, duration: 2 },
  ] },
  { id: 'text-b', clips: [
    { id: 'b1', content: 'Subtitle', start: 1, duration: 3 },
  ] },
  { id: 'hidden', visible: false, clips: [
    { id: 'h1', content: 'Hidden', start: 0, duration: 10 },
  ] },
];

test('resolves concurrent visible Text overlays in track stacking order', () => {
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, 2), [
    { trackId: 'text-a', clipId: 'a1', content: 'Opening title', start: 0, end: 3, layer: 0 },
    { trackId: 'text-b', clipId: 'b1', content: 'Subtitle', start: 1, end: 4, layer: 1 },
  ]);
});

test('switches clips exactly at boundaries and excludes ended clips', () => {
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, 3).map((clip) => clip.clipId), ['a2', 'b1']);
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, 4).map((clip) => clip.clipId), ['a2']);
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, 5), []);
});

test('fails closed for invalid times, malformed clips and invisible tracks', () => {
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, Number.NaN), []);
  assert.deepEqual(buildMasterTimelineTextOverlay(tracks, -1), []);
  assert.deepEqual(buildMasterTimelineTextOverlay([
    { id: 'bad', clips: [
      { id: 'empty', content: '   ', start: 0, duration: 2 },
      { id: 'zero', content: 'Zero', start: 0, duration: 0 },
      { id: 'negative', content: 'Negative', start: -1, duration: 2 },
    ] },
  ], 1), []);
});

test('Master Editor renders Text overlays against the shared playback clock', () => {
  const editor = readFileSync(resolve(process.cwd(), 'src/components/workspace/MasterTimelineEditor.tsx'), 'utf8');
  assert.match(editor, /buildMasterTimelineTextOverlay\(textTracks, currentTime\)/);
  assert.match(editor, /masterPreviewTextSignatureRef\.current/);
  assert.match(editor, /masterPreviewTextOverlays\.map\(\(overlay\)/);
  assert.match(editor, /ref=\{masterVideoPreviewRef\}/);
});
