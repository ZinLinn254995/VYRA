/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NavSection =
  | 'dashboard'
  | 'projects'
  | 'create'
  | 'workspace'
  | 'media'
  | 'review'
  | 'publishing'
  | 'analytics'
  | 'settings';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type VideoFormat = 'short_form' | 'long_form';

export type VisualStyle =
  | 'hyper_realistic'
  | 'cyber_minimal'
  | 'cinematic_3d'
  | 'anime_vector'
  | 'documentary_grain';

export type NarrationStyle =
  | 'authoritative'
  | 'conversational'
  | 'energetic_tech'
  | 'empathetic_storyteller';

export type SubtitleStyle =
  | 'dynamic_pop'
  | 'minimal_lower'
  | 'karaoke_neon'
  | 'none';

export type ContentCategory =
  | 'Tech & AI'
  | 'Science & Future'
  | 'Product Showcase'
  | 'Business & Finance'
  | 'Documentary'
  | 'Lifestyle & Culture';

export type ProjectStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'ready_to_publish'
  | 'archived';

export interface Scene {
  id: string;
  order: number;
  narration: string;
  visualPrompt: string;
  cameraMovement: string;
  duration: number; // in seconds
  mediaUrl: string;
  status: 'scripted' | 'rendering' | 'ready';
}

export interface Project {
  id: string;
  title: string;
  topic: string;
  category: ContentCategory;
  format: VideoFormat;
  aspectRatio: AspectRatio;
  visualStyle: VisualStyle;
  narrationStyle: NarrationStyle;
  subtitleStyle: SubtitleStyle;
  targetDuration: number; // in seconds
  targetPlatforms: string[];
  status: ProjectStatus;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
  coverImage: string;
  reviewNotes?: string;
  publishingCaption?: string;
  selectedPlatformsForPublishing?: string[];
}

export interface JobQueueItem {
  id: string;
  projectId: string;
  projectTitle: string;
  jobType: 'scene_synthesis' | 'voice_synthesis' | 'video_render' | 'composite_export';
  progress: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedSecondsLeft: number;
  startedAt: string;
}

export interface MediaAsset {
  id: string;
  title: string;
  type: 'video' | 'image' | 'audio' | 'brand_asset';
  url: string;
  dimensions?: string;
  duration?: string;
  tags: string[];
  createdAt: string;
}

export interface WorkspaceStats {
  totalProjects: number;
  activeDrafts: number;
  awaitingReview: number;
  approvedCount: number;
  totalScenesRendered: number;
  generationSecondsUsed: number;
  monthlyQuotaSeconds: number;
}
