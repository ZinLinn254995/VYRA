import test from 'node:test';
import assert from 'node:assert/strict';
import { startMasterTimelineAudioPlayback } from '../src/server/masterTimelineAudioPlaybackEngine.ts';

function createRuntime() {
  const starts: Array<{ when: number; offset: number; duration: number }> = [];
  const urls: string[] = [];
  const sources: Array<{ onended: (() => void) | null; stop: () => void; disconnect: () => void }> = [];
  const context = {
    currentTime: 50,
    destination: {},
    decodeAudioData: async () => ({ duration: 30 }),
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: () => undefined,
        disconnect: () => undefined,
        start: (when: number, offset: number, duration: number) => starts.push({ when, offset, duration }),
        stop: () => source.onended?.(),
      };
      sources.push(source);
      return source;
    },
    createGain: () => ({
      gain: { value: 1 },
      connect: () => undefined,
      disconnect: () => undefined,
    }),
  } as unknown as AudioContext;
  return {
    starts, urls, sources,
    runtime: {
      context,
      fetchAudio: async () => new ArrayBuffer(8),
      resolveAssetUrl: async (assetId: string, versionId: string) => {
        urls.push(`${assetId}/${versionId}`);
        return 'https://private-signed-url.invalid/audio';
      },
    },
  };
}

test('resolves immutable asset versions and schedules offsets/delays against one AudioContext origin', async () => {
  const mock = createRuntime();
  const handle = startMasterTimelineAudioPlayback([{
    trackId: 'track', clipId: 'clip', assetId: 'asset', assetVersionId: 'version',
    delaySeconds: 2, sourceOffsetSeconds: 4, durationSeconds: 6, gain: 0.5,
  }], mock.runtime);
  await handle.ready;
  assert.deepEqual(mock.urls, ['asset/version']);
  assert.deepEqual(mock.starts, [{ when: 52.05, offset: 4, duration: 6 }]);
  assert.equal(handle.startTime, 50.05);
  handle.stop();
});

test('clamps playback to actual decoded source duration', async () => {
  const mock = createRuntime();
  const handle = startMasterTimelineAudioPlayback([{
    trackId: 'track', clipId: 'clip', assetId: 'asset', assetVersionId: 'version',
    delaySeconds: 0, sourceOffsetSeconds: 28, durationSeconds: 8, gain: 1,
  }], mock.runtime);
  await handle.ready;
  assert.deepEqual(mock.starts, [{ when: 50.05, offset: 28, duration: 2 }]);
  handle.stop();
});

test('stop during pending asset resolution prevents source creation', async () => {
  const mock = createRuntime();
  let release!: (url: string) => void;
  let capturedSignal: AbortSignal | undefined;
  mock.runtime.resolveAssetUrl = async (_assetId: string, _versionId: string, signal?: AbortSignal) => {
    capturedSignal = signal;
    return new Promise<string>((resolve) => { release = resolve; });
  };
  const handle = startMasterTimelineAudioPlayback([{
    trackId: 'track', clipId: 'clip', assetId: 'asset', assetVersionId: 'version',
    delaySeconds: 0, sourceOffsetSeconds: 0, durationSeconds: 5, gain: 1,
  }], mock.runtime);
  handle.stop();
  assert.equal(capturedSignal?.aborted, true);
  release('https://private-signed-url.invalid/audio');
  await handle.ready;
  assert.equal(mock.sources.length, 0);
});

test('stop cancels scheduled audio sources', async () => {
  const mock = createRuntime();
  const handle = startMasterTimelineAudioPlayback([{
    trackId: 'track', clipId: 'clip', assetId: 'asset', assetVersionId: 'version',
    delaySeconds: 0, sourceOffsetSeconds: 0, durationSeconds: 5, gain: 1,
  }], mock.runtime);
  await handle.ready;
  handle.stop();
  assert.equal(mock.sources.length, 1);
});
