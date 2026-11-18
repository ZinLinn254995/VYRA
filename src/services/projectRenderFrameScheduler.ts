import type {
  ProjectRenderAudioLayer,
  ProjectRenderCompositionPlan,
  ProjectRenderTextLayer,
  ProjectRenderVisualLayer,
} from './projectRenderCompositionPlanner';

export type ProjectRenderFrameState = {
  timeSeconds: number;
  visuals: Array<ProjectRenderVisualLayer & { sourceTimeSeconds: number }>;
  audio: Array<ProjectRenderAudioLayer & { sourceTimeSeconds: number }>;
  text: ProjectRenderTextLayer[];
};

function isActive(start: number, end: number, time: number): boolean {
  return time >= start && time < end;
}

/**
 * Resolve the immutable composition plan into the exact layers active at one
 * output timestamp. The renderer can call this for every frame without
 * reinterpreting Editor state or changing the pinned plan.
 */
export function getProjectRenderFrameState(
  plan: ProjectRenderCompositionPlan,
  timeSeconds: number,
): ProjectRenderFrameState {
  if (!plan || plan.schema !== 'vyra.project-render-composition-plan' || plan.version !== 1) {
    throw new Error('A supported Project render composition plan is required.');
  }
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > plan.durationSeconds) {
    throw new Error('The render frame timestamp is outside the composition duration.');
  }

  const visuals = plan.visuals
    .filter((layer) => isActive(layer.startSeconds, layer.endSeconds, timeSeconds))
    .map((layer) => ({
      ...layer,
      sourceTimeSeconds: layer.sourceInSeconds + (timeSeconds - layer.startSeconds),
    }))
    .sort((a, b) => a.layer - b.layer || a.trackId.localeCompare(b.trackId));

  const audio = plan.audio
    .filter((layer) => isActive(layer.startSeconds, layer.endSeconds, timeSeconds))
    .map((layer) => ({
      ...layer,
      sourceTimeSeconds: layer.sourceInSeconds + (timeSeconds - layer.startSeconds),
    }))
    .sort((a, b) => a.layer - b.layer || a.trackId.localeCompare(b.trackId));

  const text = plan.text
    .filter((layer) => isActive(layer.startSeconds, layer.endSeconds, timeSeconds))
    .sort((a, b) => a.layer - b.layer || a.trackId.localeCompare(b.trackId));

  return { timeSeconds, visuals, audio, text };
}
