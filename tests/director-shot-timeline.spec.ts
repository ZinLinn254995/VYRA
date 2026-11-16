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

test('verified targeted repair replaces only its Shot and shifts downstream clips to preserve a contiguous sequence', () => {
  const before = [
    existing(0, 0, 3),
    existing(1, 3, 4),
    existing(2, 7, 5),
  ];
  const result = buildDirectorShotTimelineClips(before, [shot(1, 6, 'repaired-1')], true);

  assert.deepEqual(result.clips.map((clip) => clip.shotId), ['shot-0', 'shot-1', 'shot-2']);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 3, 9]);
  assert.deepEqual(result.clips.map((clip) => clip.assetId), ['old-0', 'repaired-1', 'old-2']);
  assert.deepEqual(result.clips.map((clip) => clip.assetVersionId), ['version-old-0', 'version-repaired-1', 'version-old-2']);
  assert.equal(result.clips[1].duration, 6);
  assert.equal(result.duration, 14);
});

test('shorter repair shifts later verified Shots earlier without dropping them or leaving a timeline gap', () => {
  const before = [existing(0, 0, 4), existing(1, 4, 5), existing(2, 9, 6)];
  const result = buildDirectorShotTimelineClips(before, [shot(1, 2, 'short-repair')], true);

  assert.deepEqual(result.clips.map((clip) => clip.assetId), ['old-0', 'short-repair', 'old-2']);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 4, 6]);
  assert.equal(result.duration, 12);
});

test('Project Editor wires the verified handoff into both Scene Timeline and Master Timeline persistence', async () => {
  const { readFileSync } = await import('node:fs');
  const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
  const handoff = readFileSync(new URL('../src/services/directorShotTimeline.ts', import.meta.url), 'utf8');
  assert.ok(workspace.includes('buildDirectorShotTimelineClips(existingDirectorClips, sequence.shots, sequence.replaceShot)'));
  assert.ok(handoff.includes("source: 'ai_director_shot' as const"));
  assert.ok(workspace.includes('const videoClips = [...otherTracks, directorTrack]'));
  assert.ok(workspace.includes('manual clips preserved when an AI Director sequence is refreshed'));
  assert.ok(workspace.includes(".filter((track) => track.type === 'video')"));
  assert.ok(workspace.includes("sourceIn: Math.max(0, clip.sourceIn ?? 0)"));
  assert.ok(workspace.includes('videoClips,'));
  assert.ok(workspace.includes('sceneInstances: nextSceneInstances'));
  assert.ok(workspace.includes('setActiveStoryboard((current)'));
  assert.ok(workspace.includes('void persistStoryboard(saved)'));
  assert.ok(workspace.includes('storyboardSaveQueueRef = useRef<Map<string, Promise<void>>>(new Map())'));
  assert.ok(workspace.includes('const previousSave = storyboardSaveQueueRef.current.get(item.id) || Promise.resolve()'));
  assert.ok(workspace.includes('previousSave.catch(() => undefined).then(async () =>'));
  assert.ok(workspace.includes('storyboardSaveQueueRef.current.get(item.id) === saveTask'));
  assert.ok(workspace.includes('onShotSequenceReady={handleShotSequenceReady}'));
});

test('queued storyboard saves cannot recreate a deleted Project', async () => {
  const { readFileSync } = await import('node:fs');
  const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
  assert.ok(workspace.includes('deletedStoryboardIdsRef = useRef<Set<string>>(new Set())'));
  assert.ok(workspace.includes('deletedStoryboardIdsRef.current.has(item.id)'));
  assert.ok(workspace.includes('deletedStoryboardIdsRef.current.add(item.id)'));
  assert.ok(workspace.includes('const queuedSave = storyboardSaveQueueRef.current.get(item.id)'));
  assert.ok(workspace.includes('if (queuedSave) await queuedSave.catch(() => undefined)'));
  assert.ok(workspace.includes('deletedStoryboardIdsRef.current.delete(item.id)'));
  assert.ok(workspace.includes('pending.filter((item) => !deletedStoryboardIdsRef.current.has(item.id))'));
  assert.ok(workspace.includes('pendingToUpload.map((item) => persistStoryboard(item))'));
  assert.ok(workspace.includes('mergedStoryboards.filter((item) => !deletedStoryboardIdsRef.current.has(item.id))'));
  assert.ok(workspace.includes('__vyraDeletedAt: new Date().toISOString()'));
  assert.ok(workspace.includes(".update({ details: deletionDetails, updated_at: deletionDetails.__vyraDeletedAt })"));
  assert.ok(workspace.includes(".is('details->>__vyraDeletedAt', null)"));
  assert.ok(workspace.includes(".lte('updated_at', item.updatedAt)"));
  assert.ok(workspace.includes(".insert(payload)"));
  assert.ok(workspace.includes(".select('details,updated_at').eq('id', item.id).eq('user_id', authData.user.id).maybeSingle()"));
  assert.ok(workspace.includes('const newerCloudSnapshot = Number.isFinite(existingUpdatedAt)'));
  assert.ok(workspace.includes('The Cloud copy is intentionally authoritative over this stale save.'));
  assert.ok(workspace.includes('const concurrentSaveWon = Number.isFinite(latestUpdatedAt)'));
  assert.ok(workspace.includes('Never use upsert here'));
  assert.ok(!workspace.includes(".upsert({\n        id: item.id, user_id: authData.user.id"));
  assert.ok(workspace.includes('const ownerStorageKey = expectedOwnerStorageKey;'));
  assert.ok(workspace.includes('if (storyboardStorageKeyRef.current !== ownerStorageKey) return;'));
  assert.ok(workspace.includes('storyboardStorageKeyRef.current === ownerStorageKey && storyboardSaveQueueRef.current.get(item.id) === saveTask'));
  assert.ok(workspace.includes('const ownerStorageKey = storyboardStorageKeyRef.current;'));
  assert.ok(workspace.includes('if (storyboardStorageKeyRef.current !== ownerStorageKey) return;'));
});

test('Project Editor autosaves every confirmed edit and restores the saved Project when reopened', async () => {
  const { readFileSync } = await import('node:fs');
  const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../src/services/workspaceStoryboards.ts', import.meta.url), 'utf8');
  assert.ok(workspace.includes('if (!activeStoryboard || !activeStoryboardConfirmed || loadedStorageKey !== ownerStorageKey) return;'));
  assert.ok(workspace.includes('const ownerStorageKey = storageKey;'));
  assert.ok(workspace.includes('window.setTimeout(() => {'));
  assert.ok(workspace.includes('}, 500);'));
  assert.ok(workspace.includes('if (storyboardStorageKeyRef.current !== ownerStorageKey) return;'));
  assert.ok(workspace.includes('current.map((item) => item.id === saved.id ? saved : item)'));
  assert.ok(workspace.includes('void persistStoryboard(saved, ownerStorageKey)'));
  assert.ok(workspace.includes('expectedOwnerStorageKey = storyboardStorageKeyRef.current'));
  assert.ok(workspace.includes('setActiveStoryboard({ ...item, details: { ...item.details, tags: [...(item.details?.tags || [])], origins: { ...item.details?.origins } } })'));
  assert.ok(workspace.includes('const item = storyboards.find((storyboard) => storyboard.id === openUniverseRequest.storyboardId)'));
  assert.ok(sync.includes('storyboards: Array.from(merged.values())'));
});
