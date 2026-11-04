import React, { useEffect, useState } from 'react';
import { Clapperboard, Film, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type Storyboard = { id: string; title: string; topic: string; createdAt: string; updatedAt: string };
type Props = { storageKey: string };

const readStoryboards = (key: string): Storyboard[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is Storyboard =>
      Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.topic === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    ) : [];
  } catch { return []; }
};

export const WorkspacePage: React.FC<Props> = ({ storageKey }) => {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(() => readStoryboards(storageKey));
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => { setStoryboards(readStoryboards(storageKey)); }, [storageKey]);
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-storyboard-title" className="w-full max-w-md rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><h2 id="create-storyboard-title" className="text-lg font-semibold text-[var(--vyra-text-primary)]">Create Storyboard</h2><p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Give your new storyboard a name.</p></div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
            </div>
            <form onSubmit={createStoryboard} className="space-y-4">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-[var(--vyra-text-primary)]">Storyboard name</span><input autoFocus required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The Last City" className="min-h-11 w-full rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)] focus:border-[var(--vyra-accent-primary)]" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-[var(--vyra-text-primary)]">Short description <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></span><textarea rows={3} maxLength={500} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What is this story about?" className="w-full resize-y rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 py-2.5 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)] focus:border-[var(--vyra-accent-primary)]" /></label>
              <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={!title.trim()}>Create Storyboard</Button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};
