import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AIChatPage } from '../ai/AIChatPage';
import { StoryboardUniverseTab } from './StoryboardUniverseTab';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clapperboard, Copy, Film, GripHorizontal, Images, Maximize2, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Card } from '../ui/Card';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { ProfileSubpageHeader } from '../profile/ProfileSubpageHeader';
import { setCompactProgress, handleHeaderWheel, handleHeaderTouchStart, handleHeaderTouchMove, handleHeaderTouchEnd } from '../profile/headerScrollMotion';
import { getCurrentAccessToken, supabase } from '../../context/AuthContext';
import { isPersistableStoryboardId, mergeWorkspaceStoryboards, workspaceStoryboardSuggestionKey } from '../../services/workspaceStoryboards';
import { parseVyralAiSuggestions } from '../../services/vyralAiDetails';
import { createVyralVideoPlaybackUrl } from '../../services/vyralAssetPlayback';
import { MasterTimelineEditor, type MasterTimelineData } from './MasterTimelineEditor';
import type { WorkspaceAiContext, WorkspaceSceneStateProposalHandoff } from '../../types/workspaceAiContext';
import type { VyralChatAssetContext } from '../../types/vyralChat';
import type { RunwayProjectShotSequenceReady } from '../../services/runwayProjectGeneration';
import { buildDirectorShotTimelineClips } from '../../services/directorShotTimeline';
import { approveSceneContinuityState, getSceneContinuityContext, hydrateSceneContinuityLedger, invalidateSceneContinuity, setCreatorApprovedSceneStartingState, isSceneContinuityLedgerSnapshotCurrent, type SceneContinuityLedger } from '../../services/universeSceneLedger';

type StoryboardAiProvenance = { provider: string; model: string; generatedAt: string };
type SceneRenderRevision = { id: string; createdAt: string; duration: number; storageKey: string; mimeType: string; checksum: string; status: 'ready' };
type SceneProjectClip = { id: string; name: string; start: number; duration: number; sourceIn?: number; sourceOut?: number; assetId?: string | null; assetVersionId?: string | null; assetMimeType?: string | null; source?: 'ai_director_shot' | 'manual'; shotId?: string; content?: string };
type SceneProjectTrack = { id: string; type: 'video' | 'audio' | 'text'; name: string; muted?: boolean; hidden?: boolean; clips: SceneProjectClip[] };
type SceneProjectTimeline = { duration: number; fps: number; width: number; height: number; tracks: SceneProjectTrack[] };
type SceneCreativeDirection = { schemaVersion: 1; source: 'ai_director_plan'; productionTitle: string; logline: string; genre: string; tone: string; sceneIndex: number; sceneCount: number; purpose: string; location: string; characters: string[]; entryState: string; action: string; exitState: string; shots: Array<{ id: string; purpose: string; durationSeconds: number; framing: string; cameraAngle: string; cameraMovement: string; composition: string; lighting: string; focus: string; sound: string; action: string; continuityNotes: string[] }> };
type SceneShotRepairHistoryEntry = { id: string; createdAt: string; sceneId: string; shotId: string; shotIndex: number; previousAssetId: string | null; previousAssetVersionId: string | null; candidateAssetId: string | null; candidateAssetVersionId: string | null; outcome: 'verified' | 'needs_review'; baselineRevision: string | null; checkedBoundaryIndices: number[]; findings: string[]; approvedCostUsd: number };
type SceneProjectData = { id: string; schemaVersion: 1; createdAt: string; updatedAt: string; renderRevisionIds: string[]; renderRevisions?: SceneRenderRevision[]; latestRenderRevisionId?: string | null; timeline?: SceneProjectTimeline; creativeDirection?: SceneCreativeDirection; repairHistory?: SceneShotRepairHistoryEntry[] };
type StoryboardScene = { id: string; title: string; description: string; duration: number; transition: string; project?: SceneProjectData };
type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string; details?: { category?: string; style?: string; mood?: string; tags?: string[]; scenes?: StoryboardScene[]; masterTimeline?: MasterTimelineData; globalMusic?: string; globalTitle?: string; origins?: Record<string, 'ai_suggested' | 'creator_edited'>; ai_provenance?: StoryboardAiProvenance; continuityLedger?: SceneContinuityLedger } };
type LibraryPage = 'my-vyrals' | 'my-media-library';
type Props = { storageKey: string; isAuthenticated: boolean; isActive?: boolean; createUniverseRequest?: number; openUniverseRequest?: { storyboardId: string; requestId: number } | null; onEditorExit?: () => void; onLoginRequired: () => void; onOpenLibraryPage: (page: LibraryPage) => void; onAiContextChange?: (context: WorkspaceAiContext) => void; pendingSceneStateProposal?: WorkspaceSceneStateProposalHandoff | null; onSceneStateProposalConsumed?: (id: string) => void; onSceneStateProposal?: (proposal: WorkspaceSceneStateProposalHandoff) => void; initialSelectedAssets?: VyralChatAssetContext[]; onSelectedAssetsChange?: (assets: VyralChatAssetContext[]) => void };

const readStoryboards = (key: string): Storyboard[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is Storyboard =>
      Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.topic === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    ).map((storyboard) => {
      if (!storyboard.details) return { ...storyboard, details: { scenes: [], continuityLedger: hydrateSceneContinuityLedger(undefined, []) } };
      const scenes = (storyboard.details.scenes || []).map((scene) => {
        if (scene.project?.id) return scene;
        const now = new Date().toISOString();
        return {
          ...scene,
          project: { id: crypto.randomUUID(), schemaVersion: 1 as const, createdAt: now, updatedAt: now, renderRevisionIds: [] },
        };
      });
      return {
        ...storyboard,
        details: {
          ...storyboard.details,
          scenes,
          continuityLedger: hydrateSceneContinuityLedger(storyboard.details.continuityLedger, scenes),
        },
      };
    }) : [];
  } catch { return []; }
};

const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)]';

const updateStoryboardHeaderCompact = (content: HTMLElement, scrollTop = content.scrollTop) => {
  setCompactProgress(content, scrollTop > 0 ? 1 : 0);
};


export const WorkspacePage: React.FC<Props> = ({ storageKey, isAuthenticated, isActive = true, createUniverseRequest = 0, openUniverseRequest = null, onEditorExit, onLoginRequired, onOpenLibraryPage, onAiContextChange, pendingSceneStateProposal, onSceneStateProposalConsumed, onSceneStateProposal, initialSelectedAssets, onSelectedAssetsChange }) => {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(() => readStoryboards(storageKey));
  const createDefaultStoryboardRef = useRef<() => void>(() => {});
  const lastOpenedUniverseRequestRef = useRef<number | null>(null);
  const lastStoryboardSyncAtRef = useRef(0);
  const storyboardSaveQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const deletedStoryboardIdsRef = useRef<Set<string>>(new Set());
  const storyboardStorageKeyRef = useRef(storageKey);
  const suggestionRequestIdRef = useRef(0);
  const [storyboardToDelete, setStoryboardToDelete] = useState<Storyboard | null>(null);
  const [isDeletingStoryboard, setIsDeletingStoryboard] = useState(false);
  const [activeStoryboard, setActiveStoryboard] = useState<Storyboard | null>(null);
  const [localWorkspaceAiContext, setLocalWorkspaceAiContext] = useState<WorkspaceAiContext | null>(null);
  const [activeStoryboardConfirmed, setActiveStoryboardConfirmed] = useState(false);
  const [storyboardDetailsExpanded, setStoryboardDetailsExpanded] = useState(false);
  const [storyboardEditorView, setStoryboardEditorView] = useState<'master' | 'chat' | 'universe' | 'details'>('chat');
  const [storyboardUniverse, setStoryboardUniverse] = useState<{ id: string; name: string; description: string } | null>(null);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [sceneVideoPreviewUrl, setSceneVideoPreviewUrl] = useState('');
  const [sceneVideoPreviewLoading, setSceneVideoPreviewLoading] = useState(false);
  const [sceneVideoPreviewError, setSceneVideoPreviewError] = useState('');
  const [sceneVideoPreviewSourceIn, setSceneVideoPreviewSourceIn] = useState(0);
  const [sceneVideoPreviewSourceOut, setSceneVideoPreviewSourceOut] = useState<number | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<WorkspaceAiContext['selectedTimelineItem']>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStoryboardId, setEditingStoryboardId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Storyboard | null>(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [style, setStyle] = useState('');
  const [mood, setMood] = useState('');
  const [tags, setTags] = useState('');
  const [detailOrigins, setDetailOrigins] = useState<Record<string, 'ai_suggested' | 'creator_edited'>>({});
  const [cachedStoryboardSuggestion, setCachedStoryboardSuggestion] = useState<{ key: string; suggestion: StoryboardSuggestion } | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [storyboardAiMessage, setStoryboardAiMessage] = useState('');
  const [sceneContinuityMessage, setSceneContinuityMessage] = useState('');

  const handleShotSequenceReady = (sequence: RunwayProjectShotSequenceReady) => {
    setActiveStoryboard((current) => {
      if (!current || current.id !== sequence.storyboardId) return current;
      const now = new Date().toISOString();
      let sceneMatched = false;
      let nextSceneInstances: MasterTimelineData['sceneInstances'];
      const scenes = (current.details?.scenes || []).map((scene) => {
        if (scene.id !== sequence.sceneId) return scene;
        sceneMatched = true;
        const project: SceneProjectData = scene.project || {
          id: crypto.randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, renderRevisionIds: [],
        };
        const timeline: SceneProjectTimeline = project.timeline || {
          duration: scene.duration, fps: 30, width: 1920, height: 1080, tracks: [],
        };
        const trackId = 'ai-director-shots-' + scene.id;
        const existingTrack = timeline.tracks.find((track) => track.id === trackId);
        const preservedManualClips = (existingTrack?.clips || []).filter((clip) => clip.source !== 'ai_director_shot');
        const existingDirectorClips = (existingTrack?.clips || []).filter((clip) => clip.source === 'ai_director_shot');
        const handoff = buildDirectorShotTimelineClips(existingDirectorClips, sequence.shots, sequence.replaceShot);
        const generatedClips = handoff.clips as SceneProjectClip[];
        const cursor = handoff.duration;
        const directorTrack: SceneProjectTrack = {
          id: trackId,
          type: 'video',
          name: 'AI Director Shots',
          clips: [...preservedManualClips, ...generatedClips],
        };
        const otherTracks = timeline.tracks
          .filter((track) => track.id !== trackId)
          .map((track) => ({
            ...track,
            clips: track.clips.filter((clip) => clip.source !== 'ai_director_shot'),
          }));
        const nextSceneDuration = Math.max(scene.duration, cursor);
        const masterTimeline: MasterTimelineData = current.details?.masterTimeline || {
          sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [],
        };
        const previousInstances = masterTimeline.sceneInstances || [];
        const previousInstance = previousInstances.find((instance) => instance.sceneId === scene.id);
        // Keep the Master Timeline playback mirror in sync with every
        // verified Video clip retained in the Scene's video tracks, including
        // manual clips preserved when an AI Director sequence is refreshed.
        const videoClips = [...otherTracks, directorTrack]
          .filter((track) => track.type === 'video')
          .flatMap((track) => track.clips)
          .filter((clip): clip is SceneProjectClip & { assetId: string; assetVersionId: string; assetMimeType: string } =>
            Boolean(clip.assetId && clip.assetVersionId && /^video\//i.test(clip.assetMimeType || '')))
          .sort((a, b) => a.start - b.start)
          .map((clip) => ({
            id: clip.id,
            name: clip.name,
            start: clip.start,
            duration: clip.duration,
            sourceIn: Math.max(0, clip.sourceIn ?? 0),
            sourceOut: Math.max(0, clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration),
            assetId: clip.assetId,
            assetVersionId: clip.assetVersionId,
            assetMimeType: clip.assetMimeType,
          }));
        const nextInstance = {
          ...(previousInstance || {
            id: scene.id, sceneId: scene.id, sourceIn: 0, sourceOut: nextSceneDuration,
          }),
          sceneId: scene.id,
          assetId: videoClips[0]?.assetId,
          assetVersionId: videoClips[0]?.assetVersionId,
          assetMimeType: videoClips[0]?.assetMimeType,
          videoSourceIn: videoClips[0]?.sourceIn ?? 0,
          videoSourceOut: videoClips[0]?.sourceOut,
          videoClips,
        };
        const nextInstances = previousInstance
          ? previousInstances.map((instance) => instance.sceneId === scene.id ? nextInstance : instance)
          : (() => {
              const sceneOrder = (current.details?.scenes || []).map((item) => item.id);
              const targetOrder = sceneOrder.indexOf(scene.id);
              const insertAt = previousInstances.findIndex((instance) => sceneOrder.indexOf(instance.sceneId) > targetOrder);
              const index = insertAt < 0 ? previousInstances.length : insertAt;
              return [...previousInstances.slice(0, index), nextInstance, ...previousInstances.slice(index)];
            })();
        nextSceneInstances = nextInstances;
        return {
          ...scene,
          duration: nextSceneDuration,
          project: {
            ...project,
            timeline: {
              ...timeline,
              duration: Math.max(timeline.duration, cursor),
              tracks: [...otherTracks, directorTrack],
            },
            updatedAt: now,
          },
        };
      });
      if (!sceneMatched) return current;
      return {
        ...current,
        details: {
          ...current.details,
          scenes,
          masterTimeline: {
            ...(current.details?.masterTimeline || { sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [] }),
            ...(nextSceneInstances ? { sceneInstances: nextSceneInstances } : {}),
          },
        },
        updatedAt: now,
      };
    });
  };
  const handleShotRepairHistory = (entry: SceneShotRepairHistoryEntry) => {
    setActiveStoryboard((current) => {
      if (!current || !current.details?.scenes?.some((scene) => scene.id === entry.sceneId)) return current;
      const now = new Date().toISOString();
      const scenes = (current.details.scenes || []).map((scene) => {
        if (scene.id !== entry.sceneId) return scene;
        const project: SceneProjectData = scene.project || {
          id: crypto.randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, renderRevisionIds: [],
        };
        const history = project.repairHistory || [];
        if (history.some((item) => item.id === entry.id)) return scene;
        return {
          ...scene,
          project: {
            ...project,
            // Append-only: never replace or edit an earlier repair event.
            repairHistory: [...history, entry],
            updatedAt: now,
          },
        };
      });
      return { ...current, details: { ...current.details, scenes }, updatedAt: now };
    });
  };
  const [sceneStartingContextDraft, setSceneStartingContextDraft] = useState('');
  const activeStartingContext = (() => {
    if (!activeStoryboard || !activeSceneId) return '';
    const scenes = activeStoryboard.details?.scenes || [];
    const ledger = hydrateSceneContinuityLedger(activeStoryboard.details?.continuityLedger, scenes);
    const state = getSceneContinuityContext(ledger, scenes, activeSceneId)?.currentEntryState;
    const story = state?.story;
    return story && typeof story === 'object' && !Array.isArray(story)
      && typeof (story as Record<string, unknown>).startingContext === 'string'
      ? (story as Record<string, string>).startingContext
      : '';
  })();
  useEffect(() => {
    setSceneStartingContextDraft(activeStartingContext);
  }, [activeStoryboard?.id, activeSceneId, activeStartingContext]);
  const lastAppliedSceneProposalRef = useRef<string | null>(null);
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);
  const updateDetail = (key: 'title' | 'topic' | 'category' | 'style' | 'mood' | 'tags', value: string) => {
    if (key === 'title') setTitle(value);
    else if (key === 'topic') setTopic(value);
    else if (key === 'category') setCategory(value);
    else if (key === 'style') setStyle(value);
    else if (key === 'mood') setMood(value);
    else setTags(value);
    setDetailOrigins((current) => ({ ...current, [key]: 'creator_edited' }));
  };
  type StoryboardSuggestion = { title: string; topic: string; category: string; style: string; mood: string; tags: string[]; provider: string; model: string; generatedAt: string };
  const requestStoryboardSuggestion = async (seedTitle: string, seedTopic: string, optional = false): Promise<StoryboardSuggestion | null> => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      if (optional) return null;
      throw new Error('Sign in before requesting AI suggestions.');
    }
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
        'Idempotency-Key': 'storyboard-details-' + crypto.randomUUID(),
      },
      body: JSON.stringify({
        task: 'suggest_details',
        detailsScope: 'storyboard',
        messages: [{ role: 'user', content: [
          'Suggest useful default metadata for a storyboard. Return JSON only. Use title, topic, category, style, mood and tags where supported. Put each field in the shape {"value":"..."}; tags may use {"value":["tag"]}.',
          'Do not invent facts when an idea is supplied. If both title and idea are blank, invent one suitable original short-video concept and concise metadata. The creator can edit every field.',
          'Current title: ' + seedTitle, 'Current idea: ' + seedTopic,
        ].join('\n') }],
      }),
    });
    const data = await response.json().catch(() => ({})) as { text?: string; error?: string; provider?: string; modelName?: string };
    if (!response.ok || !data.text) throw new Error(data.error || 'AI suggestions could not be generated.');
    const parsed = parseVyralAiSuggestions(data.text);
    const asText = (key: string) => typeof parsed[key]?.value === 'string'
      ? String(parsed[key].value).trim().slice(0, 500) : '';
    const rawTags = parsed.tags?.value;
    return {
      title: asText('title'), topic: asText('topic'), category: asText('category'),
      style: asText('style'), mood: asText('mood'),
      tags: Array.isArray(rawTags) ? rawTags.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
      provider: data.provider || 'gemini', model: data.modelName || 'unknown', generatedAt: new Date().toISOString(),
    };
  };
  const applyStoryboardSuggestionToForm = (suggestion: StoryboardSuggestion) => {
    const values = { title: suggestion.title, topic: suggestion.topic, category: suggestion.category, style: suggestion.style, mood: suggestion.mood, tags: suggestion.tags.join(', ') };
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      const value = values[key];
      if (!value || detailOrigins[key] === 'creator_edited') continue;
      if (key === 'title') setTitle(value);
      else if (key === 'topic') setTopic(value);
      else if (key === 'category') setCategory(value);
      else if (key === 'style') setStyle(value);
      else if (key === 'mood') setMood(value);
      else setTags(value);
      setDetailOrigins((current) => ({ ...current, [key]: 'ai_suggested' }));
    }
  };
  const suggestStoryboardDetails = async () => {
    const requestId = ++suggestionRequestIdRef.current;
    const requestStorageKey = storyboardStorageKeyRef.current;
    setSuggestionError('');
    setIsSuggesting(true);
    try {
      const suggestion = await requestStoryboardSuggestion(title, topic);
      // A response started under a previous account or superseded by a newer
      // request must never populate the current owner's form or suggestion cache.
      if (requestId !== suggestionRequestIdRef.current || requestStorageKey !== storyboardStorageKeyRef.current) return;
      if (suggestion) {
        setCachedStoryboardSuggestion({ key: workspaceStoryboardSuggestionKey(title, topic, detailOrigins), suggestion });
        applyStoryboardSuggestionToForm(suggestion);
      }
    } catch (error) {
      if (requestId === suggestionRequestIdRef.current && requestStorageKey === storyboardStorageKeyRef.current) {
        setSuggestionError(error instanceof Error ? error.message : 'AI suggestions are unavailable.');
      }
    } finally {
      if (requestId === suggestionRequestIdRef.current && requestStorageKey === storyboardStorageKeyRef.current) setIsSuggesting(false);
    }
  };
  const dialogRef = useRef<HTMLElement>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const workspaceScrollRef = useRef<HTMLElement>(null);
  const preservedWorkspaceScrollTopRef = useRef(0);
  const storyboardBarRef = useRef<HTMLElement>(null);
  const workspaceHeaderProgress = useRef(0);
  const workspaceBarTriggerScroll = useRef(0);
  const workspaceHeaderHeight = useRef(64);
  const workspaceTouchY = useRef<number | null>(null);
  const workspaceHeaderDirection = useRef(0);
  const workspaceHeaderStartProgress = useRef(0);
  const workspaceHeaderHandoff = useRef(0);
  const workspaceHeaderSettleTimer = useRef<number | null>(null);
  const storyboardControlsRef = useRef<HTMLDivElement>(null);
  const storyboardPreviewFrameRef = useRef<HTMLDivElement>(null);
  const storyboardPreviewProgress = useRef(0);
  const storyboardPreviewDrag = useRef<{ startY: number; lastY: number; lastAt: number; velocity: number; startProgress: number; moved: boolean; distance: number } | null>(null);
  const storyboardPreviewSettleTimer = useRef<number | null>(null);
  const visualViewport = useModalDialog(createOpen, dialogRef, dialogBodyRef);

  // Retained pages stay mounted to preserve their data, but transient dialogs
  // must not remain open (or keep the document scroll-locked) after navigation.
  useEffect(() => {
    if (!isActive) {
      setCreateOpen(false);
      setStoryboardToDelete(null);
    }
  }, [isActive]);

  useEffect(() => {
    setSceneContinuityMessage('');
  }, [activeSceneId]);

  useLayoutEffect(() => {
    const scroller = workspaceScrollRef.current;
    if (!scroller) return;
    // The parent hides this retained page before layout effects run, which
    // can reset the browser's scrollTop to zero. The onScroll handler already
    // captured the last visible position; never overwrite it while hidden.
    if (!isActive) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTop = preservedWorkspaceScrollTopRef.current;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);

  // Measure the sticky handoff point and fixed header dimensions once. Reading
  // layout geometry/computed styles on every touchmove forces synchronous
  // layout while the spacer and sticky bar are both changing.
  useLayoutEffect(() => {
    const scroller = workspaceScrollRef.current;
    const bar = storyboardBarRef.current;
    const root = document.documentElement;
    workspaceHeaderProgress.current = Math.max(0, Math.min(1, Number.parseFloat(getComputedStyle(root).getPropertyValue('--vyra-main-header-progress')) || 0));
    workspaceHeaderHeight.current = Number.parseFloat(getComputedStyle(root).getPropertyValue('--vyra-global-header-height')) || 64;
    if (scroller && bar) {
      workspaceBarTriggerScroll.current = Math.max(0, bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    }
  }, []);

  const settleWorkspaceMainHeader = () => {
    if (workspaceHeaderSettleTimer.current !== null) {
      window.clearTimeout(workspaceHeaderSettleTimer.current);
      workspaceHeaderSettleTimer.current = null;
    }
    if (workspaceHeaderDirection.current === 0) return;
    const root = document.documentElement;
    const current = workspaceHeaderProgress.current;
    // Match Profile subpages: finish the active direction after release.
    if (workspaceHeaderDirection.current < 0 && current > 0.001) {
      workspaceHeaderProgress.current = 0;
      window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: 0 }));
    } else if (workspaceHeaderDirection.current > 0 && current < 0.999) {
      workspaceHeaderProgress.current = 1;
      window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: 1 }));
    }
    root.classList.remove('is-header-dragging');
    workspaceHeaderDirection.current = 0;
    workspaceHeaderStartProgress.current = current;
    workspaceHeaderHandoff.current = 0;
  };

  // Returns the number of scroll pixels consumed by the two-header motion.
  // The remaining pixels are applied to the Workspace scroller manually, so
  // native scrolling cannot race the changing global-header spacer.
  const updateWorkspaceMainHeader = (deltaY: number, scheduleSettle = true): number => {
    if (!deltaY) return 0;
    const scroller = workspaceScrollRef.current;
    const bar = storyboardBarRef.current;
    if (!scroller || !bar) return 0;
    const direction = deltaY > 0 ? 1 : -1;
    const root = document.documentElement;
    const current = workspaceHeaderProgress.current;
    const barReachedTop = scroller.scrollTop >= workspaceBarTriggerScroll.current - 1;
    if (direction > 0 && current <= 0.001 && !barReachedTop) return 0;
    if (direction < 0 && current <= 0.001) return 0;

    if (workspaceHeaderDirection.current !== direction) {
      workspaceHeaderHandoff.current = 0;
      workspaceHeaderStartProgress.current = current;
    }
    workspaceHeaderDirection.current = direction;
    root.classList.add('is-header-dragging');

    const handoff = direction > 0 ? 28 : 64;
    const total = Math.abs(deltaY);
    const buffer = Math.min(total, Math.max(0, handoff - workspaceHeaderHandoff.current));
    workspaceHeaderHandoff.current += buffer;
    const movement = total - buffer;
    let moved = 0;
    if (movement > 0) {
      const distance = workspaceHeaderHeight.current;
      const next = direction > 0
        ? Math.min(1, current + movement / distance)
        : Math.max(0, current - movement / distance);
      moved = Math.abs(next - current) * distance;
      if (Math.abs(next - current) > 0.0001) {
        workspaceHeaderProgress.current = next;
        window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: next }));
      }
    }

    if (scheduleSettle) {
      if (workspaceHeaderSettleTimer.current !== null) window.clearTimeout(workspaceHeaderSettleTimer.current);
      workspaceHeaderSettleTimer.current = window.setTimeout(settleWorkspaceMainHeader, 140);
    }
    return Math.min(total, buffer + moved);
  };

  const handleWorkspaceWheel = (event: React.WheelEvent<HTMLElement>) => {
    const consumed = updateWorkspaceMainHeader(event.deltaY);
    if (consumed <= 0) return;
    event.preventDefault();
    const remaining = Math.abs(event.deltaY) - consumed;
    if (remaining > 0 && workspaceScrollRef.current) {
      workspaceScrollRef.current.scrollTop = Math.max(0, workspaceScrollRef.current.scrollTop + Math.sign(event.deltaY) * remaining);
    }
  };
  const handleWorkspaceTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (workspaceHeaderSettleTimer.current !== null) {
      window.clearTimeout(workspaceHeaderSettleTimer.current);
      workspaceHeaderSettleTimer.current = null;
    }
    workspaceTouchY.current = event.touches[0]?.clientY ?? null;
  };
  const handleWorkspaceTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const y = event.touches[0]?.clientY;
    const scroller = workspaceScrollRef.current;
    if (y === undefined || workspaceTouchY.current === null || !scroller) return;
    const delta = workspaceTouchY.current - y;
    workspaceTouchY.current = y;
    if (!delta) return;
    const consumed = updateWorkspaceMainHeader(delta, false);
    // Keep vertical touch scrolling under one owner. Letting the browser's
    // native pan compete with manual scrollTop updates causes the sticky bar
    // and the global-header spacer to jump against each other.
    event.preventDefault();
    const remaining = Math.max(0, Math.abs(delta) - consumed);
    if (remaining > 0) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + Math.sign(delta) * remaining);
    }
  };
  const handleWorkspaceTouchEnd = () => {
    workspaceTouchY.current = null;
    settleWorkspaceMainHeader();
  };

  // The Editor View Switcher is a dedicated preview-size grip. Its vertical
  // gesture is isolated from the page's Storyboard/Main Header scroll motion.
  const setStoryboardPreviewCompactProgress = (progress: number) => {
    const next = Math.max(0, Math.min(1, progress));
    storyboardPreviewProgress.current = next;
    const collapsedPercent = Math.round(next * 52 * 100) / 100;
    storyboardControlsRef.current?.style.setProperty(
      '--storyboard-preview-frame-width',
      `calc(100% - ${collapsedPercent}%)`,
    );
  };

  const settleStoryboardPreview = (target?: number) => {
    if (storyboardPreviewSettleTimer.current !== null) {
      window.clearTimeout(storyboardPreviewSettleTimer.current);
      storyboardPreviewSettleTimer.current = null;
    }
    const next = target ?? (storyboardPreviewProgress.current >= 0.48 ? 1 : 0);
    // Let the drag style commit before restoring the normal easing transition.
    window.requestAnimationFrame(() => {
      document.documentElement.classList.remove('is-storyboard-preview-dragging');
      window.requestAnimationFrame(() => setStoryboardPreviewCompactProgress(next));
    });
  };

  const handleStoryboardPreviewTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    if (storyboardPreviewSettleTimer.current !== null) {
      window.clearTimeout(storyboardPreviewSettleTimer.current);
      storyboardPreviewSettleTimer.current = null;
    }
    storyboardPreviewDrag.current = {
      startY: touch.clientY,
      lastY: touch.clientY,
      lastAt: Date.now(),
      velocity: 0,
      startProgress: storyboardPreviewProgress.current,
      moved: false,
      distance: 0,
    };
    // Do not let this gesture reach the generic page/header scroll handlers.
    event.stopPropagation();
  };

  const handleStoryboardPreviewTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const drag = storyboardPreviewDrag.current;
    if (!touch || !drag || event.touches.length !== 1) return;
    event.stopPropagation();
    const totalDelta = drag.startY - touch.clientY;
    if (Math.abs(totalDelta) < 4 && !drag.moved) return;
    drag.moved = true;
    drag.distance = Math.abs(totalDelta);
    const now = Date.now();
    const elapsed = Math.max(1, now - drag.lastAt);
    drag.velocity = (drag.lastY - touch.clientY) / elapsed;
    drag.lastY = touch.clientY;
    drag.lastAt = now;
    event.preventDefault();
    document.documentElement.classList.add('is-storyboard-preview-dragging');
    setStoryboardPreviewCompactProgress(drag.startProgress + totalDelta / 118);
  };

  const finishStoryboardPreviewTouch = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const drag = storyboardPreviewDrag.current;
    storyboardPreviewDrag.current = null;
    if (!drag?.moved) return;
    const current = storyboardPreviewProgress.current;
    const flicked = drag.distance >= 24 && Math.abs(drag.velocity) >= 0.55;
    const target = flicked ? (drag.velocity > 0 ? 1 : 0) : (current >= 0.48 ? 1 : 0);
    settleStoryboardPreview(target);
  };

  const handleStoryboardPreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.deltaY) return;
    const current = storyboardPreviewProgress.current;
    const next = Math.max(0, Math.min(1, current + event.deltaY / 150));
    if (Math.abs(next - current) < 0.001) return;
    event.preventDefault();
    event.stopPropagation();
    document.documentElement.classList.add('is-storyboard-preview-dragging');
    setStoryboardPreviewCompactProgress(next);
    if (storyboardPreviewSettleTimer.current !== null) window.clearTimeout(storyboardPreviewSettleTimer.current);
    storyboardPreviewSettleTimer.current = window.setTimeout(() => {
      settleStoryboardPreview();
    }, 170);
  };

  useEffect(() => {
    storyboardPreviewProgress.current = 0;
    storyboardControlsRef.current?.style.setProperty('--storyboard-preview-frame-width', '100%');
    return () => {
      if (storyboardPreviewSettleTimer.current !== null) {
        window.clearTimeout(storyboardPreviewSettleTimer.current);
        storyboardPreviewSettleTimer.current = null;
      }
      storyboardPreviewDrag.current = null;
      document.documentElement.classList.remove('is-storyboard-preview-dragging');
    };
  }, [activeStoryboard?.id]);


  useEffect(() => {
    let cancelled = false;
    const sceneInstance = activeStoryboard?.details?.masterTimeline?.sceneInstances?.find((item) => item.sceneId === activeSceneId);
    const assetId = sceneInstance?.assetId;
    const versionId = sceneInstance?.assetVersionId;
    const mimeType = sceneInstance?.assetMimeType || '';
    const sourceIn = sceneInstance?.videoSourceIn ?? 0;
    setSceneVideoPreviewUrl('');
    setSceneVideoPreviewError('');
    setSceneVideoPreviewSourceIn(sourceIn);
    setSceneVideoPreviewSourceOut(typeof sceneInstance?.videoSourceOut === 'number' ? sceneInstance.videoSourceOut : null);
    if (!activeSceneId || !assetId || !versionId || !mimeType.toLowerCase().startsWith('video/')) {
      setSceneVideoPreviewLoading(false);
      return () => { cancelled = true; };
    }
    if (!supabase) {
      setSceneVideoPreviewLoading(false);
      setSceneVideoPreviewError('Private Video Storage is not configured.');
      return () => { cancelled = true; };
    }
    setSceneVideoPreviewLoading(true);
    void createVyralVideoPlaybackUrl(supabase, { assetId, versionId })
      .then((result) => { if (!cancelled) setSceneVideoPreviewUrl(result.signedUrl); })
      .catch((error) => {
        if (!cancelled) setSceneVideoPreviewError(error instanceof Error ? error.message : 'The private Video Asset could not be opened.');
      })
      .finally(() => { if (!cancelled) setSceneVideoPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [
    activeStoryboard?.id,
    activeSceneId,
    activeStoryboard?.details?.masterTimeline?.sceneInstances,
  ]);

  useEffect(() => {
    const scenes = activeStoryboard?.details?.scenes ?? [];
    const context: WorkspaceAiContext = {
      page: activeSceneId ? 'scene-editor' : activeStoryboard ? 'storyboard-editor' : 'storyboards',
      pageLabel: activeSceneId ? 'Workspace / Scene Editor' : activeStoryboard ? 'Workspace / Storyboard Editor' : 'Workspace / Storyboards',
      activeStoryboard: activeStoryboard ? {
        id: activeStoryboard.id,
        title: activeStoryboard.title,
        topic: activeStoryboard.topic.slice(0, 1200),
        sceneCount: scenes.length,
        sceneTitles: scenes.slice(0, 30).map((scene) => scene.title),
      } : null,
      ...(activeStoryboard ? { editorView: storyboardEditorView } : {}),
      storyboardUniverse: storyboardUniverse ? { ...storyboardUniverse } : null,
      selectedSceneIds: selectedSceneIds.slice(0, 30),
      selectedSceneTitles: selectedSceneIds.slice(0, 30).map((id) => scenes.find((scene) => scene.id === id)?.title || 'Untitled scene'),
      activeSceneId,
      activeSceneTitle: scenes.find((scene) => scene.id === activeSceneId)?.title ?? null,
      activeSceneDescription: scenes.find((scene) => scene.id === activeSceneId)?.description?.slice(0, 1800) ?? null,
      continuityRuntime: activeStoryboard ? (() => {
        const ledger = hydrateSceneContinuityLedger(activeStoryboard.details?.continuityLedger, scenes);
        const activeContinuity = activeSceneId ? getSceneContinuityContext(ledger, scenes, activeSceneId) : null;
        return {
          storyboardId: activeStoryboard.id,
          sceneIds: scenes.slice(0, 500).map((scene) => scene.id),
          scenes: scenes.slice(0, 500).map((scene) => ({
            id: scene.id, title: scene.title.slice(0, 180), description: scene.description.slice(0, 1200),
            ...(scene.project?.creativeDirection ? { creativeDirection: scene.project.creativeDirection } : {}),
          })),
          ledger: JSON.stringify(ledger).length <= 48_000 ? ledger : null,
          initialEntryState: activeContinuity?.previousSceneId === null && !activeContinuity.entrySnapshotStale
            ? activeContinuity.currentEntryState : null,
        };
      })() : null,
      sceneContinuity: activeStoryboard && activeSceneId ? (() => {
        const ledger = hydrateSceneContinuityLedger(activeStoryboard.details?.continuityLedger, scenes);
        const continuity = getSceneContinuityContext(ledger, scenes, activeSceneId);
        if (!continuity) return null;
        const record = ledger.scenes[activeSceneId];
        const boundedObject = (value: Record<string, unknown> | null) => {
          if (!value) return null;
          try {
            const serialized = JSON.stringify(value);
            return typeof serialized === 'string' && serialized.length <= 6000 ? JSON.parse(serialized) as Record<string, unknown> : null;
          } catch { return null; }
        };
        return {
          previousSceneId: continuity.previousSceneId,
          previousSceneApproved: continuity.previousSceneApproved,
          entrySnapshotStale: continuity.entrySnapshotStale,
          previousExitState: boundedObject(continuity.previousExitState),
          currentEntryState: boundedObject(continuity.currentEntryState),
          intendedChanges: continuity.intendedChanges.slice(0, 12).map((change) => ({
            path: change.path.slice(0, 200),
            value: change.value,
            reason: change.reason.slice(0, 300),
          })),
          contextComplete: continuity.contextComplete && (!continuity.previousExitState || boundedObject(continuity.previousExitState) !== null),
          validationStatus: record.validationStatus,
        };
      })() : null,
      activeSceneDirectorShots: (scenes.find((scene) => scene.id === (selectedTimelineItem?.kind === 'scene' ? selectedTimelineItem.id : activeSceneId))?.project?.timeline?.tracks ?? [])
        .filter((track) => track.type === 'video')
        .flatMap((track) => track.clips)
        .filter((clip) => clip.source === 'ai_director_shot' && clip.shotId && clip.assetId && clip.assetVersionId && /^video\//i.test(clip.assetMimeType || ''))
        .map((clip) => ({
          shotId: clip.shotId!,
          shotIndex: (scenes.find((scene) => scene.id === (selectedTimelineItem?.kind === 'scene' ? selectedTimelineItem.id : activeSceneId))?.project?.creativeDirection?.shots ?? []).findIndex((shot) => shot.id === clip.shotId),
          assetId: clip.assetId!,
          assetVersionId: clip.assetVersionId!,
          mimeType: clip.assetMimeType!,
        }))
        .filter((clip) => clip.shotIndex >= 0)
        .slice(0, 30),
      activeSceneRepairHistory: (scenes.find((scene) => scene.id === (selectedTimelineItem?.kind === 'scene' ? selectedTimelineItem.id : activeSceneId))?.project?.repairHistory ?? [])
        .slice(-12)
        .map((entry) => ({
          shotIndex: entry.shotIndex,
          outcome: entry.outcome,
          createdAt: entry.createdAt,
          baselineRevision: entry.baselineRevision,
          checkedBoundaryIndices: entry.checkedBoundaryIndices.slice(0, 30),
          findings: entry.findings.slice(0, 12).map((finding) => finding.slice(0, 320)),
          approvedCostUsd: entry.approvedCostUsd,
        })),
      selectedTimelineItem: selectedTimelineItem ?? null,
      capturedAt: new Date().toISOString(),
    };
    setLocalWorkspaceAiContext(context);
    onAiContextChange?.(context);
  }, [onAiContextChange, activeStoryboard, storyboardEditorView, storyboardUniverse, selectedSceneIds, activeSceneId, selectedTimelineItem]);

  useLayoutEffect(() => {
    const storageOwnerChanged = storyboardStorageKeyRef.current !== storageKey;
    if (storageOwnerChanged) {
      // Workspace stays mounted across navigation and auth changes. Clear every
      // owner-bound editor surface before painting the next account's workspace.
      storyboardStorageKeyRef.current = storageKey;
      deletedStoryboardIdsRef.current.clear();
      suggestionRequestIdRef.current += 1;
      lastStoryboardSyncAtRef.current = 0;
      setActiveStoryboard(null);
      setStoryboardUniverse(null);
      setActiveStoryboardConfirmed(false);
      setStoryboardToDelete(null);
      setIsDeletingStoryboard(false);
      setEditingStoryboardId(null);
      setEditDraft(null);
      setCreateOpen(false);
      setTitle('');
      setTopic('');
      setCategory('');
      setStyle('');
      setMood('');
      setTags('');
      setDetailOrigins({});
      setCachedStoryboardSuggestion(null);
      setSuggestionError('');
      setIsSuggesting(false);
      setStoryboardDetailsExpanded(false);
      setStoryboardEditorView('chat');
      setSelectedSceneIds([]);
      setActiveSceneId(null);
      setSelectedTimelineItem(null);
      setSceneVideoPreviewUrl('');
      setSceneVideoPreviewLoading(false);
      setSceneVideoPreviewError('');
      setSceneVideoPreviewSourceIn(0);
      setSceneVideoPreviewSourceOut(null);
      setCloudSyncMessage('');
      setStoryboardAiMessage('');
    }
    setStoryboards(readStoryboards(storageKey));
    setLoadedStorageKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(storyboards)); } catch { /* Keep this session usable. */ }
  }, [storageKey, loadedStorageKey, storyboards]);

  useEffect(() => {
    const proposal = pendingSceneStateProposal;
    if (!proposal || !activeStoryboard || proposal.storyboardId !== activeStoryboard.id ||
        lastAppliedSceneProposalRef.current === proposal.id) return;
    const scenes = activeStoryboard.details?.scenes || [];
    if (!scenes.some((scene) => scene.id === proposal.sceneId)) return;
    const currentLedger = hydrateSceneContinuityLedger(activeStoryboard.details?.continuityLedger, scenes);
    if (!isSceneContinuityLedgerSnapshotCurrent(currentLedger, proposal.evaluatedAgainstLedger, scenes)) {
      lastAppliedSceneProposalRef.current = proposal.id;
      setSceneContinuityMessage('This proposal was evaluated against an older continuity snapshot. It was not applied because the Storyboard changed while AI was working. Generate the Scene proposal again.');
      onSceneStateProposalConsumed?.(proposal.id);
      return;
    }
    lastAppliedSceneProposalRef.current = proposal.id;
    setActiveStoryboard((current) => current?.id === proposal.storyboardId ? {
      ...current,
      details: { ...current.details, continuityLedger: proposal.ledger as SceneContinuityLedger },
      updatedAt: new Date().toISOString(),
    } : current);
    setSceneContinuityMessage(proposal.validationStatus === 'consistent'
      ? 'AI Scene-state proposal evaluated successfully. Review it, then approve it to make it canon.'
      : 'AI Scene-state proposal needs review. Continuity violations were found; it has not been approved.');
    onSceneStateProposalConsumed?.(proposal.id);
  }, [pendingSceneStateProposal, activeStoryboard?.id, activeStoryboard?.details?.scenes, onSceneStateProposalConsumed]);

  useEffect(() => {
    if (!activeStoryboard || !activeStoryboardConfirmed) return;
    const snapshot = activeStoryboard;
    const timer = window.setTimeout(() => {
      const saved = { ...snapshot, updatedAt: new Date().toISOString() };
      setStoryboards((current) => current.map((item) => item.id === saved.id ? saved : item));
      void persistStoryboard(saved);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeStoryboard, activeStoryboardConfirmed]);

  useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>('.profile-subpage-content');
    if (content) updateStoryboardHeaderCompact(content);
  }, [activeStoryboard?.id, activeStoryboard?.title, activeStoryboard?.topic, activeStoryboardConfirmed]);

  const persistStoryboard = async (item: Storyboard) => {
    const client = supabase;
    if (!isAuthenticated || !client || !isPersistableStoryboardId(item.id) || deletedStoryboardIdsRef.current.has(item.id)) return;

    // Serialize writes per Storyboard so a slower older snapshot cannot
    // overwrite a newer Editor/AI update in the cloud.
    const previousSave = storyboardSaveQueueRef.current.get(item.id) || Promise.resolve();
    let saveTask!: Promise<void>;
    saveTask = previousSave.catch(() => undefined).then(async () => {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        if (storyboardSaveQueueRef.current.get(item.id) === saveTask) {
          setCloudSyncMessage('Could not sync this Storyboard. Sign in again to retry.');
        }
        return;
      }
      const payload = {
        id: item.id, user_id: authData.user.id, title: item.title, topic: item.topic,
        details: item.details ?? {}, created_at: item.createdAt, updated_at: item.updatedAt,
      };
      // Update only a live row. A tombstone is immutable to stale device saves.
      const { data: updatedRow, error: updateError } = await client.from('vyral_storyboards')
        .update({
          title: payload.title, topic: payload.topic, details: payload.details,
          created_at: payload.created_at, updated_at: payload.updated_at,
        })
        .eq('id', item.id).eq('user_id', authData.user.id)
        .is('details->>__vyraDeletedAt', null)
        .lte('updated_at', item.updatedAt)
        .select('id').maybeSingle();
      let saveError = updateError;
      if (!saveError && !updatedRow) {
        // Insert only when the row is absent. Never use upsert here: it could
        // overwrite a deletion tombstone created on another device.
        const { error: insertError } = await client.from('vyral_storyboards').insert(payload);
        if (insertError) {
          const { data: latestRow, error: latestError } = await client.from('vyral_storyboards')
            .select('details').eq('id', item.id).eq('user_id', authData.user.id).maybeSingle();
          const latestDetails = latestRow?.details && typeof latestRow.details === 'object'
            ? latestRow.details as Record<string, unknown>
            : {};
          const deletionWon = typeof latestDetails.__vyraDeletedAt === 'string';
          saveError = deletionWon ? null : (latestError || insertError);
        }
      }
      if (storyboardSaveQueueRef.current.get(item.id) === saveTask) {
        setCloudSyncMessage(saveError ? 'Cloud sync is unavailable. This Storyboard is saved on this device.' : '');
      }
    });
    storyboardSaveQueueRef.current.set(item.id, saveTask);
    try {
      await saveTask;
    } finally {
      if (storyboardSaveQueueRef.current.get(item.id) === saveTask) {
        storyboardSaveQueueRef.current.delete(item.id);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    let syncInFlight = false;
    let isPageActive = isActive;
    const client = supabase;
    if (!isAuthenticated || !client || loadedStorageKey !== storageKey || !isActive) return;
    const syncStoryboards = async (quiet = false) => {
      if (syncInFlight || cancelled) return;
      syncInFlight = true;
      if (!quiet) setCloudSyncMessage('Syncing your Storyboards…');
      try {
        const { data: authData, error: authError } = await client.auth.getUser();
        if (cancelled) return;
        if (authError || !authData.user) {
          setCloudSyncMessage('Sign in again to sync your Storyboards.');
          return;
        }
        const { data, error: loadError } = await client.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id).order('updated_at', { ascending: false });
        if (cancelled) return;
        if (loadError) {
          setCloudSyncMessage('Cloud sync is unavailable. Your device copy is still available.');
          return;
        }
        const remote = (data ?? []).map((row) => ({
          id: row.id as string, title: row.title as string, topic: row.topic as string,
          details: (() => { const details = (row.details ?? {}) as NonNullable<Storyboard['details']>; return { ...details, continuityLedger: hydrateSceneContinuityLedger(details.continuityLedger, details.scenes || []) }; })(),
          createdAt: row.created_at as string, updatedAt: row.updated_at as string,
        }));
        const { storyboards: mergedStoryboards, pending } = mergeWorkspaceStoryboards(readStoryboards(storageKey), remote);
        // Route merge uploads through the same per-Project queue as ordinary
        // saves so Delete can drain every write before removing the cloud row.
        const pendingToUpload = pending.filter((item) => !deletedStoryboardIdsRef.current.has(item.id));
        if (pendingToUpload.length) {
          await Promise.all(pendingToUpload.map((item) => persistStoryboard(item)));
          if (cancelled) return;
        }
        if (cancelled) return;
        lastStoryboardSyncAtRef.current = Date.now();
        setStoryboards(mergedStoryboards.filter((item) => !deletedStoryboardIdsRef.current.has(item.id)));
        // persistStoryboard owns the status message for queued uploads. Only
        // clear it here when this sync did not need to upload any local rows.
        if (!pendingToUpload.length) setCloudSyncMessage('');
      } catch {
        if (!cancelled) setCloudSyncMessage('Cloud sync is unavailable. Your device copy is still available.');
      } finally {
        syncInFlight = false;
      }
    };
    const handlePageActivated = (event: Event) => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page ?? '';
      isPageActive = page === 'workspace';
      if (isPageActive && Date.now() - lastStoryboardSyncAtRef.current >= 30_000) {
        void syncStoryboards(true);
      }
    };
    const handleFocus = () => {
      if (isPageActive && document.visibilityState === 'visible' && Date.now() - lastStoryboardSyncAtRef.current >= 30_000) {
        void syncStoryboards(true);
      }
    };
    window.addEventListener('vyra:page-activated', handlePageActivated);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    if (lastStoryboardSyncAtRef.current === 0) void syncStoryboards(false);
    else if (Date.now() - lastStoryboardSyncAtRef.current >= 30_000) void syncStoryboards(true);
    return () => {
      cancelled = true;
      window.removeEventListener('vyra:page-activated', handlePageActivated);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [storageKey, isAuthenticated, isActive, loadedStorageKey]);

  const openStoryboardEditor = (item: Storyboard) => { setSelectedSceneIds([]); setActiveSceneId(null); setStoryboardUniverse(null); setStoryboardEditorView('chat'); setStoryboardDetailsExpanded(false); setActiveStoryboard({ ...item, details: { ...item.details, tags: [...(item.details?.tags || [])], origins: { ...item.details?.origins } } }); setActiveStoryboardConfirmed(true); setStoryboardAiMessage(''); };

  // Resolve the requested Project before the browser paints the editor host.
  // This prevents the retired Workspace landing page from flashing for one frame.
  useLayoutEffect(() => {
    if (!openUniverseRequest || loadedStorageKey !== storageKey || lastOpenedUniverseRequestRef.current === openUniverseRequest.requestId) return;
    const item = storyboards.find((storyboard) => storyboard.id === openUniverseRequest.storyboardId);
    if (item) {
      lastOpenedUniverseRequestRef.current = openUniverseRequest.requestId;
      openStoryboardEditor(item);
    }
  }, [openUniverseRequest?.requestId, openUniverseRequest?.storyboardId, loadedStorageKey, storageKey, storyboards]);

  const confirmDeleteStoryboard = async () => {
    if (!storyboardToDelete || isDeletingStoryboard) return;
    setIsDeletingStoryboard(true);
    const item = storyboardToDelete;
    const client = supabase;
    // Block new writes and drain any queued save before deleting, otherwise a
    // late upsert could recreate a Project that the creator just removed.
    deletedStoryboardIdsRef.current.add(item.id);
    const queuedSave = storyboardSaveQueueRef.current.get(item.id);
    if (queuedSave) await queuedSave.catch(() => undefined);
    if (isAuthenticated && client && isPersistableStoryboardId(item.id)) {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        deletedStoryboardIdsRef.current.delete(item.id);
        setCloudSyncMessage('Sign in again before deleting this Storyboard.');
        setIsDeletingStoryboard(false);
        return;
      }
      const deletionDetails = {
        ...(item.details ?? {}),
        __vyraDeletedAt: new Date().toISOString(),
      };
      // Keep a small cloud tombstone so another device's stale local cache
      // cannot interpret the missing row as a new Project and upload it again.
      const { error: deleteError } = await client.from('vyral_storyboards')
        .update({ details: deletionDetails, updated_at: deletionDetails.__vyraDeletedAt })
        .eq('id', item.id).eq('user_id', authData.user.id);
      if (deleteError) {
        deletedStoryboardIdsRef.current.delete(item.id);
        setCloudSyncMessage('Could not delete this Storyboard from the cloud. Please try again.');
        setIsDeletingStoryboard(false);
        return;
      }
    }
    setStoryboards((current) => current.filter((storyboard) => storyboard.id !== item.id));
    setStoryboardToDelete(null);
    setIsDeletingStoryboard(false);
    setCloudSyncMessage('');
  };
  useLayoutEffect(() => {
    if (createUniverseRequest > 0 && isActive) createDefaultStoryboardRef.current();
  }, [createUniverseRequest, isActive]);

  const saveStoryboardEdits = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editDraft || !editingStoryboardId) return;
    const now = new Date().toISOString();
    const updated: Storyboard = { ...editDraft, title: editDraft.title.trim() || editDraft.topic.trim().slice(0, 100) || 'Untitled Storyboard', topic: editDraft.topic.trim(), updatedAt: now, details: { ...editDraft.details, tags: (editDraft.details?.tags || []).map((tag) => tag.trim()).filter(Boolean) } };
    setStoryboards((current) => current.map((item) => item.id === editingStoryboardId ? updated : item));
    void persistStoryboard(updated);
    setEditingStoryboardId(null); setEditDraft(null);
  };

  const createStoryboard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) { onLoginRequired(); return; }
    setIsSuggesting(true);
    setSuggestionError('');
    setStoryboardAiMessage('');
    let nextTitle = title.trim();
    let nextTopic = topic.trim();
    let nextCategory = category.trim();
    let nextStyle = style.trim();
    let nextMood = mood.trim();
    let nextTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const nextOrigins = { ...detailOrigins };
    let aiProvenance: StoryboardAiProvenance | undefined;
    // Reuse a just-reviewed suggestion instead of charging for a duplicate AI request.
    // Generate fresh defaults only when the idea changed since the last suggestion.
    if (nextTitle || nextTopic) {
      try {
        const key = workspaceStoryboardSuggestionKey(nextTitle, nextTopic, nextOrigins);
        const suggestion = cachedStoryboardSuggestion?.key === key
          ? cachedStoryboardSuggestion.suggestion
          : await requestStoryboardSuggestion(nextTitle, nextTopic, true);
        if (suggestion) {
          aiProvenance = { provider: suggestion.provider, model: suggestion.model, generatedAt: suggestion.generatedAt };
          setCachedStoryboardSuggestion({ key, suggestion });
          const apply = (field: 'title' | 'topic' | 'category' | 'style' | 'mood', value: string) => {
            if (!value || nextOrigins[field] === 'creator_edited') return value;
            nextOrigins[field] = 'ai_suggested';
            return value;
          };
          if (suggestion.title && nextOrigins.title !== 'creator_edited') nextTitle = apply('title', suggestion.title);
          if (suggestion.topic && nextOrigins.topic !== 'creator_edited') nextTopic = apply('topic', suggestion.topic);
          if (suggestion.category && nextOrigins.category !== 'creator_edited') nextCategory = apply('category', suggestion.category);
          if (suggestion.style && nextOrigins.style !== 'creator_edited') nextStyle = apply('style', suggestion.style);
          if (suggestion.mood && nextOrigins.mood !== 'creator_edited') nextMood = apply('mood', suggestion.mood);
          if (suggestion.tags.length && nextOrigins.tags !== 'creator_edited') { nextTags = suggestion.tags; nextOrigins.tags = 'ai_suggested'; }
        }
      } catch (error) {
        setStoryboardAiMessage('Storyboard saved. AI details could not be generated this time; you can edit them later.');
      }
    }
    const now = new Date().toISOString();
    const next: Storyboard = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'storyboard-' + Date.now().toString(36),
      title: nextTitle || nextTopic.slice(0, 100) || 'Untitled Storyboard',
      topic: nextTopic, createdAt: now, updatedAt: now,
      details: { category: nextCategory, style: nextStyle, mood: nextMood, tags: nextTags, origins: nextOrigins, scenes: [], continuityLedger: hydrateSceneContinuityLedger(undefined, []), ...(aiProvenance ? { ai_provenance: aiProvenance } : {}) },
    };
    setStoryboards((current) => [next, ...current]);
    void persistStoryboard(next);
    setTitle(''); setTopic(''); setCategory(''); setStyle(''); setMood(''); setTags(''); setDetailOrigins({}); setCachedStoryboardSuggestion(null); setCreateOpen(false);
    setIsSuggesting(false);
  };

  const createDefaultStoryboard = () => {
    if (!isAuthenticated) { onLoginRequired(); return; }
    const now = new Date().toISOString();
    const storyboard: Storyboard = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'storyboard-' + Date.now().toString(36),
      title: 'New Project',
      topic: '',
      createdAt: now,
      updatedAt: now,
      details: { category: '', style: '', mood: '', tags: [], origins: {}, scenes: [], continuityLedger: hydrateSceneContinuityLedger(undefined, []) },
    };
    setSelectedSceneIds([]);
    setActiveSceneId(null);
    setStoryboardUniverse(null);
    setActiveStoryboard(storyboard);
    setActiveStoryboardConfirmed(true);
    setStoryboardDetailsExpanded(false);
    setStoryboardEditorView('chat');
    setStoryboardAiMessage('');
    setStoryboards((current) => [storyboard, ...current.filter((item) => item.id !== storyboard.id)]);
    void persistStoryboard(storyboard);
  };
  createDefaultStoryboardRef.current = createDefaultStoryboard;

  const cancelStoryboardDraft = () => {
    setActiveStoryboard(null);
    setStoryboardUniverse(null);
    setActiveStoryboardConfirmed(false);
    setStoryboardDetailsExpanded(true);
    setStoryboardEditorView('chat');
    setStoryboardAiMessage('');
  };

  const confirmStoryboardDraft = () => {
    if (!activeStoryboard) return;
    const confirmed: Storyboard = {
      ...activeStoryboard,
      title: activeStoryboard.title.trim() || 'Untitled Storyboard',
      topic: activeStoryboard.topic.trim(),
      updatedAt: new Date().toISOString(),
    };
    setStoryboards((current) => [confirmed, ...current.filter((item) => item.id !== confirmed.id)]);
    void persistStoryboard(confirmed);
    setActiveStoryboard(confirmed);
    setActiveStoryboardConfirmed(true);
    setStoryboardDetailsExpanded(false);
    setStoryboardEditorView('chat');
    setStoryboardAiMessage('');
  };

  const updateActiveStoryboard = (field: 'title' | 'topic' | 'category' | 'style' | 'mood' | 'tags', value: string) => {
    setActiveStoryboard((current) => {
      if (!current) return current;
      const details = current.details || {};
      const isDetail = field !== 'title' && field !== 'topic';
      const origins = { ...details.origins, [field]: 'creator_edited' as const };
      return {
        ...current,
        ...(field === 'title' ? { title: value } : {}),
        ...(field === 'topic' ? { topic: value } : {}),
        details: {
          ...details,
          ...(field === 'category' || field === 'style' || field === 'mood' ? { [field]: value } : {}),
          ...(field === 'tags' ? { tags: value.split(',').map((tag) => tag.trim()).filter(Boolean) } : {}),
          origins,
        },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const saveActiveStoryboard = () => {
    if (!activeStoryboard || !activeStoryboardConfirmed) return;
    const saved = { ...activeStoryboard, updatedAt: new Date().toISOString() };
    setActiveStoryboard(saved);
    setStoryboards((current) => current.map((item) => item.id === saved.id ? saved : item));
    void persistStoryboard(saved);
    setStoryboardAiMessage('Changes saved.');
  };

  // While a card-open request is resolving, never render the legacy Workspace
  // landing page as a transient fallback. The requested Storyboard will replace
  // this lightweight state as soon as its local record is available.
  if (openUniverseRequest && !activeStoryboard && lastOpenedUniverseRequestRef.current !== openUniverseRequest.requestId) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-[var(--vyra-bg-canvas)]">
        <div role="status" className="text-sm text-[var(--vyra-text-muted)]">Opening Project…</div>
      </main>
    );
  }

  if (activeStoryboard && activeSceneId) {
    const scene = (activeStoryboard.details?.scenes || []).find((item) => item.id === activeSceneId);
    if (scene) {
      const updateActiveScene = (patch: Partial<StoryboardScene>) => setActiveStoryboard((current) => {
        if (!current) return current;
        const now = new Date().toISOString();
        const currentScenes = current.details?.scenes || [];
        const nextScenes = currentScenes.map((item) => item.id === scene.id ? {
          ...item,
          ...patch,
          project: patch.project ? { ...(item.project || patch.project), ...patch.project, updatedAt: now } : item.project ? { ...item.project, updatedAt: now } : item.project,
        } : item);
        const details = {
          ...current.details,
          scenes: nextScenes,
          // Editing a Scene invalidates its old approval. Preserve the old
          // exit state as history, but block it from the next Scene's handoff.
          continuityLedger: invalidateSceneContinuity(
            current.details?.continuityLedger,
            currentScenes,
            scene.id,
            now,
          ),
        };
        if (patch.project?.timeline) {
          const master: MasterTimelineData = current.details?.masterTimeline || {
            sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [],
          };
          const previousInstances = master.sceneInstances || [];
          const previousInstance = previousInstances.find((instance) => instance.sceneId === scene.id);
          const videoClips = patch.project.timeline.tracks
            .filter((track) => track.type === 'video')
            .flatMap((track) => track.clips)
            .filter((clip): clip is SceneProjectClip & { assetId: string; assetVersionId: string; assetMimeType: string } => Boolean(clip.assetId && clip.assetVersionId && /^video\//i.test(clip.assetMimeType || '')))
            .sort((a, b) => a.start - b.start)
            .map((clip) => ({
              id: clip.id,
              name: clip.name,
              start: clip.start,
              duration: clip.duration,
              sourceIn: Math.max(0, clip.sourceIn ?? 0),
              sourceOut: Math.max(0, clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration),
              assetId: clip.assetId,
              assetVersionId: clip.assetVersionId,
              assetMimeType: clip.assetMimeType,
            }));
          const nextInstance = {
            ...(previousInstance || {
              id: scene.id, sceneId: scene.id, sourceIn: 0, sourceOut: patch.project.timeline.duration,
            }),
            sceneId: scene.id,
            assetId: videoClips[0]?.assetId,
            assetVersionId: videoClips[0]?.assetVersionId,
            assetMimeType: videoClips[0]?.assetMimeType,
            videoSourceIn: videoClips[0]?.sourceIn ?? 0,
            videoSourceOut: videoClips[0]?.sourceOut,
            videoClips,
          };
          const nextInstances = previousInstance
            ? previousInstances.map((instance) => instance.sceneId === scene.id ? nextInstance : instance)
            : (() => {
                const sceneOrder = currentScenes.map((item) => item.id);
                const targetOrder = sceneOrder.indexOf(scene.id);
                const insertAt = previousInstances.findIndex((instance) => sceneOrder.indexOf(instance.sceneId) > targetOrder);
                const index = insertAt < 0 ? previousInstances.length : insertAt;
                return [...previousInstances.slice(0, index), nextInstance, ...previousInstances.slice(index)];
              })();
          details.masterTimeline = { ...master, sceneInstances: nextInstances };
        }
        return { ...current, details, updatedAt: now };
      });
      const sceneLedger = hydrateSceneContinuityLedger(activeStoryboard.details?.continuityLedger, activeStoryboard.details?.scenes || []);
      const sceneContinuityRecord = sceneLedger.scenes[scene.id];
      const sceneContinuityContext = getSceneContinuityContext(sceneLedger, activeStoryboard.details?.scenes || [], scene.id);
      const proposedExitState = sceneContinuityRecord?.proposedExitState;
      const sceneContinuityViolations = Array.isArray(sceneContinuityRecord?.violations)
        ? sceneContinuityRecord.violations.filter((item): item is { path: string; reason: string; kind?: string } =>
            Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).path === 'string'
            && typeof (item as Record<string, unknown>).reason === 'string')
        : [];
      const canApproveSceneContinuity = sceneContinuityRecord?.validationStatus === 'consistent'
        && Boolean(sceneContinuityContext?.contextComplete)
        && Boolean(proposedExitState) && typeof proposedExitState === 'object' && !Array.isArray(proposedExitState);
      const saveSceneStartingContext = () => {
        const startingContext = sceneStartingContextDraft.trim();
        if (!startingContext) {
          setSceneContinuityMessage('Describe the starting conditions before saving.');
          return;
        }
        try {
          const nextLedger = setCreatorApprovedSceneStartingState(
            activeStoryboard.details?.continuityLedger,
            activeStoryboard.details?.scenes || [],
            scene.id,
            { story: { startingContext } },
          );
          setActiveStoryboard({
            ...activeStoryboard,
            details: { ...activeStoryboard.details, continuityLedger: nextLedger },
            updatedAt: new Date().toISOString(),
          });
          setSceneContinuityMessage('Starting state saved as creator-approved context. This does not approve the generated Scene exit.');
        } catch (error) {
          setSceneContinuityMessage(error instanceof Error ? error.message : 'Could not save the starting state.');
        }
      };
      const approveCurrentSceneContinuity = () => {
        try {
          const nextLedger = approveSceneContinuityState(
            activeStoryboard.details?.continuityLedger,
            activeStoryboard.details?.scenes || [],
            scene.id,
          );
          setActiveStoryboard({
            ...activeStoryboard,
            details: { ...activeStoryboard.details, continuityLedger: nextLedger },
            updatedAt: new Date().toISOString(),
          });
          setSceneContinuityMessage('Approved. The next Scene can now use this state as its continuity handoff.');
        } catch (error) {
          setSceneContinuityMessage(error instanceof Error ? error.message : 'This Scene cannot be approved yet.');
        }
      };
      const project: SceneProjectData = scene.project || { id: crypto.randomUUID(), schemaVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), renderRevisionIds: [] };
      const timeline: SceneProjectTimeline = project.timeline || {
        duration: scene.duration, fps: 30, width: 1920, height: 1080, tracks: [],
      };
      const updateProjectTimeline = (next: SceneProjectTimeline) => updateActiveScene({
        project: { ...project, timeline: next, updatedAt: new Date().toISOString() },
      });
      const updateSceneDuration = (nextDuration: number) => {
        const duration = Math.max(0.1, Math.min(3600, nextDuration));
        const nextTimeline: SceneProjectTimeline = {
          ...timeline,
          duration,
          tracks: timeline.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) => {
              const start = Math.min(clip.start, Math.max(0, duration - 0.1));
              return { ...clip, start, duration: Math.max(0.1, Math.min(clip.duration, duration - start)) };
            }),
          })),
        };
        updateActiveScene({ duration, project: { ...project, timeline: nextTimeline, updatedAt: new Date().toISOString() } });
      };
      const addProjectTrack = (type: SceneProjectTrack['type']) => {
        const count = timeline.tracks.filter((track) => track.type === type).length + 1;
        const track: SceneProjectTrack = {
          id: crypto.randomUUID(),
          type,
          name: (type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : 'Text') + ' ' + count,
          clips: [],
        };
        updateProjectTimeline({ ...timeline, tracks: [...timeline.tracks, track] });
      };
      const removeProjectTrack = (trackId: string) => updateProjectTimeline({
        ...timeline, tracks: timeline.tracks.filter((track) => track.id !== trackId),
      });
      const addTextClip = (trackId: string) => {
        const track = timeline.tracks.find((item) => item.id === trackId);
        if (!track || track.type !== 'text') return;
        const clip: SceneProjectClip = {
          id: crypto.randomUUID(), name: 'Text ' + (track.clips.length + 1),
          start: 0, duration: Math.min(3, timeline.duration), content: 'Your text',
        };
        updateProjectTimeline({
          ...timeline,
          tracks: timeline.tracks.map((item) => item.id === trackId ? { ...item, clips: [...item.clips, clip] } : item),
        });
      };
      const updateProjectClip = (trackId: string, clipId: string, patch: Partial<SceneProjectClip>) => updateProjectTimeline({
        ...timeline,
        tracks: timeline.tracks.map((track) => track.id !== trackId ? track : {
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? {
            ...clip, ...patch,
            start: Math.max(0, Math.min(timeline.duration, Number(patch.start ?? clip.start) || 0)),
            duration: Math.max(0.1, Math.min(timeline.duration, Number(patch.duration ?? clip.duration) || 0.1)),
          } : clip),
        }),
      });
      const removeProjectClip = (trackId: string, clipId: string) => updateProjectTimeline({
        ...timeline,
        tracks: timeline.tracks.map((track) => track.id !== trackId ? track : {
          ...track, clips: track.clips.filter((clip) => clip.id !== clipId),
        }),
      });
      return (
        <main className="profile-page-main w-full min-w-0 p-0">
          <div className="profile-subpage-scroll profile-subpage-viewport">
            <section className="profile-subpage-card storyboard-fullscreen-card">
              <ProfileSubpageHeader
                onBack={() => setActiveSceneId(null)}
                backLabel="Project Editor"
                icon={<Film size={22} />}
                title={scene.title}
                description={'Scene Editor · ' + scene.duration + ' seconds'}
              />
              <div className="profile-subpage-content space-y-5 p-4 sm:p-5">
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Scene Preview</h2>
                  <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--vyra-bg-subtle)]">
                    {sceneVideoPreviewUrl ? (
                      <video
                        key={sceneVideoPreviewUrl}
                        src={sceneVideoPreviewUrl}
                        controls
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          const video = event.currentTarget;
                          if (sceneVideoPreviewSourceIn > 0 && sceneVideoPreviewSourceIn < video.duration) {
                            try { video.currentTime = sceneVideoPreviewSourceIn; } catch { /* Browser will seek when metadata is ready. */ }
                          }
                        }}
                        onTimeUpdate={(event) => {
                          if (sceneVideoPreviewSourceOut !== null && event.currentTarget.currentTime >= sceneVideoPreviewSourceOut) {
                            event.currentTarget.pause();
                          }
                        }}
                        onError={() => {
                          setSceneVideoPreviewUrl('');
                          setSceneVideoPreviewError('The private Video Asset could not be played by this browser.');
                        }}
                        className="h-full w-full object-contain"
                        aria-label={scene.title + ' Video preview'}
                      />
                    ) : (
                      <div className="px-4 text-center">
                        {sceneVideoPreviewLoading ? <Film size={34} className="mx-auto mb-3 animate-pulse text-[var(--vyra-text-muted)]" /> : <Film size={34} className="mx-auto mb-3 text-[var(--vyra-text-muted)]" />}
                        <p className="text-sm font-semibold text-[var(--vyra-text-primary)]">{sceneVideoPreviewLoading ? 'Loading Video…' : scene.title}</p>
                        <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">{sceneVideoPreviewError || (sceneVideoPreviewUrl ? '' : sceneVideoPreviewLoading ? 'Preparing secure preview.' : scene.description || 'Attach a Video Asset to this Scene through AI Chat.')}</p>
                      </div>
                    )}
                  </div>
                </section>
                {scene.project?.creativeDirection && (
                  <section className="space-y-3 border-t border-[var(--vyra-border)] pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Director’s Shot Plan</h2>
                      <span className="text-[10px] text-[var(--vyra-text-secondary)]">
                        Scene {scene.project.creativeDirection.sceneIndex} of {scene.project.creativeDirection.sceneCount}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--vyra-text-primary)]">{scene.project.creativeDirection.productionTitle}</p>
                      <p className="text-xs leading-5 text-[var(--vyra-text-secondary)]">{scene.project.creativeDirection.purpose}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">Location</p>
                          <p className="mt-1 text-xs text-[var(--vyra-text-primary)]">{scene.project.creativeDirection.location}</p>
                        </div>
                        <div className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">Characters</p>
                          <p className="mt-1 text-xs text-[var(--vyra-text-primary)]">{scene.project.creativeDirection.characters.join(', ') || 'No characters'}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--vyra-border)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">Entry State</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">{scene.project.creativeDirection.entryState}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--vyra-border)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">Scene Action</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">{scene.project.creativeDirection.action}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--vyra-border)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">Exit State</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">{scene.project.creativeDirection.exitState}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-[var(--vyra-text-primary)]">Shots</h3>
                      {scene.project.creativeDirection.shots.map((shot, index) => (
                        <article key={shot.id} className="space-y-2 rounded-lg border border-[var(--vyra-border)] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--vyra-text-primary)]">{String(index + 1).padStart(2, '0')} · {shot.purpose}</p>
                            <span className="shrink-0 text-[10px] tabular-nums text-[var(--vyra-text-secondary)]">{shot.durationSeconds}s</span>
                          </div>
                          <p className="text-[11px] text-[var(--vyra-text-secondary)]">{shot.framing} · {shot.cameraAngle} · {shot.cameraMovement}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <p className="text-[11px] leading-5 text-[var(--vyra-text-secondary)]"><span className="font-semibold text-[var(--vyra-text-primary)]">Composition</span><br />{shot.composition}</p>
                            <p className="text-[11px] leading-5 text-[var(--vyra-text-secondary)]"><span className="font-semibold text-[var(--vyra-text-primary)]">Lighting</span><br />{shot.lighting}</p>
                            <p className="text-[11px] leading-5 text-[var(--vyra-text-secondary)]"><span className="font-semibold text-[var(--vyra-text-primary)]">Focus</span><br />{shot.focus}</p>
                            <p className="text-[11px] leading-5 text-[var(--vyra-text-secondary)]"><span className="font-semibold text-[var(--vyra-text-primary)]">Sound</span><br />{shot.sound}</p>
                          </div>
                          <p className="text-xs leading-5 text-[var(--vyra-text-secondary)]">{shot.action}</p>
                          {shot.continuityNotes.length > 0 && (
                            <ul className="list-disc space-y-1 pl-4 text-[11px] text-[var(--vyra-text-muted)]">
                              {shot.continuityNotes.map((note, noteIndex) => <li key={shot.id + '-note-' + noteIndex}>{note}</li>)}
                            </ul>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                <section className="space-y-2 border-t border-[var(--vyra-border)] pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Story Continuity</h2>
                    <span className="rounded-full border border-[var(--vyra-border)] px-2 py-1 text-[10px] font-medium text-[var(--vyra-text-secondary)]">
                      {sceneContinuityRecord?.validationStatus === 'creator_approved' ? 'Approved' : sceneContinuityRecord?.validationStatus === 'consistent' && !sceneContinuityContext?.contextComplete ? sceneContinuityContext?.previousSceneId ? 'Waiting for previous Scene' : 'Needs starting state' : sceneContinuityRecord?.validationStatus === 'consistent' ? 'Passed · awaiting approval' : sceneContinuityRecord?.validationStatus === 'needs_review' ? 'Needs review' : 'Not evaluated'}
                    </span>
                  </div>
                  {sceneContinuityContext?.previousSceneId === null && (
                    <div className="space-y-2 rounded-lg border border-[var(--vyra-border)] p-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-[var(--vyra-text-primary)]">Storyboard starting conditions</span>
                        <textarea
                          value={sceneStartingContextDraft}
                          onChange={(event) => setSceneStartingContextDraft(event.target.value)}
                          rows={3}
                          maxLength={12000}
                          placeholder="Describe the opening world, character states, locations, time, and important facts that must remain consistent…"
                          className={inputClass + ' w-full resize-y'}
                        />
                      </label>
                      <p className="text-[11px] leading-4 text-[var(--vyra-text-secondary)]">
                        Creator-authored starting context for the first Scene. Updating it invalidates later Scene approvals so they can be checked again.
                      </p>
                      <button type="button" onClick={saveSceneStartingContext} disabled={!sceneStartingContextDraft.trim() || sceneStartingContextDraft.trim() === activeStartingContext} className="min-h-9 rounded-lg border border-[var(--vyra-accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--vyra-accent-primary)] transition hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                        Save Starting State
                      </button>
                    </div>
                  )}
                  <p className="text-xs leading-5 text-[var(--vyra-text-secondary)]">
                    {sceneContinuityContext?.contextComplete
                      ? sceneContinuityContext.previousSceneId
                        ? 'The previous Scene has an approved state. This Scene inherits its continuity handoff.'
                        : 'This is the first Scene. No previous Scene handoff is required.'
                      : sceneContinuityContext?.previousSceneId
                        ? 'The previous Scene has not been approved yet. Its state will not be treated as canon for this Scene.'
                        : 'This first Scene needs an explicit starting state before it can become the continuity source for later Scenes.'}
                  </p>
                  {sceneContinuityViolations.length > 0 && (
                    <ul className="space-y-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3 text-xs text-[var(--vyra-text-secondary)]">
                      {sceneContinuityViolations.slice(0, 12).map((violation, index) => (
                        <li key={violation.path + '-' + index}>
                          <span className="font-semibold text-[var(--vyra-text-primary)]">{violation.path}</span>
                          <span>: {violation.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canApproveSceneContinuity && sceneContinuityRecord?.validationStatus !== 'creator_approved' && (
                    <button type="button" onClick={approveCurrentSceneContinuity} className="min-h-10 rounded-lg border border-[var(--vyra-accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--vyra-accent-primary)] transition hover:bg-[var(--vyra-bg-hover)]">
                      Approve Scene State for Next Scene
                    </button>
                  )}
                  {sceneContinuityMessage && <p role="status" className="text-xs text-[var(--vyra-text-secondary)]">{sceneContinuityMessage}</p>}
                </section>
                <section className="space-y-3 border-t border-[var(--vyra-border)] pt-5">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Scene Project</h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">This Scene has its own independent project record. Changes here belong to this Scene, not to the Master timeline trim.</p>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--vyra-text-secondary)]">Scene title</span>
                    <input value={scene.title} onChange={(event) => updateActiveScene({ title: event.target.value })} className={inputClass + ' min-h-10'} maxLength={100} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--vyra-text-secondary)]">Scene description</span>
                    <textarea value={scene.description} onChange={(event) => updateActiveScene({ description: event.target.value })} className={inputClass + ' min-h-24 resize-y py-2'} rows={3} maxLength={1000} placeholder="Describe what happens in this Scene…" />
                  </label>
                  <label className="block max-w-48 space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--vyra-text-secondary)]">Canonical Scene Duration (seconds)</span>
                    <input type="number" min="0.1" max="3600" step="0.1" value={scene.duration} onChange={(event) => updateSceneDuration(Number(event.target.value))} className={inputClass + ' min-h-10'} />
                  </label>
                </section>
                <section className="space-y-3 border-t border-[var(--vyra-border)] pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Scene Timeline</h2>
                      <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Independent editable tracks for this Scene Project</p>
                    </div>
                    <span className="text-xs tabular-nums text-[var(--vyra-text-muted)]">{timeline.duration.toFixed(1)}s</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['video', 'audio', 'text'] as const).map((type) => (
                      <button key={type} type="button" onClick={() => addProjectTrack(type)} className="rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-xs font-medium text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]">
                        + {type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : 'Text'} Track
                      </button>
                    ))}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[var(--vyra-border)]">
                    <div className="flex items-center justify-between border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">
                      <span>Track</span><span>{timeline.fps} FPS · {timeline.width} × {timeline.height}</span>
                    </div>
                    {timeline.tracks.length ? timeline.tracks.map((track) => (
                      <div key={track.id} className="flex min-h-14 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 last:border-b-0">
                        <div className="w-24 shrink-0">
                          <p className="truncate text-xs font-semibold text-[var(--vyra-text-primary)]">{track.name}</p>
                          <p className="text-[10px] capitalize text-[var(--vyra-text-muted)]">{track.type} · {track.clips.length} clips</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2 py-2">
                          <div className="relative h-8 overflow-hidden rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]">
                            {track.clips.map((clip) => (
                              <div key={clip.id + '-lane'} title={clip.name + ' · ' + clip.start.toFixed(1) + 's'} className="absolute top-1 flex h-6 min-w-[2px] items-center overflow-hidden rounded-sm border border-[var(--vyra-accent-primary)] bg-[var(--vyra-bg-hover)] px-1 text-[9px] font-medium text-[var(--vyra-text-primary)]" style={{ left: (clip.start / timeline.duration * 100) + '%', width: Math.max(1.5, clip.duration / timeline.duration * 100) + '%' }}>
                                <span className="truncate">{clip.name}</span>
                              </div>
                            ))}
                          </div>
                          {track.type === 'text' && <button type="button" onClick={() => addTextClip(track.id)} className="rounded-md border border-[var(--vyra-border)] px-2 py-1 text-[10px] font-medium text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]">+ Add Text Clip</button>}
                          {track.clips.map((clip) => (
                            <div key={clip.id} className="space-y-2 rounded-lg bg-[var(--vyra-bg-subtle)] p-2">
                              <div className="flex items-center gap-2">
                                <input aria-label="Clip name" value={clip.name} onChange={(event) => updateProjectClip(track.id, clip.id, { name: event.target.value })} className="min-w-0 flex-1 rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 py-1 text-xs text-[var(--vyra-text-primary)]" />
                                <button type="button" onClick={() => removeProjectClip(track.id, clip.id)} aria-label={'Remove ' + clip.name} className="rounded p-1 text-[var(--vyra-danger)]"><Trash2 size={12} /></button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-[var(--vyra-text-muted)]">Start (s)<input type="number" min="0" max={timeline.duration} step="0.1" value={clip.start} onChange={(event) => updateProjectClip(track.id, clip.id, { start: Number(event.target.value) })} className="mt-1 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 py-1 text-xs text-[var(--vyra-text-primary)]" /></label>
                                <label className="text-[10px] text-[var(--vyra-text-muted)]">Duration (s)<input type="number" min="0.1" max={timeline.duration} step="0.1" value={clip.duration} onChange={(event) => updateProjectClip(track.id, clip.id, { duration: Number(event.target.value) })} className="mt-1 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 py-1 text-xs text-[var(--vyra-text-primary)]" /></label>
                              </div>
                              {track.type === 'text' && <textarea aria-label="Text clip content" value={clip.content || ''} onChange={(event) => updateProjectClip(track.id, clip.id, { content: event.target.value })} rows={2} className="w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 py-1 text-xs text-[var(--vyra-text-primary)]" placeholder="Text shown in this clip" />}
                              {track.type !== 'text' && (clip.assetId && clip.assetVersionId ? <p className="text-[10px] text-[var(--vyra-text-muted)]">Linked private Project Asset · {clip.assetMimeType || 'video'} · playback is being connected</p> : <p className="text-[10px] text-[var(--vyra-text-muted)]">Media source is not linked yet.</p>)}
                            </div>
                          ))}
                          {!track.clips.length && track.type !== 'text' && <p className="text-[10px] text-[var(--vyra-text-muted)]">No media clips yet. Generated Director shots will appear here in production order.</p>}
                        </div>
                        <button type="button" onClick={() => removeProjectTrack(track.id)} aria-label={'Remove ' + track.name} className="rounded p-2 text-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]"><Trash2 size={14} /></button>
                      </div>
                    )) : <div className="px-4 py-8 text-center text-xs text-[var(--vyra-text-muted)]">Add a track to begin building this Scene independently.</div>}
                  </div>
                  <p className="text-[11px] leading-5 text-[var(--vyra-text-muted)]">Generated Director shots are saved as linked Project Assets in this Scene Timeline. Playback and final Scene rendering are the next stage; no placeholder video is generated.</p>
                </section>
              </div>
            </section>
          </div>
        <aside className="h-1/2 min-h-0 w-full shrink-0 border-t border-[var(--vyra-border)] lg:h-full lg:w-[38%] lg:border-l lg:border-t-0">
          {storyboardUniverse ? <AIChatPage isActive={Boolean(isActive && activeStoryboard)} isAuthenticated={isAuthenticated} onLoginRequired={onLoginRequired} workspaceContext={localWorkspaceAiContext} onSceneStateProposal={onSceneStateProposal} onShotSequenceReady={handleShotSequenceReady} onShotRepairHistory={handleShotRepairHistory} initialSelectedAssets={initialSelectedAssets} onSelectedAssetsChange={onSelectedAssetsChange} storyboardId={activeStoryboard.id} activeVyralId={storyboardUniverse.id} embedded /> : <div role="status" className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--vyra-text-muted)]">Preparing this Project’s Assets for AI Chat…</div>}
        </aside>
        <div className="hidden">
          <StoryboardUniverseTab storyboardId={activeStoryboard.id} storyboardTitle={activeStoryboard.title} isActive={Boolean(isActive && activeStoryboard)} renderLibrary={false} isAuthenticated={isAuthenticated} onLoginRequired={onLoginRequired} onUniverseReady={setStoryboardUniverse} />
        </div>
      </main>
    );
    }
  }

  if (activeStoryboard) {
    const details = activeStoryboard.details || {};
    const leaveStoryboardPage = () => {
      if (activeStoryboardConfirmed) {
        const latest = { ...activeStoryboard, updatedAt: new Date().toISOString() };
        setStoryboards((current) => current.map((item) => item.id === latest.id ? latest : item));
        void persistStoryboard(latest);
      }
      // Leaving the Storyboard Editor returns to the Workspace, where the global
      // navigation header must always be visible and interactive again.
      const root = document.documentElement;
      root.style.setProperty('--vyra-main-header-progress', '0');
      root.style.setProperty('--vyra-header-spacer-collapse', '0px');
      root.classList.remove('is-header-dragging');
      window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: 0 }));
      setActiveStoryboard(null);
      setStoryboardUniverse(null);
      setActiveStoryboardConfirmed(false);
      setStoryboardDetailsExpanded(true);
      setStoryboardEditorView('chat');
      setStoryboardAiMessage('');
      onEditorExit?.();
    };
    return (
      <main className="profile-page-main flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden p-0">
        <div className="profile-subpage-scroll profile-subpage-viewport !h-full !min-h-0 !w-full !overflow-hidden">
          <section className="profile-subpage-card storyboard-fullscreen-card !flex !h-full !min-h-0 !flex-col !overflow-hidden">
          <header className="sticky top-0 z-50 flex h-11 min-h-11 shrink-0 items-center justify-between bg-[var(--vyra-bg-canvas)] px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={leaveStoryboardPage} className="inline-flex shrink-0 items-center gap-[7px] rounded-[9px] px-2 py-[7px] text-sm font-medium text-[var(--vyra-text-secondary)] transition-colors hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]" aria-label="Back to My Projects">
                <ArrowLeft size={16} /><span>My Projects</span>
              </button>
              <span className="min-w-0 truncate text-sm font-semibold text-[var(--vyra-text-primary)]" title={activeStoryboard.title}>{activeStoryboard.title || 'Untitled Project'}</span>
            </div>
          </header>
          <div className="profile-subpage-content flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-4 pt-0 sm:px-0 sm:pb-5" onWheel={handleHeaderWheel} onTouchStart={handleHeaderTouchStart} onTouchMove={handleHeaderTouchMove} onTouchEnd={handleHeaderTouchEnd} onTouchCancel={handleHeaderTouchEnd}>
          {activeStoryboardConfirmed && (
            <div ref={storyboardControlsRef} className="profile-storyboard-controls -mx-4 shrink-0 sm:-mx-5">
              <div className="profile-storyboard-view-tabs order-first flex shrink-0 items-center gap-1 bg-[var(--vyra-bg-surface)]" aria-label="Project navigation">
                <button type="button" onClick={() => setStoryboardEditorView('chat')} aria-pressed={storyboardEditorView === 'chat'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'chat' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>AI Chat</button>
                <button type="button" onClick={() => setStoryboardEditorView('master')} aria-pressed={storyboardEditorView === 'master'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'master' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>Editor</button>
                <button type="button" onClick={() => setStoryboardEditorView('universe')} aria-pressed={storyboardEditorView === 'universe'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'universe' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>Project Assets</button>
                <button type="button" onClick={() => setStoryboardEditorView('details')} aria-pressed={storyboardEditorView === 'details'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'details' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>Details</button>
              </div>
              {storyboardEditorView === 'master' && (
                <>
                  <div className="profile-storyboard-preview">
                    <div ref={storyboardPreviewFrameRef} className="profile-storyboard-preview-frame relative mx-auto flex aspect-video w-full items-center justify-center overflow-hidden bg-[var(--vyra-bg-subtle)]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.16),transparent_55%)]" />
                      <div className="relative z-10 text-[var(--vyra-text-muted)]" aria-label="Video preview placeholder"><Film size={30} /></div>
                    </div>
                  </div>
                  <div className="grid h-12 grid-cols-3 items-center bg-[var(--vyra-bg-surface)] px-3">
                    <span className="justify-self-start font-mono text-[11px] tabular-nums text-[var(--vyra-text-secondary)]">
                      00:00 <span className="px-1 text-[var(--vyra-text-muted)]">/</span> {(() => {
                        const total = (activeStoryboard?.details?.scenes || []).reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0);
                        const minutes = Math.floor(total / 60).toString().padStart(2, '0');
                        const seconds = Math.floor(total % 60).toString().padStart(2, '0');
                        return minutes + ':' + seconds;
                      })()}
                    </span>
                    <button type="button" disabled aria-label="Play preview (available when video media is connected)" title="Preview playback will be available when video media is connected" className="grid size-8 justify-self-center place-items-center rounded-full bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-muted)] disabled:cursor-not-allowed disabled:opacity-60">
                      <Play size={15} fill="currentColor" />
                    </button>
                    <button type="button" onClick={() => { const frame = storyboardPreviewFrameRef.current; if (frame?.requestFullscreen) void frame.requestFullscreen(); }} aria-label="Expand preview" title="Expand preview" className="grid size-8 justify-self-end place-items-center rounded-lg text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
            {activeStoryboardConfirmed && (() => {
              const scenes = details.scenes || [];
              const updateScenes = (nextScenes: StoryboardScene[]) => setActiveStoryboard((current) => {
                if (!current) return current;
                const master = current.details?.masterTimeline;
                const continuityLedger = hydrateSceneContinuityLedger(current.details?.continuityLedger, nextScenes);
                if (!master) return { ...current, details: { ...current.details, scenes: nextScenes, continuityLedger }, updatedAt: new Date().toISOString() };
                const previousInstances = master.sceneInstances || [];
                const instancesByScene = new Map(previousInstances.map((instance) => [instance.sceneId, instance]));
                const sceneIds = new Set(nextScenes.map((scene) => scene.id));
                const orderedInstances = nextScenes.map((scene) => {
                  const existing = instancesByScene.get(scene.id);
                  return {
                    ...(existing || { id: scene.id, sceneId: scene.id }),
                    sceneId: scene.id,
                    sourceIn: 0,
                    sourceOut: scene.duration,
                    sceneProjectId: scene.project?.id,
                    renderRevisionId: scene.project?.latestRenderRevisionId ?? null,
                  };
                });
                const transitions = Object.fromEntries(Object.entries(master.transitions || {}).filter(([id]) => sceneIds.has(id) || orderedInstances.some((instance) => instance.id === id)));
                return {
                  ...current,
                  details: {
                    ...current.details,
                    scenes: nextScenes,
                    continuityLedger,
                    masterTimeline: { ...master, sceneInstances: orderedInstances, sceneRanges: {}, transitions },
                  },
                  updatedAt: new Date().toISOString(),
                };
              });
              return (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
                    {storyboardEditorView === 'master' ? (
                      <div className="storyboard-editor-pane flex min-h-0 w-full min-w-0 max-w-none flex-col">
<MasterTimelineEditor
                    scenes={scenes.map((scene) => ({
                      ...scene,
                      projectId: scene.project?.id,
                      latestRenderRevisionId: scene.project?.latestRenderRevisionId ?? null,
                    }))}
                    value={details.masterTimeline}
                    onSceneOrderChange={(sceneIds) => {
                      const byId = new Map(scenes.map((scene) => [scene.id, scene]));
                      const ordered = sceneIds.map((id) => byId.get(id)).filter((scene): scene is StoryboardScene => Boolean(scene));
                      if (ordered.length === scenes.length && ordered.some((scene, index) => scene.id !== scenes[index]?.id)) updateScenes(ordered);
                    }}
                    onSceneDuplicate={(source, index) => {
                      const original = scenes.find((scene) => scene.id === source.id);
                      const now = new Date().toISOString();
                      const copy: StoryboardScene = {
                        ...(original || { id: source.id, title: source.title, description: '', duration: source.duration, transition: 'Fade' }),
                        id: crypto.randomUUID(),
                        title: (original?.title || source.title) + ' copy',
                        project: { id: crypto.randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, renderRevisionIds: [] },
                      };
                      const next = [...scenes];
                      next.splice(Math.max(0, Math.min(index, next.length)), 0, copy);
                      updateScenes(next);
                      return { id: copy.id, title: copy.title, duration: copy.duration, projectId: copy.project?.id, latestRenderRevisionId: copy.project?.latestRenderRevisionId ?? null };
                    }}
                    onSceneDelete={(sceneId) => {
                      updateScenes(scenes.filter((scene) => scene.id !== sceneId));
                      setSelectedSceneIds((current) => current.filter((id) => id !== sceneId));
                      if (activeSceneId === sceneId) setActiveSceneId(null);
                    }}
                    onSelectionChange={(selection) => setSelectedTimelineItem((current) => JSON.stringify(current) === JSON.stringify(selection) ? current : selection)}
                    onChange={(masterTimeline) => setActiveStoryboard((current) => current ? {
                      ...current,
                      details: { ...current.details, masterTimeline },
                      updatedAt: new Date().toISOString(),
                    } : current)}
                  />
                      </div>
                    ) : storyboardEditorView === 'details' ? (
                      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6">
                        <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--vyra-text-secondary)]">Title</span><input value={activeStoryboard.title} onChange={(event) => updateActiveStoryboard('title', event.target.value)} maxLength={100} className={inputClass} /></label>
                        <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--vyra-text-secondary)]">Description</span><textarea value={activeStoryboard.topic} onChange={(event) => updateActiveStoryboard('topic', event.target.value)} rows={4} maxLength={500} className={inputClass + ' min-h-24 resize-y py-2'} /></label>
                      </section>
                    ) : storyboardEditorView === 'chat' ? (
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {storyboardUniverse ? <AIChatPage isActive={Boolean(isActive && activeStoryboard && storyboardEditorView === 'chat')} isAuthenticated={isAuthenticated} onLoginRequired={onLoginRequired} workspaceContext={localWorkspaceAiContext} onSceneStateProposal={onSceneStateProposal} initialSelectedAssets={initialSelectedAssets} onSelectedAssetsChange={onSelectedAssetsChange} storyboardId={activeStoryboard.id} activeVyralId={storyboardUniverse.id} embedded /> : <div role="status" className="flex flex-1 items-center justify-center px-4 text-center text-xs text-[var(--vyra-text-muted)]">Preparing this Project’s Assets for AI Chat…</div>}
                      </div>
                    ) : null}
                    <div className={storyboardEditorView === 'universe' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
                      <StoryboardUniverseTab storyboardId={activeStoryboard.id} storyboardTitle={activeStoryboard.title} isActive={Boolean(isActive && activeStoryboard)} renderLibrary={storyboardEditorView === 'universe'} isAuthenticated={isAuthenticated} onLoginRequired={onLoginRequired} onUniverseReady={setStoryboardUniverse} />
                    </div>
                </div>
              );
            })()}


          </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main ref={workspaceScrollRef} onScroll={(event) => { preservedWorkspaceScrollTopRef.current = event.currentTarget.scrollTop; }} onWheel={handleWorkspaceWheel} onTouchStart={handleWorkspaceTouchStart} onTouchMove={handleWorkspaceTouchMove} onTouchEnd={handleWorkspaceTouchEnd} onTouchCancel={handleWorkspaceTouchEnd} className="mx-auto min-h-0 w-full max-w-[var(--vyra-content-width)] flex-1 touch-pan-x overscroll-y-contain overflow-y-auto px-4 pb-16 pt-0 sm:px-6">
      <section className="mb-7 pt-8 sm:pt-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onOpenLibraryPage('my-vyrals')} className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-4 py-3 text-left transition hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={21} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--vyra-text-primary)]">My Projects</span><span className="mt-0.5 block text-xs text-[var(--vyra-text-secondary)]">Your creative Projects and their Assets</span></span>
            <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
          </button>
          <button type="button" onClick={() => onOpenLibraryPage('my-media-library')} className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-4 py-3 text-left transition hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Images size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--vyra-text-primary)]">My Media Library</span><span className="mt-0.5 block text-xs text-[var(--vyra-text-secondary)]">Your images, videos, audio and files</span></span>
            <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      <section ref={storyboardBarRef} className="sticky top-0 z-40 -mx-4 mb-2 flex items-center justify-between gap-3 bg-[var(--vyra-bg-canvas)] px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-xl">My Storyboards</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--vyra-text-secondary)]">Your stories, organized in one place.</p>
        {storyboardAiMessage && <p role="status" className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">{storyboardAiMessage}</p>}
        </div>
        <Button onClick={createDefaultStoryboard} className="shrink-0" startIcon={<Plus size={16} />}><span className="hidden sm:inline">Create Storyboard</span><span className="sm:hidden">Create</span></Button>
      </section>

      {storyboards.length ? (
        <section aria-label="Your storyboards" className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {storyboards.map((item) => (
            <Card key={item.id} padding="none" className="relative overflow-hidden">
              <button type="button" onClick={() => openStoryboardEditor(item)} aria-label={`Open storyboard: ${item.title}`} className="block w-full text-left transition hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
              <div className="flex aspect-[16/9] items-center justify-center border-b border-[var(--vyra-border-subtle)] bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.20),transparent_48%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))]"><Film size={34} className="text-[var(--vyra-accent-primary)]" strokeWidth={1.5} /></div>
              <div className="p-4">
                <h2 className="truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{item.title}</h2>
                {item.topic && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--vyra-text-secondary)]">{item.topic}</p>}
                {item.details?.category && <p className="mt-2 text-[11px] text-[var(--vyra-text-secondary)]">{item.details.category}{item.details.style ? ' · ' + item.details.style : ''}</p>}
                {item.details?.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.details.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-1 text-[10px] text-[var(--vyra-text-secondary)]">{tag}</span>)}</div> : null}
                <p className="mt-3 text-[10px] text-[var(--vyra-text-muted)]">Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
              </div>
              </button>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setStoryboardToDelete(item); }}
                aria-label={`Delete storyboard: ${item.title}`}
                title="Delete storyboard"
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]/95 text-[var(--vyra-text-secondary)] shadow-sm backdrop-blur transition hover:border-[var(--vyra-danger)] hover:bg-[var(--vyra-danger)] hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </section>
      ) : (
        <section className="flex min-h-[min(52vh,440px)] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]/40 px-6 py-12 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><Clapperboard size={25} /></div>
          <h2 className="mt-5 text-base font-semibold text-[var(--vyra-text-primary)]">No storyboards yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--vyra-text-secondary)]">Create your first storyboard to start organizing scenes and shaping your next video.</p>
        </section>
      )}

      <ConfirmationDialog
        open={Boolean(storyboardToDelete)}
        title="Delete storyboard?"
        description={storyboardToDelete
          ? <>“{storyboardToDelete.title}” will be permanently deleted. This action cannot be undone.</>
          : null}
        icon={<Trash2 size={20} />}
        confirmLabel={isDeletingStoryboard ? 'Deleting…' : 'Delete'}
        destructive
        loading={isDeletingStoryboard}
        onClose={() => setStoryboardToDelete(null)}
        onConfirm={() => void confirmDeleteStoryboard()}
      />

      {editDraft && editingStoryboardId && (
        <div role="presentation" className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingStoryboardId(null); setEditDraft(null); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-storyboard-title" className="my-auto w-full max-w-lg rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 id="edit-storyboard-title" className="text-xl font-bold text-[var(--vyra-text-primary)]">Edit Project Details</h2><button type="button" onClick={() => { setEditingStoryboardId(null); setEditDraft(null); }} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button></div>
            <form onSubmit={saveStoryboardEdits} className="space-y-3">
              <div><label className="mb-1 block text-xs font-semibold text-[var(--vyra-text-primary)]">Name</label><input maxLength={100} value={editDraft.title} onChange={(event) => setEditDraft((current) => current ? { ...current, title: event.target.value, details: { ...current.details, origins: { ...current.details?.origins, title: 'creator_edited' } } } : current)} className={inputClass} /></div>
              <div><label className="mb-1 block text-xs font-semibold text-[var(--vyra-text-primary)]">Description</label><textarea rows={3} maxLength={500} value={editDraft.topic} onChange={(event) => setEditDraft((current) => current ? { ...current, topic: event.target.value, details: { ...current.details, origins: { ...current.details?.origins, topic: 'creator_edited' } } } : current)} className={inputClass + ' min-h-24 resize-y px-3 py-2.5'} /></div>
              {(['category', 'style', 'mood'] as const).map((key) => <div key={key}><label className="mb-1 block text-xs font-semibold capitalize text-[var(--vyra-text-primary)]">{key === 'style' ? 'Visual style' : key}</label><input value={editDraft.details?.[key] || ''} onChange={(event) => setEditDraft((current) => current ? { ...current, details: { ...current.details, [key]: event.target.value, origins: { ...current.details?.origins, [key]: 'creator_edited' } } } : current)} className={inputClass} /></div>)}
              <div><label className="mb-1 block text-xs font-semibold text-[var(--vyra-text-primary)]">Tags</label><input value={(editDraft.details?.tags || []).join(', ')} onChange={(event) => setEditDraft((current) => current ? { ...current, details: { ...current.details, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean), origins: { ...current.details?.origins, tags: 'creator_edited' } } } : current)} className={inputClass} placeholder="Separate tags with commas" /></div>
              <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => { setEditingStoryboardId(null); setEditDraft(null); }}>Cancel</Button><Button type="submit">Save details</Button></div>
            </form>
          </section>
        </div>
      )}

      {createOpen && (
        <div role="presentation" className="fixed inset-x-0 z-[60] flex items-center justify-center overflow-hidden bg-slate-950/75 p-2 backdrop-blur-md sm:p-4" style={{ top: visualViewport.top, height: visualViewport.height }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-storyboard-title" className="flex min-h-0 w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-[var(--vyra-shadow-overlay)]" style={{ maxHeight: Math.max(120, visualViewport.height - 16) }}>
            <div ref={dialogBodyRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="mb-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h2 id="create-storyboard-title" className="min-w-0 text-2xl font-bold tracking-tight text-[var(--vyra-text-primary)]">Create Storyboard</h2>
                  <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="shrink-0 rounded-lg p-2 text-[var(--vyra-text-muted)] transition hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">Start with an idea. AI can suggest the details, and you can edit anything.</p>
              </div>
              <form onSubmit={createStoryboard} className="space-y-4">
                <div className="min-w-0 space-y-2.5">
                  <label htmlFor="vyra-storyboard-name" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Storyboard name <span className="font-normal text-[var(--vyra-text-muted)]">(optional — AI can suggest one)</span></label>
                  <input id="vyra-storyboard-name" type="text" maxLength={100} value={title} onChange={(event) => updateDetail('title', event.target.value)} placeholder="e.g. The Last City" disabled={isSuggesting} className={inputClass} />
                </div>
                <div className="min-w-0 space-y-2.5">
                  <label htmlFor="vyra-storyboard-description" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Short description <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></label>
                  <textarea id="vyra-storyboard-description" rows={3} maxLength={500} value={topic} onChange={(event) => updateDetail('topic', event.target.value)} placeholder="Describe your idea (optional)" disabled={isSuggesting} className={inputClass + ' min-h-24 resize-y px-3 py-2.5'} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><label htmlFor="vyra-storyboard-category" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Category</label><input id="vyra-storyboard-category" value={category} onChange={(event) => updateDetail('category', event.target.value)} placeholder="Suggested automatically" disabled={isSuggesting} className={inputClass} /></div>
                  <div className="space-y-1"><label htmlFor="vyra-storyboard-style" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Visual style</label><input id="vyra-storyboard-style" value={style} onChange={(event) => updateDetail('style', event.target.value)} placeholder="e.g. cinematic, documentary" disabled={isSuggesting} className={inputClass} /></div>
                  <div className="space-y-1"><label htmlFor="vyra-storyboard-mood" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Mood</label><input id="vyra-storyboard-mood" value={mood} onChange={(event) => updateDetail('mood', event.target.value)} placeholder="Suggested automatically" disabled={isSuggesting} className={inputClass} /></div>
                  <div className="space-y-1"><label htmlFor="vyra-storyboard-tags" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Tags</label><input id="vyra-storyboard-tags" value={tags} onChange={(event) => updateDetail('tags', event.target.value)} placeholder="Comma-separated" disabled={isSuggesting} className={inputClass} /></div>
                </div>
                {suggestionError && <p role="alert" className="text-xs text-[var(--vyra-danger)]">{suggestionError}</p>}
                <div className="flex flex-wrap justify-between gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={suggestStoryboardDetails} disabled={isSuggesting || (!title.trim() && !topic.trim())}>{isSuggesting ? 'Suggesting…' : '✦ Suggest with AI'}</Button>
                  <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={isSuggesting || (!title.trim() && !topic.trim())}>{isSuggesting ? "Preparing…" : "Create Storyboard"}</Button></div>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};