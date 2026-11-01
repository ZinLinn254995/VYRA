import type { AspectRatio, ContentCategory, Project, ProjectStatus, Scene, VideoFormat, VisualStyle, NarrationStyle, SubtitleStyle } from '../types';

export type CloudProjectRow = {
  id: string;
  local_id: string;
  title: string;
  status: string;
  project_data: unknown;
  created_at: string;
  updated_at: string;
};

const DEFAULT_SCENE_IMAGE = '/src/assets/images/scene_quantum_chip_1792925206672.jpg';
const CATEGORIES: ContentCategory[] = [
  'Tech & AI', 'Science & Future', 'Product Showcase',
  'Business & Finance', 'Documentary', 'Lifestyle & Culture',
];
const RATIOS: AspectRatio[] = ['9:16', '16:9', '1:1'];
const FORMATS: VideoFormat[] = ['short_form', 'long_form'];
const VISUAL_STYLES: VisualStyle[] = ['hyper_realistic', 'cyber_minimal', 'cinematic_3d', 'anime_vector', 'documentary_grain'];
const NARRATION_STYLES: NarrationStyle[] = ['authoritative', 'conversational', 'energetic_tech', 'empathetic_storyteller'];
const SUBTITLE_STYLES: SubtitleStyle[] = ['dynamic_pop', 'minimal_lower', 'karaoke_neon', 'none'];
const STATUSES: ProjectStatus[] = ['draft', 'in_review', 'changes_requested', 'approved', 'ready_to_publish', 'archived'];
const PRODUCTION_STAGES: NonNullable<Project['productionStage']>[] = ['idea', 'script_review', 'visual_review', 'voice_review', 'sample_review', 'full_production', 'final_review', 'publish_ready'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function enumValue<T extends string>(value: unknown, choices: T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

export function restoreCloudProject(row: CloudProjectRow): Project | null {
  if (!row.local_id || !row.title || !isRecord(row.project_data)) return null;
  const data = row.project_data;
  const rawScenes = Array.isArray(data.scenes) ? data.scenes : [];
  const scenes: Scene[] = rawScenes.filter(isRecord).map((scene, index) => ({
    id: textValue(scene.id, `restored-scene-${index + 1}`),
    order: numberValue(scene.order, index + 1),
    narration: textValue(scene.narration),
    visualPrompt: textValue(scene.visualPrompt),
    cameraMovement: textValue(scene.cameraMovement, 'Static camera'),
    duration: numberValue(scene.duration, 8),
    shotType: textValue(scene.shotType) || undefined,
    dialogue: textValue(scene.dialogue) || undefined,
    onScreenText: textValue(scene.onScreenText) || undefined,
    soundDesign: textValue(scene.soundDesign) || undefined,
    transition: textValue(scene.transition) || undefined,
    mediaUrl: DEFAULT_SCENE_IMAGE,
    status: enumValue(scene.status, ['scripted', 'rendering', 'ready'] as const, 'scripted'),
  }));

  return {
    id: row.local_id,
    title: row.title,
    topic: textValue(data.topic, row.title),
    category: enumValue(data.category, CATEGORIES, 'Science & Future'),
    format: enumValue(data.format, FORMATS, 'short_form'),
    aspectRatio: enumValue(data.aspectRatio, RATIOS, '9:16'),
    visualStyle: enumValue(data.visualStyle, VISUAL_STYLES, 'cinematic_3d'),
    narrationStyle: enumValue(data.narrationStyle, NARRATION_STYLES, 'conversational'),
    subtitleStyle: enumValue(data.subtitleStyle, SUBTITLE_STYLES, 'dynamic_pop'),
    videoType: textValue(data.videoType) || undefined,
    creativeDirection: textValue(data.creativeDirection) || undefined,
    visualStyleDescription: textValue(data.visualStyleDescription) || undefined,
    audioDirection: textValue(data.audioDirection) || undefined,
    audience: textValue(data.audience) || undefined,
    language: textValue(data.language) || undefined,
    targetDuration: numberValue(data.targetDuration, scenes.reduce((sum, scene) => sum + scene.duration, 0) || 30),
    targetPlatforms: Array.isArray(data.targetPlatforms) ? data.targetPlatforms.filter((item): item is string => typeof item === 'string') : [],
    status: enumValue(row.status, STATUSES, 'draft'),
    scenes,
    createdAt: textValue(row.created_at, new Date().toISOString()),
    updatedAt: textValue(row.updated_at, new Date().toISOString()),
    coverImage: DEFAULT_SCENE_IMAGE,
    productionStage: enumValue(data.productionStage, PRODUCTION_STAGES, 'idea'),
    productionStageUpdatedAt: textValue(data.productionStageUpdatedAt) || undefined,
    productionStageNotes: textValue(data.productionStageNotes) || undefined,
    reviewNotes: textValue(data.reviewNotes) || undefined,
    publishingCaption: textValue(data.publishingCaption) || undefined,
    selectedPlatformsForPublishing: Array.isArray(data.selectedPlatformsForPublishing)
      ? data.selectedPlatformsForPublishing.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}
