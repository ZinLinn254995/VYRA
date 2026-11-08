import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clapperboard, Film, Images, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Card } from '../ui/Card';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { getCurrentAccessToken, supabase } from '../../context/AuthContext';
import { confirmSpendBeforeGeneration } from '../../services/spendConfirmation';
import { isPersistableStoryboardId, mergeWorkspaceStoryboards } from '../../services/workspaceStoryboards';

type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string; details?: { category?: string; style?: string; mood?: string; tags?: string[]; origins?: Record<string, 'ai_suggested' | 'creator_edited'> } };
type LibraryPage = 'my-vyrals' | 'my-media-library';
type Props = { storageKey: string; seedDemoStoryboards?: boolean; isAuthenticated: boolean; onLoginRequired: () => void; onOpenLibraryPage: (page: LibraryPage) => void };

const readStoryboards = (key: string): Storyboard[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is Storyboard =>
      Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.topic === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    ) : [];
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

export const WorkspacePage: React.FC<Props> = ({ storageKey, seedDemoStoryboards = false, isAuthenticated, onLoginRequired, onOpenLibraryPage }) => {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(() => loadInitialStoryboards(storageKey, seedDemoStoryboards));
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
  type StoryboardSuggestion = { title: string; topic: string; category: string; style: string; mood: string; tags: string[] };
  const requestStoryboardSuggestion = async (seedTitle: string, seedTopic: string, optional = false): Promise<StoryboardSuggestion | null> => {
    const apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
    const models = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as { text?: string };
    const model = models.text;
    if (!apiKey || !model) {
      if (optional) return null;
      throw new Error('Connect OpenRouter and select a Text model in Settings to use AI suggestions.');
    }
    const approved = await confirmSpendBeforeGeneration({ operation: 'Suggest storyboard details', capability: 'text', model, apiKey, parameters: { completionTokenBudget: 500 } });
    if (!approved) return null;
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) throw new Error('Sign in again before requesting AI suggestions.');
    const response = await fetch('/api/providers/openrouter/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey, Authorization: 'Bearer ' + accessToken, 'Idempotency-Key': 'vyra-storyboard-details-' + crypto.randomUUID() },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [
        'Suggest useful default metadata for a storyboard. Return only JSON with string fields title, topic, category, style, mood and an array of up to 8 tags.',
        'Do not invent facts. If the idea is unclear, keep uncertain fields short or empty. The creator can edit every field.',
        'Current title: ' + seedTitle, 'Current idea: ' + seedTopic,
      ].join('\\n') }] }),
    });
    const data = await response.json().catch(() => ({})) as { text?: string; error?: string };
    if (!response.ok || !data.text) throw new Error(data.error || 'AI suggestions could not be generated.');
    const raw = data.text.trim().replace(/^\x60\x60\x60(?:json)?\\s*/i, '').replace(/\\s*\x60\x60\x60$/, '');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const asText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 500) : '';
    return {
      title: asText(parsed.title), topic: asText(parsed.topic), category: asText(parsed.category),
      style: asText(parsed.style), mood: asText(parsed.mood),
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
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
      if (suggestion) applyStoryboardSuggestionToForm(suggestion);
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

  const persistStoryboard = async (item: Storyboard) => {
    if (!isAuthenticated || !supabase || !isPersistableStoryboardId(item.id)) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setCloudSyncMessage('Could not sync this Storyboard. Sign in again to retry.');
      return;
    }
    const { error: saveError } = await supabase.from('vyral_storyboards').upsert({
      id: item.id, user_id: authData.user.id, title: item.title, topic: item.topic,
      details: item.details ?? {}, created_at: item.createdAt, updated_at: item.updatedAt,
    }, { onConflict: 'id' });
    setCloudSyncMessage(saveError ? 'Cloud sync is unavailable. This Storyboard is saved on this device.' : '');
  };

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !supabase || loadedStorageKey !== storageKey) return;
    const syncStoryboards = async () => {
      setCloudSyncMessage('Syncing your Storyboards…');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authError || !authData.user) {
        setCloudSyncMessage('Sign in again to sync your Storyboards.');
        return;
      }
      const { data, error: loadError } = await supabase.from('vyral_storyboards')
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
      if (pending.length) {
        const { error: uploadError } = await supabase.from('vyral_storyboards').upsert(pending.map((item) => ({
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

  const openStoryboardEditor = (item: Storyboard) => { setEditingStoryboardId(item.id); setEditDraft({ ...item, details: { ...item.details, tags: [...(item.details?.tags || [])], origins: { ...item.details?.origins } } }); };
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
    let nextTitle = title.trim();
    let nextTopic = topic.trim();
    let nextCategory = category.trim();
    let nextStyle = style.trim();
    let nextMood = mood.trim();
    let nextTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const nextOrigins = { ...detailOrigins };
    // Generate type-appropriate defaults during creation; failure or declined spend
    // never blocks a valid manual Storyboard.
    if (nextTitle || nextTopic) {
      try {
        const suggestion = await requestStoryboardSuggestion(nextTitle, nextTopic, true);
        if (suggestion) {
          const apply = (key: keyof StoryboardSuggestion, value: string) => {
            if (!value || nextOrigins[key] === 'creator_edited') return value;
            nextOrigins[key] = 'ai_suggested';
            return value;
          };
          if (suggestion.title && nextOrigins.title !== 'creator_edited') { nextTitle = apply('title', suggestion.title); }
          if (suggestion.topic && nextOrigins.topic !== 'creator_edited') { nextTopic = apply('topic', suggestion.topic); }
          if (suggestion.category && nextOrigins.category !== 'creator_edited') { nextCategory = apply('category', suggestion.category); }
          if (suggestion.style && nextOrigins.style !== 'creator_edited') { nextStyle = apply('style', suggestion.style); }
          if (suggestion.mood && nextOrigins.mood !== 'creator_edited') { nextMood = apply('mood', suggestion.mood); }
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
      details: { category: nextCategory, style: nextStyle, mood: nextMood, tags: nextTags, origins: nextOrigins },
    };
    setStoryboards((current) => [next, ...current]);
    void persistStoryboard(next);
    setTitle(''); setTopic(''); setCategory(''); setStyle(''); setMood(''); setTags(''); setDetailOrigins({}); setCreateOpen(false);
    setIsSuggesting(false);
  };

  return (
    <main className="mx-auto w-full max-w-[var(--vyra-content-width)] px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <section className="mb-7">
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

      <section className="mb-7 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-xl">My Storyboards</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--vyra-text-secondary)]">Your stories, organized in one place.</p>
        {storyboardAiMessage && <p role="status" className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">{storyboardAiMessage}</p>}
        {cloudSyncMessage && <p role="status" className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">{cloudSyncMessage}</p>}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0" startIcon={<Plus size={16} />}><span className="hidden sm:inline">Create Storyboard</span><span className="sm:hidden">Create</span></Button>
      </section>

      {storyboards.length ? (
        <section aria-label="Your storyboards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {storyboards.map((item) => (
            <Card key={item.id} padding="none" className="overflow-hidden">
              <div className="flex aspect-[16/9] items-center justify-center border-b border-[var(--vyra-border-subtle)] bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.20),transparent_48%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))]"><Film size={34} className="text-[var(--vyra-accent-primary)]" strokeWidth={1.5} /></div>
              <div className="p-4">
                <h2 className="truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{item.title}</h2>
                {item.topic && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--vyra-text-secondary)]">{item.topic}</p>}
                {item.details?.category && <p className="mt-2 text-[11px] text-[var(--vyra-text-secondary)]">{item.details.category}{item.details.style ? ' · ' + item.details.style : ''}</p>}
                {item.details?.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.details.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-1 text-[10px] text-[var(--vyra-text-secondary)]">{tag}</span>)}</div> : null}
                <p className="mt-3 text-[10px] text-[var(--vyra-text-muted)]">Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
                <button type="button" onClick={() => openStoryboardEditor(item)} className="mt-3 min-h-9 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)]">Edit details</button>
              </div>
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
                  <Button type="button" variant="secondary" onClick={suggestStoryboardDetails} disabled={isSuggesting}>{isSuggesting ? 'Suggesting…' : '✦ Suggest with AI'}</Button>
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
