import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clapperboard, Film, Images, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Card } from '../ui/Card';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';

type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string };
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
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const visualViewport = useModalDialog(createOpen, dialogRef, dialogBodyRef);

  useEffect(() => { setStoryboards(loadInitialStoryboards(storageKey, seedDemoStoryboards)); }, [storageKey, seedDemoStoryboards]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(storyboards)); } catch { /* Keep this session usable. */ }
  }, [storageKey, storyboards]);

  const createStoryboard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (!isAuthenticated) { onLoginRequired(); return; }
    const now = new Date().toISOString();
    const next: Storyboard = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'storyboard-' + Date.now().toString(36),
      title: cleanTitle, topic: topic.trim(), createdAt: now, updatedAt: now,
    };
    setStoryboards((current) => [next, ...current]);
    setTitle(''); setTopic(''); setCreateOpen(false);
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
                <p className="mt-3 text-[10px] text-[var(--vyra-text-muted)]">Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
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

      {createOpen && (
        <div role="presentation" className="fixed inset-x-0 z-[60] flex items-center justify-center overflow-hidden bg-slate-950/75 p-2 backdrop-blur-md sm:p-4" style={{ top: visualViewport.top, height: visualViewport.height }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-storyboard-title" className="flex min-h-0 w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-[var(--vyra-shadow-overlay)]" style={{ maxHeight: Math.max(120, visualViewport.height - 16) }}>
            <div ref={dialogBodyRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="mb-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h2 id="create-storyboard-title" className="min-w-0 text-2xl font-bold tracking-tight text-[var(--vyra-text-primary)]">Create Storyboard</h2>
                  <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="shrink-0 rounded-lg p-2 text-[var(--vyra-text-muted)] transition hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">Give your new storyboard a name and a short description.</p>
              </div>
              <form onSubmit={createStoryboard} className="space-y-4">
                <div className="min-w-0 space-y-2.5">
                  <label htmlFor="vyra-storyboard-name" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Storyboard name <span className="ml-1 text-[var(--vyra-danger)]" aria-hidden="true">*</span></label>
                  <input id="vyra-storyboard-name" type="text" required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The Last City" className={inputClass} />
                </div>
                <div className="min-w-0 space-y-2.5">
                  <label htmlFor="vyra-storyboard-description" className="block text-xs font-semibold text-[var(--vyra-text-primary)]">Short description <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></label>
                  <textarea id="vyra-storyboard-description" rows={3} maxLength={500} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What is this story about?" className={inputClass + ' min-h-24 resize-y px-3 py-2.5'} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={!title.trim()}>Create Storyboard</Button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
