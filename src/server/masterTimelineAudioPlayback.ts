export type MasterTimelineAudioPlaybackTrack = {
  id: string;
  muted?: boolean;
  volume?: number;
  clips: Array<{
    id: string;
    start: number;
    duration: number;
    sourceIn?: number;
    assetId?: string;
    assetVersionId?: string;
  }>;
};

export type MasterTimelineAudioPlaybackInput = {
  audioTracks: MasterTimelineAudioPlaybackTrack[];
};

export type MasterTimelineAudioPlaybackItem = {
  trackId: string;
  clipId: string;
  assetId: string;
  assetVersionId: string;
  delaySeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  gain: number;
};

/**
 * Build a deterministic multi-track playback schedule at a requested playhead.
 *
 * The returned values are relative to the playhead: delaySeconds is how long
 * until a future clip starts, sourceOffsetSeconds is the exact offset into the
 * immutable source Asset, and durationSeconds is the remaining clip duration.
 * Muted/zero-volume tracks and non-Asset placeholder clips are excluded.
 */
export function buildMasterTimelineAudioPlaybackPlan(
  timeline: MasterTimelineAudioPlaybackInput,
  playheadTime: number,
): MasterTimelineAudioPlaybackItem[] {
  if (!timeline || !Array.isArray(timeline.audioTracks) ||
      !Number.isFinite(playheadTime) || playheadTime < 0) return [];

  const plan: MasterTimelineAudioPlaybackItem[] = [];
  for (const track of timeline.audioTracks) {
    if (!track || !Array.isArray(track.clips) || track.muted === true) continue;
    const rawVolume = track.volume === undefined ? 1 : track.volume;
    if (!Number.isFinite(rawVolume)) continue;
    const gain = Math.max(0, Math.min(1, rawVolume));
    if (gain <= 0) continue;

    for (const clip of track.clips) {
      if (!clip || typeof clip.id !== 'string' || !clip.id ||
          typeof clip.assetId !== 'string' || !clip.assetId ||
          typeof clip.assetVersionId !== 'string' || !clip.assetVersionId ||
          !Number.isFinite(clip.start) || clip.start < 0 ||
          !Number.isFinite(clip.duration) || clip.duration <= 0) continue;

      const end = clip.start + clip.duration;
      if (!Number.isFinite(end) || end <= playheadTime) continue;
      const elapsed = Math.max(0, playheadTime - clip.start);
      const sourceIn = clip.sourceIn === undefined ? 0 : clip.sourceIn;
      if (!Number.isFinite(sourceIn) || sourceIn < 0) continue;

      plan.push({
        trackId: track.id,
        clipId: clip.id,
        assetId: clip.assetId,
        assetVersionId: clip.assetVersionId,
        delaySeconds: Math.max(0, clip.start - playheadTime),
        sourceOffsetSeconds: sourceIn + elapsed,
        durationSeconds: end - Math.max(playheadTime, clip.start),
        gain,
      });
    }
  }
  return plan;
}
