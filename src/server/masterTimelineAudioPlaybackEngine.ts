import type { MasterTimelineAudioPlaybackItem } from './masterTimelineAudioPlayback';

export type AudioPlaybackRuntime = {
  context: AudioContext;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  resolveAssetUrl: (assetId: string, assetVersionId: string) => Promise<string>;
};

export type AudioPlaybackHandle = {
  stop: () => void;
  finished: Promise<void>;
};

/**
 * Plays a previously validated multi-track schedule through Web Audio.
 * URLs are resolved just-in-time and never persisted in timeline data.
 * Call stop() to cancel pending fetch/decode work and all scheduled sources.
 */
export async function startMasterTimelineAudioPlayback(
  plan: MasterTimelineAudioPlaybackItem[],
  runtime: AudioPlaybackRuntime,
): Promise<AudioPlaybackHandle> {
  const sources = new Set<AudioBufferSourceNode>();
  const gains = new Set<GainNode>();
  let stopped = false;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const source of sources) {
      try { source.stop(); } catch { /* already ended */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    sources.clear();
    for (const gain of gains) {
      try { gain.disconnect(); } catch { /* already disconnected */ }
    }
    gains.clear();
    resolveFinished();
  };

  try {
    const jobs = plan.map(async (item) => {
      if (stopped) return;
      const url = await runtime.resolveAssetUrl(item.assetId, item.assetVersionId);
      if (stopped) return;
      const bytes = await runtime.fetchAudio(url);
      if (stopped) return;
      const buffer = await runtime.context.decodeAudioData(bytes.slice(0));
      if (stopped) return;

      const offset = Math.max(0, item.sourceOffsetSeconds);
      if (offset >= buffer.duration) return;
      const duration = Math.min(item.durationSeconds, buffer.duration - offset);
      if (!Number.isFinite(duration) || duration <= 0) return;

      const source = runtime.context.createBufferSource();
      const gain = runtime.context.createGain();
      source.buffer = buffer;
      gain.gain.value = Math.max(0, Math.min(1, item.gain));
      source.connect(gain);
      gain.connect(runtime.context.destination);
      sources.add(source);
      gains.add(gain);
      source.onended = () => {
        sources.delete(source);
        gains.delete(gain);
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
        if (!sources.size && !jobsPending) resolveFinished();
      };
      source.start(runtime.context.currentTime + Math.max(0, item.delaySeconds), offset, duration);
    });

    let jobsPending = true;
    await Promise.all(jobs);
    jobsPending = false;
    if (stopped || !sources.size) resolveFinished();
  } catch (error) {
    stop();
    throw error;
  }

  return { stop, finished };
}
