import { getProjectRenderSourceKey, type ProjectRenderClip, type ProjectRenderManifest, type ProjectRenderSource } from './projectRenderManifest';

export type ProjectRenderVisualLayer = {
  kind: 'video' | 'image';
  trackId: string;
  clipId: string;
  layer: number;
  startSeconds: number;
  endSeconds: number;
  sourceInSeconds: number;
  sourceOutSeconds: number;
  source: ProjectRenderSource;
  sceneId?: string;
};

export type ProjectRenderAudioLayer = {
  trackId: string;
  clipId: string;
  layer: number;
  startSeconds: number;
  endSeconds: number;
  sourceInSeconds: number;
  sourceOutSeconds: number;
  gain: number;
  source: ProjectRenderSource;
};

export type ProjectRenderTextLayer = {
  trackId: string;
  clipId: string;
  layer: number;
  startSeconds: number;
  endSeconds: number;
  content: string;
};

export type ProjectRenderCompositionPlan = {
  schema: 'vyra.project-render-composition-plan';
  version: 1;
  projectId: string;
  durationSeconds: number;
  scenes: Array<{ sceneId: string; startSeconds: number; endSeconds: number; sourceInSeconds: number; sourceOutSeconds: number }>;
  visuals: ProjectRenderVisualLayer[];
  audio: ProjectRenderAudioLayer[];
  text: ProjectRenderTextLayer[];
  transitions: Array<{ key: string; effect: string; durationSeconds: number }>;
  requiredSources: ProjectRenderSource[];
};

function clipSource(clip: ProjectRenderClip): ProjectRenderSource | null {
  if (clip.isPlaceholder) return null;
  if (clip.source) return clip.source;
  if (clip.projectFileId) return { kind: 'project-file', projectFileId: clip.projectFileId, ...(clip.assetMimeType ? { mimeType: clip.assetMimeType } : {}) };
  if (clip.assetId && clip.assetVersionId) return { kind: 'legacy-asset', assetId: clip.assetId, assetVersionId: clip.assetVersionId, ...(clip.assetMimeType ? { mimeType: clip.assetMimeType } : {}) };
  return null;
}

function sourceRange(clip: ProjectRenderClip): { sourceInSeconds: number; sourceOutSeconds: number; durationSeconds: number } {
  const sourceInSeconds = clip.sourceIn ?? 0;
  const requestedDuration = clip.sourceOut === undefined ? clip.duration : clip.sourceOut - sourceInSeconds;
  const durationSeconds = Math.min(clip.duration, requestedDuration);
  return { sourceInSeconds, sourceOutSeconds: sourceInSeconds + durationSeconds, durationSeconds };
}

/** Build a renderer-neutral, immutable composition schedule from a validated manifest. */
export function buildProjectRenderCompositionPlan(manifest: ProjectRenderManifest): ProjectRenderCompositionPlan {
  if (!manifest || manifest.schema !== 'vyra.project-render-manifest' || manifest.version !== 1) {
    throw new Error('A supported immutable Project render manifest is required.');
  }

  const scenes: ProjectRenderCompositionPlan['scenes'] = [];
  const visuals: ProjectRenderVisualLayer[] = [];
  const audio: ProjectRenderAudioLayer[] = [];
  const text: ProjectRenderTextLayer[] = [];
  const requiredSources = new Map<string, ProjectRenderSource>();
  const registerSource = (source: ProjectRenderSource) => requiredSources.set(getProjectRenderSourceKey(source), source);
  const instanceByScene = new Map<string, ProjectRenderManifest['sceneInstances'][number]>();
  for (const instance of manifest.sceneInstances) {
    if (!instanceByScene.has(instance.sceneId)) instanceByScene.set(instance.sceneId, instance);
  }

  let sceneCursor = 0;
  for (const scene of manifest.scenes) {
    const startSeconds = sceneCursor;
    const endSeconds = startSeconds + scene.duration;
    sceneCursor = endSeconds;
    const range = manifest.sceneRanges[scene.id] ?? { sourceIn: 0, sourceOut: scene.duration };
    scenes.push({ sceneId: scene.id, startSeconds, endSeconds, sourceInSeconds: range.sourceIn, sourceOutSeconds: range.sourceOut });
    const instance = instanceByScene.get(scene.id);
    if (!instance) continue;

    if (Array.isArray(instance.videoClips)) {
      instance.videoClips.forEach((clip, layer) => {
        const source = clipSource(clip);
        if (!source) return;
        const kind = source.mimeType?.toLowerCase().startsWith('image/') || clip.mediaKind === 'image' ? 'image' : 'video';
        const range = sourceRange(clip);
        const start = startSeconds + clip.start;
        const end = Math.min(endSeconds, start + range.durationSeconds);
        if (end <= start) return;
        visuals.push({
          kind, trackId: 'scene:' + scene.id, clipId: clip.id, layer,
          startSeconds: start, endSeconds: end,
          sourceInSeconds: range.sourceInSeconds,
          sourceOutSeconds: range.sourceInSeconds + (end - start),
          source, sceneId: scene.id,
        });
        registerSource(source);
      });
    } else if (instance.projectFileId || (instance.assetId && instance.assetVersionId)) {
      const source: ProjectRenderSource = instance.projectFileId
        ? { kind: 'project-file', projectFileId: instance.projectFileId, ...(instance.assetMimeType ? { mimeType: instance.assetMimeType } : {}) }
        : { kind: 'legacy-asset', assetId: instance.assetId!, assetVersionId: instance.assetVersionId!, ...(instance.assetMimeType ? { mimeType: instance.assetMimeType } : {}) };
      if (source.mimeType?.toLowerCase().startsWith('video/')) {
        const sourceIn = instance.videoSourceIn ?? 0;
        const sourceOut = instance.videoSourceOut ?? sourceIn + scene.duration;
        const duration = Math.min(scene.duration, sourceOut - sourceIn);
        if (duration > 0) {
          visuals.push({ kind: 'video', trackId: 'scene:' + scene.id, clipId: instance.id, layer: 0,
            startSeconds, endSeconds: startSeconds + duration, sourceInSeconds: sourceIn,
            sourceOutSeconds: sourceIn + duration, source, sceneId: scene.id });
          registerSource(source);
        }
      }
    }
  }

  manifest.videoTracks.forEach((track, layer) => {
    if (track.visible === false) return;
    track.clips.forEach((clip) => {
      const source = clipSource(clip);
      if (!source) return;
      const mime = source.mimeType?.toLowerCase() ?? '';
      const kind = clip.mediaKind === 'image' || mime.startsWith('image/') ? 'image' : 'video';
      if (kind === 'video' && mime && !mime.startsWith('video/')) return;
      const range = sourceRange(clip);
      const endSeconds = clip.start + range.durationSeconds;
      if (endSeconds <= clip.start) return;
      visuals.push({ kind, trackId: track.id, clipId: clip.id, layer,
        startSeconds: clip.start, endSeconds, sourceInSeconds: range.sourceInSeconds,
        sourceOutSeconds: range.sourceOutSeconds, source });
      registerSource(source);
    });
  });

  manifest.audioTracks.forEach((track, layer) => {
    if (track.muted) return;
    const gain = track.volume === undefined ? 1 : Math.max(0, Math.min(1, track.volume));
    if (!Number.isFinite(gain) || gain <= 0) return;
    track.clips.forEach((clip) => {
      const source = clipSource(clip);
      if (!source) return;
      const range = sourceRange(clip);
      if (range.durationSeconds <= 0) return;
      audio.push({ trackId: track.id, clipId: clip.id, layer,
        startSeconds: clip.start, endSeconds: clip.start + range.durationSeconds,
        sourceInSeconds: range.sourceInSeconds, sourceOutSeconds: range.sourceOutSeconds, gain, source });
      registerSource(source);
    });
  });

  manifest.textTracks.forEach((track, layer) => {
    if (track.visible === false) return;
    track.clips.forEach((clip) => {
      if (typeof clip.content !== 'string' || !clip.content.trim()) return;
      text.push({ trackId: track.id, clipId: clip.id, layer,
        startSeconds: clip.start, endSeconds: clip.start + clip.duration, content: clip.content });
    });
  });

  visuals.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer || a.trackId.localeCompare(b.trackId));
  audio.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer || a.trackId.localeCompare(b.trackId));
  text.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer || a.trackId.localeCompare(b.trackId));
  const transitions = Object.entries(manifest.transitions).map(([key, value]) => ({
    key, effect: value.effect, durationSeconds: value.duration,
  })).sort((a, b) => a.key.localeCompare(b.key));
  const durationSeconds = Math.max(sceneCursor, ...visuals.map((item) => item.endSeconds), ...audio.map((item) => item.endSeconds), ...text.map((item) => item.endSeconds), 0);
  const plan = { schema: 'vyra.project-render-composition-plan' as const, version: 1 as const,
    projectId: manifest.projectId, durationSeconds, scenes, visuals, audio, text, transitions,
    requiredSources: [...requiredSources.values()] };
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value as Record<string, unknown>).forEach(freeze);
    }
  };
  freeze(plan);
  return plan;
}
