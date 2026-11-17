import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Archive, Clock3, Copy, History, Lock, MessageSquare,
  MoreHorizontal, Plus, Share2, Trash2, Unlock, X, Sparkles,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { AIChatMessageContent } from './AIChatMessageContent';
import { getCurrentAccessToken, supabase } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import type { WorkspaceAiContext } from '../../types/workspaceAiContext';
import { extractGlobalChatNavigationTarget, extractStoryboardCreateRequest, extractStoryboardDetailTitle, extractStoryboardDeleteTitle, extractStoryboardUpdateRequest, findMentionedVyrals, findStoryboardMatches, formatStoryboardCreateDraft, formatStoryboardDeleteDraft, formatStoryboardDetail, formatStoryboardList, formatStoryboardUpdateDraft, isStoryboardCreateConfirmation, isStoryboardCreateIntent, isStoryboardDeleteConfirmation, isStoryboardDeleteIntent, isStoryboardListRequest, isStoryboardUpdateConfirmation, isStoryboardUpdateIntent, isNaturalChatApproval, isVyralAssetUploadConfirmation, type GlobalChatAction, type GlobalChatNavigationTarget, type GlobalChatStoryboardRecord } from '../../services/globalChatActions.ts';
import { mergeWorkspaceStoryboards } from '../../services/workspaceStoryboards.ts';
import { createSupabaseVyralAssetIngestionPort, ingestVyralAsset, VyralAssetIngestionError } from '../../services/vyralAssetIngestion.ts';
import { registerVyralAssetInMediaLibrary } from '../../services/mediaLibraryCloud';
import { generateRunwayProjectMedia, generateRunwayProjectShotSequence, listRunwayProjectMediaRecovery, recoverRunwayProjectMediaJob, type RunwayProjectRecoveryJob, type RunwayProjectShotSequenceReady } from '../../services/runwayProjectGeneration';
import type { RunwayProjectOutputAsset } from '../../services/runwayProjectGeneration';
import type { CreativeScenePlan } from '../../services/creativeProductionPlanning';
import { buildSceneVisualInspectionPrompt, buildSceneVisualRepairPrompt, buildSceneVisualTransitionPrompt, parseSceneVisualInspection, type SceneVisualAnchor } from '../../services/universeSceneVisualVerification';
import type { MediaQuality } from '../../services/mediaModelSelection';

type PendingShotRepair = {
  scene: CreativeScenePlan;
  shotIndex: number;
  previousShotAsset?: RunwayProjectOutputAsset;
  nextShotAsset?: RunwayProjectOutputAsset;
  downstreamShotAssets?: Array<{ shotIndex: number; asset: RunwayProjectOutputAsset }>;
  promptText: string;
  productionTitle: string;
  logline: string;
  genre: string;
  tone: string;
  sceneIndex?: number;
  originalPromptText: string;
  storyboardId: string;
};
type ProjectMediaPreview = { assetId: string; name: string; mimeType: string; url?: string };
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; status?: 'success' | 'preview' | 'error' | 'cancelled'; providerLabel?: string; action?: GlobalChatAction; mediaAssets?: ProjectMediaPreview[] };
type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  archived?: boolean;
  locked?: boolean;
};

type AIChatPageProps = {
  isActive: boolean;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  onShotSequenceReady?: (sequence: RunwayProjectShotSequenceReady) => void;
  onShotRepairHistory?: (entry: { id: string; createdAt: string; sceneId: string; shotId: string; shotIndex: number; previousAssetId: string | null; previousAssetVersionId: string | null; candidateAssetId: string | null; candidateAssetVersionId: string | null; outcome: 'verified' | 'needs_review'; baselineRevision: string | null; checkedBoundaryIndices: number[]; findings: string[]; approvedCostUsd: number }) => void;
  workspaceContext?: WorkspaceAiContext | null;
  storyboardId?: string;
  activeVyralId?: string | null;
  embedded?: boolean;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;



type VisionImage = { mimeType: 'image/jpeg'; data: string; width: number; height: number };
type VisionVideoFrame = VisionImage & { assetId: string; assetName: string; frameTimeMs: number };

const createVisionImagePreview = async (source: Blob): Promise<VisionImage> => {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not prepare the video frame for AI Vision.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
    let preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode vision preview.')), 'image/jpeg', 0.82));
    if (preview.size > 600 * 1024) preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not compress vision preview.')), 'image/jpeg', 0.55));
    if (preview.size > 600 * 1024) throw new Error('A video frame preview exceeds the AI Vision size limit.');
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read vision preview.')); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid vision preview.')); reader.readAsDataURL(preview); });
    const separator = dataUrl.indexOf(',');
    if (separator < 0) throw new Error('Invalid vision preview encoding.');
    return { mimeType: 'image/jpeg', data: dataUrl.slice(separator + 1), width, height };
  } finally { bitmap.close(); }
};

const extractSelectedVideoFrames = async (
  source: Blob,
  assetId: string,
  assetName: string,
  maxFrames: number,
): Promise<VisionVideoFrame[]> => {
  if (maxFrames <= 0) return [];
  const objectUrl = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('This video format could not be opened for frame inspection.'));
    });
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('The first video frame could not be decoded.'));
      });
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable duration.');
    const frameCount = Math.min(4, maxFrames);
    const lastSafeFrameTime = Math.max(0, duration - Math.min(0.05, duration / 10));
    const timestamps = Array.from({ length: frameCount }, (_, index) =>
      frameCount === 1 ? 0 : lastSafeFrameTime * index / (frameCount - 1)
    ).filter((time, index, all) => all.indexOf(time) === index);
    const frames: VisionVideoFrame[] = [];
    for (const time of timestamps) {
      if (Math.abs(video.currentTime - time) > 0.02) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('A video frame could not be decoded.')); };
          const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onError, { once: true });
          video.currentTime = time;
        });
      }
      const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not prepare a video frame for AI Vision.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode a video frame.')), 'image/jpeg', 0.78)
      );
      const preview = await createVisionImagePreview(frameBlob);
      const minutes = Math.floor(time / 60).toString().padStart(2, '0');
      const seconds = Math.floor(time % 60).toString().padStart(2, '0');
      frames.push({ ...preview, assetId, assetName: `${assetName} · ${minutes}:${seconds}`, frameTimeMs: Math.round(time * 1000) });
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
};

const canonicalizeAttachmentJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalizeAttachmentJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonicalizeAttachmentJson(record[key])).join(',') + '}';
};

const collectSceneVisualAnchors = (state: Record<string, unknown>): SceneVisualAnchor[] => {
  const anchors: SceneVisualAnchor[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 12) throw new Error('The approved Scene state is too deeply nested for visual verification.');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) {
        if (path) anchors.push({ path, expectedValue: {}, scope: 'persistent', visibility: 'required' });
        return;
      }
      for (const [key, child] of entries) {
        if (!/^[A-Za-z0-9_$-]+$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new Error('The approved Scene state contains a visual anchor with an unsupported path.');
        }
        visit(child, path ? path + '.' + key : key, depth + 1);
      }
      return;
    }
    if (!path) return;
    canonicalizeAttachmentJson(value);
    const temporary = /(^|\.)(pose|position|expression|camera|framing|lighting|motion|blocking|screenDirection|screen_direction)(\.|$)/i.test(path);
    anchors.push({
      path, expectedValue: value,
      scope: temporary ? 'scene_state' : 'persistent',
      visibility: 'required',
    });
    if (anchors.length > 120) throw new Error('The approved Scene state contains too many visual anchors for one shot inspection.');
  };
  visit(state, '', 0);
  return anchors;
};

const getSceneVisualBaselineRevision = async (
  context: WorkspaceAiContext | null | undefined,
  sceneId: string,
): Promise<string> => {
  const continuity = context?.activeSceneId === sceneId ? context.sceneContinuity : null;
  if (!continuity || !continuity.contextComplete || continuity.entrySnapshotStale
    || continuity.validationStatus !== 'creator_approved' || !continuity.currentEntryState) {
    throw new Error('A current creator-approved Scene entry state is required for visual verification.');
  }
  const baseline = canonicalizeAttachmentJson({
    sceneId,
    previousSceneId: continuity.previousSceneId,
    currentEntryState: continuity.currentEntryState,
    intendedChanges: continuity.intendedChanges,
    validationStatus: continuity.validationStatus,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(baseline));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const AIChatPage: React.FC<AIChatPageProps> = ({ isActive, isAuthenticated, onLoginRequired, onShotSequenceReady, onShotRepairHistory, workspaceContext, storyboardId, activeVyralId: storyboardUniverseId, embedded = false }) => {
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showArchivedChats, setShowArchivedChats] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileStatus, setSelectedFileStatus] = useState<string | null>(null);
  const [activeVyralId, setActiveVyralId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [mediaComposerOpen, setMediaComposerOpen] = useState(false);
  const [mediaTask, setMediaTask] = useState<'image' | 'video' | 'audio'>('image');
  const [mediaQuality, setMediaQuality] = useState<MediaQuality>('standard');
  const [mediaBudgetUsd, setMediaBudgetUsd] = useState('');
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [mediaGenerationStatus, setMediaGenerationStatus] = useState<string | null>(null);
  const [pendingShotRepair, setPendingShotRepair] = useState<PendingShotRepair | null>(null);
  const [projectRecoveryJobs, setProjectRecoveryJobs] = useState<RunwayProjectRecoveryJob[]>([]);
  const [projectRecoveryLoading, setProjectRecoveryLoading] = useState(false);
  const [recoveringProjectJobId, setRecoveringProjectJobId] = useState<string | null>(null);
  const [projectRecoveryError, setProjectRecoveryError] = useState<string | null>(null);
  const mediaRequestControllerRef = useRef<AbortController | null>(null);
  const [historyOwnerId, setHistoryOwnerId] = useState<string | null>(null);
  const [historyAuthRevision, setHistoryAuthRevision] = useState(0);
  const historyOwnerRef = useRef<string | null>(null);
  const historyWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  const refreshProjectRecovery = useCallback(async () => {
    if (!storyboardId || !storyboardUniverseId || !supabase || !isAuthenticated) {
      setProjectRecoveryJobs([]);
      setProjectRecoveryError(null);
      return;
    }
    setProjectRecoveryLoading(true);
    setProjectRecoveryError(null);
    try {
      const jobs = await listRunwayProjectMediaRecovery(supabase, storyboardUniverseId);
      setProjectRecoveryJobs(jobs);
    } catch (error) {
      setProjectRecoveryError(error instanceof Error ? error.message : 'Project generation history could not be loaded.');
    } finally {
      setProjectRecoveryLoading(false);
    }
  }, [storyboardId, storyboardUniverseId, isAuthenticated]);

  const recoverProjectGeneration = async (jobId: string) => {
    if (!supabase || !storyboardUniverseId || recoveringProjectJobId) return;
    const controller = new AbortController();
    setRecoveringProjectJobId(jobId);
    setProjectRecoveryError(null);
    setMediaGenerationStatus('Checking the saved generation job. VYRA will not submit it again…');
    try {
      const result = await recoverRunwayProjectMediaJob(supabase, storyboardUniverseId, jobId, controller.signal);
      if (result.status === 'ready') {
        const assets = 'assets' in result ? result.assets : [];
        if (assets.length && supabase) {
          const previews: ProjectMediaPreview[] = [];
          for (let index = 0; index < assets.length; index++) {
            const asset = assets[index];
            const { data: signed, error: signedError } = await supabase.storage.from('vyral-assets').createSignedUrl(asset.storagePath, 3600);
            previews.push({ assetId: asset.assetId, name: 'Recovered Asset ' + (index + 1), mimeType: asset.mimeType, ...(!signedError && signed?.signedUrl ? { url: signed.signedUrl } : {}) });
          }
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', status: 'success', mediaAssets: previews,
            content: 'Recovered ' + assets.length + ' Project Asset(s). verification is complete.' }]);
        }
        setMediaGenerationStatus(assets.length
          ? 'Recovered ' + assets.length + ' Project Asset(s). verification is complete.'
          : 'This generation job is already recovered.');
      } else if (result.status === 'submitted_pending') {
        setMediaGenerationStatus('The provider is still processing this job. Check again shortly.');
      } else if (result.status === 'reconciliation_required') {
        setMediaGenerationStatus('This job needs provider reconciliation. It was not resubmitted.');
      } else {
        setMediaGenerationStatus('Generation job status: ' + result.status + '.');
      }
      await refreshProjectRecovery();
    } catch (error) {
      setProjectRecoveryError(error instanceof Error ? error.message : 'The saved generation job could not be recovered.');
    } finally {
      setRecoveringProjectJobId(null);
    }
  };

  useEffect(() => {
    if (isActive && storyboardId) void refreshProjectRecovery();
  }, [isActive, storyboardId, storyboardUniverseId, refreshProjectRecovery]);

  const cancelActiveRequest = () => {
    const controller = activeRequestControllerRef.current;
    if (!controller) return;
    activeRequestControllerRef.current = null;
    controller.abort();
    setIsSending(false);
  };

  useEffect(() => () => {
    activeRequestControllerRef.current?.abort();
    activeRequestControllerRef.current = null;
  }, []);

  useEffect(() => () => {
    mediaRequestControllerRef.current?.abort();
    mediaRequestControllerRef.current = null;
  }, []);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentFilesRef = useRef(new Map<string, File>());


  // Keep conversation data mounted across navigation, but dismiss transient chat overlays.
  useEffect(() => {
    if (!isActive) {
      setHistoryOpen(false);
      setActionsOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    let active = true;
    if (storyboardId) {
      setActiveVyralId(storyboardUniverseId ?? null);
      return () => { active = false; };
    }
    if (!historyOwnerId || !supabase) {
      setActiveVyralId(null);
      return () => { active = false; };
    }
    const storageKey = 'vyra_active_vyral_v1:' + historyOwnerId;
    let storedId: string | null = null;
    try { storedId = localStorage.getItem(storageKey); } catch { storedId = null; }
    if (!storedId) {
      setActiveVyralId(null);
      return () => { active = false; };
    }
    void supabase.from('vyrals').select('id,name').eq('id', storedId).eq('user_id', historyOwnerId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setActiveVyralId(null);
          try { localStorage.removeItem(storageKey); } catch { /* storage is optional */ }
          return;
        }
        setActiveVyralId(String(data.id));
      });
    return () => { active = false; };
  }, [historyOwnerId, storyboardId, storyboardUniverseId]);



  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextOwnerId = session?.user?.id ?? null;
      const currentOwnerId = historyOwnerRef.current;
      if (currentOwnerId && currentOwnerId !== nextOwnerId) {
        // Clear private conversation and attachment state synchronously on
        // identity change; do not wait for the next account's history query.
        cancelActiveRequest();
        historyOwnerRef.current = null;
        setHistoryOwnerId(null);
        setSessions([]);
        setMessages([]);
        setActiveSessionId(null);
        setIsLocked(false);
        setSelectedFile(null);
        setSelectedFileStatus(null);
        setActiveVyralId(null);
        
        setDraft('');
        setHistoryError(null);
      }
      setHistoryAuthRevision((revision) => revision + 1);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const supabaseClient = supabase;
    if (!isAuthenticated || !supabaseClient) {
      cancelActiveRequest();
      historyOwnerRef.current = null;
      setHistoryOwnerId(null);
      setSessions([]);
      setMessages([]);
      setActiveSessionId(null);
      setIsLocked(false);
      setHistoryError(null);
      setHistoryReady(true);
      return () => { active = false; };
    }

    setHistoryReady(false);
    setHistoryError(null);
    if (storyboardId) { cancelActiveRequest(); setMessages([]); setActiveSessionId(null); setIsLocked(false); }
    const previousOwnerId = historyOwnerRef.current;
    // Stop work under the previous identity before any asynchronous auth/history checks.
    if (previousOwnerId) cancelActiveRequest();
    // Invalidate queued writes immediately while the current auth identity is revalidated.
    historyOwnerRef.current = null;
    const loadHistory = async () => {
      const { data: userResult, error: userError } = await supabaseClient.auth.getUser();
      if (!active) return;
      if (userError || !userResult.user) throw new Error('Sign in again to load your saved conversations.');
      const ownerId = userResult.user.id;
      let historyQuery = supabaseClient
        .from('vyra_ai_chat_conversations')
        .select('id,title,messages,archived,locked,updated_at')
        .eq('user_id', ownerId);
      if (storyboardId) historyQuery = historyQuery.eq('id', storyboardId);
      else historyQuery = historyQuery.order('updated_at', { ascending: false }).limit(100);
      const { data, error } = await historyQuery;
      if (error) throw new Error('Saved chat history is temporarily unavailable.');
      if (previousOwnerId && previousOwnerId !== ownerId) {
        setMessages([]);
        setActiveSessionId(null);
        setIsLocked(false);
      }
      const loaded = (data ?? []).map((row) => {
        const rawMessages = Array.isArray(row.messages) ? row.messages : [];
        const safeMessages = rawMessages.flatMap((item: unknown) => {
          if (!item || typeof item !== 'object') return [];
          const message = item as Record<string, unknown>;
          if (typeof message.id !== 'string' ||
              (message.role !== 'user' && message.role !== 'assistant') ||
              typeof message.content !== 'string') return [];
          return [{
            id: message.id,
            role: message.role,
            content: message.content,
            ...(message.status === 'success' || message.status === 'preview' || message.status === 'error' || message.status === 'cancelled' ? { status: message.status } : {}),
            ...(typeof message.providerLabel === 'string' ? { providerLabel: message.providerLabel } : {}),
            ...(Array.isArray(message.mediaAssets) ? { mediaAssets: message.mediaAssets.flatMap((entry: unknown) => {
              if (!entry || typeof entry !== 'object') return [];
              const asset = entry as Record<string, unknown>;
              return typeof asset.assetId === 'string' && typeof asset.name === 'string' && typeof asset.mimeType === 'string'
                ? [{ assetId: asset.assetId, name: asset.name, mimeType: asset.mimeType }] : [];
            }) } : {}),
            ...(message.action && typeof message.action === 'object' && (['storyboard-create-draft', 'storyboard-create-complete', 'storyboard-update-draft', 'storyboard-update-complete', 'storyboard-delete-draft', 'storyboard-delete-complete', 'vyral-create-draft', 'vyral-create-complete', 'vyral-asset-upload-draft', 'vyral-asset-upload-complete'].includes(String((message.action as Record<string, unknown>).type))) ? { action: message.action as GlobalChatAction } : {}),
          } as ChatMessage];
        });
        const date = new Date(row.updated_at);
        return {
          id: row.id,
          title: typeof row.title === 'string' ? row.title : 'New chat',
          updatedAt: Number.isNaN(date.getTime()) ? 'Saved' : date.toLocaleDateString(),
          messages: safeMessages,
          archived: Boolean(row.archived),
          locked: Boolean(row.locked),
        } as ChatSession;
      }).filter((session) => session.messages.length > 0);
      if (storyboardId && supabaseClient) {
        const previewIds = [...new Set(loaded.flatMap((session) => session.messages.flatMap((message) => message.mediaAssets?.map((asset) => asset.assetId) ?? [])))];
        if (previewIds.length) {
          const { data: previewRows, error: previewError } = await supabaseClient.from('vyral_assets')
            .select('id,name,mime_type,storage_path').eq('user_id', ownerId).eq('vyral_id', storyboardUniverseId)
            .eq('processing_status', 'ready').in('id', previewIds);
          if (!previewError && Array.isArray(previewRows)) {
            const urls = new Map<string, string>();
            for (const asset of previewRows) {
              if (typeof asset.storage_path !== 'string' || typeof asset.id !== 'string') continue;
              const { data: signed } = await supabaseClient.storage.from('vyral-assets').createSignedUrl(asset.storage_path, 3600);
              if (signed?.signedUrl) urls.set(asset.id, signed.signedUrl);
            }
            for (const session of loaded) session.messages = session.messages.map((message) => ({
              ...message,
              ...(message.mediaAssets ? { mediaAssets: message.mediaAssets.flatMap((asset) => {
                const url = urls.get(asset.assetId);
                return url ? [{ ...asset, url }] : [];
              }) } : {}),
            }));
          }
        }
      }
      if (!active) return;
      historyOwnerRef.current = ownerId;
      setHistoryOwnerId(ownerId);
      setSessions(loaded);
      if (storyboardId) {
        const storyboardSession = loaded.find((session) => session.id === storyboardId);
        setMessages(storyboardSession?.messages ?? []);
        setActiveSessionId(storyboardSession?.id ?? null);
        setIsLocked(Boolean(storyboardSession?.locked));
      }
    };

    void loadHistory()
      .catch((error) => {
        if (!active) return;
        setHistoryOwnerId(null);
        setHistoryError(error instanceof Error ? error.message : 'Saved chat history could not be loaded.');
      })
      .finally(() => { if (active) setHistoryReady(true); });
    return () => { active = false; };
  }, [isAuthenticated, historyAuthRevision, storyboardId, storyboardUniverseId]);

  useLayoutEffect(() => {
    const container = chatScrollRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior: isSending ? 'auto' : 'smooth' });
  }, [messages, isSending]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Measure and apply height before paint so the composer never flashes between sizes.
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, 144);
    textarea.style.height = `${nextHeight}px`;
    const nextIsMultiline = nextHeight > 48;
    setIsMultiline((current) => current === nextIsMultiline ? current : nextIsMultiline);
  }, [draft]);

  const hasMessages = messages.length > 0;
  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    return firstUserMessage.length > 42 ? firstUserMessage.slice(0, 42) + '…' : firstUserMessage || 'New chat';
  }, [messages]);

  const persistSession = useCallback((session: ChatSession) => {
    const client = supabase;
    const ownerId = historyOwnerId;
    if (!client || !ownerId) return Promise.resolve(false);

    // Serialize writes so a slower, older transcript cannot overwrite a newer one.
    const write = historyWriteQueueRef.current.then(async () => {
      // A queued write must never run after sign-out or an account switch.
      if (historyOwnerRef.current !== ownerId) return false;
      const storedMessages = session.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        ...(message.status ? { status: message.status } : {}),
        ...(message.providerLabel ? { providerLabel: message.providerLabel } : {}),
        ...(message.mediaAssets?.length ? { mediaAssets: message.mediaAssets.map(({ assetId, name, mimeType }) => ({ assetId, name, mimeType })) } : {}),
        ...(message.action ? { action: message.action } : {}),
      }));
      const { error } = await client.from('vyra_ai_chat_conversations').upsert({
        id: storyboardId ?? session.id,
        user_id: ownerId,
        title: (session.title || 'New chat').slice(0, 160),
        messages: storedMessages,
        archived: Boolean(session.archived),
        locked: Boolean(session.locked),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (historyOwnerRef.current !== ownerId) return false;
      if (error) {
        setHistoryError('Chat history could not be saved. Please keep this page open and retry.');
        return false;
      }
      setHistoryError(null);
      return true;
    });
    historyWriteQueueRef.current = write.then(() => undefined, () => undefined);
    return write;
  }, [historyOwnerId, storyboardId]);

  useEffect(() => {
    if (!historyReady || !historyOwnerId || !activeSessionId || !messages.length) return;
    const session: ChatSession = {
      id: activeSessionId,
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived: false,
      locked: isLocked,
    };
    const timeout = window.setTimeout(() => {
      void persistSession(session).then((saved) => {
        if (saved) setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [historyReady, historyOwnerId, activeSessionId, messages, currentTitle, isLocked, persistSession]);

  const saveCurrentSession = async (archived = false): Promise<boolean> => {
    if (!hasMessages) return true;
    const session: ChatSession = {
      id: activeSessionId ?? storyboardId ?? crypto.randomUUID(),
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived,
      locked: isLocked,
    };
    const saved = await persistSession(session);
    if (!saved) return false;
    setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
    return true;
  };

  const startNewChat = async () => {
    const ownerAtStart = historyOwnerRef.current;
    cancelActiveRequest();
    const saved = await saveCurrentSession();
    if (!saved || historyOwnerRef.current !== ownerAtStart) return;
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    pendingAttachmentFilesRef.current.clear();
    setSelectedFile(null);
    setSelectedFileStatus(null);
    
    
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const openSession = (session: ChatSession) => {
    // A stale history row must not be opened after the authenticated owner changes.
    const ownerId = historyOwnerId;
    if (!ownerId || historyOwnerRef.current !== ownerId ||
        !sessions.some((item) => item.id === session.id)) return;
    cancelActiveRequest();
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setIsLocked(Boolean(session.locked));
    pendingAttachmentFilesRef.current.clear();
    setSelectedFile(null);
    setSelectedFileStatus(null);
    
    
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDraft('');
    setHistoryOpen(false);
  };

  const sendMessage = async (value = draft, retryUserMessageId?: string) => {
    const text = value.trim();
    const retryUserIndex = retryUserMessageId ? messages.findIndex((message) => message.id === retryUserMessageId && message.role === 'user') : -1;
    if (retryUserMessageId && retryUserIndex < 0) return;
    if ((!text && !selectedFile) || isLocked || isSending) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    // Bind this entire turn to the owner whose history is currently validated.
    const requestOwnerId = historyOwnerRef.current;
    if (!requestOwnerId || requestOwnerId !== historyOwnerId) return;
    let visionImages: Array<VisionImage & { assetId: string; assetName: string }> = [];
    
    const attachedFile = selectedFile;
    const uploadClientDraftId = attachedFile ? crypto.randomUUID() : null;
    if (attachedFile && uploadClientDraftId) pendingAttachmentFilesRef.current.set(uploadClientDraftId, attachedFile);
    const attachmentText = selectedFile
      ? `\n\nAttached file: ${selectedFile.name} (${selectedFile.type || 'application/octet-stream'}, ${selectedFile.size.toLocaleString()} bytes)${selectedFileStatus ? `\n${selectedFileStatus}` : ''}`
      : '';
    const userMessage: ChatMessage = retryUserIndex >= 0
      ? messages[retryUserIndex]
      : {
          id: makeId(),
          role: 'user',
          content: (text || 'Please inspect this attachment.') + attachmentText,
        };
    shouldAutoScrollRef.current = true;
    // Retry the original user turn in place; discard the failed assistant turn and anything after it.
    const nextMessages = retryUserIndex >= 0
      ? messages.slice(0, retryUserIndex + 1)
      : [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setSelectedFile(null);
    setSelectedFileStatus(null);
    
    
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    const chatSessionId = activeSessionId ?? storyboardId ?? crypto.randomUUID();
    if (!activeSessionId) setActiveSessionId(chatSessionId);

    setIsSending(true);
    const requestController = new AbortController();
    activeRequestControllerRef.current = requestController;
    const assertRequestCurrent = () => {
      if (activeRequestControllerRef.current !== requestController ||
          historyOwnerRef.current !== requestOwnerId ||
          requestController.signal.aborted) {
        throw new DOMException('This chat request is no longer active.', 'AbortError');
      }
    };
    const awaitForCurrentRequest = async <T,>(operation: PromiseLike<T>): Promise<T> => {
      assertRequestCurrent();
      const result = await operation;
      assertRequestCurrent();
      return result;
    };
    let streamingAssistantId: string | null = null;
    let streamedText = '';
    try {
      let resolvedActiveVyralId = storyboardId ? storyboardUniverseId ?? null : activeVyralId;
      let mentionedVyrals: { id: string; name: string; description?: string }[] = [];
      if (supabase && text && !storyboardId) {
        const { data: authData } = await awaitForCurrentRequest(supabase.auth.getUser());
        assertRequestCurrent();
        if (authData.user?.id !== requestOwnerId) throw new DOMException('The signed-in account changed. Please retry this request.', 'AbortError');
        if (authData.user) {
          const { data: ownedVyrals } = await awaitForCurrentRequest(supabase.from('vyrals')
            .select('id,name,description,metadata').eq('user_id', authData.user.id).limit(150));
          if (ownedVyrals) {
            const ownedRecords = ownedVyrals
              .filter((item) => storyboardId ? item.id === storyboardUniverseId : (item.metadata as Record<string, unknown> | null)?.universe_scope !== 'storyboard')
              .map((item) => ({
                id: String(item.id), name: String(item.name), description: typeof item.description === 'string' ? item.description : '',
              }));
            if (resolvedActiveVyralId) {
              const verifiedActive = ownedRecords.find((item) => item.id === resolvedActiveVyralId);
              if (verifiedActive) {
                try { localStorage.setItem('vyra_active_vyral_v1:' + authData.user.id, verifiedActive.id); } catch { /* in-memory context remains active */ }
              } else {
                resolvedActiveVyralId = null;
                setActiveVyralId(null);
              }
            }
            mentionedVyrals = findMentionedVyrals(text, ownedRecords);
            if (!storyboardId && mentionedVyrals.length === 1) {
              resolvedActiveVyralId = mentionedVyrals[0].id;
              setActiveVyralId(resolvedActiveVyralId);
              try { localStorage.setItem('vyra_active_vyral_v1:' + authData.user.id, resolvedActiveVyralId); } catch { /* in-memory context remains active */ }
            }
          }
        }
      }

      const navigationTarget = extractGlobalChatNavigationTarget(text);
      if (navigationTarget && !selectedFile) {
        const destinationLabels: Record<GlobalChatNavigationTarget, string> = {
          workspace: 'Workspace',
          'my-vyrals': 'My Universes',
          'my-media-library': 'My Media Library',
        };
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          content: 'Opening ' + destinationLabels[navigationTarget] + '… Your conversation has been saved.',
          status: 'success',
        };
        const sessionId = activeSessionId ?? crypto.randomUUID();
        const sessionToSave: ChatSession = {
          id: sessionId,
          title: (() => { const firstUserText = nextMessages.find((message) => message.role === 'user')?.content ?? text; return firstUserText.length > 42 ? firstUserText.slice(0, 42) + '…' : firstUserText || 'New chat'; })(),
          updatedAt: 'Just now',
          messages: [...nextMessages, assistantMessage],
          archived: false,
          locked: isLocked,
        };
        const saved = await persistSession(sessionToSave);
        assertRequestCurrent();
        if (!saved) throw new Error('I could not confirm that this conversation was saved. Please stay here and try again.');
        setMessages(sessionToSave.messages);
        setActiveSessionId(sessionId);
        setSessions((previous) => [sessionToSave, ...previous.filter((item) => item.id !== sessionId)]);
        window.dispatchEvent(new CustomEvent('vyra:global-chat-navigate', { detail: { target: navigationTarget } }));
        return;
      }

      if (isStoryboardDeleteConfirmation(text) && !selectedFile && [...messages].reverse().find((message) => message.role === 'assistant')?.action?.type === 'storyboard-delete-draft') {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-delete-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-delete-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard has already been deleted. I did not repeat the action.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard deletion is unavailable in this environment.');
          const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
          assertRequestCurrent();
          if (authData.user?.id !== requestOwnerId) throw new DOMException('The signed-in account changed. Please retry this action.', 'AbortError');
          if (authError || !authData.user) throw new Error('Sign in again before deleting this Storyboard.');
          const { data: currentCloud, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
            .select('id,updated_at,details')
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id)
            .maybeSingle());
          assertRequestCurrent();
          if (loadError) throw new Error('I could not verify this Storyboard before deletion. Nothing was deleted.');
          if (currentCloud && String(currentCloud.updated_at) !== draft.expectedUpdatedAt) {
            throw new Error('This Storyboard changed after the delete preview was prepared. Nothing was deleted. Ask me to prepare the delete again.');
          }
          if (currentCloud) {
            const details = currentCloud.details && typeof currentCloud.details === 'object'
              ? currentCloud.details as Record<string, unknown>
              : {};
            const deletedAt = new Date().toISOString();
            const { data: deletedRows, error: deleteError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
              .update({ details: { ...details, __vyraDeletedAt: deletedAt }, updated_at: deletedAt })
              .eq('id', draft.storyboardId)
              .eq('user_id', authData.user.id)
              .eq('updated_at', draft.expectedUpdatedAt)
              .select('id'));
            if (deleteError) throw new Error('I could not delete this Storyboard from the cloud. Please retry confirmation. ' + deleteError.message);
            if (!deletedRows?.length) throw new Error('This Storyboard changed or was removed before deletion completed. Nothing else was changed.');
          }
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(cached)) {
              localStorage.setItem(storageKey, JSON.stringify(cached.filter((item) =>
                !item || typeof item !== 'object' || (item as Record<string, unknown>).id !== draft.storyboardId
              )));
            }
          } catch {
            // The cloud row is authoritative; Workspace can rebuild its cache from cloud on next load.
          }
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: '**Storyboard deleted:** ' + draft.storyboardTitle + '\nIt has been removed from your Workspace.',
            status: 'success',
            action: { type: 'storyboard-delete-complete', draftId: draft.id },
          }]);
          return;
        }
      }

      if ((isStoryboardUpdateConfirmation(text) || isNaturalChatApproval(text)) && !selectedFile && [...messages].reverse().find((message) => message.role === 'assistant')?.action?.type === 'storyboard-update-draft') {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-update-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-update-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard update has already been saved. I did not apply it again.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard updates are unavailable in this environment.');
          const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
          assertRequestCurrent();
          if (authData.user?.id !== requestOwnerId) throw new DOMException('The signed-in account changed. Please retry this action.', 'AbortError');
          if (authError || !authData.user) throw new Error('Sign in again before updating this Storyboard.');
          const { data: currentCloud, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
            .select('id,title,topic,created_at,updated_at')
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id)
            .maybeSingle());
          assertRequestCurrent();
          if (loadError) throw new Error('I could not verify this Storyboard before updating it. Please retry confirmation.');
          if (!currentCloud) throw new Error('This Storyboard is no longer available in your account. No changes were made.');
          if (String(currentCloud.updated_at) !== draft.expectedUpdatedAt) throw new Error('This Storyboard changed after the draft was prepared. Ask me to prepare the update again so no newer changes are overwritten.');
          const now = new Date().toISOString();
          const patch = draft.field === 'title'
            ? { title: draft.nextValue, updated_at: now }
            : { topic: draft.nextValue, updated_at: now };
          const { error: updateError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
            .update(patch)
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id));
          if (updateError) throw new Error('I could not save this Storyboard update. Please retry confirmation. ' + updateError.message);
          let cacheWarning = '';
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(cached)) {
              const nextCache = cached.map((item) => {
                if (!item || typeof item !== 'object' || (item as Record<string, unknown>).id !== draft.storyboardId) return item;
                return {
                  ...(item as Record<string, unknown>),
                  [draft.field === 'title' ? 'title' : 'topic']: draft.nextValue,
                  updatedAt: now,
                };
              });
              localStorage.setItem(storageKey, JSON.stringify(nextCache));
            }
          } catch {
            cacheWarning = ' The cloud copy is saved; the device cache will refresh when Workspace opens.';
          }
          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: 'assistant',
            content: '**Storyboard updated:** ' + draft.storyboardTitle + '\n' +
              (draft.field === 'title' ? 'Title: ' : 'Topic: ') + draft.nextValue + cacheWarning,
            status: 'success',
            action: { type: 'storyboard-update-complete', draftId: draft.id },
          };
          setMessages((previous) => [...previous, assistantMessage]);
          return;
        }
      }

      if ((isStoryboardCreateConfirmation(text) || isNaturalChatApproval(text)) && !selectedFile && [...messages].reverse().find((message) => message.role === 'assistant')?.action?.type === 'storyboard-create-draft') {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-create-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-create-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard draft has already been created. I did not create a duplicate.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard creation is unavailable in this environment.');
          const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
          assertRequestCurrent();
          if (authData.user?.id !== requestOwnerId) throw new DOMException('The signed-in account changed. Please retry this action.', 'AbortError');
          if (authError || !authData.user) throw new Error('Sign in again before creating a Storyboard.');
          const now = new Date().toISOString();
          const storyboard = {
            id: draft.id,
            user_id: authData.user.id,
            title: draft.title,
            topic: draft.topic,
            details: { category: '', style: '', mood: '', tags: [], origins: {} },
            created_at: now,
            updated_at: now,
          };
          const { data: existingCloud, error: existingError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
            .select('id,created_at,updated_at')
            .eq('id', draft.id)
            .eq('user_id', authData.user.id)
            .maybeSingle());
          assertRequestCurrent();
          if (existingError) throw new Error('I could not verify whether this Storyboard was already saved. Please retry confirmation.');
          let savedCreatedAt = now;
          let savedUpdatedAt = now;
          if (existingCloud) {
            savedCreatedAt = String(existingCloud.created_at || now);
            savedUpdatedAt = String(existingCloud.updated_at || now);
          } else {
            const { error: createError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards').insert(storyboard));
            if (createError) throw new Error('I could not save this Storyboard. Nothing was reported as created. ' + createError.message);
          }
          let cacheWarning = '';
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const existing = Array.isArray(cached) ? cached.filter((item) =>
              Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
            ) as Record<string, unknown>[] : [];
            const localRecord = {
              id: draft.id, title: draft.title, topic: draft.topic,
              details: storyboard.details, createdAt: savedCreatedAt, updatedAt: savedUpdatedAt,
            };
            localStorage.setItem(storageKey, JSON.stringify([localRecord, ...existing.filter((item) => item.id !== draft.id)]));
          } catch {
            cacheWarning = ' The cloud copy is saved; the device cache will refresh when Workspace opens.';
          }
          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: 'assistant',
            content: '**Storyboard created:** ' + draft.title + '\\n\\n' + draft.topic + cacheWarning,
            status: 'success',
            action: { type: 'storyboard-create-complete', draftId: draft.id },
          };
          setMessages((previous) => [...previous, assistantMessage]);
          return;
        }
      }

      if (isStoryboardDeleteIntent(text) && !selectedFile) {
        const requestedTitle = extractStoryboardDeleteTitle(text);
        if (!requestedTitle) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'Tell me the exact Storyboard title you want to delete. Example: Delete storyboard "Moon Journey". I will show a confirmation preview before deleting anything.',
            status: 'success',
          }]);
          return;
        }
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
        if (authError || !authData.user) throw new Error('Sign in again to manage your Workspace Storyboards.');
        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Use the account-scoped cloud rows if local cache is malformed.
        }
        const { data, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false }));
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);
        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id), title: String(row.title), topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at), updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, requestedTitle);
        if (!matches.length) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I could not find a Storyboard matching "' + requestedTitle + '". Nothing was deleted.', status: 'success' }]);
          return;
        }
        if (matches.length > 1) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I found multiple matching Storyboards. Please use the exact title:\n' + matches.map((item) => '• ' + item.title).join('\n'), status: 'success' }]);
          return;
        }
        const item = matches[0];
        const draft = {
          id: crypto.randomUUID(),
          storyboardId: item.id,
          storyboardTitle: item.title,
          expectedUpdatedAt: item.updatedAt,
        };
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardDeleteDraft(draft),
          status: 'preview', action: { type: 'storyboard-delete-draft', draft },
        }]);
        return;
      }

      if (isStoryboardUpdateIntent(text) && !selectedFile) {
        const parsed = extractStoryboardUpdateRequest(text);
        if (!parsed) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'Tell me the exact Storyboard title, the field (title or topic), and the new value. Example: Update storyboard "Moon Journey" topic to A child explores Mars.',
            status: 'success',
          }]);
          return;
        }
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
        if (authError || !authData.user) throw new Error('Sign in again to update your Workspace Storyboards.');
        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Continue with the account-scoped cloud copy if the device cache is malformed.
        }
        const { data, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false }));
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);
        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id), title: String(row.title), topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at), updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, parsed.storyboardTitle);
        if (!matches.length) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I could not find a Storyboard matching "' + parsed.storyboardTitle + '". No changes were made.', status: 'success' }]);
          return;
        }
        if (matches.length > 1) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I found multiple matching Storyboards. Please use the exact title:\n' + matches.map((item) => '• ' + item.title).join('\n'), status: 'success' }]);
          return;
        }
        const item = matches[0];
        const draft = {
          id: crypto.randomUUID(),
          storyboardId: item.id,
          storyboardTitle: item.title,
          field: parsed.field,
          previousValue: parsed.field === 'title' ? item.title : item.topic,
          expectedUpdatedAt: item.updatedAt,
          nextValue: parsed.value,
        } as const;
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardUpdateDraft(draft),
          status: 'preview', action: { type: 'storyboard-update-draft', draft },
        }]);
        return;
      }

      if (isStoryboardCreateIntent(text) && !selectedFile) {
        const parsed = extractStoryboardCreateRequest(text);
        if (!parsed?.topic) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'What should the Storyboard be about? Tell me the topic or short video idea, and I will prepare a draft for you to review.',
            status: 'success',
          }]);
          return;
        }
        const title = parsed.title.trim() || parsed.topic.trim().slice(0, 80) || 'Untitled Storyboard';
        const draft = { id: crypto.randomUUID(), title, topic: parsed.topic.trim() };
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          content: formatStoryboardCreateDraft(draft),
          status: 'preview',
          action: { type: 'storyboard-create-draft', draft },
        };
        setMessages((previous) => [...previous, assistantMessage]);
        return;
      }

      const requestedStoryboardTitle = extractStoryboardDetailTitle(text);
      if (requestedStoryboardTitle && !selectedFile) {
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
        if (authError || !authData.user) throw new Error('Sign in again to access your Workspace Storyboards.');

        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Ignore malformed device cache and continue with the account-scoped cloud query.
        }

        const { data, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false }));
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);

        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, requestedStoryboardTitle);
        let response: string;
        if (!matches.length) {
          response = 'I could not find a Storyboard matching "' + requestedStoryboardTitle + '". Ask me to show your Storyboards to see the available titles.';
        } else if (matches.length > 1) {
          response = 'I found more than one matching Storyboard. Please use its exact title:\\n' +
            matches.map((item) => '• ' + item.title).join('\\n');
        } else {
          response = formatStoryboardDetail(matches[0]);
        }
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: response, status: 'success' }]);
        return;
      }

      if (isStoryboardListRequest(text) && !selectedFile) {
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
        if (authError || !authData.user) throw new Error('Sign in again to access your Workspace Storyboards.');

        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // A malformed local cache must not prevent reading the account's cloud Storyboards.
        }

        const { data, error: loadError } = await awaitForCurrentRequest(supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false }));
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);

        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardList(merged), status: 'success',
        }]);
        return;
      }

      if (requestController.signal.aborted) throw new DOMException('Generation stopped.', 'AbortError');
      const accessToken = await getCurrentAccessToken();
      assertRequestCurrent();
      const canStreamText = visionImages.length === 0;
      if (canStreamText) {
        streamingAssistantId = makeId();
        setMessages((previous) => [...previous, {
          id: streamingAssistantId!,
          role: 'assistant',
          content: '',
        }]);
      }
      const promptWorkspaceContext = workspaceContext ? (({ continuityRuntime: _localRuntime, ...context }) => context)(workspaceContext) : null;
      const result = await aiService.generateResponse({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        conversationId: chatSessionId,
        ...(resolvedActiveVyralId ? { activeVyralId: resolvedActiveVyralId } : {}),
        ...(attachedFile ? { uploadAttachment: { clientDraftId: uploadClientDraftId!, fileName: attachedFile.name, mimeType: attachedFile.type || 'application/octet-stream', sizeBytes: attachedFile.size } } : {}),
        ...(promptWorkspaceContext ? { workspaceContext: promptWorkspaceContext } : {}),
        ...(accessToken ? { accessToken } : {}),
        signal: requestController.signal,
        idempotencyKey: 'chat-' + makeId(),
        ...(canStreamText ? {
          onTextDelta: (chunk: string) => {
            if (activeRequestControllerRef.current !== requestController ||
                historyOwnerRef.current !== requestOwnerId ||
                requestController.signal.aborted) return;
            const messageId = streamingAssistantId;
            if (!messageId) return;
            streamedText += chunk;
            setMessages((previous) => previous.map((message) => message.id === messageId
              ? { ...message, content: message.content + chunk }
              : message));
          },
        } : {}),
        ...(visionImages.length ? { visionImages: visionImages.map(({ mimeType, data, assetId, assetName }) => ({ mimeType, data, assetId, assetName })) } : {}),
      });
      assertRequestCurrent();
      let assetUploadCompletionText = '';
      const operatorAction = result.operatorAction;
      if (operatorAction?.type === 'asset-upload-approved') {
        const actionId = typeof operatorAction.actionId === 'string' ? operatorAction.actionId : '';
        const clientDraftId = typeof operatorAction.clientDraftId === 'string' ? operatorAction.clientDraftId : '';
        const vyralId = typeof operatorAction.vyralId === 'string' ? operatorAction.vyralId : '';
        const vyralName = typeof operatorAction.vyralName === 'string' ? operatorAction.vyralName : '';
        const fileName = typeof operatorAction.fileName === 'string' ? operatorAction.fileName : '';
        const assetName = typeof operatorAction.assetName === 'string' ? operatorAction.assetName : '';
        const mimeType = typeof operatorAction.mimeType === 'string' ? operatorAction.mimeType : '';
        const sizeBytes = typeof operatorAction.sizeBytes === 'number' ? operatorAction.sizeBytes : -1;
        const sourceFile = pendingAttachmentFilesRef.current.get(clientDraftId);
        const reportUploadFailure = async () => {
          // Never acknowledge an old account's upload action using a newly signed-in session.
          if (historyOwnerRef.current !== requestOwnerId ||
              activeRequestControllerRef.current !== requestController) return;
          if (supabase && actionId) {
            await awaitForCurrentRequest(supabase.functions.invoke('vyra-openai-chat', {
              body: { conversationId: chatSessionId, assetUploadCompletion: { actionId, failed: true } },
            }));
          }
        };
        if (!supabase || !actionId || !/^[0-9a-f-]{36}$/i.test(clientDraftId) ||
            !/^[0-9a-f-]{36}$/i.test(vyralId) || !sourceFile ||
            sourceFile.name !== fileName || sourceFile.size !== sizeBytes ||
            (sourceFile.type || 'application/octet-stream').toLowerCase() !== mimeType.toLowerCase()) {
          await reportUploadFailure();
          throw new Error('The approved upload no longer matches the exact file attached in this chat. Nothing was transferred. Please attach the file again and prepare a fresh preview.');
        }
        try {
          const { data: authData, error: authError } = await awaitForCurrentRequest(supabase.auth.getUser());
          assertRequestCurrent();
          if (authData.user?.id !== requestOwnerId) throw new DOMException('The signed-in account changed. Please retry this action.', 'AbortError');
          if (authError || !authData.user) throw new Error('Sign in again before transferring this Asset.');
          const { data: destination, error: destinationError } = await awaitForCurrentRequest(supabase.from('vyrals')
            .select('id,name').eq('id', vyralId).eq('user_id', authData.user.id).maybeSingle());
          assertRequestCurrent();
          if (destinationError || !destination || destination.name !== vyralName || (storyboardId && destination.id !== storyboardUniverseId)) {
            throw new Error('The destination Vyral could not be re-verified for your account. No file was transferred.');
          }
          const ingested = await ingestVyralAsset(createSupabaseVyralAssetIngestionPort(supabase), {
            vyralId: destination.id, userId: authData.user.id, file: sourceFile, assetName,
            signal: requestController.signal,
            metadata: { upload_source: 'creator_workspace', origin: storyboardId ? 'storyboard_ai_chat' : 'global_ai_chat', ...(storyboardId ? { storyboard_id: storyboardId } : {}), chat_upload_draft_id: clientDraftId },
          });
          let mediaLibraryMessage = '';
          try {
            await awaitForCurrentRequest(registerVyralAssetInMediaLibrary({
              assetId: ingested.assetId, userId: authData.user.id, fileName: sourceFile.name,
              mimeType: ingested.mimeType, sizeBytes: ingested.sizeBytes, storagePath: ingested.storagePath,
              sourceKind: 'vyral_asset', universeId: storyboardId ? destination.id : undefined, thumbnailSource: sourceFile,
            }));
            mediaLibraryMessage = storyboardId ? '\n**Storyboard Universe:** Added automatically.' : '\n**My Media Library:** Added automatically.';
          } catch {
            mediaLibraryMessage = storyboardId ? '\n**Storyboard Universe:** Sync is pending; the Asset is safely stored in this Universe.' : '\n**My Media Library:** Sync is pending; the Asset is safely stored in its Universe.';
          }
          assertRequestCurrent();
          const { data: completion, error: completionError } = await awaitForCurrentRequest(supabase.functions.invoke('vyra-openai-chat', {
            body: {
              conversationId: chatSessionId,
              assetUploadCompletion: { actionId, clientDraftId, assetId: ingested.assetId, versionId: ingested.versionId },
            },
          }));
          assertRequestCurrent();
          if (completionError || completion?.status !== 'completed') {
            throw new Error('The Asset file was saved, but the server could not finalize the approved upload audit. Refresh the Universe before retrying.');
          }
          pendingAttachmentFilesRef.current.delete(clientDraftId);
          assetUploadCompletionText = '\n\n**Asset saved to Universe:** ' + destination.name +
            '\n**Asset name:** ' + assetName +
            '\n**Original file:** ' + sourceFile.name +
            '\n**Asset ID:** ' + ingested.assetId +
            '\n**Status:** Ready' + mediaLibraryMessage;
        } catch (uploadError) {
          await reportUploadFailure();
          throw uploadError;
        }
      }

      // A provider response or post-response Asset transfer may finish after sign-out.
      // Never publish that old request's completion into the next account's chat.
      if (activeRequestControllerRef.current !== requestController) return;
      let assistantResponseContent = result.status === 'error' && streamedText
        ? streamedText + '\n\n' + result.content : result.content;
      const completedMessage: ChatMessage = {
        id: streamingAssistantId ?? makeId(),
        role: 'assistant',
        content: result.cancelled
          ? (streamedText ? streamedText + '\n\nGeneration stopped.' : 'Generation stopped before a response was received.')
          : assistantResponseContent + assetUploadCompletionText,
        status: result.cancelled ? 'cancelled' : result.status,
        providerLabel: [result.providerName, result.modelName].filter(Boolean).join(' · '),
      };
      if (streamingAssistantId) {
        const messageId = streamingAssistantId;
        setMessages((previous) => previous.map((message) => message.id === messageId ? completedMessage : message));
      } else {
        setMessages((previous) => [...previous, completedMessage]);
      }
    } catch (error) {
      if (activeRequestControllerRef.current !== requestController ||
          historyOwnerRef.current !== requestOwnerId) return;
      const wasCancelled = requestController.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      const message = wasCancelled ? 'Generation stopped.' : error instanceof Error ? error.message : 'VYRA AI could not complete this request. Please try again.';
      if (wasCancelled) {
        const cancelledMessage: ChatMessage = { id: streamingAssistantId ?? makeId(), role: 'assistant', content: streamedText ? streamedText + '\n\nGeneration stopped.' : message, status: 'cancelled' };
        if (streamingAssistantId) setMessages((previous) => previous.map((item) => item.id === streamingAssistantId ? cancelledMessage : item));
        else setMessages((previous) => [...previous, cancelledMessage]);
      } else if (streamingAssistantId) {
        const messageId = streamingAssistantId;
        setMessages((previous) => previous.map((item) => item.id === messageId
          ? { ...item, content: item.content ? item.content + '\n\n' + message : message, status: 'error' }
          : item));
      } else {
        const lastAssistantAction = [...messages].reverse().find((item) => item.role === 'assistant')?.action;
        const naturalApprovalAttempt = isNaturalChatApproval(text) || isStoryboardDeleteConfirmation(text) ||
          isStoryboardUpdateConfirmation(text) || isVyralAssetUploadConfirmation(text) ||
          isStoryboardCreateConfirmation(text);
        const preservedUpload = lastAssistantAction?.type === 'vyral-asset-upload-draft' &&
          naturalApprovalAttempt && error instanceof VyralAssetIngestionError && error.preservedForRecovery;
        if (preservedUpload && lastAssistantAction?.type === 'vyral-asset-upload-draft') {
          pendingAttachmentFilesRef.current.delete(lastAssistantAction.draft.id);
        }
        const retryDraftAction = preservedUpload || !naturalApprovalAttempt ||
          !lastAssistantAction || ![
            'storyboard-delete-draft', 'storyboard-update-draft', 'storyboard-create-draft',
            'vyral-asset-upload-draft',
          ].includes(lastAssistantAction.type)
          ? undefined
          : lastAssistantAction;
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: preservedUpload ? message + ' The source Asset was preserved for recovery; open Project Storage and retry recovery. Asset ID: ' + (error instanceof VyralAssetIngestionError ? error.assetId ?? 'not returned' : 'unknown') : message,
          status: 'error',
          ...(retryDraftAction ? { action: retryDraftAction } : {}),
        }]);
      }
    } finally {
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = null;
        setIsSending(false);
      }
    }
  };

  const startProjectMediaGeneration = async (repairRequest?: PendingShotRepair) => {
    const prompt = repairRequest?.promptText ?? draft.trim();
    if (repairRequest && repairRequest.storyboardId !== storyboardId) {
      setPendingShotRepair(null);
      setMediaGenerationStatus('This repair belongs to a different Project. Reinspect the active Scene before repairing.');
      return;
    }
    if (!storyboardId || !storyboardUniverseId || !supabase) {
      setMediaGenerationStatus('Open a Project before creating media.');
      return;
    }
    const projectSupabase = supabase;
    if (!isAuthenticated) { onLoginRequired(); return; }
    if (!prompt) { setMediaGenerationStatus('Describe the media you want to create first.'); textareaRef.current?.focus(); return; }
    const effectiveMediaTask = repairRequest ? 'video' : mediaTask;
    const budget = Number(mediaBudgetUsd);
    if (!Number.isFinite(budget) || budget <= 0) {
      setMediaGenerationStatus('Enter the maximum USD budget you are willing to approve.');
      return;
    }
    if (isSending || isGeneratingMedia) return;
    const controller = new AbortController();
    const requestOwnerId = historyOwnerRef.current;
    mediaRequestControllerRef.current = controller;
    const assertMediaRequestCurrent = () => {
      if (mediaRequestControllerRef.current !== controller ||
          historyOwnerRef.current !== requestOwnerId ||
          controller.signal.aborted) {
        throw new DOMException('This media request is no longer active for the signed-in account.', 'AbortError');
      }
    };
    const awaitForCurrentMediaRequest = async <T,>(operation: PromiseLike<T>): Promise<T> => {
      assertMediaRequestCurrent();
      const result = await operation;
      assertMediaRequestCurrent();
      return result;
    };
    setIsGeneratingMedia(true);
    setMediaGenerationStatus('Checking Project destination and requesting a live provider quote…');
    try {
      const sceneContext = workspaceContext ? {
        page: workspaceContext.page,
        activeSceneId: workspaceContext.activeSceneId,
        activeSceneTitle: workspaceContext.activeSceneTitle,
        activeSceneDescription: workspaceContext.activeSceneDescription,
        sceneContinuity: workspaceContext.sceneContinuity,
        continuityRuntime: workspaceContext.continuityRuntime,
        editorView: workspaceContext.editorView,
        selectedTimelineItem: workspaceContext.selectedTimelineItem,
        selectedSceneIds: workspaceContext.selectedSceneIds,
        activeSceneRepairHistory: workspaceContext.activeSceneRepairHistory,
      } : null;
      const selectedSceneId = repairRequest?.scene.id ?? (workspaceContext?.editorView === 'master'
        ? workspaceContext.selectedTimelineItem?.kind === 'scene' ? workspaceContext.selectedTimelineItem.id : null
        : workspaceContext?.page === 'scene-editor' ? workspaceContext.activeSceneId ?? null : null);
      const selectedScene = workspaceContext?.continuityRuntime?.storyboardId === storyboardId
        ? workspaceContext.continuityRuntime.scenes?.find((scene) => scene.id === selectedSceneId)
        : undefined;
      const direction = selectedScene?.creativeDirection;
      const plannedShots = Array.isArray(direction?.shots) ? direction.shots : [];
      const directorScenePlan: CreativeScenePlan | null = selectedScene && direction && plannedShots.length
        ? {
          id: selectedScene.id,
          title: selectedScene.title,
          purpose: direction.purpose ?? '',
          durationSeconds: plannedShots.reduce((sum, shot) => sum + Number(shot.durationSeconds || 0), 0),
          location: direction.location ?? '',
          characters: direction.characters ?? [],
          entryState: direction.entryState ?? '',
          action: direction.action ?? '',
          exitState: direction.exitState ?? '',
          shots: plannedShots,
        }
        : null;
      const activeDirectorScenePlan = repairRequest?.scene ?? directorScenePlan;
      let visualVerification: Parameters<typeof generateRunwayProjectShotSequence>[1]['visualVerification'];
      const visualBaseline = workspaceContext?.activeSceneId === selectedSceneId
        ? workspaceContext.sceneContinuity : null;
      if (effectiveMediaTask === 'video' && activeDirectorScenePlan && visualBaseline?.contextComplete
        && !visualBaseline.entrySnapshotStale && visualBaseline.validationStatus === 'creator_approved'
        && visualBaseline.currentEntryState) {
        const anchors = collectSceneVisualAnchors(visualBaseline.currentEntryState).filter((anchor) => anchor.scope === 'persistent');
        if (anchors.length) {
          const baselineRevision = await getSceneVisualBaselineRevision(workspaceContext, selectedSceneId!);
          visualVerification = {
            baselineRevision,
            anchors,
            getCurrentBaselineRevision: () => getSceneVisualBaselineRevision(workspaceContextRef.current, selectedSceneId!),
            getAnchorsForShot: (shot) => [
              ...anchors,
              { path: 'shot.framing', expectedValue: shot.framing, scope: 'scene_state', visibility: 'required' },
              { path: 'shot.cameraAngle', expectedValue: shot.cameraAngle, scope: 'scene_state', visibility: 'required' },
              { path: 'shot.composition', expectedValue: shot.composition, scope: 'scene_state', visibility: 'required' },
              { path: 'shot.lighting', expectedValue: shot.lighting, scope: 'scene_state', visibility: 'required' },
              { path: 'shot.action', expectedValue: shot.action, scope: 'scene_state', visibility: 'required' },
              { path: 'shot.cameraMovement', expectedValue: shot.cameraMovement, scope: 'scene_state', visibility: 'optional' },
              { path: 'shot.focus', expectedValue: shot.focus, scope: 'scene_state', visibility: 'optional' },
            ],
            inspect: async ({ asset, shot, shotIndex, shotCount, scene, signal, anchors: shotAnchors }) => {
              if (!projectSupabase || !/^video\//i.test(asset.mimeType)) {
                return { observations: [], inspectionComplete: false };
              }
              const { data: signed, error: signedError } = await projectSupabase.storage
                .from('vyral-assets').createSignedUrl(asset.storagePath, 300);
              if (signedError || !signed?.signedUrl) throw new Error('The private generated shot could not be opened for visual inspection.');
              const response = await fetch(signed.signedUrl, {
                cache: 'no-store', redirect: 'error', ...(signal ? { signal } : {}),
              });
              if (!response.ok) throw new Error('The generated shot could not be downloaded for visual inspection.');
              const blob = await response.blob();
              if (blob.size <= 0 || blob.size > 128 * 1024 * 1024) {
                throw new Error('The generated shot exceeds the safe visual inspection size limit.');
              }
              const frames = await extractSelectedVideoFrames(blob, asset.assetId, 'Shot ' + (shotIndex + 1), 4);
              if (!frames.length) return { observations: [], inspectionComplete: false };
              const accessToken = await getCurrentAccessToken();
              if (!accessToken) throw new Error('The signed-in session is unavailable for AI Vision inspection.');
              const vision = await aiService.generateResponse({
                messages: [{
                  role: 'user',
                  content: buildSceneVisualInspectionPrompt({
                    sceneTitle: scene.title,
                    shotIndex,
                    shotCount,
                    shotPurpose: shot.purpose,
                    shotAction: shot.action,
                    anchors: shotAnchors,
                    frameTimesMs: frames.map((frame) => frame.frameTimeMs),
                  }),
                }],
                accessToken,
                signal,
                visionImages: frames.map(({ mimeType, data, assetId, assetName }) => ({
                  mimeType, data, assetId, assetName,
                })),
              });
              if (vision.status !== 'success') throw new Error(vision.errorMessage || 'AI Vision could not inspect the generated shot.');
              return parseSceneVisualInspection(
                vision.content, shotAnchors, frames.map((frame) => frame.frameTimeMs),
              );
            },
            inspectTransition: async ({ previousAsset, currentAsset, previousShot, currentShot, scene, anchors: transitionAnchors, signal }) => {
              const storageClient = projectSupabase;
              if (!storageClient) return { observations: [], inspectionComplete: false };
              const loadBoundaryFrame = async (asset: NonNullable<typeof previousAsset>, boundary: 'opening' | 'closing') => {
                const { data: signed, error: signedError } = await storageClient.storage
                  .from('vyral-assets').createSignedUrl(asset.storagePath, 300);
                if (signedError || !signed?.signedUrl) throw new Error('A private shot boundary frame could not be opened.');
                const response = await fetch(signed.signedUrl, {
                  cache: 'no-store', redirect: 'error', ...(signal ? { signal } : {}),
                });
                if (!response.ok) throw new Error('A shot boundary video could not be downloaded.');
                const blob = await response.blob();
                if (blob.size <= 0 || blob.size > 128 * 1024 * 1024) throw new Error('A shot boundary video exceeds the safe inspection size limit.');
                const frames = await extractSelectedVideoFrames(blob, asset.assetId, boundary + ' shot boundary', 4);
                if (!frames.length) throw new Error('A shot boundary frame could not be decoded.');
                return boundary === 'closing' ? frames[frames.length - 1] : frames[0];
              };
              const [previousFrame, currentFrame] = await Promise.all([
                loadBoundaryFrame(previousAsset, 'closing'),
                loadBoundaryFrame(currentAsset, 'opening'),
              ]);
              const accessToken = await getCurrentAccessToken();
              if (!accessToken) throw new Error('The signed-in session is unavailable for transition inspection.');
              const vision = await aiService.generateResponse({
                messages: [{
                  role: 'user',
                  content: buildSceneVisualTransitionPrompt({
                    sceneTitle: scene.title,
                    previousShot,
                    currentShot,
                    anchors: transitionAnchors,
                  }),
                }],
                accessToken,
                signal,
                visionImages: [
                  { mimeType: previousFrame.mimeType, data: previousFrame.data, assetId: previousFrame.assetId, assetName: 'Previous shot · final frame' },
                  { mimeType: currentFrame.mimeType, data: currentFrame.data, assetId: currentFrame.assetId, assetName: 'Current shot · opening frame' },
                ],
              });
              if (vision.status !== 'success') throw new Error(vision.errorMessage || 'AI Vision could not inspect the shot transition.');
              return parseSceneVisualInspection(vision.content, transitionAnchors, [0, 1]);
            },
          };
        }
      }
      const onGenerationProgress = (progress: Parameters<NonNullable<Parameters<typeof generateRunwayProjectMedia>[1]['onProgress']>>[0]) => {
        if (progress.stage === 'quote') setMediaGenerationStatus('Quote received. Waiting for your approval…');
        else if (progress.stage === 'reserved') setMediaGenerationStatus('Credits reserved. Preparing provider submission…');
        else if (progress.stage === 'submitted') setMediaGenerationStatus('Provider accepted the job. Generating media…');
        else if (progress.stage === 'polling') setMediaGenerationStatus('Generation status: ' + progress.status + '…');
        else if (progress.stage === 'ingesting') setMediaGenerationStatus('Saving output ' + (progress.outputIndex + 1) + ' of ' + progress.outputCount + ' into Project Assets…');
        else if (progress.stage === 'ready') setMediaGenerationStatus('Asset verification completed. Project Assets are ready.');
      };
      const approveQuote = async (quote: Parameters<NonNullable<Parameters<typeof generateRunwayProjectMedia>[1]['requestApproval']>>[0], shotLabel?: string, maxApprovedCostUsd = budget) => {
        const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(quote.estimatedCostUsd);
        const credits = new Intl.NumberFormat().format(quote.estimatedCredits);
        const approvedMax = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(maxApprovedCostUsd);
        const details = ['Approve ' + (shotLabel ? shotLabel + '?' : 'this media generation?'), '',
          'Task: ' + quote.task, 'Quality: ' + quote.quality,
          'Provider / model: ' + quote.provider + ' / ' + quote.model,
          'Estimated cost: ' + money, 'Estimated VYRA credits: ' + credits,
          'Maximum approved cost: ' + approvedMax, '', 'Credits are reserved only after approval.'].join('\\n');
        return window.confirm(details) ? { confirmed: true as const, maxCostUsd: maxApprovedCostUsd } : { confirmed: false as const };
      };
      const result = effectiveMediaTask === 'video' && activeDirectorScenePlan
        ? await generateRunwayProjectShotSequence(projectSupabase, {
          targetVyralId: storyboardUniverseId,
          quality: mediaQuality,
          maxTotalCostUsd: budget,
          maxCostUsdPerShot: budget,
          scene: activeDirectorScenePlan,
          productionTitle: repairRequest?.productionTitle || direction?.productionTitle || workspaceContext?.activeStoryboard?.title || 'Project production',
          logline: repairRequest?.logline || direction?.logline || workspaceContext?.activeStoryboard?.topic || prompt,
          genre: repairRequest?.genre || direction?.genre || 'Unspecified',
          tone: repairRequest?.tone || direction?.tone || 'Unspecified',
          sceneIndex: repairRequest?.sceneIndex ?? direction?.sceneIndex,
          promptText: prompt,
          ...(repairRequest ? { repair: { shotIndex: repairRequest.shotIndex, ...(repairRequest.previousShotAsset ? { previousShotAsset: repairRequest.previousShotAsset } : {}), ...(repairRequest.nextShotAsset ? { nextShotAsset: repairRequest.nextShotAsset } : {}), ...(repairRequest.downstreamShotAssets ? { downstreamShotAssets: repairRequest.downstreamShotAssets } : {}) } } : {}),
          sceneContext,
          signal: controller.signal,
          ...(visualVerification ? { visualVerification } : {}),
          onProgress: onGenerationProgress,
          onShotProgress: (event) => setMediaGenerationStatus('Shot ' + (event.shotIndex + 1) + ' of ' + event.shotCount + ' · ' + event.status + (event.jobId ? ' · Job ' + event.jobId : '')),
          requestApproval: (quote, shot, shotIndex) => approveQuote(quote, 'Shot ' + (shotIndex + 1) + ' — ' + shot.purpose, quote.estimatedCostUsd),
        })
        : await generateRunwayProjectMedia(projectSupabase, {
          targetVyralId: storyboardUniverseId, task: effectiveMediaTask, quality: mediaQuality,
          maxCostUsd: budget, input: { promptText: prompt },
          sceneContext,
          signal: controller.signal,
          onProgress: onGenerationProgress,
          requestApproval: (quote) => approveQuote(quote),
        });
      assertMediaRequestCurrent();
      const isShotSequence = 'completedShots' in result;
      if (result.status === 'approval_declined') {
        setMediaGenerationStatus('Cancelled. No new job was created for the declined shot.');
      } else if ('completedShots' in result && result.status === 'budget_exceeded') {
        const completed = result.completedShots.length;
        setMediaGenerationStatus('Shot sequence paused at Shot ' + ((result.stoppedAtShotIndex ?? 0) + 1) +
          ': the approved total budget would be exceeded. ' + completed + ' earlier shot(s) remain saved in Project Assets.');
      } else if ('completedShots' in result && result.status === 'partial') {
        if (repairRequest) setPendingShotRepair(null);
        const completed = result.completedShots.length;
        const stoppedShot = (result.stoppedAtShotIndex ?? 0) + 1;
        setMediaGenerationStatus('Shot sequence paused at Shot ' + stoppedShot + ' (' + (result.stoppedStatus ?? 'pending') + '). ' +
          completed + ' earlier shot(s) are saved in Project Assets.' +
          (result.stoppedJobId ? ' Recover or check Job ' + result.stoppedJobId + ' before continuing.' : ' Review the failed shot before continuing.'));
      } else if ('completedShots' in result && result.status === 'needs_review') {
        // A needs_review result is never eligible for Editor handoff. Keep every
        // candidate in Project Assets until the complete Scene passes verification.
        const repair = result.completedShots.flatMap((shot) => shot.repairPrompts ?? []).filter(Boolean);
        const findings = result.completedShots.flatMap((shot) => [
          ...(shot.visualVerifications ?? []).map((verification) => ({ verification, label: 'Shot ' + (shot.shotIndex + 1) })),
          ...(shot.transitionVerification ? [{ verification: shot.transitionVerification, label: 'Shot ' + shot.shotIndex + ' → Shot ' + (shot.shotIndex + 1) }] : []),
          ...(shot.outgoingTransitionVerification ? [{ verification: shot.outgoingTransitionVerification, label: 'Shot ' + (shot.shotIndex + 1) + ' outgoing boundary' }] : []),
          ...(shot.downstreamShotVerifications ?? []).map((item) => ({
            verification: item.verification,
            label: 'Shot ' + (item.shotIndex + 1) + ' visual inspection',
          })),
          ...(shot.downstreamTransitionVerifications ?? []).map((item) => ({
            verification: item.verification,
            label: 'Shot ' + (item.previousShotIndex + 1) + ' → Shot ' + (item.currentShotIndex + 1),
          })),
        ].flatMap(({ verification, label }) =>
          verification.findings.filter((finding) => finding.status !== 'match').map((finding) =>
            label + ' · ' + finding.path + ' · ' + finding.status + ' · ' + finding.reason
          )
        ));
        const finalValidationReasons = result.finalSceneValidation?.reasons ?? [];
        const detail = [
          ...findings,
          ...finalValidationReasons,
        ].filter(Boolean).join('\n') || 'The inspection was incomplete or the approved Scene baseline changed during inspection.';
        const failedShot = result.completedShots.find((shot) => shot.shotIndex === result.stoppedAtShotIndex) ?? result.completedShots[result.completedShots.length - 1];
        const failedBoundary = result.failedTransitionBoundary;
        const failedDownstreamShot = failedShot?.downstreamShotVerifications?.find((item) => item.verification.status !== 'consistent');
        const repairTargetShotIndex = failedBoundary?.currentShotIndex ?? failedDownstreamShot?.shotIndex ?? failedShot?.shotIndex;
        const repairTargetShotPlan = repairTargetShotIndex !== undefined ? activeDirectorScenePlan?.shots[repairTargetShotIndex] : undefined;
        const failedShotVerifications = failedShot ? [
          ...(failedShot.visualVerifications ?? []),
          ...(failedShot.transitionVerification ? [failedShot.transitionVerification] : []),
          ...(failedShot.outgoingTransitionVerification ? [failedShot.outgoingTransitionVerification] : []),
          ...(failedShot.downstreamShotVerifications ?? []).map((item) => item.verification),
          ...(failedShot.downstreamTransitionVerifications ?? []).map((item) => item.verification),
        ] : [];
        const baselineChangedDuringReview = failedShotVerifications.some((verification) =>
          verification.limitations.some((limitation) => limitation.includes('approved Scene baseline changed after inspection'))
        );
        const previousShotAsset = failedShot && failedShot.shotIndex > 0
          ? result.completedShots.find((shot) => shot.shotIndex === failedShot.shotIndex - 1)?.assets.find((asset) => /^video\//i.test(asset.mimeType)) ?? repairRequest?.previousShotAsset
          : undefined;
        const downstreamShotAssets: Array<{ shotIndex: number; asset: RunwayProjectOutputAsset }> = [];
        if (failedShot && projectSupabase) {
          const downstreamIndices = (activeDirectorScenePlan?.shots ?? []).map((_shot, index) => index)
            .filter((index) => index > failedShot.shotIndex);
          for (const shotIndex of downstreamIndices) {
            const existing = workspaceContext?.activeSceneDirectorShots?.find((item) => item.shotIndex === shotIndex);
            if (!existing) continue;
            const [assetResult, versionResult] = await Promise.all([
              projectSupabase.from('vyral_assets').select('id,vyral_id,storage_path,mime_type,size_bytes,sha256')
                .eq('id', existing.assetId).eq('vyral_id', storyboardUniverseId).eq('user_id', requestOwnerId).maybeSingle(),
              projectSupabase.from('vyral_asset_versions').select('id,storage_path,mime_type,size_bytes,sha256')
                .eq('id', existing.assetVersionId).eq('asset_id', existing.assetId).eq('user_id', requestOwnerId).maybeSingle(),
            ]);
            const asset = assetResult.data as {
              id: string; vyral_id: string; storage_path: string; mime_type: string | null;
              size_bytes: number | string | null; sha256: string | null;
            } | null;
            const version = versionResult.data as {
              id: string; storage_path: string; mime_type: string | null;
              size_bytes: number | string | null; sha256: string | null;
            } | null;
            if (asset && version && asset.id === existing.assetId && asset.vyral_id === storyboardUniverseId
              && version.id === existing.assetVersionId && typeof version.storage_path === 'string'
              && version.storage_path.length > 0 && asset.storage_path === version.storage_path
              && typeof version.mime_type === 'string' && /^video\//i.test(version.mime_type)
              && typeof version.sha256 === 'string' && Number.isSafeInteger(Number(version.size_bytes))
              && Number(version.size_bytes) > 0) {
              downstreamShotAssets.push({
                shotIndex,
                asset: {
                  assetId: asset.id, versionId: version.id, storagePath: version.storage_path,
                  mimeType: version.mime_type, sizeBytes: Number(version.size_bytes), sha256: version.sha256,
                },
              });
            }
          }
          if (!downstreamShotAssets.length && repairRequest?.downstreamShotAssets?.length) {
            downstreamShotAssets.push(...repairRequest.downstreamShotAssets);
          }
        }
        const repairPreviousShotAsset = repairTargetShotIndex !== undefined && repairTargetShotIndex > 0
          ? downstreamShotAssets.find((item) => item.shotIndex === repairTargetShotIndex - 1)?.asset
            ?? (failedShot?.shotIndex === repairTargetShotIndex
              ? previousShotAsset
              : result.completedShots.find((item) => item.shotIndex === repairTargetShotIndex - 1)?.assets.find((asset) => /^video\//i.test(asset.mimeType)))
          : undefined;
        const repairNextShotAsset = repairTargetShotIndex !== undefined
          ? downstreamShotAssets.find((item) => item.shotIndex === repairTargetShotIndex + 1)?.asset
          : undefined;
        const repairDownstreamShotAssets = repairTargetShotIndex !== undefined
          ? downstreamShotAssets.filter((item) => item.shotIndex > repairTargetShotIndex)
          : [];
        const hasActionableBoundaryMismatch = failedBoundary?.verification.findings.some((finding) => finding.status === 'mismatch') === true;
        const hasActionableDownstreamShotMismatch = failedDownstreamShot?.verification.findings.some((finding) => finding.status === 'mismatch') === true;
        const actionableShotVerification = failedShot?.visualVerifications?.find((verification) =>
          verification.findings.some((finding) => finding.status === 'mismatch')
        );
        const repairInstruction = failedBoundary
          ? hasActionableBoundaryMismatch && repairTargetShotPlan
            ? buildSceneVisualRepairPrompt(failedBoundary.verification, repairTargetShotPlan)
            : undefined
          : failedDownstreamShot
            ? hasActionableDownstreamShotMismatch && repairTargetShotPlan
              ? buildSceneVisualRepairPrompt(failedDownstreamShot.verification, repairTargetShotPlan)
              : undefined
            : actionableShotVerification && repairTargetShotPlan
              ? buildSceneVisualRepairPrompt(actionableShotVerification, repairTargetShotPlan)
              : undefined;
        const targetedRepairPrepared = repairTargetShotIndex !== undefined && repairTargetShotPlan
          && activeDirectorScenePlan && Boolean(repairInstruction) && Boolean(visualVerification) && !baselineChangedDuringReview;
        if (repairRequest && failedShot && onShotRepairHistory) {
          const historyShotIndex = repairTargetShotIndex ?? repairRequest.shotIndex;
          const candidate = !failedDownstreamShot && failedShot.shotIndex === historyShotIndex
            ? failedShot.assets.find((asset) => /^video\//i.test(asset.mimeType))
            : undefined;
          const original = workspaceContext?.activeSceneDirectorShots?.find((item) => item.shotIndex === historyShotIndex);
          const verifications = [
            ...(failedShot.visualVerifications ?? []),
            ...(failedShot.transitionVerification ? [failedShot.transitionVerification] : []),
            ...(failedShot.downstreamShotVerifications ?? []).map((item) => item.verification),
            ...(failedShot.downstreamTransitionVerifications ?? []).map((item) => item.verification),
          ];
          onShotRepairHistory({
            id: makeId(), createdAt: new Date().toISOString(), sceneId: activeDirectorScenePlan?.id ?? repairRequest.scene.id,
            shotId: repairRequest.scene.shots[historyShotIndex]?.id ?? 'unknown',
            shotIndex: historyShotIndex,
            previousAssetId: original?.assetId ?? null, previousAssetVersionId: original?.assetVersionId ?? null,
            candidateAssetId: candidate?.assetId ?? null, candidateAssetVersionId: candidate?.versionId ?? null,
            outcome: 'needs_review',
            baselineRevision: verifications[0]?.baselineRevision ?? visualVerification?.baselineRevision ?? null,
            checkedBoundaryIndices: [
              ...(failedShot.shotIndex === historyShotIndex && failedShot.transitionVerification ? [historyShotIndex - 1] : []),
              ...(failedShot.downstreamTransitionVerifications ?? []).map((item) => item.previousShotIndex),
            ].filter((index) => index >= 0),
            findings: [...findings, ...finalValidationReasons].filter(Boolean).slice(0, 20),
            approvedCostUsd: result.approvedCostUsd,
          });
        }
        const reviewPreviews: ProjectMediaPreview[] = [];
        for (const asset of failedShot?.assets ?? []) {
          const { data: signed, error: signedError } = await awaitForCurrentMediaRequest(
            projectSupabase.storage.from('vyral-assets').createSignedUrl(asset.storagePath, 300),
          );
          reviewPreviews.push({
            assetId: asset.assetId,
            name: 'Shot ' + ((failedShot?.shotIndex ?? 0) + 1) + ' · Continuity review candidate',
            mimeType: asset.mimeType,
            ...(!signedError && signed?.signedUrl ? { url: signed.signedUrl } : {}),
          });
        }
        if (targetedRepairPrepared && repairTargetShotIndex !== undefined && repairTargetShotPlan && activeDirectorScenePlan && repairInstruction && visualVerification) {
          setPendingShotRepair({
            scene: activeDirectorScenePlan, shotIndex: repairTargetShotIndex,
            storyboardId,
            ...(repairPreviousShotAsset ? { previousShotAsset: repairPreviousShotAsset } : {}),
            ...(repairNextShotAsset ? { nextShotAsset: repairNextShotAsset } : {}),
            ...(repairDownstreamShotAssets.length ? { downstreamShotAssets: repairDownstreamShotAssets } : {}),
            promptText: (repairRequest?.originalPromptText ?? prompt) + '\n\nDIRECTOR-LED TARGETED SHOT REPAIR:\n' + repairInstruction,
            originalPromptText: repairRequest?.originalPromptText ?? prompt,
            productionTitle: repairRequest?.productionTitle ?? direction?.productionTitle ?? workspaceContext?.activeStoryboard?.title ?? 'Project production',
            logline: repairRequest?.logline ?? direction?.logline ?? workspaceContext?.activeStoryboard?.topic ?? prompt,
            genre: repairRequest?.genre ?? direction?.genre ?? 'Unspecified',
            tone: repairRequest?.tone ?? direction?.tone ?? 'Unspecified',
            sceneIndex: repairRequest?.sceneIndex ?? direction?.sceneIndex,
          });
          setMediaComposerOpen(true);
        } else {
          setPendingShotRepair(null);
        }
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', status: 'success', mediaAssets: reviewPreviews,
          content: 'Visual continuity review paused the sequence' +
            (failedBoundary ? ' at the boundary Shot ' + (failedBoundary.previousShotIndex + 1) + ' → Shot ' + (failedBoundary.currentShotIndex + 1) + ' (' + failedBoundary.status + ')' : failedDownstreamShot ? ' while rechecking downstream Shot ' + (failedDownstreamShot.shotIndex + 1) : ' after Shot ' + ((result.stoppedAtShotIndex ?? 0) + 1)) +
            (repairRequest
              ? '. The repaired candidate is saved in Project Assets; the previous Editor clip remains unchanged until verification passes.\n\n'
              : '. The generated Asset remains in Project Assets and was not added to the Editor because continuity verification did not pass.\n\n') +
            detail +
            (failedBoundary
              ? targetedRepairPrepared
                ? '\n\nThe failed handoff is Shot ' + (failedBoundary.previousShotIndex + 1) + ' → Shot ' + (failedBoundary.currentShotIndex + 1) + '. VYRA has prepared a separate repair for the receiving Shot ' + (failedBoundary.currentShotIndex + 1) + '; the earlier repair target will not be regenerated.'
                : '\n\nThe handoff inspection did not identify a specific mismatch that can safely guide regeneration. No paid repair was offered; inspect again or review this boundary manually.'
              : '') +
            (baselineChangedDuringReview ? '\n\nThe approved Scene baseline changed during inspection. Refresh the Scene and inspect again before attempting a repair.' : '') + (repair.length ? '\n\n' + repair.join('\n\n') : '') +
            '\n\nNo later shots were generated and no automatic paid regeneration was attempted.',
        }]);
        setMediaGenerationStatus(baselineChangedDuringReview
          ? 'The approved Scene baseline changed during inspection. Refresh the Scene and inspect again before attempting a repair.'
          : failedBoundary
          ? targetedRepairPrepared
            ? 'Continuity mismatch at Shot ' + (failedBoundary.previousShotIndex + 1) + ' → Shot ' + (failedBoundary.currentShotIndex + 1) + '. A targeted repair is ready for Shot ' + (failedBoundary.currentShotIndex + 1) + '.'
            : 'Continuity review needs clearer evidence at Shot ' + (failedBoundary.previousShotIndex + 1) + ' → Shot ' + (failedBoundary.currentShotIndex + 1) + '. No paid repair was offered.'
          : 'Paused for visual continuity review at Shot ' + ((result.stoppedAtShotIndex ?? 0) + 1) +
            (repairRequest
              ? '. The existing Editor clip was kept; the new candidate is available in Project Assets for review.'
              : '. Review the saved shot in Editor; VYRA will not spend credits to regenerate it without your approval.'));
      } else if (result.status === 'ready') {
        let shotSequenceLinkMessage = '';
        if (repairRequest && onShotRepairHistory && 'completedShots' in result) {
          const repairedShot = result.completedShots.find((shot) => shot.shotIndex === repairRequest.shotIndex);
          const candidate = repairedShot?.assets.find((asset) => /^video\//i.test(asset.mimeType));
          const original = workspaceContext?.activeSceneDirectorShots?.find((item) => item.shotIndex === repairRequest.shotIndex);
          onShotRepairHistory({
            id: makeId(), createdAt: new Date().toISOString(), sceneId: activeDirectorScenePlan?.id ?? repairRequest.scene.id,
            shotId: repairRequest.scene.shots[repairRequest.shotIndex]?.id ?? 'unknown',
            shotIndex: repairRequest.shotIndex,
            previousAssetId: original?.assetId ?? null, previousAssetVersionId: original?.assetVersionId ?? null,
            candidateAssetId: candidate?.assetId ?? null, candidateAssetVersionId: candidate?.versionId ?? null,
            outcome: result.finalSceneValidation?.status === 'verified' ? 'verified' : 'needs_review',
            baselineRevision: result.finalSceneValidation?.baselineRevision ?? repairedShot?.visualVerifications?.[0]?.baselineRevision ?? null,
            checkedBoundaryIndices: result.finalSceneValidation?.checkedBoundaryIndices ?? [],
            findings: result.finalSceneValidation?.reasons ?? [],
            approvedCostUsd: result.approvedCostUsd,
          });
        }
        const repairVerificationScope = repairRequest && activeDirectorScenePlan
          ? [
              'shot-level',
              ...(repairRequest.shotIndex > 0 ? ['incoming-boundary'] : []),
              ...(repairRequest.shotIndex + 1 < activeDirectorScenePlan.shots.length ? ['outgoing + downstream boundaries'] : []),
            ].join(', ')
          : 'shot-level';
        if ('completedShots' in result && activeDirectorScenePlan && storyboardId && (!repairRequest || result.finalSceneValidation?.status === 'verified')) {
          const linkedShots = result.completedShots.flatMap((shot) => {
            const asset = shot.assets.find((item) => item.mimeType.toLowerCase().startsWith('video/'));
            const shotPlan = activeDirectorScenePlan.shots[shot.shotIndex];
            return asset && shotPlan ? [{
              shotId: shot.shotId,
              shotIndex: shot.shotIndex,
              durationSeconds: shotPlan.durationSeconds,
              assetId: asset.assetId,
              assetVersionId: asset.versionId,
              mimeType: asset.mimeType,
            }] : [];
          });
          if (linkedShots.length === result.completedShots.length && onShotSequenceReady) {
            onShotSequenceReady({ storyboardId, sceneId: activeDirectorScenePlan.id, shots: linkedShots, ...(repairRequest ? { replaceShot: true } : {}) });
            shotSequenceLinkMessage = repairRequest
              ? 'The verified replacement is in the original Shot position; all other Director shots were preserved.'
              : 'All generated shots are linked to the Scene Project timeline in production order.';
          } else {
            shotSequenceLinkMessage = repairRequest
              ? 'The repair candidate is saved in Project Assets, but final continuity validation was not confirmed; the previous Editor clip was kept.'
              : 'All outputs are saved in Project Assets, but the complete sequence could not be linked to the Editor timeline.';
          }
        }
        const generatedAssets = 'completedShots' in result
          ? result.completedShots.flatMap((shot) => shot.assets.map((asset) => ({ ...asset, shotIndex: shot.shotIndex })))
          : Array.isArray(result.assets) ? result.assets.map((asset) => ({ ...asset, shotIndex: null as number | null })) : [];
        if (!generatedAssets.length) throw new Error('The generation job completed without verified Project Assets.');
        const previews: ProjectMediaPreview[] = [];
        for (let index = 0; index < generatedAssets.length; index++) {
          const asset = generatedAssets[index];
          const { data: signed, error: signedError } = await awaitForCurrentMediaRequest(projectSupabase.storage.from('vyral-assets').createSignedUrl(asset.storagePath, 3600));
          const name = asset.shotIndex === null
            ? 'Generated ' + mediaTask + ' ' + (index + 1)
            : 'Shot ' + (asset.shotIndex + 1) + ' · Generated video';
          previews.push({ assetId: asset.assetId, name, mimeType: asset.mimeType, ...(!signedError && signed?.signedUrl ? { url: signed.signedUrl } : {}) });
        }
        const summary = generatedAssets.map((asset, index) =>
          (asset.shotIndex === null ? (index + 1) + '. ' : 'Shot ' + (asset.shotIndex + 1) + ': ') +
          asset.assetId + ' · ' + asset.mimeType).join('\\n');
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', status: 'success', mediaAssets: previews,
          content: repairRequest
            ? 'Shot ' + (repairRequest.shotIndex + 1) + ' was regenerated and passed final continuity validation for the repaired Shot and every following Shot/boundary in the same approved baseline. Its Editor clip has been replaced; all available downstream shot boundaries were re-inspected.'
            : (isShotSequence
            ? 'The Director shot sequence completed. '
            : 'Media generation completed. ') +
            generatedAssets.length + ' Asset(s) were saved to this Project and passed verification.' +
            (isShotSequence && 'visualVerificationStatus' in result && result.visualVerificationStatus === 'verified'
              ? ' All generated shots also passed the required sampled-frame visual continuity checks; creator approval is still required.'
              : isShotSequence ? ' Visual continuity was not automatically verified because no current creator-approved Scene baseline was available.' : '') +
            '\n\n' + summary,
        }]);
        if (repairRequest) setPendingShotRepair(null); else setDraft('');
        setMediaGenerationStatus(repairRequest
          ? 'Shot ' + (repairRequest.shotIndex + 1) + ' repaired and verified against its approved ' + repairVerificationScope + ' checks. The matching Editor clip has been replaced; all available downstream boundaries were re-inspected.'
          : isShotSequence
          ? 'Completed. All planned shots are saved in Project Assets. ' +
            (isShotSequence && 'visualVerificationStatus' in result && result.visualVerificationStatus === 'verified'
              ? 'Sampled-frame visual continuity checks passed; creator review is still required. '
              : 'Visual continuity remains unverified because no approved baseline was available. ') +
            (shotSequenceLinkMessage || 'Open the Scene to review its timeline links.')
          : 'Completed. Your new media is available in Project Assets.');
      } else if (result.status === 'submitted_pending') {
        if (repairRequest) setPendingShotRepair(null);
        setMediaGenerationStatus('Generation is still processing. Job ID: ' + result.jobId + '. Do not submit this job again.');
      } else if (result.status === 'reconciliation_required') {
        if (repairRequest) setPendingShotRepair(null);
        setMediaGenerationStatus('Provider outcome needs reconciliation. Job ID: ' + result.jobId + '. VYRA will not submit it again automatically.');
      } else {
        setMediaGenerationStatus('Generation ' + result.status + ': ' + ('error' in result ? result.error : 'Please check the generation job.'));
      }
    } catch (error) {
      if (mediaRequestControllerRef.current !== controller || historyOwnerRef.current !== requestOwnerId) return;
      setMediaGenerationStatus(error instanceof Error ? error.message : 'Media generation could not be completed.');
    } finally {
      if (mediaRequestControllerRef.current === controller) {
        mediaRequestControllerRef.current = null;
        setIsGeneratingMedia(false);
      }
    }
  };

  const stopGeneration = () => {
    activeRequestControllerRef.current?.abort();
  };

  const handleFileSelection = async (file: File | null) => {
    setSelectedFile(file);
    
    
    
    if (!file) {
      setSelectedFileStatus(null);
      return;
    }
    setSelectedFileStatus('File metadata only · full content parsing is not available for this file type yet');
  };

  const renameSession = async (session: ChatSession) => {
    const ownerId = historyOwnerId;
    if (!supabase || !ownerId || historyOwnerRef.current !== ownerId) return;
    const proposed = window.prompt('Rename conversation', session.title);
    if (proposed === null) return;
    const title = proposed.trim().slice(0, 160);
    if (!title || title === session.title) return;
    const { error } = await supabase.from('vyra_ai_chat_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', session.id).eq('user_id', ownerId);
    if (historyOwnerRef.current !== ownerId) return;
    if (error) { setHistoryError('This conversation could not be renamed. Please try again.'); return; }
    setSessions((previous) => previous.map((item) => item.id === session.id ? { ...item, title } : item));
    setHistoryError(null);
  };

  const removeSession = async (session: ChatSession) => {
    const ownerId = historyOwnerId;
    if (!supabase || !ownerId || historyOwnerRef.current !== ownerId || !window.confirm('Delete this conversation permanently?')) return;
    const { error } = await supabase.from('vyra_ai_chat_conversations').delete().eq('id', session.id).eq('user_id', ownerId);
    if (historyOwnerRef.current !== ownerId) return;
    if (error) { setHistoryError('This conversation could not be deleted. Please try again.'); return; }
    setSessions((previous) => previous.filter((item) => item.id !== session.id));
    if (activeSessionId === session.id) { setMessages([]); setActiveSessionId(null); setIsLocked(false); }
    setHistoryError(null);
  };

  const restoreSession = async (session: ChatSession) => {
    const ownerId = historyOwnerId;
    if (!supabase || !ownerId || historyOwnerRef.current !== ownerId) return;
    const { error } = await supabase.from('vyra_ai_chat_conversations').update({ archived: false, updated_at: new Date().toISOString() }).eq('id', session.id).eq('user_id', ownerId);
    if (historyOwnerRef.current !== ownerId) return;
    if (error) { setHistoryError('This conversation could not be restored. Please try again.'); return; }
    setSessions((previous) => previous.map((item) => item.id === session.id ? { ...item, archived: false } : item));
    setHistoryError(null);
  };

  const shareCurrentChat = async () => {
    const transcript = messages.map((message) => `${message.role === 'user' ? 'You' : 'VYRA AI'}: ${message.content}`).join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VYRA AI Chat', text: transcript });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcript);
      }
    } catch {
      // The user may cancel the native share sheet.
    }
    setActionsOpen(false);
  };

  const archiveCurrentChat = async () => {
    const ownerAtStart = historyOwnerRef.current;
    const saved = await saveCurrentSession(true);
    if (!saved || historyOwnerRef.current !== ownerAtStart) return;
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    pendingAttachmentFilesRef.current.clear();
    setSelectedFile(null);
    setSelectedFileStatus(null);
    
    
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const deleteCurrentChat = async () => {
    const ownerAtStart = historyOwnerRef.current;
    const sessionId = activeSessionId;
    const ownerId = historyOwnerId;
    // Do not run a destructive action while auth state and its validated owner ref disagree.
    if (ownerId !== ownerAtStart) return;
    if (sessionId && supabase && ownerId) {
      const { error } = await supabase.from('vyra_ai_chat_conversations')
        .delete().eq('id', sessionId).eq('user_id', ownerId);
      if (historyOwnerRef.current !== ownerAtStart) return;
      if (error) {
        setHistoryError('This conversation could not be deleted. Please try again.');
        return;
      }
    }
    if (historyOwnerRef.current !== ownerAtStart) return;
    if (sessionId) {
      setSessions((previous) => previous.filter((session) => session.id !== sessionId));
    }
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    pendingAttachmentFilesRef.current.clear();
    setSelectedFile(null);
    setSelectedFileStatus(null);
    
    
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const toggleLock = () => {
    setIsLocked((previous) => !previous);
    setActionsOpen(false);
  };

  const handleCopy = (content: string) => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(content);
  };

  return (
    <main className={embedded ? "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden" : "fixed inset-x-0 top-[calc(var(--vyra-visual-viewport-top,0px)+109px)] bottom-[var(--vyra-visual-viewport-bottom-gap,0px)] mx-auto min-h-0 w-full max-w-[var(--vyra-content-width)] overflow-hidden px-3 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+64px)] sm:px-6"}>
      <header className={embedded ? "absolute right-2 top-2 z-[60] flex items-start justify-end" : "fixed right-3 top-[calc(var(--vyra-visual-viewport-top,0px)+112px)] z-[60] flex items-start justify-end sm:right-6 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+76px)]"}>
        <div
          className="relative overflow-hidden border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-primary)]"
          style={{
            width: actionsOpen ? 208 : 40,
            height: actionsOpen ? 304 : 40,
            borderRadius: actionsOpen ? '16px' : '50%',
            transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className={`absolute right-0 top-0 z-10 size-10 rounded-full px-0 text-[var(--vyra-text-primary)] ${actionsOpen ? 'bg-transparent hover:bg-[var(--vyra-bg-hover)]' : 'bg-[var(--vyra-bg-surface)] hover:bg-[var(--vyra-bg-hover)]'}`}
            aria-label={actionsOpen ? 'Close chat menu' : 'Open chat menu'}
            title="Chat menu"
            onClick={() => setActionsOpen((open) => !open)}
          >
            {actionsOpen ? <X size={20} /> : <MoreHorizontal size={23} />}
          </Button>
          <div
            aria-hidden={!actionsOpen}
            className={`absolute inset-x-0 bottom-0 top-10 p-1.5 pt-1 text-[var(--vyra-text-primary)] transition-opacity duration-200 ${actionsOpen ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
          >
            {!storyboardId && <>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={() => { setHistoryOpen(true); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <History size={14} /> Recent chats
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <Plus size={14} /> New chat
            </button>
            </>}
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={shareCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Share2 size={14} /> Share chat
            </button>
            {!storyboardId && <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={archiveCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Archive size={14} /> Archive chat
            </button>}
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={toggleLock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {isLocked ? 'Unlock chat' : 'Lock chat'}
            </button>
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            {!storyboardId && <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={deleteCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-danger)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 size={14} /> Delete chat
            </button>}
          </div>
        </div>
      </header>

      <section ref={chatScrollRef} onScroll={(event) => { const element = event.currentTarget; shouldAutoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }} className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {!hasMessages ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 pb-32 pt-20 text-center">
            <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] shadow-lg shadow-cyan-950/10">
              <MessageSquare size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Hello! What would you like to create today?</h1>
            <p className="mt-2 max-w-md text-xs leading-5 text-[var(--vyra-text-secondary)] sm:text-sm">
              Explore ideas, write scripts, plan projects, or ask me anything — about VYRA or beyond.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-1 pb-36 pt-20">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${message.role === 'user' ? 'max-w-[88%]' : 'w-full max-w-full sm:max-w-[94%]'} ${message.role === 'user' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)]'}`}>
                  <AIChatMessageContent content={message.content} />
                  {message.role === 'assistant' && message.mediaAssets?.length ? (
                    <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                      {message.mediaAssets.map((asset) => (
                        <div key={asset.assetId} className="min-w-0 overflow-hidden rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg)]">
                          {asset.url && asset.mimeType.startsWith('image/') ? <img src={asset.url} alt={asset.name} loading="lazy" className="max-h-[420px] w-full object-contain" />
                            : asset.url && asset.mimeType.startsWith('video/') ? <video src={asset.url} controls playsInline preload="metadata" className="max-h-[420px] w-full bg-black" />
                              : asset.url && asset.mimeType.startsWith('audio/') ? <div className="p-3"><p className="mb-2 truncate text-xs text-[var(--vyra-text-primary)]">{asset.name}</p><audio src={asset.url} controls preload="metadata" className="w-full" /></div>
                                : <div className="p-3 text-xs text-[var(--vyra-text-muted)]">Preview unavailable · Asset remains saved in Project Assets</div>}
                          <p className="truncate px-3 py-2 text-[10px] text-[var(--vyra-text-muted)]">{asset.name}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {message.role === 'assistant' && message.providerLabel && <p className="mt-2 text-[10px] text-[var(--vyra-text-muted)]">{message.providerLabel}</p>}
                  {message.role === 'assistant' && message.status === 'preview' && <p className="mt-1 text-[10px] text-[var(--vyra-text-muted)]">Preview response · no live model was confirmed</p>}
                  {message.role === 'assistant' && message.status === 'error' && (() => {
                    const previousUserMessage = messages.slice(0, messages.indexOf(message)).reverse().find((item) => item.role === 'user');
                    const canRetry = previousUserMessage && !/Attached file:|Selected VYRA Assets/.test(previousUserMessage.content);
                    return canRetry ? <button type="button" onClick={() => { void sendMessage(previousUserMessage.content, previousUserMessage.id); }} disabled={isSending} className="mt-2 mr-3 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)] disabled:opacity-40">Retry</button> : null;
                  })()}
                  {message.role === 'assistant' && <button type="button" onClick={() => handleCopy(message.content)} className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]"><Copy size={12} /> Copy</button>}
                </div>
              </div>
            ))}
            {isSending && <p className="text-center text-xs text-[var(--vyra-text-muted)]">VYRA AI is preparing a response…</p>}
          </div>
        )}
      </section>

      <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-[var(--vyra-content-width)] p-0 sm:inset-x-6 sm:bottom-4">
        {isLocked && (
          <p className="mb-2 text-center text-[11px] text-[var(--vyra-text-muted)]">ဒီ Chat ကို Lock လုပ်ထားပါတယ်။ စာပို့ရန် Unlock လုပ်ပါ။</p>
        )}
        <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2">
          {storyboardId && (
            <div className="mb-2 px-1">
              <button type="button" onClick={() => { setMediaComposerOpen((open) => !open); setMediaGenerationStatus(null); }} disabled={isSending || isGeneratingMedia} className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--vyra-text-secondary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50">
                <Sparkles size={14} /> Create media <span className="text-[var(--vyra-text-muted)]">{mediaComposerOpen ? '−' : '+'}</span>
              </button>
              {projectRecoveryJobs.length > 0 && (
                <div className="mt-2 rounded-xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-base)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--vyra-text-primary)]">Unfinished generations</p>
                    <button type="button" onClick={() => { void refreshProjectRecovery(); }} disabled={projectRecoveryLoading || Boolean(recoveringProjectJobId)} className="text-[10px] text-[var(--vyra-text-muted)] underline disabled:opacity-40">{projectRecoveryLoading ? 'Checking…' : 'Refresh'}</button>
                  </div>
                  <div className="space-y-2">
                    {projectRecoveryJobs.map((job) => (
                      <div key={job.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--vyra-border)] px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] text-[var(--vyra-text-primary)]">{job.status === 'succeeded' ? 'Output ready · Asset saving ' + job.assetIngestionStatus : 'Generation ' + job.status}</p>
                          <p className="truncate text-[9px] text-[var(--vyra-text-muted)]">Job {job.id}</p>
                        </div>
                        <button type="button" onClick={() => { void recoverProjectGeneration(job.id); }} disabled={Boolean(recoveringProjectJobId) || projectRecoveryLoading || job.status === 'unknown'} className="shrink-0 rounded-full border border-[var(--vyra-border)] px-3 py-1.5 text-[10px] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40">
                          {recoveringProjectJobId === job.id ? 'Checking…' : job.status === 'unknown' ? 'Needs review' : 'Resume'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {projectRecoveryError && <p role="alert" className="mt-2 break-words text-[10px] text-[var(--vyra-text-muted)]">{projectRecoveryError}</p>}
              {mediaComposerOpen && (
                <>
                {pendingShotRepair && (
                  <div className="mb-3 rounded-lg border border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/5 p-3">
                    <p className="text-xs font-medium text-[var(--vyra-text-primary)]">Shot {pendingShotRepair.shotIndex + 1} needs a continuity repair</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--vyra-text-muted)]">VYRA will regenerate only this shot, inspect its visual continuity again, and replace its current Editor clip only after verification. A fresh quote and your approval are required.</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => { void startProjectMediaGeneration(pendingShotRepair); }} disabled={isGeneratingMedia || isSending || !mediaBudgetUsd.trim()} className="inline-flex h-8 items-center justify-center gap-2 rounded-full bg-[var(--vyra-accent-primary)] px-3 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                        {isGeneratingMedia ? 'Repairing…' : 'Review quote & repair Shot ' + (pendingShotRepair.shotIndex + 1)}
                      </button>
                      <button type="button" onClick={() => setPendingShotRepair(null)} disabled={isGeneratingMedia} className="h-8 rounded-full px-3 text-[11px] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40">Dismiss</button>
                    </div>
                  </div>
                )}
                <div className="mt-2 rounded-xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-base)] p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="flex min-w-0 flex-col gap-1 text-[10px] text-[var(--vyra-text-muted)]">Media type
                      <select value={mediaTask} onChange={(event) => setMediaTask(event.target.value as 'image' | 'video' | 'audio')} disabled={isGeneratingMedia} className="h-9 min-w-0 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)]">
                        <option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-[10px] text-[var(--vyra-text-muted)]">Quality
                      <select value={mediaQuality} onChange={(event) => setMediaQuality(event.target.value as MediaQuality)} disabled={isGeneratingMedia} className="h-9 min-w-0 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)]">
                        <option value="draft">Draft</option><option value="standard">Standard</option><option value="premium">Premium</option>
                      </select>
                    </label>
                    <label className="col-span-2 flex min-w-0 flex-col gap-1 text-[10px] text-[var(--vyra-text-muted)] sm:col-span-2">Maximum budget (USD)
                      <input type="number" min="0.0001" step="0.0001" inputMode="decimal" value={mediaBudgetUsd} onChange={(event) => setMediaBudgetUsd(event.target.value)} disabled={isGeneratingMedia} placeholder="Set your spending limit" className="h-9 w-full min-w-0 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)] placeholder:text-[var(--vyra-text-muted)]" />
                    </label>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-[var(--vyra-text-muted)]">Use the prompt in the chat box below. VYRA shows the live quote and asks for approval before reserving credits.</p>
                  {mediaGenerationStatus && <p role="status" className="mt-2 break-words text-[11px] text-[var(--vyra-text-secondary)]">{mediaGenerationStatus}</p>}
                  <button type="button" onClick={() => { void startProjectMediaGeneration(); }} disabled={isGeneratingMedia || isSending || !draft.trim() || !mediaBudgetUsd.trim()} className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[var(--vyra-accent-primary)] px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    {isGeneratingMedia ? <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Sparkles size={14} />}
                    {isGeneratingMedia ? 'Creating…' : 'Generate in this Project'}
                  </button>
                </div>
                </>
              )}
            </div>
          )}

          {selectedFile && (
            <div className="mb-1 flex items-center gap-2 px-2 text-[10px] text-[var(--vyra-text-muted)]">
              <span className="min-w-0 flex-1 truncate">{selectedFile.name}{selectedFileStatus ? ` · ${selectedFileStatus}` : ''}</span>
              <button type="button" onClick={() => { setSelectedFile(null); setSelectedFileStatus(null); 
      if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Remove attachment" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--vyra-bg-hover)]">
                <X size={13} />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,application/zip"
            onChange={(event) => { void handleFileSelection(event.target.files?.[0] ?? null); }}
          />
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-end gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLocked}
              aria-label="Upload file"
              title="Upload file"
              className={`col-start-1 grid size-11 min-h-11 min-w-11 place-items-center rounded-full text-[var(--vyra-text-muted)] transition-colors hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] active:bg-transparent disabled:opacity-40 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
            >
              <Plus size={21} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
              rows={1}
              disabled={isLocked}
              placeholder={isLocked ? 'Chat locked' : isSending ? 'VYRA AI is thinking…' : 'Message VYRA AI…'}
              aria-label="Message VYRA AI"
              style={{ outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent", WebkitAppearance: "none" }}
              className={`col-start-2 row-start-1 w-full max-h-36 min-h-11 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-6 text-[var(--vyra-text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--vyra-text-muted)] focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent]`}
            />
            <Button
              type={isSending ? "button" : "submit"}
              onClick={isSending ? stopGeneration : undefined}
              size="sm"
              className={`col-start-3 !size-11 !min-h-11 !min-w-11 !rounded-full !p-0 aspect-square shrink-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
              disabled={isSending ? false : ((!draft.trim() && !selectedFile) || isLocked || false)}
              aria-label={isSending ? "Stop generation" : "Send message"}
              title={isSending ? "Stop generation" : "Send message"}
            >
              {isSending ? <span className="size-3.5 rounded-[3px] bg-current" /> : <ArrowUp size={17} />}
            </Button>
          </div>
        </form>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="chat-history-title" className="max-h-[min(80vh,620px)] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--vyra-border-subtle)] px-4 py-3.5">
              <div>
                <h2 id="chat-history-title" className="text-sm font-bold text-[var(--vyra-text-primary)]">Recent chats</h2>
                <p className="mt-0.5 text-[10px] text-[var(--vyra-text-muted)]">{historyError ?? (historyReady ? 'Your conversations' : 'Loading chat history…')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setShowArchivedChats((value) => !value)} className="rounded-lg px-2 py-1.5 text-[10px] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]">{showArchivedChats ? 'Recent' : 'Archived'}</button>
                <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" className="grid size-8 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {!historyReady ? (
                <div className="px-5 py-12 text-center text-xs text-[var(--vyra-text-muted)]">Loading chat history…</div>
              ) : sessions.filter((session) => session.archived === showArchivedChats).length ? sessions.filter((session) => session.archived === showArchivedChats).map((session) => (
                <div key={session.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[var(--vyra-bg-hover)]">
                  <button type="button" onClick={() => openSession(session)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left">
                    <MessageSquare size={16} className="shrink-0 text-[var(--vyra-text-muted)]" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--vyra-text-primary)]">{session.title}</span>
                    <span className="shrink-0 text-[10px] text-[var(--vyra-text-muted)]">{session.updatedAt}</span>
                  </button>
                  {session.archived && <button type="button" onClick={() => void restoreSession(session)} className="rounded-md px-2 py-1 text-[10px] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-surface)]">Restore</button>}
                  <button type="button" onClick={() => void renameSession(session)} aria-label={'Rename '+session.title} className="rounded-md px-2 py-1 text-[10px] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-surface)]">Rename</button>
                  <button type="button" onClick={() => void removeSession(session)} aria-label={'Delete '+session.title} className="rounded-md px-2 py-1 text-[10px] text-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-surface)]">Delete</button>
                </div>
              )) : (
                <div className="px-5 py-12 text-center">
                  <Clock3 size={23} className="mx-auto text-[var(--vyra-text-muted)]" />
                  <p className="mt-3 text-xs font-semibold text-[var(--vyra-text-primary)]">No recent chats yet</p>
                  <p className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">Your conversations will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};