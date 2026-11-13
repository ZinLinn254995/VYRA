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
  assetMimeType?: string | null;
  videoSourceIn?: number | null;
  videoSourceOut?: number | null;
};

export type MasterTimelineVideoPlaybackItem = {
  instanceId: string;
  sceneId: string;
  assetId: string;
  assetVersionId: string;
  timelineStartSeconds: number;
  timelineEndSeconds: number;
  delaySeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
};

/**
 * Build a deterministic sequential video-source schedule for Scene instances.
 * Scene timing follows MasterTimelineEditor: ordered Scene durations are
 * contiguous and transitions do not shorten/overlap those durations.
 * Only exact immutable, typed Video Asset references are eligible for playback.
 */
export function buildMasterTimelineVideoPlaybackPlan(
  scenes: MasterTimelineVideoScene[],
  instances: MasterTimelineVideoInstance[] | undefined,
  playheadTime: number,
): MasterTimelineVideoPlaybackItem[] {
  if (!Array.isArray(scenes) || !Number.isFinite(playheadTime) || playheadTime < 0) return [];

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const instanceByScene = new Map<string, MasterTimelineVideoInstance>();
  for (const instance of instances || []) {
    if (instance && typeof instance.sceneId === 'string' && !instanceByScene.has(instance.sceneId)) {
      instanceByScene.set(instance.sceneId, instance);
    }
  }

  const orderedScenes = instances?.length
    ? [
        ...instances.map((instance) => sceneById.get(instance.sceneId)).filter((scene): scene is MasterTimelineVideoScene => Boolean(scene)),
        ...scenes.filter((scene) => !(instances || []).some((instance) => instance.sceneId === scene.id)),
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

    if (!instance || typeof instance.assetId !== 'string' || !instance.assetId ||
        typeof instance.assetVersionId !== 'string' || !instance.assetVersionId ||
        typeof instance.assetMimeType !== 'string' || !/^video\//i.test(instance.assetMimeType) ||
        !Number.isFinite(instance.videoSourceIn ?? instance.sourceIn) || (instance.videoSourceIn ?? instance.sourceIn) < 0 ||
        !Number.isFinite(instance.videoSourceOut ?? instance.sourceOut) || (instance.videoSourceOut ?? instance.sourceOut) <= (instance.videoSourceIn ?? instance.sourceIn) ||
        playheadTime >= sceneEnd) continue;

    const elapsed = Math.max(0, playheadTime - sceneStart);
    const sourceIn = instance.videoSourceIn ?? instance.sourceIn;
    const sourceOut = instance.videoSourceOut ?? instance.sourceOut;
    const sourceOffsetSeconds = sourceIn + elapsed;
    const sourceDuration = sourceOut - sourceIn;
    const available = Math.min(scene.duration, sourceDuration) - elapsed;
    if (available <= 0 || sourceOffsetSeconds >= sourceOut) continue;

    plan.push({
      instanceId: instance.id,
      sceneId: scene.id,
      assetId: instance.assetId,
      assetVersionId: instance.assetVersionId,
      timelineStartSeconds: sceneStart,
      timelineEndSeconds: sceneEnd,
      delaySeconds: Math.max(0, sceneStart - playheadTime),
      sourceOffsetSeconds,
      durationSeconds: Math.min(available, sourceOut - sourceOffsetSeconds),
    });
  }
  return plan;
}
