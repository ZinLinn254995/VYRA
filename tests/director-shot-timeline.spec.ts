import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectorShotTimelineClips, type DirectorShotTimelineClip } from '../src/services/directorShotTimeline';

const shot = (shotIndex: number, durationSeconds: number, assetId = 'asset-' + shotIndex) => ({
  shotId: 'shot-' + shotIndex,
  shotIndex,
  durationSeconds,
  assetId,
  assetVersionId: 'version-' + assetId,
  mimeType: 'video/mp4',
});

const existing = (shotIndex: number, start: number, duration: number, assetId = 'old-' + shotIndex): DirectorShotTimelineClip => ({
  id: 'director-shot-' + shotIndex + '-' + assetId,
  name: 'Shot ' + (shotIndex + 1),
  start,
  duration,
  sourceIn: 0,
  sourceOut: duration,
  assetId,
  assetVersionId: 'version-' + assetId,
  assetMimeType: 'video/mp4',
  source: 'ai_director_shot',
  shotId: 'shot-' + shotIndex,
});

test('verified Director sequence handoff creates ordered, contiguous timeline clips with exact Asset versions', () => {
  const result = buildDirectorShotTimelineClips([], [
    shot(1, 4, 'new-1'),
    shot(0, 3, 'new-0'),
    shot(2, 5, 'new-2'),
  ]);

  assert.deepEqual(result.clips.map((clip) => clip.shotId), ['shot-0', 'shot-1', 'shot-2']);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 3, 7]);
  assert.deepEqual(result.clips.map((clip) => clip.assetId), ['new-0', 'new-1', 'new-2']);
  assert.deepEqual(result.clips.map((clip) => clip.assetVersionId), ['version-new-0', 'version-new-1', 'version-new-2']);
  assert.ok(result.clips.every((clip) => clip.source === 'ai_director_shot'));
  assert.equal(result.duration, 12);
});

test('verified targeted repair replaces only its Shot and preserves every other clip position and Asset reference', () => {
  const before = [
    existing(0, 0, 3),
    existing(1, 3, 4),
    existing(2, 7, 5),
  ];
  const result = buildDirectorShotTimelineClips(before, [shot(1, 6, 'repaired-1')], true);

  assert.deepEqual(result.clips.map((clip) => clip.shotId), ['shot-0', 'shot-1', 'shot-2']);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 3, 7]);
  assert.deepEqual(result.clips.map((clip) => clip.assetId), ['old-0', 'repaired-1', 'old-2']);
  assert.deepEqual(result.clips.map((clip) => clip.assetVersionId), ['version-old-0', 'version-repaired-1', 'version-old-2']);
  assert.equal(result.clips[1].duration, 6);
  assert.equal(result.duration, 12);
});

test('repair handoff does not discard a previously verified downstream Shot when the replacement is shorter', () => {
  const before = [existing(0, 0, 4), existing(1, 4, 5), existing(2, 9, 6)];
  const result = buildDirectorShotTimelineClips(before, [shot(1, 2, 'short-repair')], true);

  assert.deepEqual(result.clips.map((clip) => clip.assetId), ['old-0', 'short-repair', 'old-2']);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 4, 9]);
  assert.equal(result.duration, 15);
});

test('Project Editor wires the verified handoff into both Scene Timeline and Master Timeline persistence', async () => {
  const { readFileSync } = await import('node:fs');
  const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
  assert.ok(workspace.includes('buildDirectorShotTimelineClips(existingDirectorClips, sequence.shots, sequence.replaceShot)'));
  assert.ok(workspace.includes("source: 'ai_director_shot'"));
  assert.ok(workspace.includes('const videoClips = generatedClips.map'));
  assert.ok(workspace.includes('videoClips,'));
  assert.ok(workspace.includes('sceneInstances: nextSceneInstances'));
  assert.ok(workspace.includes('setActiveStoryboard((current)'));
  assert.ok(workspace.includes('void persistStoryboard(saved)'));
  assert.ok(workspace.includes('onShotSequenceReady={handleShotSequenceReady}'));
});
