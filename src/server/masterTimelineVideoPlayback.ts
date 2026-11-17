export type MasterTimelineVideoScene = {
  id: string;
  duration: number;
};

export type MasterTimelineVideoInstance = {
  id: string;
  sceneId: string;
  sourceIn: number;
  sourceOut: number;
  assetId?: string | null;
  assetVersionId?: string | null;
  projectFileId?: string | null;
  assetMimeType?: string | null;
  videoSourceIn?: number | null;
  videoSourceOut?: number | null;
  videoClips?: Array<{
    id: string;
    start: number;
    duration: number;
    sourceIn?: number | null;
    sourceOut?: number | null;
    assetId?: string | null;
    assetVersionId?: string | null;
    projectFileId?: string | null;
    assetMimeType?: string | null;
  }>;
};

export type MasterTimelineVideoPlaybackItem = {
  instanceId: string;
  sceneId: string;
  assetId?: string;
  assetVersionId?: string;
  projectFileId?: string;
  timelineStartSeconds: number;
  timelineEndSeconds: number;
  delaySeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  playbackStartSeconds: number;
  playbackEndSeconds: number;
};

/**
 * Build a deterministic sequential video-source schedule for Scene instances.
 * Scene timing follows MasterTimelineEditor: ordered Scene durations are
 * contiguous and transitions do not shorten/overlap those durations.
 * Only typed Project Files or exact immutable Video Asset references are eligible for playback.
 */
export function buildMasterTimelineVideoPlaybackPlan(
  scenes: MasterTimelineVideoScene[],
  instances: MasterTimelineVideoInstance[] | undefined,
  playheadTime: number,
  videoTracks: Array<{ id: string; clips: Array<{ id: string; start: number; duration: number; sourceIn?: number; sourceOut?: number; assetId?: string; assetVersionId?: string; projectFileId?: string; assetMimeType?: string; mediaKind?: string }> }> = [],
): MasterTimelineVideoPlaybackItem[] {
  if (!Array.isArray(scenes) || !Number.isFinite(playheadTime) || playheadTime < 0) return [];

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const instanceByScene = new Map<string, MasterTimelineVideoInstance>();
  for (const instance of instances || []) {
    if (instance && typeof instance.sceneId === 'string' && !instanceByScene.has(instance.sceneId)) {
      instanceByScene.set(instance.sceneId, instance);
    }
  }

  const orderedSceneIds: string[] = [];
  for (const instance of instances || []) {
    if (instance && sceneById.has(instance.sceneId) && !orderedSceneIds.includes(instance.sceneId)) {
      orderedSceneIds.push(instance.sceneId);
    }
  }
  const orderedScenes = orderedSceneIds.length
    ? [
        ...orderedSceneIds.map((sceneId) => sceneById.get(sceneId) as MasterTimelineVideoScene),
        ...scenes.filter((scene) => !orderedSceneIds.includes(scene.id)),
      ]
    : scenes;

  const plan: MasterTimelineVideoPlaybackItem[] = [];
  let timelineCursor = 0;
  for (const scene of orderedScenes) {
    if (!scene || typeof scene.id !== 'string' || !Number.isFinite(scene.duration) || scene.duration <= 0) continue;
    const instance = instanceByScene.get(scene.id);
    const sceneStart = timelineCursor;
    const sceneEnd = sceneStart + scene.duration;
    timelineCursor = sceneEnd;

    if (!instance || playheadTime >= sceneEnd) continue;

    if (Array.isArray(instance.videoClips)) {
      const orderedClips = [...instance.videoClips].sort((a, b) => a.start - b.start);
      for (const clip of orderedClips) {
        if (!clip || typeof clip.id !== 'string' || !clip.id ||
            !Number.isFinite(clip.start) || clip.start < 0 ||
            !Number.isFinite(clip.duration) || clip.duration <= 0 ||
            !(typeof clip.projectFileId === 'string' && clip.projectFileId) &&
            !(typeof clip.assetId === 'string' && clip.assetId && typeof clip.assetVersionId === 'string' && clip.assetVersionId) ||
            typeof clip.assetMimeType !== 'string' || !/^video\//i.test(clip.assetMimeType)) continue;
        const clipStart = sceneStart + clip.start;
        const clipEnd = Math.min(sceneEnd, clipStart + clip.duration);
        if (clipEnd <= clipStart || playheadTime >= clipEnd) continue;
        const sourceIn = Number.isFinite(clip.sourceIn) && (clip.sourceIn as number) >= 0 ? clip.sourceIn as number : 0;
        const sourceOut = Number.isFinite(clip.sourceOut) && (clip.sourceOut as number) > sourceIn
          ? clip.sourceOut as number
          : sourceIn + clip.duration;
        const elapsed = Math.max(0, playheadTime - clipStart);
        const sourceOffsetSeconds = sourceIn + elapsed;
        const playbackStartSeconds = Math.max(clipStart, playheadTime);
        const available = Math.min(clipEnd - playbackStartSeconds, sourceOut - sourceOffsetSeconds);
        if (available <= 0 || sourceOffsetSeconds >= sourceOut) continue;
        plan.push({
          instanceId: instance.id + ':' + clip.id,
          sceneId: scene.id,
          ...(clip.projectFileId ? { projectFileId: clip.projectFileId } : { assetId: clip.assetId!, assetVersionId: clip.assetVersionId! }),
          timelineStartSeconds: clipStart,
          timelineEndSeconds: clipEnd,
          delaySeconds: Math.max(0, clipStart - playheadTime),
          sourceOffsetSeconds,
          durationSeconds: available,
          playbackStartSeconds,
          playbackEndSeconds: playbackStartSeconds + available,
        });
      }
      continue;
    }

    const hasProjectFileSource = typeof instance.projectFileId === 'string' && instance.projectFileId.length > 0;
    const hasLegacyAssetSource = typeof instance.assetId === 'string' && instance.assetId.length > 0 &&
      typeof instance.assetVersionId === 'string' && instance.assetVersionId.length > 0;
    if ((!hasProjectFileSource && !hasLegacyAssetSource) ||
        typeof instance.assetMimeType !== 'string' || !/^video\//i.test(instance.assetMimeType) ||
        !Number.isFinite(instance.videoSourceIn) || (instance.videoSourceIn as number) < 0 ||
        !Number.isFinite(instance.videoSourceOut) || (instance.videoSourceOut as number) <= (instance.videoSourceIn as number)) continue;

    const elapsed = Math.max(0, playheadTime - sceneStart);
    const sourceIn = instance.videoSourceIn as number;
    const sourceOut = instance.videoSourceOut as number;
    const sourceOffsetSeconds = sourceIn + elapsed;
    const sourceDuration = sourceOut - sourceIn;
    const available = Math.min(scene.duration, sourceDuration) - elapsed;
    if (available <= 0 || sourceOffsetSeconds >= sourceOut) continue;

    plan.push({
      instanceId: instance.id,
      sceneId: scene.id,
      ...(hasProjectFileSource ? { projectFileId: instance.projectFileId! } : { assetId: instance.assetId!, assetVersionId: instance.assetVersionId! }),
      timelineStartSeconds: sceneStart,
      timelineEndSeconds: sceneEnd,
      delaySeconds: Math.max(0, sceneStart - playheadTime),
      sourceOffsetSeconds,
      durationSeconds: Math.min(available, sourceOut - sourceOffsetSeconds),
      playbackStartSeconds: Math.max(sceneStart, playheadTime),
      playbackEndSeconds: Math.max(sceneStart, playheadTime) + Math.min(available, sourceOut - sourceOffsetSeconds),
    });
  }

  // Directly uploaded media lives on Video rows rather than Scene instances.
  // Include only immutable Video Asset Versions; Image clips are rendered by
  // the visual preview surface and never sent to the video decoder.
  for (const track of videoTracks || []) {
    for (const clip of track.clips || []) {
      if (!clip || !clip.id || !Number.isFinite(clip.start) || clip.start < 0 ||
          !Number.isFinite(clip.duration) || clip.duration <= 0 ||
          !(typeof (clip as any).projectFileId === 'string' && (clip as any).projectFileId) &&
          !(typeof clip.assetId === 'string' && clip.assetId && typeof clip.assetVersionId === 'string' && clip.assetVersionId) ||
          typeof clip.assetMimeType !== 'string' || !/^video\//i.test(clip.assetMimeType)) continue;
      const clipEnd = clip.start + clip.duration;
      if (playheadTime >= clipEnd) continue;
      const sourceIn = Number.isFinite(clip.sourceIn) && (clip.sourceIn as number) >= 0 ? clip.sourceIn as number : 0;
      const sourceOut = Number.isFinite(clip.sourceOut) && (clip.sourceOut as number) > sourceIn
        ? clip.sourceOut as number : sourceIn + clip.duration;
      const sourceOffsetSeconds = sourceIn + Math.max(0, playheadTime - clip.start);
      const playbackStartSeconds = Math.max(clip.start, playheadTime);
      const available = Math.min(clipEnd - playbackStartSeconds, sourceOut - sourceOffsetSeconds);
      if (available <= 0 || sourceOffsetSeconds >= sourceOut) continue;
      plan.push({
        instanceId: 'timeline-track:' + track.id + ':' + clip.id,
        sceneId: 'timeline-track:' + track.id,
        ...((clip as any).projectFileId ? { projectFileId: (clip as any).projectFileId } : { assetId: clip.assetId!, assetVersionId: clip.assetVersionId! }),
        timelineStartSeconds: clip.start,
        timelineEndSeconds: clipEnd,
        delaySeconds: Math.max(0, clip.start - playheadTime),
        sourceOffsetSeconds,
        durationSeconds: available,
        playbackStartSeconds,
        playbackEndSeconds: playbackStartSeconds + available,
      });
    }
  }
  plan.sort((a, b) => a.playbackStartSeconds - b.playbackStartSeconds ||
    Number(!a.sceneId.startsWith('timeline-track:')) - Number(!b.sceneId.startsWith('timeline-track:')));
  return plan;
}
