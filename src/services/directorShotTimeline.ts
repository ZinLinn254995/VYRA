export type DirectorShotTimelineClip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  sourceIn?: number;
  sourceOut?: number;
  assetId?: string | null;
  assetVersionId?: string | null;
  assetMimeType?: string | null;
  source?: 'ai_director_shot' | 'manual';
  shotId?: string;
};

export type DirectorShotTimelineInput = {
  shotId: string;
  shotIndex: number;
  durationSeconds: number;
  assetId: string;
  assetVersionId: string;
  mimeType: string;
};

export function buildDirectorShotTimelineClips(
  existingDirectorClips: DirectorShotTimelineClip[],
  shots: DirectorShotTimelineInput[],
  replaceShot = false,
): { clips: DirectorShotTimelineClip[]; duration: number } {
  const incoming = [...shots]
    .sort((a, b) => a.shotIndex - b.shotIndex)
    .map((shot) => ({
      id: 'director-' + shot.shotId + '-' + shot.assetId,
      name: 'Shot ' + (shot.shotIndex + 1),
      start: 0,
      duration: Math.max(0.1, Math.min(3600, Number(shot.durationSeconds) || 0.1)),
      assetId: shot.assetId,
      assetVersionId: shot.assetVersionId,
      assetMimeType: shot.mimeType,
      source: 'ai_director_shot' as const,
      shotId: shot.shotId,
    }));

  let clips: DirectorShotTimelineClip[];
  if (!replaceShot) {
    let cursor = 0;
    clips = incoming.map((clip) => {
      const arranged = { ...clip, start: cursor };
      cursor += arranged.duration;
      return arranged;
    });
  } else {
    const replacementByShot = new Map(incoming.map((clip) => [clip.shotId, clip]));
    const orderedExisting = [...existingDirectorClips].sort((a, b) => a.start - b.start);
    let shiftAfter = 0;
    const replaced = orderedExisting.map((clip) => {
      const shiftedStart = clip.start + shiftAfter;
      const candidate = clip.shotId ? replacementByShot.get(clip.shotId) : undefined;
      if (!candidate) return { ...clip, start: shiftedStart };
      const replacementClip = { ...candidate, start: shiftedStart };
      // Keep the Director sequence contiguous: if a repaired Shot changes
      // duration, move every later Director Shot by the same delta. This
      // prevents overlaps and silent gaps while preserving their order.
      shiftAfter += replacementClip.duration - clip.duration;
      return replacementClip;
    });
    const appendAt = orderedExisting.reduce(
      (end, clip) => Math.max(end, clip.start + clip.duration), 0,
    ) + shiftAfter;
    const missing = incoming
      .filter((item) => !existingDirectorClips.some((clip) => clip.shotId === item.shotId))
      .map((clip) => ({ ...clip, start: appendAt }));
    clips = [...replaced, ...missing].sort((a, b) => a.start - b.start);
  }

  const duration = clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  return { clips, duration };
}
