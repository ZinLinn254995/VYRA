export type ProjectRenderSource =
  | { kind: 'project-file'; projectFileId: string; mimeType?: string }
  | { kind: 'legacy-asset'; assetId: string; assetVersionId: string; mimeType?: string };

export type ProjectRenderClip = {
  id: string;
  name?: string;
  start: number;
  duration: number;
  sourceIn?: number;
  sourceOut?: number;
  source?: ProjectRenderSource;
  projectFileId?: string;
  assetId?: string;
  assetVersionId?: string;
  assetMimeType?: string;
  content?: string;
  mediaKind?: 'video' | 'image' | 'audio';
  isPlaceholder?: boolean;
};

export type ProjectRenderTrack = {
  id: string;
  name?: string;
  muted?: boolean;
  volume?: number;
  visible?: boolean;
  clips: ProjectRenderClip[];
};

export type ProjectRenderSceneInstance = {
  id: string;
  sceneId: string;
  sourceIn: number;
  sourceOut: number;
  sceneProjectId?: string;
  renderRevisionId?: string | null;
  projectFileId?: string;
  assetId?: string;
  assetVersionId?: string;
  assetMimeType?: string;
  videoSourceIn?: number;
  videoSourceOut?: number;
  videoClips?: ProjectRenderClip[];
};

export type ProjectRenderManifest = {
  schema: 'vyra.project-render-manifest';
  version: 1;
  projectId: string;
  createdAt: string;
  scenes: Array<{ id: string; title: string; duration: number }>;
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  sceneInstances: ProjectRenderSceneInstance[];
  videoTracks: ProjectRenderTrack[];
  audioTracks: ProjectRenderTrack[];
  textTracks: ProjectRenderTrack[];
  transitions: Record<string, { effect: string; duration: number }>;
};

export type ProjectRenderManifestInput = {
  projectId: string;
  scenes: Array<{ id: string; title: string; duration: number }>;
  timeline: {
    sceneRanges?: Record<string, { sourceIn: number; sourceOut: number }>;
    sceneInstances?: ProjectRenderSceneInstance[];
    videoTracks?: ProjectRenderTrack[];
    audioTracks?: ProjectRenderTrack[];
    textTracks?: ProjectRenderTrack[];
    transitions?: Record<string, { effect: string; duration: number }>;
  };
  createdAt?: string;
};

export type ProjectRenderManifestIssue = {
  code: 'missing-source' | 'invalid-timing' | 'invalid-track' | 'invalid-scene';
  path: string;
  message: string;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function snapshotSource(clip: ProjectRenderClip, path: string, issues: ProjectRenderManifestIssue[]): ProjectRenderSource | undefined {
  if (clip.isPlaceholder) return undefined;
  if (typeof clip.projectFileId === 'string' && clip.projectFileId.trim()) {
    return { kind: 'project-file', projectFileId: clip.projectFileId, ...(clip.assetMimeType ? { mimeType: clip.assetMimeType } : {}) };
  }
  if (typeof clip.assetId === 'string' && clip.assetId.trim() &&
      typeof clip.assetVersionId === 'string' && clip.assetVersionId.trim()) {
    return { kind: 'legacy-asset', assetId: clip.assetId, assetVersionId: clip.assetVersionId, ...(clip.assetMimeType ? { mimeType: clip.assetMimeType } : {}) };
  }
  issues.push({ code: 'missing-source', path, message: 'A renderable clip must reference a Project File ID or an immutable legacy Asset/version pair.' });
  return undefined;
}

function snapshotClip(clip: ProjectRenderClip, path: string, issues: ProjectRenderManifestIssue[], requiresMediaSource = true): ProjectRenderClip {
  if (!clip || typeof clip.id !== 'string' || !clip.id.trim()) {
    issues.push({ code: 'invalid-track', path, message: 'Every timeline clip must have a stable clip ID.' });
    return { id: '', start: 0, duration: 0 };
  }
  if (!Number.isFinite(clip.start) || clip.start < 0 || !Number.isFinite(clip.duration) || clip.duration <= 0 ||
      (clip.sourceIn !== undefined && (!Number.isFinite(clip.sourceIn) || clip.sourceIn < 0)) ||
      (clip.sourceOut !== undefined && (!Number.isFinite(clip.sourceOut) || clip.sourceOut <= (clip.sourceIn ?? 0)))) {
    issues.push({ code: 'invalid-timing', path, message: 'Clip placement, duration, and source trim must be finite, non-negative, and ordered.' });
  }
  if ((clip.name !== undefined && typeof clip.name !== 'string') ||
      (clip.content !== undefined && typeof clip.content !== 'string') ||
      (clip.mediaKind !== undefined && !['video', 'image', 'audio'].includes(clip.mediaKind)) ||
      (clip.isPlaceholder !== undefined && typeof clip.isPlaceholder !== 'boolean')) {
    issues.push({ code: 'invalid-track', path, message: 'Clip metadata must use valid text, media-kind, and placeholder values.' });
  }
  const source = requiresMediaSource ? snapshotSource(clip, path, issues) : undefined;
  return {
    id: clip.id,
    ...(clip.name !== undefined ? { name: clip.name } : {}),
    start: clip.start,
    duration: clip.duration,
    ...(clip.sourceIn !== undefined ? { sourceIn: clip.sourceIn } : {}),
    ...(clip.sourceOut !== undefined ? { sourceOut: clip.sourceOut } : {}),
    ...(source ? { source } : {}),
    ...(clip.content !== undefined ? { content: clip.content } : {}),
    ...(clip.mediaKind ? { mediaKind: clip.mediaKind } : {}),
    ...(clip.isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

function snapshotTracks(tracks: ProjectRenderTrack[] | undefined, label: string, issues: ProjectRenderManifestIssue[], requiresMediaSource = true): ProjectRenderTrack[] {
  if (!Array.isArray(tracks)) return [];
  return tracks.map((track, trackIndex) => {
    const path = label + '[' + trackIndex + ']';
    if (!track || typeof track.id !== 'string' || !track.id.trim() || !Array.isArray(track.clips)) {
      issues.push({ code: 'invalid-track', path, message: 'A timeline track must have a stable ID and a clips array.' });
      return { id: '', clips: [] };
    }
    if ((track.name !== undefined && typeof track.name !== 'string') ||
        (track.muted !== undefined && typeof track.muted !== 'boolean') ||
        (track.visible !== undefined && typeof track.visible !== 'boolean') ||
        (track.volume !== undefined && (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1))) {
      issues.push({ code: 'invalid-track', path, message: 'Track name, visibility, mute state, and normalized volume must be valid.' });
    }
    return {
      id: track.id,
      ...(track.name !== undefined ? { name: track.name } : {}),
      ...(track.muted !== undefined ? { muted: track.muted } : {}),
      ...(track.volume !== undefined ? { volume: track.volume } : {}),
      ...(track.visible !== undefined ? { visible: track.visible } : {}),
      clips: track.clips.map((clip, clipIndex) => snapshotClip(clip, path + '.clips[' + clipIndex + ']', issues, requiresMediaSource)),
    };
  });
}

/** Capture a detached, serializable timeline snapshot. Signed URLs and editor-only state are never copied. */
export function createProjectRenderManifest(input: ProjectRenderManifestInput): ProjectRenderManifest {
  if (!input || typeof input.projectId !== 'string' || !input.projectId.trim()) throw new Error('A Project ID is required to create a render manifest.');
  if (!input.timeline || !Array.isArray(input.scenes)) throw new Error('A timeline and scene list are required to create a render manifest.');
  const issues: ProjectRenderManifestIssue[] = [];
  const scenes = input.scenes.map((scene, index) => {
    if (!scene || typeof scene.id !== 'string' || !scene.id.trim() || typeof scene.title !== 'string' || !Number.isFinite(scene.duration) || scene.duration <= 0) {
      issues.push({ code: 'invalid-scene', path: 'scenes[' + index + ']', message: 'Each scene must have a stable ID, text title, and positive finite duration.' });
    }
    return { id: scene.id, title: scene.title, duration: scene.duration };
  });
  const sceneInstances = (input.timeline.sceneInstances ?? []).map((instance, index) => {
    if (!instance || typeof instance.id !== 'string' || !instance.id.trim() || typeof instance.sceneId !== 'string' || !instance.sceneId.trim() ||
        !Number.isFinite(instance.sourceIn) || !Number.isFinite(instance.sourceOut) || instance.sourceIn < 0 || instance.sourceOut <= instance.sourceIn ||
        (instance.videoSourceIn !== undefined && (!Number.isFinite(instance.videoSourceIn) || instance.videoSourceIn < 0)) ||
        (instance.videoSourceOut !== undefined && (!Number.isFinite(instance.videoSourceOut) || instance.videoSourceOut <= (instance.videoSourceIn ?? 0)))) {
      issues.push({ code: 'invalid-scene', path: 'sceneInstances[' + index + ']', message: 'Scene instances must have stable IDs and valid scene/video source ranges.' });
    }
    return {
      id: instance.id,
      sceneId: instance.sceneId,
      sourceIn: instance.sourceIn,
      sourceOut: instance.sourceOut,
      ...(instance.sceneProjectId ? { sceneProjectId: instance.sceneProjectId } : {}),
      ...(instance.renderRevisionId !== undefined ? { renderRevisionId: instance.renderRevisionId } : {}),
      ...(instance.projectFileId ? { projectFileId: instance.projectFileId } : {}),
      ...(instance.assetId ? { assetId: instance.assetId } : {}),
      ...(instance.assetVersionId ? { assetVersionId: instance.assetVersionId } : {}),
      ...(instance.assetMimeType ? { assetMimeType: instance.assetMimeType } : {}),
      ...(instance.videoSourceIn !== undefined ? { videoSourceIn: instance.videoSourceIn } : {}),
      ...(instance.videoSourceOut !== undefined ? { videoSourceOut: instance.videoSourceOut } : {}),
      ...(instance.videoClips ? { videoClips: instance.videoClips.map((clip, clipIndex) => snapshotClip(clip, 'sceneInstances[' + index + '].videoClips[' + clipIndex + ']', issues)) } : {}),
    };
  });
  const videoTracks = snapshotTracks(input.timeline.videoTracks, 'videoTracks', issues);
  const audioTracks = snapshotTracks(input.timeline.audioTracks, 'audioTracks', issues);
  const textTracks = snapshotTracks(input.timeline.textTracks, 'textTracks', issues, false);
  for (const [sceneId, range] of Object.entries(input.timeline.sceneRanges ?? {})) {
    if (!sceneId || !Number.isFinite(range?.sourceIn) || !Number.isFinite(range?.sourceOut) || range.sourceIn < 0 || range.sourceOut <= range.sourceIn) {
      issues.push({ code: 'invalid-scene', path: 'sceneRanges.' + sceneId, message: 'Scene source ranges must be finite and ordered.' });
    }
  }
  for (const [key, transition] of Object.entries(input.timeline.transitions ?? {})) {
    if (!key || !transition || typeof transition.effect !== 'string' || !transition.effect || !Number.isFinite(transition.duration) || transition.duration < 0) {
      issues.push({ code: 'invalid-timing', path: 'transitions.' + key, message: 'Transitions must have an effect and a finite non-negative duration.' });
    }
  }
  if (issues.length) {
    const error = new Error('The timeline cannot be snapshotted for rendering: ' + issues.map((issue) => issue.path + ' (' + issue.code + ')').join(', '));
    Object.assign(error, { issues });
    throw error;
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('A valid manifest creation timestamp is required.');
  const sceneRanges = Object.fromEntries(Object.entries(input.timeline.sceneRanges ?? {}).map(([id, range]) => [id, { sourceIn: range.sourceIn, sourceOut: range.sourceOut }]));
  const transitions = Object.fromEntries(Object.entries(input.timeline.transitions ?? {}).map(([key, value]) => [key, { effect: value.effect, duration: value.duration }]));
  return deepFreeze({
    schema: 'vyra.project-render-manifest',
    version: 1,
    projectId: input.projectId,
    createdAt,
    scenes,
    sceneRanges,
    sceneInstances,
    videoTracks,
    audioTracks,
    textTracks,
    transitions,
  });
}

/** Return the stable source identity only; callers must resolve bytes through Project-scoped storage. */
export function getProjectRenderSourceKey(source: ProjectRenderSource): string {
  return source.kind === 'project-file'
    ? 'project-file:' + source.projectFileId
    : 'legacy-asset:' + source.assetId + ':' + source.assetVersionId;
}
