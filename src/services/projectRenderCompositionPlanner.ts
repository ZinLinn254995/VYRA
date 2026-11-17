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
  transitions: Array<{ key: string; effect: string; durationSeconds: number; scope: 'scene' | 'video' | 'unresolved'; boundarySeconds: number | null; fromId?: string; toId?: string }>;
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
  // Scene media forms the base composition. Explicit video tracks are overlays and
  // must always stack above every scene-local video clip, regardless of track IDs.
  const sceneLayerCount = Math.max(1, ...manifest.sceneInstances.map((instance) => {
    if (!Array.isArray(instance.videoClips)) return 1;
    const sceneDuration = manifest.scenes.find((scene) => scene.id === instance.sceneId)?.duration ?? 0;
    return instance.videoClips.filter((clip) => {
      const source = clipSource(clip);
      if (!source || clip.mediaKind === 'audio') return false;
      const mime = source.mimeType?.toLowerCase() ?? '';
      if (mime.startsWith('audio/') || (mime && !mime.startsWith('video/') && !mime.startsWith('image/'))) return false;
      const range = sourceRange(clip);
      return range.durationSeconds > 0 && Math.min(sceneDuration, clip.start + range.durationSeconds) > clip.start;
    }).length;
  }));
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
      let sceneLayer = 0;
      instance.videoClips.forEach((clip) => {
        const source = clipSource(clip);
        if (!source) return;
        const mime = source.mimeType?.toLowerCase() ?? '';
        if (clip.mediaKind === 'audio' || mime.startsWith('audio/')) return;
        if (mime && !mime.startsWith('video/') && !mime.startsWith('image/')) return;
        const kind = mime.startsWith('image/') || clip.mediaKind === 'image' ? 'image' : 'video';
        const range = sourceRange(clip);
        const start = startSeconds + clip.start;
        const end = Math.min(endSeconds, start + range.durationSeconds);
        if (end <= start) return;
        visuals.push({
          kind, trackId: 'scene:' + scene.id, clipId: clip.id, layer: sceneLayer++,
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

  manifest.videoTracks.forEach((track, trackIndex) => {
    const layer = sceneLayerCount + trackIndex;
    if (track.visible === false) return;
    track.clips.forEach((clip) => {
      const source = clipSource(clip);
      if (!source) return;
      const mime = source.mimeType?.toLowerCase() ?? '';
      if (clip.mediaKind === 'audio' || mime.startsWith('audio/')) return;
      if (mime && !mime.startsWith('video/') && !mime.startsWith('image/')) return;
      const kind = clip.mediaKind === 'image' || mime.startsWith('image/') ? 'image' : 'video';
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

  // Modern JS sort is stable: equal-time/equal-layer clips retain manifest insertion
  // order, which is the user's explicit track order. Sorting by track ID would
  // silently change visual/audio/text stacking when IDs are renamed.
  visuals.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer);
  audio.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer);
  text.sort((a, b) => a.startSeconds - b.startSeconds || a.layer - b.layer);
  // The Editor stores transitions under stable adjacent-item keys:
  // sceneId:nextSceneId for scene boundaries, or clipId:nextClipId for
  // adjacent visual clips. Resolve those keys against the pinned manifest
  // instead of leaving renderers to guess where an effect belongs.
  const resolvedTransitions = new Map<string, ProjectRenderCompositionPlan['transitions'][number]>();
  let transitionBoundary = 0;
  for (let index = 0; index < scenes.length - 1; index += 1) {
    const current = scenes[index];
    const next = scenes[index + 1];
    const key = current.sceneId + ':' + next.sceneId;
    const value = manifest.transitions[key];
    transitionBoundary = current.endSeconds;
    if (value) resolvedTransitions.set(key, {
      key, effect: value.effect, durationSeconds: value.duration,
      scope: 'scene', boundarySeconds: transitionBoundary,
      fromId: current.sceneId, toId: next.sceneId,
    });
  }
  // The Editor's shared Scenes row combines Director scene-instance clips
  // with every uploaded visual clip. Build the same adjacency sequence here so
  // clip-to-clip transitions remain resolvable when either side is Director media.
  const sceneStartById = new Map(scenes.map((scene) => [scene.sceneId, scene.startSeconds]));
  const directorTransitionClips = manifest.scenes.flatMap((scene) => {
    const instance = instanceByScene.get(scene.id);
    if (!instance) return [];
    const sceneStart = sceneStartById.get(scene.id) ?? 0;
    // Match the Editor: explicit Director videoClips replace the instance's
    // top-level source in the shared Scenes row; do not count both.
    const instanceClips = (instance.videoClips ?? []).filter((clip) => {
      const mime = clip.assetMimeType?.toLowerCase() ?? '';
      return Boolean(clip.projectFileId || (clip.assetId && clip.assetVersionId)) &&
        (mime.startsWith('video/') || mime.startsWith('image/'));
    });
    if (instanceClips.length) {
      return instanceClips.map((clip) => ({
        id: clip.id,
        start: sceneStart + clip.start,
        duration: clip.duration,
      }));
    }
    const mime = instance.assetMimeType?.toLowerCase() ?? '';
    if (!(instance.projectFileId || (instance.assetId && instance.assetVersionId)) ||
        !(mime.startsWith('video/') || mime.startsWith('image/'))) return [];
    const sourceIn = instance.videoSourceIn ?? 0;
    const sourceOut = instance.videoSourceOut ?? scene.duration;
    return [{
      id: instance.id,
      start: sceneStart,
      duration: Math.max(0.1, Math.min(scene.duration, sourceOut - sourceIn)),
    }];
  });
  const orderedVideoClips = [
    ...directorTransitionClips,
    ...manifest.videoTracks.flatMap((track) => track.clips.map((clip) => clip)),
  ]
    // Match mergeTimelineVideoRows, then the Editor's stable start/duration sort.
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    .sort((a, b) => a.start - b.start || a.duration - b.duration);
  for (let index = 0; index < orderedVideoClips.length - 1; index += 1) {
    const current = orderedVideoClips[index];
    const next = orderedVideoClips[index + 1];
    const boundarySeconds = current.start + current.duration;
    const matchingScene = scenes.find((scene, sceneIndex) =>
      sceneIndex < scenes.length - 1 && scenes[sceneIndex + 1].startSeconds === boundarySeconds);
    const key = matchingScene
      ? matchingScene.sceneId + ':' + scenes[scenes.indexOf(matchingScene) + 1].sceneId
      : current.id + ':' + next.id;
    const value = manifest.transitions[key];
    if (value && !resolvedTransitions.has(key)) resolvedTransitions.set(key, {
      key, effect: value.effect, durationSeconds: value.duration,
      scope: 'video', boundarySeconds, fromId: current.id, toId: next.id,
    });
  }
  const transitions = Object.entries(manifest.transitions).map(([key, value]) =>
    resolvedTransitions.get(key) ?? {
      key, effect: value.effect, durationSeconds: value.duration,
      scope: 'unresolved' as const, boundarySeconds: null,
    },
  ).sort((a, b) => a.key.localeCompare(b.key));
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
