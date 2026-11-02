/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NavSection =
  | 'dashboard'
  | 'projects'
  | 'create'
  | 'ideas'
  | 'workspace'
  | 'media'
  | 'consistency'
  | 'review'
  | 'publishing'
  | 'analytics'
  | 'jobs'
  | 'usage'
  | 'settings';

export type AspectRatio = '9:16' | '16:9' | '1:1';
export type VideoFormat = 'short_form' | 'long_form';
export type VisualStyle = 'hyper_realistic' | 'cyber_minimal' | 'cinematic_3d' | 'anime_vector' | 'documentary_grain';
export type NarrationStyle = 'authoritative' | 'conversational' | 'energetic_tech' | 'empathetic_storyteller';
export type SubtitleStyle = 'dynamic_pop' | 'minimal_lower' | 'karaoke_neon' | 'none';
export type ContentCategory = 'Tech & AI' | 'Science & Future' | 'Product Showcase' | 'Business & Finance' | 'Documentary' | 'Lifestyle & Culture';
export type ProjectStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'ready_to_publish' | 'archived';

/** Shared vocabulary for reusable visual, audio, story, and brand references. */
export type ConsistencyAssetKind =
  | 'character'
  | 'environment'
  | 'object'
  | 'brand'
  | 'visual_style'
  | 'voice'
  | 'music'
  | 'audio'
  | 'story'
  | 'other';
export type ConsistencyRuleScope = 'global' | 'project' | 'scene';
export type ConsistencyRuleStrength = 'locked' | 'preferred' | 'flexible';

/** A reusable reference that can be attached to one or many scenes. */
export interface ConsistencyReference {
  id: string;
  kind: ConsistencyAssetKind;
  name: string;
  description: string;
  /** IDs of media assets stored by the media library; storage remains device-local for now. */
  mediaIds?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Human-readable continuity instruction with explicit scope and priority. */
export interface ConsistencyRule {
  id: string;
  scope: ConsistencyRuleScope;
  instruction: string;
  strength: ConsistencyRuleStrength;
  priority: number;
  active: boolean;
  sceneIds?: string[];
  appliesTo?: ConsistencyAssetKind[];
}
export interface ProjectConsistencyBible {
  version: 1;
  references: ConsistencyReference[];
  rules: ConsistencyRule[];
}

/** Existing character identity records remain supported without migration. */
export interface CharacterReference {
  id: string;
  name: string;
  visualDescription: string;
  referenceImageId?: string;
  continuityNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  order: number;
  narration: string;
  visualPrompt: string;
  cameraMovement: string;
  duration: number;
  shotType?: string;
  dialogue?: string;
  onScreenText?: string;
  soundDesign?: string;
  transition?: string;
  mediaUrl: string;
  characterIds?: string[];
  consistencyReferenceIds?: string[];
  generatedImageId?: string;
  generatedVideoId?: string;
  generatedAudioId?: string;
  status: 'scripted' | 'rendering' | 'ready';
}

export type ProductionStage = 'idea' | 'script_review' | 'visual_review' | 'voice_review' | 'sample_review' | 'full_production' | 'final_review' | 'publish_ready';
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
  videoType?: string;
  creativeDirection?: string;
  visualStyleDescription?: string;
  audioDirection?: string;
  audience?: string;
  language?: string;
  targetDuration: number;
  targetPlatforms: string[];
  status: ProjectStatus;
  scenes: Scene[];
  characters?: CharacterReference[];
  consistencyBible?: ProjectConsistencyBible;
  createdAt: string;
  updatedAt: string;
  coverImage: string;
  productionStage?: ProductionStage;
  productionStageUpdatedAt?: string;
  productionStageNotes?: string;
  finalVideoId?: string;
  finalVideoExportedAt?: string;
  reviewNotes?: string;
  publishingCaption?: string;
  selectedPlatformsForPublishing?: string[];
}

export interface JobQueueItem { id: string; projectId: string; projectTitle: string; jobType: 'scene_synthesis' | 'voice_synthesis' | 'video_render' | 'composite_export'; progress: number; status: 'queued' | 'processing' | 'completed' | 'failed'; estimatedSecondsLeft: number; startedAt: string; }
export interface MediaAsset { id: string; title: string; type: 'video' | 'image' | 'audio' | 'brand_asset'; url: string; dimensions?: string; duration?: string; tags: string[]; createdAt: string; }
export interface WorkspaceStats { totalProjects: number; activeDrafts: number; awaitingReview: number; approvedCount: number; totalScenesRendered: number; generationSecondsUsed: number; monthlyQuotaSeconds: number; }
export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatSuggestedAction { label: string; action: 'create_project' | 'save_idea' | 'develop_script'; data?: { title?: string; topic?: string; category?: ContentCategory; format?: VideoFormat; }; }
export type ToolStatus = 'executing' | 'success' | 'failed' | 'requires_confirmation' | 'unsupported';
export interface ToolExecutionRecord { id: string; toolName: string; displayName: string; status: ToolStatus; inputArgs: Record<string, any>; outputSummary?: string; outputData?: any; errorMessage?: string; timestamp: string; resourceLink?: { label: string; section: NavSection; resourceId?: string; }; }
export interface ChatMessage { id: string; role: ChatRole; content: string; timestamp: string; isPreviewNotice?: boolean; suggestedActions?: ChatSuggestedAction[]; toolExecutions?: ToolExecutionRecord[]; providerName?: string; modelName?: string; generationId?: string; usage?: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; costUsd: number | null; }; }
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[]; category?: string; isPinned?: boolean; }
export interface SavedIdea { id: string; title: string; concept: string; category?: ContentCategory; tags: string[]; sourceConversationId?: string; createdAt: string; }
export interface AIServiceStatus { status: 'connected' | 'preview_mode' | 'error'; providerName: string; modelName: string; backendEndpoint?: string; message?: string; }
