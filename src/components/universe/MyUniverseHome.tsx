import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight, BookOpen, BriefcaseBusiness, Clapperboard, Compass,
  Folder, Gamepad2, Globe2, Grid2X2, List, MoreHorizontal, Plus,
  Search, Sparkles, X,
} from 'lucide-react';

type UniverseCategory = 'Story Worlds' | 'Content & Media' | 'Brand & Business' | 'Games & Interactive' | 'Design & Creative' | 'Knowledge & Research';

type UniverseSample = {
  id: string;
  name: string;
  category: UniverseCategory;
  description: string;
  updated: string;
  assets: number;
  theme: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

const initialUniverses: UniverseSample[] = [
  { id: 'u1', name: 'The Emberfall Chronicles', category: 'Story Worlds', description: 'A cinematic fantasy world of ancient kingdoms and forgotten magic.', updated: 'Edited 2 hours ago', assets: 128, theme: 'from-orange-950 via-rose-950 to-slate-950', icon: Globe2 },
  { id: 'u2', name: 'Beyond the Blue', category: 'Content & Media', description: 'A documentary series exploring the mysteries of the ocean.', updated: 'Edited yesterday', assets: 46, theme: 'from-cyan-950 via-blue-950 to-indigo-950', icon: Clapperboard },
  { id: 'u3', name: 'NOVA Studio', category: 'Brand & Business', description: 'Visual identity, campaigns and creative direction for NOVA.', updated: 'Edited 3 days ago', assets: 73, theme: 'from-violet-950 via-fuchsia-950 to-slate-950', icon: BriefcaseBusiness },
  { id: 'u4', name: 'Aetherfall', category: 'Games & Interactive', description: 'An evolving game universe with characters, maps and lore.', updated: 'Edited 1 week ago', assets: 214, theme: 'from-emerald-950 via-teal-950 to-slate-950', icon: Gamepad2 },
  { id: 'u5', name: 'Form & Space', category: 'Design & Creative', description: 'Architecture, interiors and experimental spatial concepts.', updated: 'Edited 2 weeks ago', assets: 35, theme: 'from-amber-950 via-stone-900 to-slate-950', icon: Compass },
  { id: 'u6', name: 'Creative Research Vault', category: 'Knowledge & Research', description: 'References, studies and ideas collected in one place.', updated: 'Edited 1 month ago', assets: 92, theme: 'from-slate-800 via-slate-900 to-indigo-950', icon: BookOpen },
];

const categories = ['All', 'Story Worlds', 'Content & Media', 'Brand & Business', 'Games & Interactive', 'Design & Creative', 'Knowledge & Research'] as const;

export function MyUniverseHome() {
  const [universes, setUniverses] = useState(initialUniverses);
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const visibleUniverses = useMemo(() => universes.filter((universe) => {
    const matchesCategory = category === 'All' || universe.category === category;
    const matchesSearch = (universe.name + ' ' + universe.description + ' ' + universe.category).toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [universes, category, search]);

  const createSample = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setUniverses((current) => [{
      id: `local-${Date.now()}`,
      name,
      category: 'Story Worlds',
      description: 'A new Universe preview. Your creative world starts here.',
      updated: 'Just created',
      assets: 0,
      theme: 'from-violet-950 via-indigo-950 to-slate-950',
      icon: Sparkles,
    }, ...current]);
    setCategory('All');
    setSearch('');
    setNewName('');
    setCreateOpen(false);
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vyra-bg-canvas)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--vyra-text-muted)]">
              <Sparkles size={14} /> Your creative space
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">My Universe</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--vyra-text-muted)] sm:text-base">
              Every idea, world and creative project — organized in one place.
            </p>
          </div>
          <button onClick={() => setCreateOpen(true)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--vyra-text-primary)] px-5 text-sm font-semibold text-[var(--vyra-bg-canvas)] transition hover:opacity-90">
            <Plus size={17} strokeWidth={2.4} /> New
          </button>
        </div>

        <div className="mb-7 flex flex-col gap-4 border-b border-[var(--vyra-border-subtle)] pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((item) => (
                <button key={item} onClick={() => setCategory(item)} className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${category === item ? 'bg-[var(--vyra-surface-raised)] text-[var(--vyra-text-primary)] ring-1 ring-[var(--vyra-border-strong)]' : 'text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-surface-hover)] hover:text-[var(--vyra-text-primary)]'}`}>
                  {item}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--vyra-text-muted)]">
              <Grid2X2 size={15} />
              <span>Grid view</span>
              <List size={16} className="ml-2 opacity-40" />
            </div>
          </div>
          <label className="flex h-11 max-w-sm items-center gap-2.5 rounded-xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-surface)] px-3.5 text-[var(--vyra-text-muted)] focus-within:border-[var(--vyra-border-strong)]">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your Universes..." className="w-full bg-transparent text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)]" />
          </label>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">{category === 'All' ? 'All Universes' : category}</h2>
            <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">{visibleUniverses.length} Universes</p>
          </div>
          <span className="rounded-md border border-dashed border-[var(--vyra-border-strong)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--vyra-text-muted)]">Sample preview</span>
        </div>

        {visibleUniverses.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleUniverses.map((universe) => {
              const Icon = universe.icon;
              return (
                <button key={universe.id} onClick={() => undefined} className="group overflow-hidden rounded-2xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-surface)] text-left transition duration-200 hover:-translate-y-0.5 hover:border-[var(--vyra-border-strong)] hover:bg-[var(--vyra-surface-hover)]">
                  <div className={`relative flex h-40 items-end overflow-hidden bg-gradient-to-br ${universe.theme} p-5`}>
                    <div className="absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/10" />
                    <div className="absolute -right-1 top-2 h-32 w-32 rounded-full border border-white/10" />
                    <div className="absolute right-12 top-8 h-16 w-16 rotate-45 rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-sm" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur-md">
                      <Icon size={22} strokeWidth={1.7} />
                    </div>
                    <span className="relative ml-auto rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm">Universe</span>
                  </div>
                  <div className="p-4">
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <h3 className="line-clamp-1 text-base font-semibold text-[var(--vyra-text-primary)]">{universe.name}</h3>
                      <MoreHorizontal size={18} className="shrink-0 text-[var(--vyra-text-muted)]" />
                    </div>
                    <p className="line-clamp-2 min-h-10 text-xs leading-5 text-[var(--vyra-text-muted)]">{universe.description}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-[var(--vyra-border-subtle)] pt-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-[var(--vyra-text-secondary)]">{universe.category}</p>
                        <p className="mt-1 text-[10px] text-[var(--vyra-text-muted)]">{universe.updated}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--vyra-text-muted)]">
                        <Folder size={13} /> {universe.assets} assets
                        <ArrowUpRight size={14} className="ml-1 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--vyra-border-strong)] px-6 py-16 text-center">
            <Search className="mx-auto mb-3 text-[var(--vyra-text-muted)]" size={22} />
            <p className="text-sm font-medium text-[var(--vyra-text-primary)]">No Universes found</p>
            <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">Try another search or category.</p>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <form onSubmit={createSample} className="w-full max-w-md rounded-2xl border border-[var(--vyra-border-strong)] bg-[var(--vyra-surface)] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--vyra-text-primary)]">Create a Universe</h2>
                <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">Preview only — no data will be saved.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-surface-hover)]"><X size={18} /></button>
            </div>
            <label className="mb-2 block text-xs font-medium text-[var(--vyra-text-secondary)]">Universe name</label>
            <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Give your Universe a name" className="h-11 w-full rounded-xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-border-strong)]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="h-10 rounded-xl px-4 text-sm text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-surface-hover)]">Cancel</button>
              <button type="submit" disabled={!newName.trim()} className="h-10 rounded-xl bg-[var(--vyra-text-primary)] px-4 text-sm font-semibold text-[var(--vyra-bg-canvas)] disabled:cursor-not-allowed disabled:opacity-40">Create preview</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
