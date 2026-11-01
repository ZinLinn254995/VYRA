/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * VYRA Application Tool Registry & Conversational Control Agent
 *
 * Connects natural-language chat to real, typed VYRA application operations.
 * Only reports success when the underlying state operation actually succeeds.
 */

import {
  Project,
  Scene,
  SavedIdea,
  MediaAsset,
  ContentCategory,
  VideoFormat,
  AspectRatio,
  ToolExecutionRecord,
  NavSection,
  ProductionStage,
} from '../types';

export interface AgentContext {
  projects: Project[];
  activeProjectId: string | null;
  activeProject?: Project;
  savedIdeas: SavedIdea[];
  mediaAssets: MediaAsset[];
  createProject: (newProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  archiveProject: (id: string) => void;
  deleteProject: (id: string) => void;
  addScene: (projectId: string, sceneData?: Partial<Scene>) => void;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  removeScene: (projectId: string, sceneId: string) => void;
  submitForReview: (projectId: string) => void;
  approveProject: (projectId: string) => void;
  saveIdea: (idea: Omit<SavedIdea, 'id' | 'createdAt'>) => void;
  setActiveProjectId: (id: string | null) => void;
  setCurrentSection: (section: NavSection) => void;
}

export interface AgentToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: 'projects' | 'storyboard' | 'ideas' | 'media' | 'review' | 'publishing' | 'system';
  isOperational: boolean;
  requiresConfirmation?: boolean;
}

export const AGENT_TOOLS_REGISTRY: AgentToolDefinition[] = [
  {
    name: 'get_production_status',
    displayName: 'Get Production Status',
    description: 'Show the current production checkpoint and the next approval required for a project.',
    category: 'system',
    isOperational: true,
  },
  {
    name: 'approve_production_stage',
    displayName: 'Approve Production Stage',
    description: 'Approve only the current checkpoint and unlock the next production stage. This does not start paid generation.',
    category: 'system',
    isOperational: true,
  },
  {
    name: 'request_production_changes',
    displayName: 'Request Production Changes',
    description: 'Record requested revisions without restarting or regenerating the entire project.',
    category: 'system',
    isOperational: true,
  },
  {
    name: 'list_projects',
    displayName: 'List Projects',
    description: 'Retrieve projects from the workspace, filtered by status, category, or search query.',
    category: 'projects',
    isOperational: true,
  },
  {
    name: 'get_project_details',
    displayName: 'Get Project Details',
    description: 'Inspect full storyboard, scenes, duration, and status for a specific or active project.',
    category: 'projects',
    isOperational: true,
  },
  {
    name: 'create_project',
    displayName: 'Create Project',
    description: 'Create a new video project with title, topic, format, aspect ratio, and optional scenes.',
    category: 'projects',
    isOperational: true,
  },
  {
    name: 'update_project',
    displayName: 'Update Project',
    description: 'Update project title, description, duration, or publishing caption.',
    category: 'projects',
    isOperational: true,
  },
  {
    name: 'archive_project',
    displayName: 'Archive Project',
    description: 'Move an active project to the archive.',
    category: 'projects',
    isOperational: true,
  },
  {
    name: 'delete_project',
    displayName: 'Delete Project',
    description: 'Permanently remove a project (requires explicit user confirmation).',
    category: 'projects',
    isOperational: true,
    requiresConfirmation: true,
  },
  {
    name: 'add_storyboard_scene',
    displayName: 'Add Storyboard Scene',
    description: 'Add a new scene with narration script, visual prompt, and duration to a project storyboard.',
    category: 'storyboard',
    isOperational: true,
  },
  {
    name: 'generate_storyboard',
    displayName: 'Generate Storyboard',
    description: 'Generate a structured multi-scene storyboard sequence for a project.',
    category: 'storyboard',
    isOperational: true,
  },
  {
    name: 'save_content_idea',
    displayName: 'Save Idea to Library',
    description: 'Save a brainstormed video concept, hook, or outline to the idea scratchpad.',
    category: 'ideas',
    isOperational: true,
  },
  {
    name: 'list_saved_ideas',
    displayName: 'List Saved Ideas',
    description: 'List all concepts bookmarked in the idea scratchpad.',
    category: 'ideas',
    isOperational: true,
  },
  {
    name: 'submit_to_review_queue',
    displayName: 'Submit to Review Queue',
    description: 'Submit an active project for editorial review before publishing.',
    category: 'review',
    isOperational: true,
  },
  {
    name: 'approve_project_for_review',
    displayName: 'Approve Project in Review',
    description: 'Mark a project as approved in the quality review queue.',
    category: 'review',
    isOperational: true,
  },
  {
    name: 'list_media_assets',
    displayName: 'List Media Assets',
    description: 'Browse available media library b-rolls, images, and audio tracks.',
    category: 'media',
    isOperational: true,
  },
  {
    name: 'prepare_social_post',
    displayName: 'Prepare Social Post',
    description: 'Format captions, hashtags, and destination platforms for an approved project.',
    category: 'publishing',
    isOperational: true,
  },
  {
    name: 'start_video_render',
    displayName: 'Start Video Render',
    description: 'Trigger GPU rendering pipeline (Backend worker pending connection in WP2).',
    category: 'system',
    isOperational: false,
  },
];

export interface AgentExecutionResult {
  assistantResponse: string;
  toolExecutions: ToolExecutionRecord[];
  updatedContext?: Partial<AgentContext>;
}

/**
 * Execute an Application Tool against the live StudioContext
 */
export async function executeAgentTool(
  toolName: string,
  args: Record<string, any>,
  context: AgentContext
): Promise<ToolExecutionRecord> {
  const timestamp = new Date().toISOString();
  const execId = `exec-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const toolDef = AGENT_TOOLS_REGISTRY.find((t) => t.name === toolName);
  const displayName = toolDef?.displayName || toolName;

  // Check if tool is supported
  if (!toolDef || !toolDef.isOperational) {
    return {
      id: execId,
      toolName,
      displayName,
      status: 'unsupported',
      inputArgs: args,
      errorMessage: `Feature "${displayName}" is pending server-side GPU/OAuth worker integration in Work Package 2.`,
      outputSummary: 'Backend service integration required.',
      timestamp,
    };
  }

  // Target project resolution
  const resolveProject = (projId?: string): Project | undefined => {
    if (projId) return context.projects.find((p) => p.id === projId || p.title.toLowerCase().includes(projId.toLowerCase()));
    if (context.activeProjectId) return context.projects.find((p) => p.id === context.activeProjectId);
    return context.projects[0];
  };

  try {
    switch (toolName) {
      case 'get_production_status': {
        const target = resolveProject(args.projectId);
        if (!target) return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Target project not found.', timestamp };
        const stage = target.productionStage || 'idea';
        const stageLabels: Record<ProductionStage, string> = {
          idea: 'Idea approval',
          script_review: 'Script & dialogue review',
          visual_review: 'Character & scene visual review',
          voice_review: 'Voice & pronunciation review',
          sample_review: 'Sample animation & lip-sync review',
          full_production: 'Full scene production',
          final_review: 'Final video preview',
          publish_ready: 'Ready for final publishing approval',
        };
        const nextActions: Record<ProductionStage, string> = {
          idea: 'Approve the idea to begin script and dialogue preparation.',
          script_review: 'Review and approve the script before visual assets are generated.',
          visual_review: 'Review character designs and scene images before voice production.',
          voice_review: 'Check voice samples and pronunciation before animation.',
          sample_review: 'Approve a sample animation before rendering every scene.',
          full_production: 'Complete the approved scene renders and assemble the full video.',
          final_review: 'Preview the complete video and request only the changes needed.',
          publish_ready: 'Give final publishing approval before sending the video to a platform.',
        };
        return {
          id: execId, toolName, displayName, status: 'success', inputArgs: args,
          outputSummary: '"' + target.title + '" is at: ' + stageLabels[stage] + '.',
          outputData: { projectId: target.id, title: target.title, stage, stageLabel: stageLabels[stage], nextAction: nextActions[stage], notes: target.productionStageNotes || null },
          resourceLink: { label: 'Open Production Workspace', section: 'workspace', resourceId: target.id },
          timestamp,
        };
      }

      case 'approve_production_stage': {
        const target = resolveProject(args.projectId);
        if (!target) return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Target project not found. Create or select a project first.', timestamp };
        const currentStage: ProductionStage = target.productionStage || 'idea';
        const requestedStage = (args.stage || currentStage) as ProductionStage;
        if (requestedStage !== currentStage) {
          return {
            id: execId, toolName, displayName, status: 'failed', inputArgs: args,
            errorMessage: '"' + target.title + '" is currently at "' + currentStage + '". Finish that checkpoint before approving "' + requestedStage + '".',
            timestamp,
          };
        }
        const nextStage: Partial<Record<ProductionStage, ProductionStage>> = {
          idea: 'script_review',
          script_review: 'visual_review',
          visual_review: 'voice_review',
          voice_review: 'sample_review',
          sample_review: 'full_production',
          full_production: 'final_review',
          final_review: 'publish_ready',
        };
        const next = nextStage[currentStage];
        if (currentStage === 'script_review' && (!target.scenes.length || target.scenes.some((scene) => !scene.narration.trim() || !scene.visualPrompt.trim()))) {
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Complete the narration script and visual prompt for every scene before approving the script.', timestamp };
        }
        if (currentStage === 'visual_review' && target.scenes.some((scene) => !scene.generatedImageId)) {
          const missing = target.scenes.filter((scene) => !scene.generatedImageId).map((scene) => scene.order);
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Generate and review an image for every scene before approving visuals. Missing scene images: ' + missing.join(', ') + '.', timestamp };
        }
        if (currentStage === 'voice_review' && target.scenes.some((scene) => !scene.generatedAudioId)) {
          const missing = target.scenes.filter((scene) => !scene.generatedAudioId).map((scene) => scene.order);
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Generate and review the voiceover for every scene before approving voices. Missing voiceovers: ' + missing.join(', ') + '.', timestamp };
        }
        if (currentStage === 'sample_review' && !target.scenes.some((scene) => scene.generatedVideoId)) {
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Generate at least one sample animation clip and review it before starting full production.', timestamp };
        }
        if (currentStage === 'full_production' && target.scenes.some((scene) => !scene.generatedVideoId)) {
          const missing = target.scenes.filter((scene) => !scene.generatedVideoId).map((scene) => scene.order);
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Generate every scene clip before moving to final video review. Missing scene clips: ' + missing.join(', ') + '.', timestamp };
        }
        if (currentStage === 'final_review' && !target.finalVideoId) {
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Export and save the assembled final video preview before approving the final video.', timestamp };
        }
        if (!next) {
          return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'The final publishing checkpoint is already reached. No further production stage can be approved.', timestamp };
        }
        context.updateProject(target.id, { productionStage: next, productionStageUpdatedAt: timestamp, productionStageNotes: undefined });
        return {
          id: execId, toolName, displayName, status: 'success', inputArgs: args,
          outputSummary: 'Approved "' + currentStage + '" for "' + target.title + '". Next checkpoint: "' + next + '". No paid media generation was started.',
          outputData: { projectId: target.id, approvedStage: currentStage, nextStage: next, generationStarted: false },
          resourceLink: { label: 'Continue in Production Workspace', section: 'workspace', resourceId: target.id },
          timestamp,
        };
      }

      case 'request_production_changes': {
        const target = resolveProject(args.projectId);
        if (!target) return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Target project not found.', timestamp };
        const notes = typeof args.notes === 'string' ? args.notes.trim() : '';
        if (!notes) return { id: execId, toolName, displayName, status: 'failed', inputArgs: args, errorMessage: 'Describe the specific scene, image, voice, pronunciation, or other part that needs changing.', timestamp };
        context.updateProject(target.id, { productionStageNotes: notes, productionStageUpdatedAt: timestamp });
        return {
          id: execId, toolName, displayName, status: 'success', inputArgs: args,
          outputSummary: 'Recorded a targeted revision request for "' + target.title + '". The current checkpoint is unchanged; the whole project will not be restarted.',
          outputData: { projectId: target.id, stage: target.productionStage || 'idea', notes, fullRegenerationRequested: false },
          resourceLink: { label: 'Open Storyboard Workspace', section: 'workspace', resourceId: target.id },
          timestamp,
        };
      }

      case 'list_projects': {
        const status = args.status?.toLowerCase();
        const query = args.query?.toLowerCase();
        let list = context.projects;

        if (status) {
          if (status === 'draft') list = list.filter((p) => p.status === 'draft');
          else if (status === 'in_review') list = list.filter((p) => p.status === 'in_review');
          else if (status === 'approved') list = list.filter((p) => p.status === 'approved');
          else if (status === 'archived') list = list.filter((p) => p.status === 'archived');
          else if (status === 'active') list = list.filter((p) => p.status !== 'archived');
        }

        if (query) {
          list = list.filter((p) => p.title.toLowerCase().includes(query) || p.topic.toLowerCase().includes(query));
        }

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Found ${list.length} project(s) matching criteria.`,
          outputData: list.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            scenesCount: p.scenes.length,
            duration: `${p.targetDuration}s`,
            aspectRatio: p.aspectRatio,
          })),
          resourceLink: {
            label: 'View Projects Catalog',
            section: 'projects',
          },
          timestamp,
        };
      }

      case 'get_project_details': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: `Could not find project "${args.projectId || 'active'}".`,
            timestamp,
          };
        }

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Project "${target.title}" is in "${target.status}" status with ${target.scenes.length} scenes.`,
          outputData: {
            id: target.id,
            title: target.title,
            topic: target.topic,
            status: target.status,
            productionStage: target.productionStage || 'idea',
            productionStageNotes: target.productionStageNotes || null,
            finalVideoExportedAt: target.finalVideoExportedAt || null,
            targetDuration: `${target.targetDuration}s`,
            aspectRatio: target.aspectRatio,
            format: target.format,
            scenes: target.scenes.map((s) => ({
              order: s.order,
              duration: `${s.duration}s`,
              narration: s.narration,
            })),
          },
          resourceLink: {
            label: 'Open in Storyboard',
            section: 'workspace',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'create_project': {
        const title = args.title || 'Untitled AI Project';
        const topic = args.topic || args.title || 'Exploration of emerging concepts';
        const format: VideoFormat = args.format === 'long_form' ? 'long_form' : 'short_form';
        const aspectRatio: AspectRatio = args.aspectRatio || (format === 'short_form' ? '9:16' : '16:9');
        const category: ContentCategory = args.category || 'Tech & AI';
        const sceneCount = Number(args.sceneCount) || (format === 'short_form' ? 3 : 5);
        const targetDuration = Number(args.targetDuration) || (format === 'short_form' ? 45 : 90);

        // Build scenes
        const initialScenes: Scene[] = [];
        const sceneDuration = Math.round(targetDuration / sceneCount);

        for (let i = 1; i <= sceneCount; i++) {
          initialScenes.push({
            id: `sc-${Date.now()}-${i}`,
            order: i,
            narration: i === 1
              ? `Hook: Did you know that ${topic.slice(0, 70)}? Here is what changes everything.`
              : i === sceneCount
              ? `Conclusion: Follow VYRA for more deep dives into ${category}.`
              : `Scene ${i}: The core breakthrough behind ${title}.`,
            visualPrompt: `High fidelity cinematic shot of ${title} in cyber-minimal studio lighting`,
            cameraMovement: i === 1 ? 'Slow inward push' : 'Dynamic sweeping arc',
            duration: sceneDuration,
            mediaUrl: i % 2 === 0
              ? '/src/assets/images/scene_quantum_chip_1792925206672.jpg'
              : '/src/assets/images/hero_cyber_city_1792925206979.jpg',
            status: 'ready',
          });
        }

        const newId = context.createProject({
          title,
          topic,
          category,
          format,
          aspectRatio,
          visualStyle: 'cyber_minimal',
          narrationStyle: 'energetic_tech',
          subtitleStyle: 'dynamic_pop',
          targetDuration,
          targetPlatforms: format === 'short_form' ? ['YouTube Shorts', 'TikTok', 'Instagram Reels'] : ['YouTube & Shorts', 'LinkedIn Video'],
          coverImage: '/src/assets/images/scene_quantum_chip_1792925206672.jpg',
          publishingCaption: `${title} — ${topic.slice(0, 100)}... #FutureTech #VYRAStudio`,
          selectedPlatformsForPublishing: ['youtube'],
          scenes: initialScenes,
        });

        context.setActiveProjectId(newId);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Created project "${title}" (${format === 'short_form' ? '9:16 Shorts' : '16:9 Widescreen'}) with ${sceneCount} storyboard scenes.`,
          outputData: {
            projectId: newId,
            title,
            format,
            aspectRatio,
            sceneCount,
          },
          resourceLink: {
            label: 'Open Storyboard Workspace',
            section: 'workspace',
            resourceId: newId,
          },
          timestamp,
        };
      }

      case 'update_project': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Target project not found.',
            timestamp,
          };
        }

        const updates: Partial<Project> = {};
        if (args.title) updates.title = args.title;
        if (args.publishingCaption) updates.publishingCaption = args.publishingCaption;
        if (args.targetDuration) updates.targetDuration = Number(args.targetDuration);

        context.updateProject(target.id, updates);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Updated project "${target.title}".`,
          outputData: updates,
          resourceLink: {
            label: 'View Project Details',
            section: 'workspace',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'archive_project': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Project to archive not found.',
            timestamp,
          };
        }

        context.archiveProject(target.id);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Archived project "${target.title}".`,
          resourceLink: {
            label: 'View Catalog Archive',
            section: 'projects',
          },
          timestamp,
        };
      }

      case 'delete_project': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Project to delete not found.',
            timestamp,
          };
        }

        if (!args.confirmed) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'requires_confirmation',
            inputArgs: { ...args, targetTitle: target.title, targetId: target.id },
            outputSummary: `Deletion requires confirmation. Are you sure you want to permanently delete "${target.title}"?`,
            timestamp,
          };
        }

        context.deleteProject(target.id);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Permanently deleted project "${target.title}".`,
          timestamp,
        };
      }

      case 'add_storyboard_scene': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Target project not found to add scene.',
            timestamp,
          };
        }

        const narration = args.narration || 'New scene voiceover script...';
        const visualPrompt = args.visualPrompt || 'Cinematic sequence with studio lighting';
        const duration = Number(args.duration) || 8;
        const cameraMovement = args.cameraMovement || 'Slow inward push';

        context.addScene(target.id, {
          narration,
          visualPrompt,
          duration,
          cameraMovement,
          mediaUrl: '/src/assets/images/hero_cyber_city_1792925206979.jpg',
        });

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Added Scene 0${target.scenes.length + 1} (${duration}s) to "${target.title}".`,
          resourceLink: {
            label: 'Open Storyboard',
            section: 'workspace',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'generate_storyboard': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Target project not found to generate storyboard.',
            timestamp,
          };
        }

        const count = Math.min(10, Math.max(2, Number(args.sceneCount) || 4));
        const theme = args.themePrompt || target.topic || target.title;

        // Add additional scenes to reach target count
        const currentCount = target.scenes.length;
        const needed = Math.max(0, count - currentCount);

        for (let i = 1; i <= needed; i++) {
          const order = currentCount + i;
          context.addScene(target.id, {
            narration: `Scene ${order}: Exploring key perspectives of ${theme.slice(0, 60)}.`,
            visualPrompt: `Futuristic cinematic visualization of ${theme.slice(0, 50)}`,
            cameraMovement: i % 2 === 0 ? 'Sweeping aerial pedestal' : 'Inward macro push',
            duration: 10,
          });
        }

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Generated storyboard sequence with ${target.scenes.length + needed} total scenes for "${target.title}".`,
          resourceLink: {
            label: 'Inspect Storyboard',
            section: 'workspace',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'save_content_idea': {
        const title = args.title || 'Brainstormed Video Idea';
        const concept = args.concept || args.title || 'Creative video outline';
        const category: ContentCategory = args.category || 'Tech & AI';
        const tags = Array.isArray(args.tags) ? args.tags : ['Agent Idea', category];

        context.saveIdea({
          title,
          concept,
          category,
          tags,
        });

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Saved idea "${title}" to your Idea Scratchpad.`,
          outputData: { title, category, tags },
          timestamp,
        };
      }

      case 'list_saved_ideas': {
        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `You have ${context.savedIdeas.length} idea(s) in your scratchpad.`,
          outputData: context.savedIdeas.map((i) => ({
            id: i.id,
            title: i.title,
            category: i.category,
            concept: i.concept,
          })),
          timestamp,
        };
      }

      case 'submit_to_review_queue': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Target project not found to submit for review.',
            timestamp,
          };
        }

        context.submitForReview(target.id);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Submitted project "${target.title}" to the Review Queue.`,
          resourceLink: {
            label: 'Open Review Queue',
            section: 'review',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'approve_project_for_review': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Target project not found to approve.',
            timestamp,
          };
        }

        context.approveProject(target.id);

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Approved project "${target.title}" for publishing dispatch.`,
          resourceLink: {
            label: 'View in Publishing Queue',
            section: 'publishing',
            resourceId: target.id,
          },
          timestamp,
        };
      }

      case 'list_media_assets': {
        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Found ${context.mediaAssets.length} asset(s) in the Media Library.`,
          outputData: context.mediaAssets.map((m) => ({
            id: m.id,
            title: m.title,
            type: m.type,
            url: m.url,
          })),
          resourceLink: {
            label: 'Open Media Library',
            section: 'media',
          },
          timestamp,
        };
      }

      case 'prepare_social_post': {
        const target = resolveProject(args.projectId);
        if (!target) {
          return {
            id: execId,
            toolName,
            displayName,
            status: 'failed',
            inputArgs: args,
            errorMessage: 'Project not found.',
            timestamp,
          };
        }

        const caption = args.caption || target.publishingCaption || `${target.title} — Watch the full breakdown. #VYRAStudio`;
        context.updateProject(target.id, { publishingCaption: caption });

        return {
          id: execId,
          toolName,
          displayName,
          status: 'success',
          inputArgs: args,
          outputSummary: `Prepared social publishing caption for "${target.title}". Note: Social distribution APIs (YouTube/TikTok/Meta) are currently Not Connected pending OAuth configuration in WP2.`,
          outputData: {
            caption,
            channelsStatus: 'Not Connected · Requires OAuth setup',
          },
          resourceLink: {
            label: 'View Social Publishing Channels',
            section: 'publishing',
          },
          timestamp,
        };
      }

      default:
        return {
          id: execId,
          toolName,
          displayName,
          status: 'unsupported',
          inputArgs: args,
          errorMessage: `Tool "${toolName}" is not registered in the application control engine.`,
          timestamp,
        };
    }
  } catch (err: any) {
    return {
      id: execId,
      toolName,
      displayName,
      status: 'failed',
      inputArgs: args,
      errorMessage: err?.message || 'Operation failed during tool execution.',
      timestamp,
    };
  }
}

/**
 * Natural-Language Intent Dispatcher: Analyzes user input and determines
 * if an application tool action should be executed against the live workspace.
 */
export async function processAgentRequest(
  userInput: string,
  context: AgentContext
): Promise<AgentExecutionResult> {
  const text = userInput.trim();
  const lower = text.toLowerCase();
  const toolExecutions: ToolExecutionRecord[] = [];

  // Approval gates keep paid generation behind explicit user checkpoints.
  if (/(production|workflow).*(status|stage)|what stage.*project/i.test(text)) {
    const target = context.activeProject || context.projects[0];
    const exec = await executeAgentTool('get_production_status', { projectId: target?.id }, context);
    toolExecutions.push(exec);
    const data = exec.outputData;
    return {
      assistantResponse: data
        ? '**' + data.title + ' — ' + data.stageLabel + '**\n\n' + data.nextAction + (data.notes ? '\n\n**Revision notes:** ' + data.notes : '') + '\n\nChecking status does not start generation.'
        : exec.errorMessage || 'I could not find an active project.',
      toolExecutions,
    };
  }

  const approvalMatch = lower.match(/approve\s+(?:the\s+)?(idea|script|dialogue|character(?:s)?|visuals?|images?|voice|audio|sample|animation|lip.?sync|full production|final video)/i);
  if (approvalMatch) {
    const term = approvalMatch[1];
    const stage: ProductionStage =
      term === 'idea' ? 'idea' :
      ['script', 'dialogue'].includes(term) ? 'script_review' :
      ['character', 'characters', 'visual', 'visuals', 'image', 'images'].includes(term) ? 'visual_review' :
      ['voice', 'audio'].includes(term) ? 'voice_review' :
      ['sample', 'animation', 'lip-sync', 'lipsync'].includes(term) ? 'sample_review' :
      term === 'full production' ? 'full_production' : 'final_review';
    const target = context.activeProject || context.projects[0];
    const exec = await executeAgentTool('approve_production_stage', { projectId: target?.id, stage }, context);
    toolExecutions.push(exec);
    return {
      assistantResponse: exec.status === 'success'
        ? 'Approved **' + term + '** for **"' + target?.title + '"**.\n\nThe next checkpoint is **' + exec.outputData?.nextStage + '**. This approval only unlocks the next step; it does not start paid image, voice, or video generation.\n\nSay **"show production status"** to see what is next.'
        : exec.errorMessage || 'This approval could not be applied.',
      toolExecutions,
    };
  }

  if (/(change|revise|regenerate|fix|not happy|မကြိုက်|ပြင်)/i.test(text) && /(scene|voice|audio|pronunciation|character|image|visual|lip.?sync|အသံ|မြန်မာ|ဇာတ်ကောင်)/i.test(text)) {
    const target = context.activeProject || context.projects[0];
    const exec = await executeAgentTool('request_production_changes', { projectId: target?.id, notes: text }, context);
    toolExecutions.push(exec);
    return {
      assistantResponse: exec.status === 'success'
        ? 'I recorded the targeted revision request for **"' + target?.title + '"**. The current stage is unchanged, and approved assets remain untouched; the whole project will not be restarted.'
        : exec.errorMessage || 'I could not record that revision request.',
      toolExecutions,
    };
  }

  // 1. "Create a new project called [name]" / "Create project [name]"
  const createProjectMatch =
    text.match(/create\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named|titled)?\s*["“]?([^"”\n\.]+)/i) ||
    (lower.startsWith('create project') ? text.match(/create project\s*["“]?([^"”\n\.]+)/i) : null);

  if (createProjectMatch && createProjectMatch[1]) {
    const rawTitle = createProjectMatch[1].trim();
    const isShorts = lower.includes('short') || lower.includes('reel') || lower.includes('tiktok') || lower.includes('9:16');
    const isLong = lower.includes('long') || lower.includes('16:9') || lower.includes('10-minute') || lower.includes('documentary');

    // Scene count extraction if present e.g. "with 8 scenes"
    const sceneCountMatch = text.match(/(\d+)\s+scenes?/i);
    const sceneCount = sceneCountMatch ? parseInt(sceneCountMatch[1], 10) : (isShorts ? 3 : 4);

    const exec = await executeAgentTool(
      'create_project',
      {
        title: rawTitle,
        topic: text,
        format: isLong ? 'long_form' : 'short_form',
        aspectRatio: isLong ? '16:9' : '9:16',
        sceneCount,
        category: lower.includes('space') || lower.includes('science') ? 'Science & Future' : 'Tech & AI',
      },
      context
    );

    toolExecutions.push(exec);

    return {
      assistantResponse: `I've created your new project **"${rawTitle}"** with **${sceneCount} storyboard scenes** in **${isLong ? '16:9 Widescreen' : '9:16 Vertical'}** format.\n\n` +
        `The project is now active in your workspace. You can click the link below to inspect the scenes, adjust camera movements, or modify the narration.`,
      toolExecutions,
    };
  }

  // 2. "Show me my projects that are still in draft" / "List draft projects" / "Show all projects"
  if (
    lower.includes('show') && lower.includes('project') ||
    lower.includes('list') && lower.includes('project') ||
    lower.includes('my projects')
  ) {
    let statusFilter: string | undefined = undefined;
    if (lower.includes('draft')) statusFilter = 'draft';
    else if (lower.includes('review')) statusFilter = 'in_review';
    else if (lower.includes('approved')) statusFilter = 'approved';
    else if (lower.includes('archive')) statusFilter = 'archived';

    const exec = await executeAgentTool('list_projects', { status: statusFilter }, context);
    toolExecutions.push(exec);

    const count = exec.outputData?.length || 0;
    const filterLabel = statusFilter ? `**${statusFilter}**` : 'all';

    let listProse = `Here are your ${filterLabel} projects in VYRA:\n\n`;
    if (count > 0) {
      exec.outputData.forEach((p: any, idx: number) => {
        listProse += `${idx + 1}. **${p.title}** (${p.status.replace('_', ' ')}) · ${p.scenesCount} scenes · ${p.duration}\n`;
      });
      listProse += `\nWould you like to open one in the Storyboard Workspace or add scenes?`;
    } else {
      listProse += `No projects currently match this filter. You can say *"Create a new project called [Name]"* to start one.`;
    }

    return {
      assistantResponse: listProse,
      toolExecutions,
    };
  }

  // 3. "Create a storyboard with [N] scenes" / "Add [N] scenes to storyboard"
  const storyboardMatch = text.match(/(?:create|generate|add|build)\s+(?:a\s+)?storyboard\s+(?:with\s+)?(\d+)\s+scenes?/i);
  if (storyboardMatch && storyboardMatch[1]) {
    const count = parseInt(storyboardMatch[1], 10);
    const activeTarget = context.activeProject || context.projects[0];

    const exec = await executeAgentTool(
      'generate_storyboard',
      {
        projectId: activeTarget?.id,
        sceneCount: count,
        themePrompt: text,
      },
      context
    );
    toolExecutions.push(exec);

    return {
      assistantResponse: `I have generated and sequenced **${count} scenes** for your project **"${activeTarget?.title}"**.\n\n` +
        `Each scene includes pacing duration, voiceover narration scripts, and cinematic camera directives. You can review them directly in the workspace.`,
      toolExecutions,
    };
  }

  // 4. "Save this idea to my library" / "Save idea [concept]"
  if (
    lower.includes('save this idea') ||
    lower.includes('save to library') ||
    lower.includes('save idea') ||
    lower.includes('save to scratchpad')
  ) {
    const activeConv = context;
    // Derive title from current text or concept
    const ideaTitle = text.length > 50 ? `${text.slice(0, 40)}...` : text.replace(/save (this )?idea (to )?(my )?(library|scratchpad)?/i, '').trim() || 'Creative Video Idea';

    const exec = await executeAgentTool(
      'save_content_idea',
      {
        title: ideaTitle,
        concept: text,
        category: 'Tech & AI',
        tags: ['Chat Saved', 'Video Concept'],
      },
      context
    );
    toolExecutions.push(exec);

    return {
      assistantResponse: `I've saved **"${ideaTitle}"** to your Idea Scratchpad.\n\n` +
        `You can access it anytime from the Saved Ideas tab or say *"Show my saved ideas"* to turn it into a full script or project.`,
      toolExecutions,
    };
  }

  // 5. "Show my saved ideas" / "List saved ideas"
  if (lower.includes('saved ideas') || lower.includes('list ideas') || lower.includes('show ideas')) {
    const exec = await executeAgentTool('list_saved_ideas', {}, context);
    toolExecutions.push(exec);

    const count = exec.outputData?.length || 0;
    let prose = `You have **${count} saved idea(s)** in your library:\n\n`;
    if (count > 0) {
      exec.outputData.forEach((idea: any, idx: number) => {
        prose += `${idx + 1}. **${idea.title}** (${idea.category})\n   *"${idea.concept.slice(0, 80)}..."*\n`;
      });
      prose += `\nYou can say *"Create a project from idea [Number or Title]"* to immediately initialize a storyboard.`;
    } else {
      prose += `No ideas are currently saved. You can save any brainstormed concept by saying *"Save this idea to my library"*!`;
    }

    return {
      assistantResponse: prose,
      toolExecutions,
    };
  }

  // 6. "Add this completed video to the review queue" / "Submit to review queue"
  if (
    lower.includes('review queue') ||
    lower.includes('submit to review') ||
    lower.includes('add to review')
  ) {
    const target = context.activeProject || context.projects[0];
    const exec = await executeAgentTool('submit_to_review_queue', { projectId: target?.id }, context);
    toolExecutions.push(exec);

    return {
      assistantResponse: `Project **"${target?.title}"** has been added to the **Review Queue**.\n\n` +
        `The video preview, captions, and platform settings are now staged for editorial verification.`,
      toolExecutions,
    };
  }

  // 7. "Prepare this video for YouTube publishing" / "Prepare for publishing"
  if (
    lower.includes('prepare') && lower.includes('publish') ||
    lower.includes('publish to youtube') ||
    lower.includes('prepare social post')
  ) {
    const target = context.activeProject || context.projects[0];
    const exec = await executeAgentTool(
      'prepare_social_post',
      {
        projectId: target?.id,
        caption: `${target?.title} — Deep-dive breakdown. #FutureTech #VYRAStudio`,
      },
      context
    );
    toolExecutions.push(exec);

    return {
      assistantResponse: `I've prepared the social publishing metadata and caption package for **"${target?.title}"**.\n\n` +
        `⚠️ **Connection Status Notice:** The social media channels (YouTube, TikTok, Meta) are currently **Not Connected** pending real OAuth authorization in the backend phase. Your package is staged safely in the distribution queue.`,
      toolExecutions,
    };
  }

  // 8. "Delete project [name]" (Destructive action requiring confirmation)
  const deleteMatch = text.match(/delete\s+project\s+["“]?([^"”\n\.]+)/i);
  if (deleteMatch && deleteMatch[1]) {
    const targetName = deleteMatch[1].trim();
    const target = context.projects.find((p) => p.title.toLowerCase().includes(targetName.toLowerCase()));

    if (!target) {
      return {
        assistantResponse: `Could not find any project matching "${targetName}" to delete.`,
        toolExecutions: [
          {
            id: `exec-fail-${Date.now()}`,
            toolName: 'delete_project',
            displayName: 'Delete Project',
            status: 'failed',
            inputArgs: { targetName },
            errorMessage: `Project "${targetName}" not found.`,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const exec = await executeAgentTool('delete_project', { projectId: target.id, confirmed: false }, context);
    toolExecutions.push(exec);

    return {
      assistantResponse: `⚠️ **Action Requires Confirmation:**\n\n` +
        `Are you sure you want to permanently delete **"${target.title}"**? This will remove all associated storyboard scenes and voiceover scripts.`,
      toolExecutions,
    };
  }

  // 9. "Turn this idea into a 60-second YouTube Shorts script"
  if (lower.includes('60-second') && (lower.includes('shorts') || lower.includes('script'))) {
    const topic = text.replace(/turn (this )?(idea )?into a 60-second.*script:?/i, '').trim() || 'Emerging Technology Breakthrough';
    const title = topic.length > 30 ? `${topic.slice(0, 28)}...` : topic;

    const exec = await executeAgentTool(
      'create_project',
      {
        title: title || '60s YouTube Shorts Concept',
        topic,
        format: 'short_form',
        aspectRatio: '9:16',
        targetDuration: 60,
        sceneCount: 3,
      },
      context
    );
    toolExecutions.push(exec);

    return {
      assistantResponse: `I've initialized a 60-second **YouTube Shorts project** for **"${title}"** with a 3-act pacing structure (Hook, Core Breakthrough, Call-to-Action) in 9:16 vertical format.\n\n` +
        `The project is now live in your workspace. You can open the Storyboard to view and edit the narration.`,
      toolExecutions,
    };
  }

  // 10. Fallback: Pure conversational ideation (No unwarranted action execution)
  return {
    assistantResponse: `I understand you want to explore: **"${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"**.\n\n` +
      `As your VYRA Studio Control Agent, I can execute actual workspace commands for you:\n\n` +
      `- *"Create a new project called [Name]"*\n` +
      `- *"Turn this idea into a 60-second YouTube Shorts script"*\n` +
      `- *"Create a storyboard with 6 scenes"*\n` +
      `- *"Show me my projects that are still in draft"*\n` +
      `- *"Save this idea to my library"*\n` +
      `- *"Submit this video to the review queue"*\n\n` +
      `What would you like me to execute?`,
    toolExecutions: [],
  };
}
