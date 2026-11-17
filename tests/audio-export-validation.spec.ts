import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectAudioTrack, Scene } from '../src/types.ts';
import { validateProjectAudioTracksForExport } from '../src/services/audioExportValidation.ts';

const scene = { id: 'scene-1' } as Scene;
const validTrack: ProjectAudioTrack = {
  id: 'music-1',
  mediaId: 'media-1',
  name: 'Background music',
  kind: 'music',
  startTimeSeconds: 0,
  volume: 0.8,
  fadeInSeconds: 1,
  fadeOutSeconds: 2,
  loop: true,
  enabled: true,
  duckingEnabled: true,
  duckingLevel: 0.25,
};

test('accepts valid enabled music tracks with narration ducking', () => {
  assert.deepEqual(validateProjectAudioTracksForExport([validTrack], [scene]), []);
});

test('ignores disabled tracks so stale optional settings do not block export', () => {
  assert.deepEqual(validateProjectAudioTracksForExport([
    { ...validTrack, enabled: false, mediaId: '', volume: 5 },
  ], []), []);
});

test('reports invalid audio metadata before attempting export', () => {
  const issues = validateProjectAudioTracksForExport([
    { ...validTrack, mediaId: '', volume: 1.5, startTimeSeconds: -1, fadeInSeconds: -2 },
  ], [scene]);
  assert.equal(issues.length, 4);
  assert.ok(issues.some((issue) => issue.message.includes('Re-upload')));
  assert.ok(issues.some((issue) => issue.message.includes('Volume')));
  assert.ok(issues.some((issue) => issue.message.includes('Start time')));
  assert.ok(issues.some((issue) => issue.message.includes('Fade durations')));
});

test('requires scene-scoped tracks to be sound effects assigned to an existing scene', () => {
  const issues = validateProjectAudioTracksForExport([
    { ...validTrack, sceneId: 'missing-scene' },
  ], [scene]);
  assert.ok(issues.some((issue) => issue.message.includes('Only sound effects')));
  assert.ok(issues.some((issue) => issue.message.includes('scene no longer exists')));
});

test('rejects invalid ducking configuration and duplicate track identifiers', () => {
  const issues = validateProjectAudioTracksForExport([
    { ...validTrack, duckingLevel: 0.95 },
    { ...validTrack, kind: 'sound_effect', duckingEnabled: true, duckingLevel: 0.25 },
  ], [scene]);
  assert.ok(issues.some((issue) => issue.message.includes('duplicate identifier')));
  assert.ok(issues.some((issue) => issue.message.includes('music tracks only')));
  assert.ok(issues.some((issue) => issue.message.includes('between 0.1 and 0.8')));
});
