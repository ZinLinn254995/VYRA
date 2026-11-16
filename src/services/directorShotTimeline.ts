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
    const replaced = existingDirectorClips.map((clip) => {
      const candidate = incoming.find((item) => item.shotId === clip.shotId);
      return candidate ? { ...candidate, start: clip.start } : clip;
    });
    const appendAt = existingDirectorClips.reduce(
      (end, clip) => Math.max(end, clip.start + clip.duration), 0,
    );
    const missing = incoming
      .filter((item) => !existingDirectorClips.some((clip) => clip.shotId === item.shotId))
      .map((clip) => ({ ...clip, start: appendAt }));
    clips = [...replaced, ...missing].sort((a, b) => a.start - b.start);
  }

  const duration = clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  return { clips, duration };
}
