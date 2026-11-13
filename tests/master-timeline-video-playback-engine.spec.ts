import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { startMasterTimelineVideoPlayback, type MasterTimelineVideoElement } from '../src/server/masterTimelineVideoPlaybackEngine.ts';
import type { MasterTimelineVideoPlaybackItem } from '../src/server/masterTimelineVideoPlayback.ts';

function createVideo() {
  const listeners = new Map<string, Set<EventListener>>();
  const calls = { plays: 0, pauses: 0, loads: 0, removed: [] as string[] };
  const video = {
    currentTime: 0,
    paused: true,
    readyState: 0,
    src: '',
    play: async () => { calls.plays += 1; video.paused = false; },
    pause: () => { calls.pauses += 1; video.paused = true; },
    load: () => { calls.loads += 1; },
    removeAttribute: (name: string) => { calls.removed.push(name); },
    addEventListener: (type: string, listener: EventListener) => {
      const bucket = listeners.get(type) || new Set<EventListener>();
      bucket.add(listener); listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: EventListener) => listeners.get(type)?.delete(listener),
  } as unknown as MasterTimelineVideoElement;
  return {
    video, calls,
    dispatch(type: string) {
      for (const listener of [...(listeners.get(type) || [])]) listener(new Event(type));
    },
  };
}

const plan: MasterTimelineVideoPlaybackItem[] = [
  { instanceId: 'instance-a', sceneId: 'scene-a', assetId: 'asset-a', assetVersionId: 'version-a', timelineStartSeconds: 0, timelineEndSeconds: 5, delaySeconds: 0, sourceOffsetSeconds: 2, durationSeconds: 5, playbackStartSeconds: 0, playbackEndSeconds: 5 },
  { instanceId: 'instance-b', sceneId: 'scene-b', assetId: 'asset-b', assetVersionId: 'version-b', timelineStartSeconds: 5, timelineEndSeconds: 10, delaySeconds: 5, sourceOffsetSeconds: 4, durationSeconds: 5, playbackStartSeconds: 5, playbackEndSeconds: 10 },
];

test('loads the exact immutable Video Version and seeks from the shared timeline time', async () => {
  const mock = createVideo();
  const resolved: string[] = [];
  const handle = startMasterTimelineVideoPlayback(plan, {
    video: mock.video,
    resolveAssetUrl: async (assetId, versionId) => {
      resolved.push(assetId + '/' + versionId);
      return 'https://private.example/' + assetId;
    },
  });
  handle.sync(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.src, 'https://private.example/asset-a');
  mock.video.readyState = 1;
  mock.dispatch('loadedmetadata');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.currentTime, 4);
  assert.equal(mock.calls.plays, 1);
  assert.deepEqual(resolved, ['asset-a/version-a']);
  handle.stop();
});

test('switches Scene sources at their timeline boundary and follows source offsets', async () => {
  const mock = createVideo();
  const handle = startMasterTimelineVideoPlayback(plan, {
    video: mock.video,
    resolveAssetUrl: async (assetId) => 'https://private.example/' + assetId,
  });
  handle.sync(0);
  await new Promise((resolve) => setImmediate(resolve));
  mock.video.readyState = 1;
  mock.dispatch('loadedmetadata');
  await new Promise((resolve) => setImmediate(resolve));
  handle.sync(6);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.src, 'https://private.example/asset-b');
  mock.dispatch('loadedmetadata');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.currentTime, 5);
  handle.stop();
});

test('pauses and resumes against the latest shared-clock position', async () => {
  const mock = createVideo();
  const handle = startMasterTimelineVideoPlayback(plan, {
    video: mock.video,
    resolveAssetUrl: async () => 'https://private.example/asset-a',
  });
  handle.sync(0);
  await new Promise((resolve) => setImmediate(resolve));
  mock.video.readyState = 1;
  mock.dispatch('loadedmetadata');
  await new Promise((resolve) => setImmediate(resolve));
  handle.pause();
  assert.equal(mock.video.paused, true);
  handle.sync(1.5);
  handle.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.currentTime, 3.5);
  assert.equal(mock.video.paused, false);
  handle.stop();
});

test('pauses in gaps and aborts stale Video URL resolution', async () => {
  const mock = createVideo();
  let resolveOld!: (url: string) => void;
  const signals: AbortSignal[] = [];
  const handle = startMasterTimelineVideoPlayback(plan, {
    video: mock.video,
    resolveAssetUrl: async (_assetId, _versionId, signal) => {
      if (signal) signals.push(signal);
      if (_assetId === 'asset-a') return new Promise<string>((resolve) => { resolveOld = resolve; });
      return 'https://private.example/asset-b';
    },
  });
  handle.sync(0);
  await new Promise((resolve) => setImmediate(resolve));
  handle.sync(5);
  assert.equal(signals[0].aborted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.video.src, 'https://private.example/asset-b');
  handle.sync(10);
  assert.equal(mock.video.paused, true);
  resolveOld('https://private.example/stale');
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(mock.video.src, 'https://private.example/stale');
  handle.stop();
});

test('Master Timeline shares one AudioContext clock for Audio and Scene Video transport', () => {
  const editor = readFileSync(resolve(process.cwd(), 'src/components/workspace/MasterTimelineEditor.tsx'), 'utf8');
  assert.match(editor, /buildMasterTimelineVideoPlaybackPlan\(orderedScenes, value\?\.sceneInstances, timelineStart\)/);
  assert.match(editor, /startMasterTimelineVideoPlayback\(videoPlan/);
  assert.match(editor, /masterVideoPlaybackHandleRef\.current\?\.sync\(currentTime\)/);
  assert.match(editor, /videoHandle\?\.pause\(\)/);
  assert.match(editor, /videoHandle\?\.resume\(\)/);
  assert.match(editor, /contextStart = handle\?\.startTime \?\? \(context\.currentTime \+ 0\.05\)/);
  assert.match(editor, /createVyralVideoPlaybackUrl\(supabase, \{ assetId, versionId: assetVersionId \}\)/);
  assert.match(editor, /ref=\{masterVideoPreviewRef\}/);
});
