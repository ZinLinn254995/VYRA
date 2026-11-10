import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clapperboard, Copy, Film, Images, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Card } from '../ui/Card';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { ProfileSubpageHeader } from '../profile/ProfileSubpageHeader';
import { getCurrentAccessToken, supabase } from '../../context/AuthContext';
import { isPersistableStoryboardId, mergeWorkspaceStoryboards, workspaceStoryboardSuggestionKey } from '../../services/workspaceStoryboards';
import { parseVyralAiSuggestions } from '../../services/vyralAiDetails';
import { MasterTimelineEditor, type MasterTimelineData } from './MasterTimelineEditor';

type StoryboardAiProvenance = { provider: string; model: string; generatedAt: string };
type SceneRenderRevision = { id: string; createdAt: string; duration: number; storageKey: string; mimeType: string; checksum: string; status: 'ready' };
type SceneProjectClip = { id: string; name: string; start: number; duration: number; assetId?: string | null; content?: string };
type SceneProjectTrack = { id: string; type: 'video' | 'audio' | 'text'; name: string; muted?: boolean; hidden?: boolean; clips: SceneProjectClip[] };
type SceneProjectTimeline = { duration: number; fps: number; width: number; height: number; tracks: SceneProjectTrack[] };
type SceneProjectData = { id: string; schemaVersion: 1; createdAt: string; updatedAt: string; renderRevisionIds: string[]; renderRevisions?: SceneRenderRevision[]; latestRenderRevisionId?: string | null; timeline?: SceneProjectTimeline };
type StoryboardScene = { id: string; title: string; description: string; duration: number; transition: string; project?: SceneProjectData };
type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string; details?: { category?: string; style?: string; mood?: string; tags?: string[]; scenes?: StoryboardScene[]; masterTimeline?: MasterTimelineData; globalMusic?: string; globalTitle?: string; origins?: Record<string, 'ai_suggested' | 'creator_edited'>; ai_provenance?: StoryboardAiProvenance } };
type LibraryPage = 'my-vyrals' | 'my-media-library';
type Props = { storageKey: string; seedDemoStoryboards?: boolean; isAuthenticated: boolean; onLoginRequired: () => void; onOpenLibraryPage: (page: LibraryPage) => void };

const readStoryboards = (key: string): Storyboard[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is Storyboard =>
      Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.topic === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    ).map((storyboard) => ({
      ...storyboard,
      details: storyboard.details ? {
        ...storyboard.details,
        scenes: (storyboard.details.scenes || []).map((scene) => {
          if (scene.project?.id) return scene;
          const now = new Date().toISOString();
          return {
            ...scene,
            project: { id: crypto.randomUUID(), schemaVersion: 1 as const, createdAt: now, updatedAt: now, renderRevisionIds: [] },
          };
        }),
      } : storyboard.details,
    })) : [];
  } catch { return []; }
};

const loadInitialStoryboards = (key: string, seedDemoStoryboards: boolean): Storyboard[] => {
  const existing = readStoryboards(key);
  if (existing.length || !seedDemoStoryboards) return existing;

  const markerKey = key + ':demo-storyboards-seeded';
  try {
    if (localStorage.getItem(markerKey) === '1') return existing;
    const now = new Date().toISOString();
    const samples: Storyboard[] = [
      { id: 'demo-myanmar-folktale', title: 'Myanmar Folktale — The Golden Peacock', topic: 'A cinematic retelling of a Myanmar folktale, with a clear beginning, a magical journey and a meaningful ending.', createdAt: now, updatedAt: now },
      { id: 'demo-product-promotion', title: 'Product Promotion — Smart Bottle', topic: 'A short product video introducing the key features, everyday benefits and a memorable call to action.', createdAt: now, updatedAt: now },
      { id: 'demo-science-explainer', title: 'Science Explainer — Black Holes', topic: 'An easy-to-follow visual explanation of black holes, gravity and how light behaves near the event horizon.', createdAt: now, updatedAt: now },
    ];
    localStorage.setItem(markerKey, '1');
    localStorage.setItem(key, JSON.stringify(samples));
    return samples;
  } catch { return existing; }
};

const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)]';

const updateStoryboardHeaderCompact = (content: HTMLElement, scrollTop = content.scrollTop) => {
  const header = content.closest<HTMLElement>('.profile-subpage-card')?.querySelector<HTMLElement>('.profile-collapse-header');
  if (!header) return;

  // Snap between the two complete layouts. Do not tie the animation progress
  // to every scroll pixel: that can leave the header frozen halfway through
  // its transition when the user pauses scrolling.
  // Any real upward scroll should compact the header, even when the page has little or no data.
  const compact = scrollTop > 0;
  const headerProgress = compact ? 1 : 0;

  const expandedHeight = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-expanded')) || 148;
  const collapseDistance = 76;
  header.style.setProperty('--profile-header-progress', String(headerProgress));
  // The header completes its full-height change; the flex content area then
  // automatically receives the remaining viewport height.
  header.style.setProperty('--profile-header-height', (expandedHeight - collapseDistance * headerProgress) + 'px');
  header.style.setProperty('--profile-header-shift-y', (44 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-shift-x', (48 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-icon-rotation', '0deg');
  header.style.setProperty('--profile-header-title-shift-y', (40 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-title-shift-x', (48 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-icon-size', (44 - 8 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-title-size', ((window.innerWidth < 640 ? 21 : 24) - 4 * headerProgress) + 'px');
  header.style.setProperty('--profile-header-action-shift', (42 * headerProgress) + 'px');
  header.style.setProperty('--profile-create-button-width', (148 - 64 * headerProgress) + 'px');
  header.style.setProperty('--profile-create-extra-width', (100 * (1 - headerProgress)) + 'px');
  header.style.setProperty('--profile-create-extra-opacity', (1 - headerProgress).toFixed(3));
  header.style.setProperty('--profile-create-extra-shift', (12 * headerProgress) + 'px');
  header.style.setProperty('--profile-back-label-opacity', (1 - headerProgress).toFixed(3));
  header.style.setProperty('--profile-description-shift', (-8 * headerProgress) + 'px');
};


export const WorkspacePage: React.FC<Props> = ({ storageKey, seedDemoStoryboards = false, isAuthenticated, onLoginRequired, onOpenLibraryPage }) => {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(() => loadInitialStoryboards(storageKey, seedDemoStoryboards));
  const [activeStoryboard, setActiveStoryboard] = useState<Storyboard | null>(null);
  const [activeStoryboardConfirmed, setActiveStoryboardConfirmed] = useState(false);
  const [storyboardDetailsExpanded, setStoryboardDetailsExpanded] = useState(true);
  const [storyboardEditorView, setStoryboardEditorView] = useState<'scenes' | 'master'>('scenes');
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
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
    setSuggestionError('');
    setIsSuggesting(true);
    try {
      const suggestion = await requestStoryboardSuggestion(title, topic);
      if (suggestion) {
        setCachedStoryboardSuggestion({ key: workspaceStoryboardSuggestionKey(title, topic, detailOrigins), suggestion });
        applyStoryboardSuggestionToForm(suggestion);
      }
    } catch (error) { setSuggestionError(error instanceof Error ? error.message : 'AI suggestions are unavailable.'); }
    finally { setIsSuggesting(false); }
  };
  const dialogRef = useRef<HTMLElement>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const visualViewport = useModalDialog(createOpen, dialogRef, dialogBodyRef);

  useEffect(() => {
    setStoryboards(loadInitialStoryboards(storageKey, seedDemoStoryboards));
    setLoadedStorageKey(storageKey);
  }, [storageKey, seedDemoStoryboards]);
  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(storyboards)); } catch { /* Keep this session usable. */ }
  }, [storageKey, loadedStorageKey, storyboards]);

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
    if (!isAuthenticated || !client || !isPersistableStoryboardId(item.id)) return;
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      setCloudSyncMessage('Could not sync this Storyboard. Sign in again to retry.');
      return;
    }
    const { error: saveError } = await client.from('vyral_storyboards').upsert({
      id: item.id, user_id: authData.user.id, title: item.title, topic: item.topic,
      details: item.details ?? {}, created_at: item.createdAt, updated_at: item.updatedAt,
    }, { onConflict: 'id' });
    setCloudSyncMessage(saveError ? 'Cloud sync is unavailable. This Storyboard is saved on this device.' : '');
  };

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!isAuthenticated || !client || loadedStorageKey !== storageKey) return;
    const syncStoryboards = async () => {
      setCloudSyncMessage('Syncing your Storyboards…');
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
        details: (row.details ?? {}) as Storyboard['details'],
        createdAt: row.created_at as string, updatedAt: row.updated_at as string,
      }));
      const { storyboards: mergedStoryboards, pending } = mergeWorkspaceStoryboards(readStoryboards(storageKey), remote);
      let syncFailed = false;
      if (pending.length) {
        const { error: uploadError } = await client.from('vyral_storyboards').upsert(pending.map((item) => ({
          id: item.id, user_id: authData.user.id, title: item.title, topic: item.topic,
          details: item.details ?? {}, created_at: item.createdAt, updated_at: item.updatedAt,
        })), { onConflict: 'id' });
        if (cancelled) return;
        if (uploadError) syncFailed = true;
      }
      if (cancelled) return;
      setStoryboards(mergedStoryboards);
      setCloudSyncMessage(syncFailed ? 'Some Storyboards could not sync. Your device copy is still available.' : '');
    };
    void syncStoryboards();
    return () => { cancelled = true; };
  }, [storageKey, isAuthenticated, loadedStorageKey]);

  const openStoryboardEditor = (item: Storyboard) => { setSelectedSceneIds([]); setActiveSceneId(null); setStoryboardDetailsExpanded(true); setActiveStoryboard({ ...item, details: { ...item.details, tags: [...(item.details?.tags || [])], origins: { ...item.details?.origins } } }); setActiveStoryboardConfirmed(true); setStoryboardAiMessage(''); };
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
      details: { category: nextCategory, style: nextStyle, mood: nextMood, tags: nextTags, origins: nextOrigins, ...(aiProvenance ? { ai_provenance: aiProvenance } : {}) },
    };
    setStoryboards((current) => [next, ...current]);
    void persistStoryboard(next);
    setTitle(''); setTopic(''); setCategory(''); setStyle(''); setMood(''); setTags(''); setDetailOrigins({}); setCachedStoryboardSuggestion(null); setCreateOpen(false);
    setIsSuggesting(false);
  };

  const createDefaultStoryboard = () => {
    if (!isAuthenticated) { onLoginRequired(); return; }
    const now = new Date().toISOString();
    const draft: Storyboard = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'storyboard-' + Date.now().toString(36),
      title: 'A New Storyboard',
      topic: 'A new video story is ready to take shape. Create your scenes and build your story.',
      createdAt: now,
      updatedAt: now,
      details: { origins: {} },
    };
    // Keep the new storyboard provisional until the creator confirms it.
    // It is not written to local storage or Supabase yet.
    setActiveStoryboard(draft);
    setActiveStoryboardConfirmed(false);
    setStoryboardDetailsExpanded(true);
    setStoryboardAiMessage('Preparing your storyboard title and description…');

    void requestStoryboardSuggestion('', '', true).then((suggestion) => {
      if (!suggestion) { setStoryboardAiMessage('Your default title and description are ready. Create to continue.'); return; }
      setActiveStoryboard((current) => {
        if (!current || current.id !== draft.id) return current;
        const origins = current.details?.origins || {};
        return {
          ...current,
          title: origins.title === 'creator_edited' ? current.title : (suggestion.title || current.title),
          topic: origins.topic === 'creator_edited' ? current.topic : (suggestion.topic || current.topic),
          updatedAt: new Date().toISOString(),
          details: {
            ...current.details,
            category: origins.category === 'creator_edited' ? current.details?.category : suggestion.category,
            style: origins.style === 'creator_edited' ? current.details?.style : suggestion.style,
            mood: origins.mood === 'creator_edited' ? current.details?.mood : suggestion.mood,
            tags: origins.tags === 'creator_edited' ? current.details?.tags : suggestion.tags,
            origins: {
              ...origins,
              ...(suggestion.title && origins.title !== 'creator_edited' ? { title: 'ai_suggested' as const } : {}),
              ...(suggestion.topic && origins.topic !== 'creator_edited' ? { topic: 'ai_suggested' as const } : {}),
              ...(suggestion.category && origins.category !== 'creator_edited' ? { category: 'ai_suggested' as const } : {}),
              ...(suggestion.style && origins.style !== 'creator_edited' ? { style: 'ai_suggested' as const } : {}),
              ...(suggestion.mood && origins.mood !== 'creator_edited' ? { mood: 'ai_suggested' as const } : {}),
              ...(suggestion.tags.length && origins.tags !== 'creator_edited' ? { tags: 'ai_suggested' as const } : {}),
            },
            ai_provenance: { provider: suggestion.provider, model: suggestion.model, generatedAt: suggestion.generatedAt },
          },
        };
      });
      setStoryboardAiMessage('');
    }).catch(() => {
      setStoryboardAiMessage('AI suggestions are unavailable right now. You can edit the details yourself or confirm this draft.');
    });
  };

  const cancelStoryboardDraft = () => {
    setActiveStoryboard(null);
    setActiveStoryboardConfirmed(false);
    setStoryboardDetailsExpanded(true);
    setStoryboardEditorView('scenes');
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
    setStoryboardEditorView('scenes');
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

  if (activeStoryboard && activeSceneId) {
    const scene = (activeStoryboard.details?.scenes || []).find((item) => item.id === activeSceneId);
    if (scene) {
      const updateActiveScene = (patch: Partial<StoryboardScene>) => setActiveStoryboard((current) => {
        if (!current) return current;
        const now = new Date().toISOString();
        return {
          ...current,
          details: {
            ...current.details,
            scenes: (current.details?.scenes || []).map((item) => item.id === scene.id ? {
              ...item,
              ...patch,
              project: item.project ? { ...item.project, updatedAt: now } : item.project,
            } : item),
          },
          updatedAt: now,
        };
      });
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
                backLabel="Storyboard"
                icon={<Film size={22} />}
                title={scene.title}
                description={'Scene Editor · ' + scene.duration + ' seconds'}
              />
              <div className="profile-subpage-content space-y-5 p-4 sm:p-5">
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Scene Preview</h2>
                  <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-[var(--vyra-bg-subtle)]">
                    <div className="text-center"><Film size={34} className="mx-auto mb-3 text-[var(--vyra-text-muted)]" /><p className="text-sm font-semibold text-[var(--vyra-text-primary)]">{scene.title}</p><p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">{scene.description || 'Add media to this scene.'}</p></div>
                  </div>
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
                              {track.type !== 'text' && <p className="text-[10px] text-[var(--vyra-text-muted)]">Media source linking will be enabled with the Media Library integration.</p>}
                            </div>
                          ))}
                          {!track.clips.length && track.type !== 'text' && <p className="text-[10px] text-[var(--vyra-text-muted)]">No media clips. Import a source from My Media Library when asset linking is available.</p>}
                        </div>
                        <button type="button" onClick={() => removeProjectTrack(track.id)} aria-label={'Remove ' + track.name} className="rounded p-2 text-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]"><Trash2 size={14} /></button>
                      </div>
                    )) : <div className="px-4 py-8 text-center text-xs text-[var(--vyra-text-muted)]">Add a track to begin building this Scene independently.</div>}
                  </div>
                  <p className="text-[11px] leading-5 text-[var(--vyra-text-muted)]">Track structure is saved with this Scene Project. Media placement, playback, and rendering will be connected in the next stage; no placeholder video is generated.</p>
                </section>
              </div>
            </section>
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
      setActiveStoryboard(null);
      setActiveStoryboardConfirmed(false);
      setStoryboardDetailsExpanded(true);
      setStoryboardEditorView('scenes');
      setStoryboardAiMessage('');
    };
    return (
      <main className="profile-page-main w-full min-w-0 p-0">
        <div className="profile-subpage-scroll profile-subpage-viewport">
          <section className="profile-subpage-card storyboard-fullscreen-card">
          <ProfileSubpageHeader
            onBack={leaveStoryboardPage}
            backLabel="Workspace"
            icon={<Clapperboard size={22} />}
            title={activeStoryboardConfirmed ? activeStoryboard.title : 'Create Storyboard'}
            description={activeStoryboard.topic || 'Preparing your storyboard description…'}
            storyboardTitle
          />
          <div className="profile-subpage-content px-4 pb-4 pt-0 sm:px-5 sm:pb-5" onScroll={(event) => updateStoryboardHeaderCompact(event.currentTarget)} onScrollCapture={(event) => { const target = event.target; if (target instanceof HTMLElement) updateStoryboardHeaderCompact(event.currentTarget, target.scrollTop); }} onWheel={(event) => { const el = event.currentTarget; if (el.dataset.headerWheelLocked === '1') return; el.dataset.headerWheelLocked = '1'; const header = el.closest('.profile-subpage-card')?.querySelector('.profile-collapse-header'); const compact = Number.parseFloat(header?.style.getPropertyValue('--profile-header-progress') || '0') >= 0.5; const hidden = document.querySelector('header[aria-hidden="true"]') !== null; const stage = compact || hidden ? 'main' : 'compact'; if (event.deltaY > 0) { if (stage === 'main' && compact) window.dispatchEvent(new CustomEvent('vyra:main-header-visibility', { detail: true })); else if (stage === 'compact') updateStoryboardHeaderCompact(el, 1); } else if (event.deltaY < 0) { if (hidden) window.dispatchEvent(new CustomEvent('vyra:main-header-visibility', { detail: false })); else if (el.scrollTop <= 0) updateStoryboardHeaderCompact(el, 0); } window.setTimeout(() => { delete el.dataset.headerWheelLocked; }, 220); onTouchStart={(event) => { const el = event.currentTarget; const header = el.closest('.profile-subpage-card')?.querySelector('.profile-collapse-header'); const compact = Number.parseFloat(header?.style.getPropertyValue('--profile-header-progress') || '0') >= 0.5; const hidden = document.querySelector('header[aria-hidden="true"]') !== null; el.dataset.compactTouchY = String(event.touches[0]?.clientY ?? 0); el.dataset.compactTouchStage = compact || hidden ? 'main' : 'compact'; }} onTouchMove={(event) => { const el = event.currentTarget; const start = Number(el.dataset.compactTouchY || 0); const current = event.touches[0]?.clientY ?? start; const stage = el.dataset.compactTouchStage; if (current < start - 4) { if (stage === 'main') window.dispatchEvent(new CustomEvent('vyra:main-header-visibility', { detail: true })); else if (stage === 'compact') updateStoryboardHeaderCompact(el, 1); } else if (current > start + 4) { if (document.querySelector('header[aria-hidden="true"]')) window.dispatchEvent(new CustomEvent('vyra:main-header-visibility', { detail: false })); else if (el.scrollTop <= 0) updateStoryboardHeaderCompact(el, 0); } }} onTouchEnd={(event) => { delete event.currentTarget.dataset.compactTouchStage; }}>
          {activeStoryboardConfirmed && (
            <div className="profile-storyboard-controls -mx-4 sm:-mx-5">
              <div className="profile-storyboard-preview">
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-[var(--vyra-bg-subtle)]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.16),transparent_55%)]" />
                  <div className="relative z-10 text-[var(--vyra-text-muted)]" aria-label="Video preview placeholder"><Film size={30} /></div>
                </div>
              </div>
              <div className="profile-storyboard-view-tabs flex items-center gap-1 border-b border-[var(--vyra-border)]">
                <button type="button" onClick={() => setStoryboardEditorView('scenes')} aria-pressed={storyboardEditorView === 'scenes'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'scenes' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>Scenes</button>
                <button type="button" onClick={() => setStoryboardEditorView('master')} aria-pressed={storyboardEditorView === 'master'} className={'border-b-2 px-4 py-2.5 text-xs font-semibold transition ' + (storyboardEditorView === 'master' ? 'border-[var(--vyra-accent-primary)] text-[var(--vyra-text-primary)]' : 'border-transparent text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]')}>Master Editor</button>
              </div>
            </div>
          )}
            {activeStoryboardConfirmed && (() => {
              const scenes = details.scenes || [];
              const updateScenes = (nextScenes: StoryboardScene[]) => setActiveStoryboard((current) => {
                if (!current) return current;
                const master = current.details?.masterTimeline;
                if (!master) return { ...current, details: { ...current.details, scenes: nextScenes }, updatedAt: new Date().toISOString() };
                const previousInstances = master.sceneInstances || [];
                const instancesByScene = new Map(previousInstances.map((instance) => [instance.sceneId, instance]));
                const sceneIds = new Set(nextScenes.map((scene) => scene.id));
                const orderedInstances = nextScenes.map((scene) => {
                  const existing = instancesByScene.get(scene.id);
                  if (existing) return existing;
                  const legacyRange = master.sceneRanges?.[scene.id];
                  return {
                    id: scene.id,
                    sceneId: scene.id,
                    sourceIn: Math.max(0, Number(legacyRange?.sourceIn) || 0),
                    sourceOut: Math.min(scene.duration, Math.max(0.1, Number(legacyRange?.sourceOut) || scene.duration)),
                    sceneProjectId: scene.project?.id,
                    renderRevisionId: scene.project?.latestRenderRevisionId ?? null,
                  };
                });
                const sceneRanges = Object.fromEntries(Object.entries(master.sceneRanges || {}).filter(([id]) => sceneIds.has(id)));
                const transitions = Object.fromEntries(Object.entries(master.transitions || {}).filter(([id]) => sceneIds.has(id) || orderedInstances.some((instance) => instance.id === id)));
                return {
                  ...current,
                  details: {
                    ...current.details,
                    scenes: nextScenes,
                    masterTimeline: { ...master, sceneInstances: orderedInstances, sceneRanges, transitions },
                  },
                  updatedAt: new Date().toISOString(),
                };
              });
              const addScene = () => {
                const now = new Date().toISOString();
                const scene: StoryboardScene = { id: crypto.randomUUID(), title: 'Scene ' + (scenes.length + 1), description: '', duration: 5, transition: 'Fade', project: { id: crypto.randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, renderRevisionIds: [] } };
                updateScenes([...scenes, scene]);
              };
              const updateScene = (id: string, patch: Partial<StoryboardScene>) => updateScenes(scenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));
              const moveScene = (index: number, offset: number) => {
                const target = index + offset;
                if (target < 0 || target >= scenes.length) return;
                const next = [...scenes]; [next[index], next[target]] = [next[target], next[index]]; updateScenes(next);
              };
              const duplicateScene = (scene: StoryboardScene) => {
                const now = new Date().toISOString();
                const copy: StoryboardScene = { ...scene, id: crypto.randomUUID(), title: scene.title + ' copy', project: { id: crypto.randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, renderRevisionIds: [] } };
                const index = scenes.findIndex((item) => item.id === scene.id);
                const next = [...scenes]; next.splice(index + 1, 0, copy); updateScenes(next);
              };
              const removeScene = (id: string) => {
                const next = scenes.filter((scene) => scene.id !== id); updateScenes(next);
                setSelectedSceneIds((current) => current.filter((sceneId) => sceneId !== id));
              };
              return (
                <div className="space-y-4">
                    {storyboardEditorView === 'scenes' ? (
<section className="space-y-3">
                    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Scenes</h2><p className="mt-0.5 text-[11px] text-[var(--vyra-text-secondary)]">Build the story in the order you want.</p></div><Button type="button" onClick={addScene}><Plus size={14} /> Add Scene</Button></div>
                    {scenes.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {scenes.map((scene, index) => <div key={scene.id} className={"relative min-w-0 overflow-hidden rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] " + (selectedSceneIds.includes(scene.id) ? "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-xl after:border-2 after:border-[var(--vyra-accent-primary)] after:shadow-[0_0_12px_var(--vyra-accent-primary)]" : "")}>
                        <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                          <span className="text-[10px] font-medium text-[var(--vyra-text-secondary)]">Scene {index + 1}</span>
                          <button type="button" role="checkbox" aria-checked={selectedSceneIds.includes(scene.id)} aria-label={'Select ' + scene.title} onClick={() => setSelectedSceneIds((current) => current.includes(scene.id) ? current.filter((id) => id !== scene.id) : [...current, scene.id])} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--vyra-accent-primary)]/40">
                            <span className={'flex size-5 items-center justify-center rounded-full border transition-colors ' + (selectedSceneIds.includes(scene.id) ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-white' : 'border-[var(--vyra-text-muted)]/45 bg-transparent text-transparent')}>
                              {selectedSceneIds.includes(scene.id) && <Check size={12} strokeWidth={3} />}
                            </span>
                          </button>
                        </div>
                        <button type="button" onClick={() => setActiveSceneId(scene.id)} aria-label={'Open Scene Editor: ' + scene.title} className="block w-full p-3 pt-1 text-left">
                          <div className="mb-2 flex aspect-video items-center justify-center rounded-lg bg-[var(--vyra-bg-subtle)] transition hover:bg-[var(--vyra-bg-hover)]"><Film size={22} className="text-[var(--vyra-text-muted)]" /></div>
                          <p className="truncate text-xs font-semibold text-[var(--vyra-text-primary)]">{scene.title}</p><p className="mt-1 text-[10px] text-[var(--vyra-text-secondary)]">{scene.duration}s · Open Scene Editor</p>
                        </button>
                        <div className="flex items-center justify-between border-t border-[var(--vyra-border-subtle)] px-2 py-1">
                          <button type="button" onClick={() => moveScene(index, -1)} disabled={index === 0} aria-label="Move scene left" className="rounded p-1.5 text-[var(--vyra-text-secondary)] disabled:opacity-30"><ChevronDown className="rotate-90" size={14} /></button>
                          <button type="button" onClick={() => duplicateScene(scene)} aria-label="Duplicate scene" className="rounded p-1.5 text-[var(--vyra-text-secondary)]"><Copy size={13} /></button>
                          <button type="button" onClick={() => moveScene(index, 1)} disabled={index === scenes.length - 1} aria-label="Move scene right" className="rounded p-1.5 text-[var(--vyra-text-secondary)] disabled:opacity-30"><ChevronDown className="-rotate-90" size={14} /></button>
                          <button type="button" onClick={() => removeScene(scene.id)} aria-label="Delete scene" className="rounded p-1.5 text-[var(--vyra-danger)]"><Trash2 size={13} /></button>
                        </div>
                      </div>)}
                    </div> : <button type="button" onClick={addScene} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--vyra-border)] text-sm text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><Plus size={20} /> Add your first scene</button>}
                  </section>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div><h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Master Editor</h2><p className="mt-1 text-[11px] text-[var(--vyra-text-secondary)]">Timeline composition simulation · Scene source projects are kept independent.</p></div>
                          <span className="rounded-md bg-[var(--vyra-bg-subtle)] px-2 py-1 text-[10px] font-semibold tracking-wide text-[var(--vyra-text-muted)]">SIMULATION</span>
                        </div>
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
                    onChange={(masterTimeline) => setActiveStoryboard((current) => current ? {
                      ...current,
                      details: { ...current.details, masterTimeline },
                      updatedAt: new Date().toISOString(),
                    } : current)}
                  />
                      </div>
                    )}
                </div>
              );
            })()}

            {!activeStoryboardConfirmed && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--vyra-border)] pt-3">
                <Button type="button" variant="ghost" onClick={cancelStoryboardDraft}><X size={15} /> Cancel</Button>
                <Button type="button" onClick={confirmStoryboardDraft}><Check size={15} /> Create</Button>
              </div>
            )}
          </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-0 w-full max-w-[var(--vyra-content-width)] flex-1 overflow-y-auto px-4 pb-16 pt-0 sm:px-6">
      <section className="mb-7 pt-8 sm:pt-10">
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--vyra-accent-primary)] sm:text-[11px]"><Clapperboard size={14} /> CREATIVE WORKSPACE</p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Your Workspace</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">Manage your Vyrals, media library and storyboards in one place.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onOpenLibraryPage('my-vyrals')} className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-4 py-3 text-left transition hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={21} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--vyra-text-primary)]">My Vyrals</span><span className="mt-0.5 block text-xs text-[var(--vyra-text-secondary)]">Your creative assets and Vyral collections</span></span>
            <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
          </button>
          <button type="button" onClick={() => onOpenLibraryPage('my-media-library')} className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-4 py-3 text-left transition hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Images size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--vyra-text-primary)]">My Media Library</span><span className="mt-0.5 block text-xs text-[var(--vyra-text-secondary)]">Your images, videos, audio and files</span></span>
            <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      <section className="sticky top-0 z-30 -mx-4 mb-2 flex items-center justify-between gap-3 bg-[var(--vyra-bg-canvas)] px-4 py-3 sm:-mx-6 sm:px-6">
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
            <Card key={item.id} padding="none" className="overflow-hidden">
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

      {editDraft && editingStoryboardId && (
        <div role="presentation" className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingStoryboardId(null); setEditDraft(null); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-storyboard-title" className="my-auto w-full max-w-lg rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 id="edit-storyboard-title" className="text-xl font-bold text-[var(--vyra-text-primary)]">Edit Storyboard Details</h2><button type="button" onClick={() => { setEditingStoryboardId(null); setEditDraft(null); }} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button></div>
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
