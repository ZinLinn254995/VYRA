import type { MasterTimelineAudioPlaybackItem } from './masterTimelineAudioPlayback';

export type AudioPlaybackRuntime = {
  context: AudioContext;
  fetchAudio: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  resolveAssetUrl: (assetId: string, assetVersionId: string, signal: AbortSignal) => Promise<string>;
};

export type AudioPlaybackHandle = {
  stop: () => void;
  ready: Promise<void>;
  finished: Promise<void>;
  /** AudioContext time at which timeline time zero for this plan is scheduled. */
  readonly startTime: number | null;
};

/**
 * Preloads every immutable Asset Version before scheduling any source. This
 * prevents network/decode latency from shifting clips relative to one another.
 * The handle is returned immediately, so stop() aborts network fetches and prevents late scheduling.
 * Signed URLs exist only in memory and are resolved just-in-time.
 */
export function startMasterTimelineAudioPlayback(
  plan: MasterTimelineAudioPlaybackItem[],
  runtime: AudioPlaybackRuntime,
): AudioPlaybackHandle {
  const sources = new Set<AudioBufferSourceNode>();
  const gains = new Set<GainNode>();
  const abortController = new AbortController();
  let stopped = false;
  let scheduledStartTime: number | null = null;
  let resolveFinished!: () => void;
  let rejectReady!: (error: unknown) => void;
  let resolveReady!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    abortController.abort();
    for (const source of sources) {
      try { source.stop(); } catch { /* source may not have started */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    sources.clear();
    for (const gain of gains) {
      try { gain.disconnect(); } catch { /* already disconnected */ }
    }
    gains.clear();
    resolveFinished();
  };

  const prepare = async () => {
    try {
      const prepared = await Promise.all(plan.map(async (item) => {
        if (stopped) return null;
        const url = await runtime.resolveAssetUrl(item.assetId, item.assetVersionId, abortController.signal);
        if (stopped) return null;
        const bytes = await runtime.fetchAudio(url, abortController.signal);
        if (stopped) return null;
        const buffer = await runtime.context.decodeAudioData(bytes.slice(0));
        if (stopped) return null;

        const offset = Math.max(0, item.sourceOffsetSeconds);
        if (offset >= buffer.duration) return null;
        const duration = Math.min(item.durationSeconds, buffer.duration - offset);
        if (!Number.isFinite(duration) || duration <= 0) return null;
        return { item, buffer, offset, duration };
      }));

      if (stopped) {
        resolveReady();
        return;
      }

      // All clips share one scheduling origin, so slow network requests cannot
      // cause later tracks to drift out of sync with earlier tracks.
      scheduledStartTime = runtime.context.currentTime + 0.05;
      for (const entry of prepared) {
        if (!entry || stopped) continue;
        const source = runtime.context.createBufferSource();
        const gain = runtime.context.createGain();
        source.buffer = entry.buffer;
        gain.gain.value = Math.max(0, Math.min(1, entry.item.gain));
        source.connect(gain);
        gain.connect(runtime.context.destination);
        sources.add(source);
        gains.add(gain);
        source.onended = () => {
          sources.delete(source);
          gains.delete(gain);
          try { source.disconnect(); } catch { /* already disconnected */ }
          try { gain.disconnect(); } catch { /* already disconnected */ }
          if (!sources.size) resolveFinished();
        };
        source.start(
          scheduledStartTime + Math.max(0, entry.item.delaySeconds),
          entry.offset,
          entry.duration,
        );
      }
      resolveReady();
      if (!sources.size) resolveFinished();
    } catch (error) {
      if (stopped) { resolveReady(); return; }
      stop();
      rejectReady(error);
    }
  };

  void prepare();
  return {
    stop,
    ready,
    finished,
    get startTime() { return scheduledStartTime; },
  };
}
