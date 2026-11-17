import type { MasterTimelineData, TimelineClip } from '../components/workspace/MasterTimelineEditor';
import type { ProjectRenderManifestInput, ProjectRenderClip, ProjectRenderTrack, ProjectRenderSceneInstance } from './projectRenderManifest';

type EditorScene = { id: string; title: string; duration: number };

function toRenderClip(clip: TimelineClip): ProjectRenderClip {
  return {
    id: clip.id,
    name: clip.name,
    start: clip.start,
    duration: clip.duration,
    ...(clip.sourceIn !== undefined ? { sourceIn: clip.sourceIn } : {}),
    ...(clip.sourceOut !== undefined ? { sourceOut: clip.sourceOut } : {}),
    ...(clip.content !== undefined ? { content: clip.content } : {}),
    ...(clip.projectFileId ? { projectFileId: clip.projectFileId } : {}),
    ...(clip.assetId ? { assetId: clip.assetId } : {}),
    ...(clip.assetVersionId ? { assetVersionId: clip.assetVersionId } : {}),
    ...(clip.assetMimeType ? { assetMimeType: clip.assetMimeType } : {}),
    ...(clip.mediaKind ? { mediaKind: clip.mediaKind } : {}),
    ...(clip.isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

function toRenderTrack(track: MasterTimelineData['audioTracks'][number]): ProjectRenderTrack {
  return {
    id: track.id,
    name: track.name,
    ...(track.muted !== undefined ? { muted: track.muted } : {}),
    ...(track.volume !== undefined ? { volume: track.volume } : {}),
    ...(track.visible !== undefined ? { visible: track.visible } : {}),
    clips: track.clips.map(toRenderClip),
  };
}

/**
 * Whitelist the serializable fields from the live Editor model. In-memory URLs,
 * waveform caches, upload recovery flags, and collapsed UI state never enter
 * the render manifest.
 */
export function createProjectRenderManifestInputFromEditor(input: {
  projectId: string;
  scenes: EditorScene[];
  timeline: MasterTimelineData;
}): ProjectRenderManifestInput {
  const { projectId, scenes, timeline } = input;
  if (!projectId.trim()) throw new Error('A Project ID is required to snapshot the Editor timeline.');
  const sceneInstances: ProjectRenderSceneInstance[] = (timeline.sceneInstances ?? []).map((instance) => ({
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
    ...(instance.videoClips ? { videoClips: instance.videoClips.map(toRenderClip) } : {}),
  }));

  return {
    projectId,
    scenes: scenes.map((scene) => ({ id: scene.id, title: scene.title, duration: scene.duration })),
    timeline: {
      sceneRanges: timeline.sceneRanges ?? {},
      sceneInstances,
      videoTracks: (timeline.videoTracks ?? []).map(toRenderTrack),
      audioTracks: timeline.audioTracks.map(toRenderTrack),
      textTracks: timeline.textTracks.map(toRenderTrack),
      transitions: timeline.transitions ?? {},
    },
  };
}
