import React, { useMemo, useState } from 'react';
import { ArrowUpRight, AudioLines, Box, Clapperboard, Layers3, Search, Sparkles, Store, Users, WandSparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type Category = 'All' | 'Vyrals' | 'Characters' | 'Environments' | 'Visual Styles' | 'Voices' | 'Templates';

type MarketItem = {
  id: string;
  title: string;
  category: Exclude<Category, 'All'>;
  description: string;
  creator: string;
  tag: string;
  icon: React.ReactNode;
  art: string;
};

const categories: Category[] = ['All', 'Vyrals', 'Characters', 'Environments', 'Visual Styles', 'Voices', 'Templates'];

const items: MarketItem[] = [
  { id: 'vyral-starter', title: 'Story Character Pack', category: 'Vyrals', description: 'A reusable cast for connected animated stories.', creator: 'VYRA Studio', tag: 'Featured', icon: <Users size={25} />, art: 'from-violet-500/35 via-fuchsia-500/15 to-cyan-400/20' },
  { id: 'character-01', title: 'Milo — The Explorer', category: 'Characters', description: 'A curious 3D character with a ready-to-use visual identity.', creator: 'VYRA Studio', tag: 'Character', icon: <Sparkles size={25} />, art: 'from-amber-400/30 via-orange-500/15 to-rose-500/25' },
  { id: 'env-01', title: 'Neon City at Night', category: 'Environments', description: 'A cinematic city environment for night-time scenes.', creator: 'VYRA Studio', tag: 'Environment', icon: <Layers3 size={25} />, art: 'from-cyan-400/30 via-blue-500/20 to-violet-600/35' },
  { id: 'style-01', title: 'Soft Cinematic 3D', category: 'Visual Styles', description: 'A consistent, polished 3D animation look.', creator: 'VYRA Studio', tag: 'Visual style', icon: <WandSparkles size={25} />, art: 'from-fuchsia-400/25 via-violet-500/25 to-indigo-500/30' },
  { id: 'voice-01', title: 'Warm Storyteller', category: 'Voices', description: 'A friendly narration direction for story-led videos.', creator: 'VYRA Studio', tag: 'Voice', icon: <AudioLines size={25} />, art: 'from-emerald-400/25 via-teal-500/20 to-cyan-500/25' },
  { id: 'template-01', title: 'Short Story Sequence', category: 'Templates', description: 'A structured starting point for short-form storytelling.', creator: 'VYRA Studio', tag: 'Template', icon: <Clapperboard size={25} />, art: 'from-rose-400/25 via-purple-500/25 to-blue-500/25' },
];

type MarketplaceProps = {
  onLoginRequired: () => void;
};

export const MarketplaceHome: React.FC<MarketplaceProps> = ({ onLoginRequired }) => {
  const [category, setCategory] = useState<Category>('All');
  const [search, setSearch] = useState('');

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesCategory = category === 'All' || item.category === category;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [item.title, item.description, item.category].some((value) => value.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  }), [category, search]);

  return (
    <main className="mx-auto w-full max-w-[var(--vyra-content-width)] px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <section className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--vyra-accent-primary)]">
            <Store size={14} /> VYRA CREATIVE MARKET
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">Marketplace</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--vyra-text-secondary)] sm:text-base">
            Discover reusable creative assets to build consistent AI stories and videos.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2.5 md:max-w-xs">
          <Search size={17} className="shrink-0 text-[var(--vyra-text-muted)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search marketplace" aria-label="Search marketplace" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)]" />
        </div>
      </section>

      <section aria-label="Marketplace categories" className="mb-7 flex gap-2 overflow-x-auto pb-2">
        {categories.map((item) => (
          <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${category === item ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-slate-950' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)] hover:text-[var(--vyra-text-primary)]'}`}>
            {item}
          </button>
        ))}
      </section>

      <section className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--vyra-text-primary)]">Explore creative assets</h2>
          <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">{visibleItems.length} items to explore</p>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-[var(--vyra-text-muted)] sm:flex"><Box size={14} /> Preview before adding</span>
      </section>

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <Card key={item.id} padding="none" className="group overflow-hidden">
              <div className={`relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br ${item.art}`}>
                <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 50% 35%, rgba(255,255,255,.22), transparent 42%), linear-gradient(135deg, transparent 35%, rgba(5,8,24,.38))' }} />
                <div className="relative grid size-20 place-items-center rounded-3xl border border-white/20 bg-slate-950/25 text-white shadow-2xl backdrop-blur-sm transition duration-300 group-hover:scale-105">
                  {item.icon}
                </div>
                <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">{item.tag}</span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vyra-text-muted)]">{item.category}</p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{item.title}</h3>
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--vyra-text-muted)]">Free preview</span>
                </div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-[var(--vyra-text-secondary)]">{item.description}</p>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--vyra-border-subtle)] pt-3">
                  <span className="text-[10px] text-[var(--vyra-text-muted)]">by {item.creator}</span>
                  <Button size="sm" variant="secondary" onClick={onLoginRequired} endIcon={<ArrowUpRight size={13} />}>View details</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--vyra-border)] px-6 py-16 text-center">
          <Search size={22} className="mx-auto text-[var(--vyra-text-muted)]" />
          <p className="mt-3 text-sm font-semibold text-[var(--vyra-text-primary)]">No matching assets</p>
          <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Try another search or category.</p>
        </div>
      )}
    </main>
  );
};
