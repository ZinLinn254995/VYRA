export type MasterTimelineTextTrack = {
  id: string;
  visible?: boolean;
  clips: Array<{
    id: string;
    content?: string;
    start: number;
    duration: number;
  }>;
};

export type MasterTimelineTextOverlay = {
  trackId: string;
  clipId: string;
  content: string;
  start: number;
  end: number;
  layer: number;
};

/**
 * Resolve visible Text clips active at an absolute Master Timeline time.
 * Results preserve track stacking order and never mutate source timeline data.
 */
export function buildMasterTimelineTextOverlay(
  tracks: MasterTimelineTextTrack[],
  timelineTime: number,
): MasterTimelineTextOverlay[] {
  if (!Array.isArray(tracks) || !Number.isFinite(timelineTime) || timelineTime < 0) return [];
  const overlays: MasterTimelineTextOverlay[] = [];
  tracks.forEach((track, layer) => {
    if (!track || track.visible === false || !Array.isArray(track.clips)) return;
    for (const clip of track.clips) {
      if (!clip || typeof clip.id !== 'string' || typeof clip.content !== 'string' ||
          !clip.content.trim() || !Number.isFinite(clip.start) || clip.start < 0 ||
          !Number.isFinite(clip.duration) || clip.duration <= 0) continue;
      const end = clip.start + clip.duration;
      if (timelineTime < clip.start || timelineTime >= end) continue;
      overlays.push({
        trackId: track.id,
        clipId: clip.id,
        content: clip.content,
        start: clip.start,
        end,
        layer,
      });
    }
  });
  return overlays;
}
