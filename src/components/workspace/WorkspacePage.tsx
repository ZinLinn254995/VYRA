import React, { useEffect, useRef, useState } from 'react';
import { Clapperboard, Film, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Card } from '../ui/Card';

type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string };
type Props = { storageKey: string; seedDemoStoryboards?: boolean };

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
      {
        id: 'demo-myanmar-folktale',
        title: 'Myanmar Folktale — The Golden Peacock',
        topic: 'A cinematic retelling of a Myanmar folktale, with a clear beginning, a magical journey and a meaningful ending.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-product-promotion',
        title: 'Product Promotion — Smart Bottle',
        topic: 'A short product video introducing the key features, everyday benefits and a memorable call to action.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-science-explainer',
        title: 'Science Explainer — Black Holes',
        topic: 'An easy-to-follow visual explanation of black holes, gravity and how light behaves near the event horizon.',
        createdAt: now,
        updatedAt: now,
      },
    ];
    localStorage.setItem(markerKey, '1');
    localStorage.setItem(key, JSON.stringify(samples));
    return samples;
  } catch {
    return existing;
  }
};

const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-none focus-visible:outline-none focus:ring-0 placeholder:text-[var(--vyra-text-muted)]';

export const WorkspacePage: React.FC<Props> = ({ storageKey, seedDemoStoryboards = false }) => {
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
      <section className="mb-7 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--vyra-accent-primary)]"><Clapperboard size={14} /> CREATIVE WORKSPACE</p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-3xl">My Storyboards</h1>
          <p className="mt-2 text-sm text-[var(--vyra-text-secondary)]">Your stories, organized in one place.</p>
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
            <div className="flex shrink-0 justify-end px-3 pt-3">
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] transition hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button>
            </div>

            <div ref={dialogBodyRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vyra-accent-primary)]">CREATIVE WORKSPACE</p>
                <h2 id="create-storyboard-title" className="text-2xl font-bold tracking-tight text-[var(--vyra-text-primary)]">Create Storyboard</h2>
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
