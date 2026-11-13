import type { MasterTimelineVideoPlaybackItem } from './masterTimelineVideoPlayback';

export type MasterTimelineVideoElement = {
  currentTime: number;
  paused: boolean;
  readyState: number;
  src: string;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
  addEventListener: (type: string, listener: EventListener, options?: unknown) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

export type MasterTimelineVideoRuntime = {
  video: MasterTimelineVideoElement;
  resolveAssetUrl: (assetId: string, assetVersionId: string, signal: AbortSignal) => Promise<string>;
  onError?: (error: Error) => void;
};

export type MasterTimelineVideoPlaybackHandle = {
  sync: (timelineTime: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  readonly activeSceneId: string | null;
};

const DRIFT_CORRECTION_SECONDS = 0.35;

/**
 * Drive a single HTMLVideoElement from the shared Master Timeline clock.
 * Scene switches are gap-aware. Video loading never advances or resets the
 * AudioContext clock; late sources join at the correct source offset.
 */
export function startMasterTimelineVideoPlayback(
  plan: MasterTimelineVideoPlaybackItem[],
  runtime: MasterTimelineVideoRuntime,
): MasterTimelineVideoPlaybackHandle {
  const { video } = runtime;
  let stopped = false;
  let paused = false;
  let activeKey: string | null = null;
  let activeScene: string | null = null;
  let activeController: AbortController | null = null;
  let lastTimelineTime = 0;
  let sourceReady = false;
  let loadToken = 0;

  const report = (error: unknown) => {
    if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
    runtime.onError?.(error instanceof Error ? error : new Error('Video playback failed.'));
  };

  const playAtLatestTime = async (token: number, item: MasterTimelineVideoPlaybackItem) => {
    if (stopped || paused || token !== loadToken || activeKey !== item.instanceId || !sourceReady) return;
    const offset = item.sourceOffsetSeconds + Math.max(0, lastTimelineTime - item.playbackStartSeconds);
    if (Math.abs(video.currentTime - offset) > DRIFT_CORRECTION_SECONDS) {
      try { video.currentTime = offset; } catch { /* Metadata may not permit seeking yet. */ }
    }
    if (video.paused) {
      try { await video.play(); } catch (error) { report(error); }
    }
  };

  const loadItem = (item: MasterTimelineVideoPlaybackItem) => {
    activeController?.abort();
    activeController = new AbortController();
    const controller = activeController;
    const token = ++loadToken;
    activeKey = item.instanceId;
    activeScene = item.sceneId;
    sourceReady = false;
    video.pause();
    void runtime.resolveAssetUrl(item.assetId, item.assetVersionId, controller.signal)
      .then((url) => {
        if (stopped || controller.signal.aborted || token !== loadToken) return;
        if (!/^https:\/\//i.test(url)) throw new Error('The private Video playback URL is invalid.');
        video.src = url;
        video.load();
        const onReady: EventListener = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('error', onFailure);
          if (stopped || controller.signal.aborted || token !== loadToken) return;
          sourceReady = true;
          void playAtLatestTime(token, item);
        };
        const onFailure: EventListener = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('error', onFailure);
          if (token === loadToken) report(new Error('A private Video Asset could not be loaded.'));
        };
        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('error', onFailure, { once: true });
        if (video.readyState >= 1) onReady(new Event('loadedmetadata'));
      })
      .catch(report);
  };

  const sync = (timelineTime: number) => {
    if (stopped || !Number.isFinite(timelineTime) || timelineTime < 0) return;
    lastTimelineTime = timelineTime;
    const item = plan.find((candidate) =>
      timelineTime >= candidate.playbackStartSeconds &&
      timelineTime < candidate.playbackEndSeconds,
    );
    if (!item) {
      activeController?.abort();
      activeController = null;
      loadToken += 1;
      activeKey = null;
      activeScene = null;
      sourceReady = false;
      video.pause();
      return;
    }
    if (activeKey !== item.instanceId) {
      loadItem(item);
      return;
    }
    if (sourceReady && !paused) void playAtLatestTime(loadToken, item);
  };

  const pause = () => {
    if (stopped) return;
    paused = true;
    video.pause();
  };

  const resume = () => {
    if (stopped) return;
    paused = false;
    sync(lastTimelineTime);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    loadToken += 1;
    activeController?.abort();
    activeController = null;
    activeKey = null;
    activeScene = null;
    sourceReady = false;
    video.pause();
    video.removeAttribute?.('src');
    video.src = '';
    video.load();
  };

  return {
    sync,
    pause,
    resume,
    stop,
    get activeSceneId() { return activeScene; },
  };
}
