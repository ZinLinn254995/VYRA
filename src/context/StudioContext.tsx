/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  NavSection,
  Project,
  Scene,
  JobQueueItem,
  MediaAsset,
  WorkspaceStats,
  Conversation,
  ChatMessage,
  SavedIdea,
  AIServiceStatus,
  ContentCategory,
  VideoFormat,
  ChatSuggestedAction,
} from '../types';
import {
  INITIAL_PROJECTS,
  INITIAL_JOBS,
  INITIAL_MEDIA_ASSETS,
  INITIAL_STATS,
  INITIAL_CONVERSATIONS,
  INITIAL_SAVED_IDEAS,
  normalizeLegacySeedAssetPath,
} from '../data/seedData';
import { BRAND_CONFIG } from '../config/brand';
import { aiService } from '../services/aiService';
import { processAgentRequest, executeAgentTool, AgentContext } from '../services/agentTools';
import { ToolExecutionRecord } from '../types';

interface StudioContextType {
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Navigation
  currentSection: NavSection;
  setCurrentSection: (section: NavSection) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeProject: Project | undefined;
  navigateToProjectWorkspace: (id: string) => void;
  navigateToReviewQueue: (id: string) => void;

  // Projects CRUD
  projects: Project[];
  createProject: (newProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;
  duplicateProject: (id: string) => string;
  deleteProject: (id: string) => void;

  // Storyboard Scene Management
  addScene: (projectId: string, sceneData?: Partial<Scene>) => void;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  removeScene: (projectId: string, sceneId: string) => void;
  reorderScenes: (projectId: string, fromIndex: number, toIndex: number) => void;

  // Review Workflow
  submitForReview: (projectId: string) => void;
  approveProject: (projectId: string) => void;
  requestChanges: (projectId: string, notes: string) => void;

  // Media Library
  mediaAssets: MediaAsset[];
  addMediaAsset: (asset: Omit<MediaAsset, 'id' | 'createdAt'>) => void;
  deleteMediaAsset: (id: string) => void;

  // Jobs
  jobs: JobQueueItem[];
  addJob: (job: Omit<JobQueueItem, 'id' | 'startedAt'>) => void;

  // Stats
  stats: WorkspaceStats;

  // Brand dynamic customization
  brandName: string;
  setBrandName: (name: string) => void;
  brandTagline: string;
  setBrandTagline: (tagline: string) => void;

  // Filtering & Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (f: string) => void;

  // Feedback Toast
  toast: { message: string; type: 'success' | 'info' | 'warning' } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  clearToast: () => void;

  // AI Content Ideas & Chat
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | undefined;
  createNewConversation: (initialPrompt?: string) => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  isSendingMessage: boolean;
  chatError: string | null;
  retryLastMessage: () => Promise<void>;
  aiStatus: AIServiceStatus;

  // Saved Ideas
  savedIdeas: SavedIdea[];
  saveIdea: (idea: Omit<SavedIdea, 'id' | 'createdAt'>) => void;
  deleteSavedIdea: (id: string) => void;
  createProjectFromIdea: (params: {
    title?: string;
    topic?: string;
    category?: ContentCategory;
    format?: VideoFormat;
  }) => string;

  // Agent Tool Execution
  executeToolDirectly: (toolName: string, args: Record<string, any>) => Promise<ToolExecutionRecord>;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state persisted in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vyra_theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    localStorage.setItem('vyra_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Navigation
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | null>('proj-01-quantum');

  // Brand state (editable via Settings)
  const [brandName, setBrandName] = useState<string>(BRAND_CONFIG.name);
  const [brandTagline, setBrandTagline] = useState<string>(BRAND_CONFIG.tagline);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Data Collections
  const [projects, setProjects] = useState<Project[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vyra_projects_v1');
      if (stored) {
        try {
          const cached = JSON.parse(stored) as Project[];
          return cached.map((project) => ({
            ...project,
            coverImage: project.coverImage ? normalizeLegacySeedAssetPath(project.coverImage) : project.coverImage,
            scenes: project.scenes.map((scene) => ({
              ...scene,
              mediaUrl: normalizeLegacySeedAssetPath(scene.mediaUrl),
            })),
          }));
        } catch (e) {
          console.error('Failed to parse cached projects', e);
        }
      }
    }
    return INITIAL_PROJECTS;
  });

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);
  const [jobs, setJobs] = useState<JobQueueItem[]>(INITIAL_JOBS);
  const [stats, setStats] = useState<WorkspaceStats>(INITIAL_STATS);

  // Sync projects to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vyra_projects_v1', JSON.stringify(projects));
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [projects]);

  // Recalculate stats whenever projects change
  useEffect(() => {
    const active = projects.filter((p) => p.status !== 'archived');
    const drafts = active.filter((p) => p.status === 'draft').length;
    const review = active.filter((p) => p.status === 'in_review').length;
    const approved = active.filter((p) => p.status === 'approved' || p.status === 'ready_to_publish').length;
    const totalScenes = projects.reduce((acc, p) => acc + p.scenes.length, 0);

    setStats((prev) => ({
      ...prev,
      totalProjects: projects.length,
      activeDrafts: drafts,
      awaitingReview: review,
      approvedCount: approved,
      totalScenesRendered: totalScenes,
    }));
  }, [projects]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  const clearToast = () => setToast(null);

  // AI Conversations & Saved Ideas State (Local preview persistence)
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vyra_conversations_v1');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse cached conversations', e);
        }
      }
    }
    return INITIAL_CONVERSATIONS;
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    INITIAL_CONVERSATIONS[0]?.id || null
  );

  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vyra_saved_ideas_v1');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse cached saved ideas', e);
        }
      }
    }
    return INITIAL_SAVED_IDEAS;
  });

  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIServiceStatus>({
    status: 'preview_mode',
    providerName: 'Google Gemini AI (Server-Proxy Ready)',
    modelName: 'gemini-2.5-flash',
    message: 'Checking server-side Gemini connection.',
  });

  // Check AI service endpoint status on mount
  useEffect(() => {
    aiService.checkStatus().then(setAiStatus);
  }, []);

  // Sync conversations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vyra_conversations_v1', JSON.stringify(conversations));
    } catch (e) {
      console.warn('Failed to save conversations to local storage', e);
    }
  }, [conversations]);

  // Sync saved ideas to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vyra_saved_ideas_v1', JSON.stringify(savedIdeas));
    } catch (e) {
      console.warn('Failed to save ideas to local storage', e);
    }
  }, [savedIdeas]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const navigateToProjectWorkspace = (id: string) => {
    setActiveProjectId(id);
    setCurrentSection('workspace');
  };

  const navigateToReviewQueue = (id: string) => {
    setActiveProjectId(id);
    setCurrentSection('review');
  };

  // Project CRUD
  const createProject = (
    newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ): string => {
    const newId = `proj-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const created: Project = {
      ...newProjectData,
      id: newId,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(newId);
    showToast(`Project "${created.title}" initialized successfully!`, 'success');
    return newId;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((proj) =>
        proj.id === id
          ? {
              ...proj,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : proj
      )
    );
  };

  const archiveProject = (id: string) => {
    updateProject(id, { status: 'archived' });
    showToast('Project moved to archive', 'info');
  };

  const unarchiveProject = (id: string) => {
    updateProject(id, { status: 'draft' });
    showToast('Project restored from archive to drafts', 'success');
  };

  const duplicateProject = (id: string): string => {
    const original = projects.find((p) => p.id === id);
    if (!original) return '';
    const newId = `proj-${Date.now().toString(36)}`;
    const duplicated: Project = {
      ...original,
      id: newId,
      title: `${original.title} (Copy)`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [duplicated, ...prev]);
    showToast(`Project duplicated as "${duplicated.title}"`, 'success');
    return newId;
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(projects.find((p) => p.id !== id)?.id || null);
    }
    showToast('Project permanently deleted', 'warning');
  };

  // Storyboard Scene Management
  const addScene = (projectId: string, sceneData?: Partial<Scene>) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        const newOrder = proj.scenes.length + 1;
        const newScene: Scene = {
          id: `sc-${Date.now().toString(36)}`,
          order: newOrder,
          narration: sceneData?.narration || 'Describe narration for this sequence...',
          visualPrompt:
            sceneData?.visualPrompt ||
            'Futuristic cinematic sequence, pristine atmospheric lighting and holographic interface detail',
          cameraMovement: sceneData?.cameraMovement || 'Slow dynamic push inward',
          duration: sceneData?.duration || 8,
          mediaUrl: sceneData?.mediaUrl || proj.coverImage || '/src/assets/images/hero_cyber_city_1792925206979.jpg',
          status: 'ready',
        };
        return {
          ...proj,
          scenes: [...proj.scenes, newScene],
          updatedAt: new Date().toISOString(),
        };
      })
    );
    showToast('New storyboard scene added', 'success');
  };

  const updateScene = (projectId: string, sceneId: string, updates: Partial<Scene>) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          scenes: proj.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...updates } : sc)),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const removeScene = (projectId: string, sceneId: string) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        const filtered = proj.scenes.filter((sc) => sc.id !== sceneId);
        // renumber orders
        const renumbered = filtered.map((sc, idx) => ({ ...sc, order: idx + 1 }));
        return {
          ...proj,
          scenes: renumbered,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    showToast('Scene removed from storyboard', 'info');
  };

  const reorderScenes = (projectId: string, fromIndex: number, toIndex: number) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        const scenesCopy = [...proj.scenes];
        const [moved] = scenesCopy.splice(fromIndex, 1);
        scenesCopy.splice(toIndex, 0, moved);
        const renumbered = scenesCopy.map((sc, idx) => ({ ...sc, order: idx + 1 }));
        return {
          ...proj,
          scenes: renumbered,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  // Review actions
  const submitForReview = (projectId: string) => {
    updateProject(projectId, { status: 'in_review' });
    showToast('Project submitted to Review Queue', 'info');
  };

  const approveProject = (projectId: string) => {
    updateProject(projectId, {
      status: 'approved',
      reviewNotes: 'Approved for distribution. Ready for queue dispatch once social accounts are connected.',
    });
    showToast('Project approved! Ready for publishing queue.', 'success');
  };

  const requestChanges = (projectId: string, notes: string) => {
    updateProject(projectId, {
      status: 'changes_requested',
      reviewNotes: notes,
    });
    showToast('Changes requested. Sent back to storyboard editor.', 'warning');
  };

  // Media
  const addMediaAsset = (asset: Omit<MediaAsset, 'id' | 'createdAt'>) => {
    const newAsset: MediaAsset = {
      ...asset,
      id: `media-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    setMediaAssets((prev) => [newAsset, ...prev]);
    showToast('New asset uploaded to Media Library', 'success');
  };

  const deleteMediaAsset = (id: string) => {
    setMediaAssets((prev) => prev.filter((m) => m.id !== id));
    showToast('Asset removed from library', 'info');
  };

  // Jobs
  const addJob = (job: Omit<JobQueueItem, 'id' | 'startedAt'>) => {
    const newJob: JobQueueItem = {
      ...job,
      id: `job-${Math.floor(Math.random() * 900 + 100)}`,
      startedAt: new Date().toISOString(),
    };
    setJobs((prev) => [newJob, ...prev]);
  };

  // AI Ideas & Conversation Actions
  const createNewConversation = (initialPrompt?: string): string => {
    const newId = `conv-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newTitle = initialPrompt
      ? (initialPrompt.length > 35 ? `${initialPrompt.slice(0, 32)}...` : initialPrompt)
      : 'New Idea Exploration';

    const newConv: Conversation = {
      id: newId,
      title: newTitle,
      createdAt: now,
      updatedAt: now,
      messages: initialPrompt
        ? [
            {
              id: `msg-${Date.now()}`,
              role: 'user',
              content: initialPrompt,
              timestamp: now,
            },
          ]
        : [],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
    showToast('Started new idea conversation', 'info');
    return newId;
  };

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    setChatError(null);
  };

  const renameConversation = (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: newTitle.trim(), updatedAt: new Date().toISOString() }
          : c
      )
    );
    showToast('Conversation renamed', 'success');
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(filtered[0]?.id || null);
      }
      return filtered;
    });
    showToast('Conversation deleted', 'info');
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isSendingMessage) return;

    let targetConvId = activeConversationId;
    let currentConv = conversations.find((c) => c.id === targetConvId);

    if (!currentConv) {
      targetConvId = createNewConversation();
      currentConv = {
        id: targetConvId,
        title: content.slice(0, 32) + (content.length > 32 ? '...' : ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    }

    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: now,
    };

    const updatedMessages = [...currentConv.messages, userMsg];

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== targetConvId) return c;
        const shouldUpdateTitle = c.title === 'New Idea Exploration';
        return {
          ...c,
          title: shouldUpdateTitle
            ? content.length > 35
              ? `${content.slice(0, 32)}...`
              : content
            : c.title,
          updatedAt: now,
          messages: updatedMessages,
        };
      })
    );

    setIsSendingMessage(true);
    setChatError(null);

    try {
      const agentContext: AgentContext = {
        projects,
        activeProjectId,
        activeProject,
        savedIdeas,
        mediaAssets,
        createProject,
        updateProject,
        archiveProject,
        deleteProject,
        addScene,
        updateScene,
        removeScene,
        submitForReview,
        approveProject,
        saveIdea,
        setActiveProjectId,
        setCurrentSection,
      };

      // 1. Process natural-language intent through the Application Tool Agent
      const agentResult = await processAgentRequest(content, agentContext);

      let finalContent = agentResult.assistantResponse;
      let finalSuggestedActions: ChatSuggestedAction[] = [];
      let isPreviewNotice = false;

      // 2. If no tool command matched, run creative ideation engine
      if (agentResult.toolExecutions.length === 0) {
        const response = await aiService.generateResponse({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          conversationId: targetConvId || undefined,
        });
        finalContent = response.content;
        finalSuggestedActions = response.suggestedActions || [];
        isPreviewNotice = response.isPreviewNotice || false;
      }

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        suggestedActions: finalSuggestedActions,
        isPreviewNotice,
        toolExecutions: agentResult.toolExecutions.length > 0 ? agentResult.toolExecutions : undefined,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: [...c.messages, assistantMsg],
              }
            : c
        )
      );
    } catch (err: any) {
      console.error('Agent execution error', err);
      setChatError(err?.message || 'Failed to process request. Please retry.');
      showToast('Could not complete request', 'warning');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const executeToolDirectly = async (
    toolName: string,
    args: Record<string, any>
  ): Promise<ToolExecutionRecord> => {
    const agentContext: AgentContext = {
      projects,
      activeProjectId,
      activeProject,
      savedIdeas,
      mediaAssets,
      createProject,
      updateProject,
      archiveProject,
      deleteProject,
      addScene,
      updateScene,
      removeScene,
      submitForReview,
      approveProject,
      saveIdea,
      setActiveProjectId,
      setCurrentSection,
    };

    const record = await executeAgentTool(toolName, args, agentContext);

    // If an action succeeded, post a system confirmation message in active conversation
    if (activeConversationId) {
      const confirmMsg: ChatMessage = {
        id: `msg-tool-${Date.now()}`,
        role: 'assistant',
        content: `Executed **${record.displayName}**: ${record.outputSummary || 'Action completed successfully.'}`,
        timestamp: new Date().toISOString(),
        toolExecutions: [record],
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, updatedAt: new Date().toISOString(), messages: [...c.messages, confirmMsg] }
            : c
        )
      );
    }

    return record;
  };

  const retryLastMessage = async () => {
    if (!activeConversation || activeConversation.messages.length === 0) return;
    const lastUserMsg = [...activeConversation.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      await sendMessage(lastUserMsg.content);
    }
  };

  const saveIdea = (idea: Omit<SavedIdea, 'id' | 'createdAt'>) => {
    const newIdea: SavedIdea = {
      ...idea,
      id: `idea-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    setSavedIdeas((prev) => [newIdea, ...prev]);
    showToast(`Saved "${newIdea.title}" to Idea Scratchpad!`, 'success');
  };

  const deleteSavedIdea = (id: string) => {
    setSavedIdeas((prev) => prev.filter((i) => i.id !== id));
    showToast('Idea removed from scratchpad', 'info');
  };

  const createProjectFromIdea = (params: {
    title?: string;
    topic?: string;
    category?: ContentCategory;
    format?: VideoFormat;
  }): string => {
    const title = params.title || 'AI Generated Video Project';
    const topic = params.topic || title;
    const category = params.category || 'Tech & AI';
    const format = params.format || 'short_form';
    const aspectRatio = format === 'short_form' ? '9:16' : '16:9';

    const projectId = createProject({
      title,
      topic,
      category,
      format,
      aspectRatio,
      visualStyle: 'cyber_minimal',
      narrationStyle: 'energetic_tech',
      subtitleStyle: 'dynamic_pop',
      targetDuration: format === 'short_form' ? 45 : 90,
      targetPlatforms:
        format === 'short_form'
          ? ['YouTube Shorts', 'TikTok', 'Instagram Reels']
          : ['YouTube & Shorts', 'LinkedIn Video'],
      coverImage: '/src/assets/images/scene_quantum_chip_1792925206672.jpg',
      publishingCaption: `${title} — ${topic.slice(0, 100)}... #FutureTech #VYRAStudio`,
      selectedPlatformsForPublishing: ['youtube'],
      scenes: [
        {
          id: `sc-${Date.now()}-1`,
          order: 1,
          narration: `Introducing ${title}. ${topic.slice(0, 80)}...`,
          visualPrompt: `High fidelity cinematic visualization of ${title} in cyber-minimal aesthetic`,
          cameraMovement: 'Slow inward macro push with shallow depth of field',
          duration: 12,
          mediaUrl: '/src/assets/images/scene_quantum_chip_1792925206672.jpg',
          status: 'ready',
        },
      ],
    });

    navigateToProjectWorkspace(projectId);
    showToast(`Created new project "${title}"! Opening Storyboard Workspace.`, 'success');
    return projectId;
  };

  return (
    <StudioContext.Provider
      value={{
        theme,
        toggleTheme,
        currentSection,
        setCurrentSection,
        activeProjectId,
        setActiveProjectId,
        activeProject,
        navigateToProjectWorkspace,
        navigateToReviewQueue,
        projects,
        createProject,
        updateProject,
        archiveProject,
        unarchiveProject,
        duplicateProject,
        deleteProject,
        addScene,
        updateScene,
        removeScene,
        reorderScenes,
        submitForReview,
        approveProject,
        requestChanges,
        mediaAssets,
        addMediaAsset,
        deleteMediaAsset,
        jobs,
        addJob,
        stats,
        brandName,
        setBrandName,
        brandTagline,
        setBrandTagline,
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        toast,
        showToast,
        clearToast,
        // AI Ideas Chat
        conversations,
        activeConversationId,
        activeConversation,
        createNewConversation,
        selectConversation,
        renameConversation,
        deleteConversation,
        sendMessage,
        isSendingMessage,
        chatError,
        retryLastMessage,
        aiStatus,
        savedIdeas,
        saveIdea,
        deleteSavedIdea,
        createProjectFromIdea,
        executeToolDirectly,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
};

export const useStudio = () => {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return context;
};
