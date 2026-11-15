import React, { useState } from 'react';
import {
  Plus, X,
} from 'lucide-react';
import { Button } from '../ui/Button';

type UniverseSample = {
  id: string;
  name: string;
  updated: string;
  thumbnail: string;
};

const initialUniverses: UniverseSample[] = [
  { id: 'u1', name: 'The Emberfall Chronicles', updated: 'Edited 2 hours ago', thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&auto=format&fit=crop&q=85' },
  { id: 'u2', name: 'Beyond the Blue', updated: 'Edited yesterday', thumbnail: 'https://images.unsplash.com/photo-1518467166778-b88f373ffec7?w=900&auto=format&fit=crop&q=85' },
  { id: 'u3', name: 'NOVA Studio', updated: 'Edited 3 days ago', thumbnail: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&auto=format&fit=crop&q=85' },
  { id: 'u4', name: 'Aetherfall', updated: 'Edited 1 week ago', thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=900&auto=format&fit=crop&q=85' },
  { id: 'u5', name: 'Form & Space', updated: 'Edited 2 weeks ago', thumbnail: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&auto=format&fit=crop&q=85' },
  { id: 'u6', name: 'Creative Research Vault', updated: 'Edited 1 month ago', thumbnail: 'https://images.unsplash.com/photo-1455390582262-044cde7d0c2d?w=900&auto=format&fit=crop&q=85' },
];

export function MyUniverseHome() {
  const [universes, setUniverses] = useState(initialUniverses);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const createSample = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setUniverses((current) => [{
      id: `local-${Date.now()}`,
      name,
      updated: 'Just now',
      thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&auto=format&fit=crop&q=85',
    }, ...current]);
    setNewName('');
    setCreateOpen(false);
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vyra-bg-canvas)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">My Universe</h1>
          <Button size="md" className="shrink-0" startIcon={<Plus size={16} strokeWidth={2.4} />} onClick={() => setCreateOpen(true)}>New</Button>
        </div>


        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {universes.map((universe) => (
            <button key={universe.id} onClick={() => undefined} className="group overflow-hidden rounded-2xl text-left">
              <div className="aspect-[16/10] overflow-hidden rounded-xl bg-[var(--vyra-bg-surface)]">
                <img src={universe.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
              </div>
              <div className="flex items-center justify-between gap-3 px-1 pt-3">
                <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{universe.name}</h3>
                <span className="shrink-0 text-xs text-[var(--vyra-text-muted)]">{universe.updated}</span>
              </div>
            </button>
          ))}

        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <form onSubmit={createSample} className="w-full max-w-md rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--vyra-text-primary)]">Create a Universe</h2>
                <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">Preview only — no data will be saved.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={18} /></button>
            </div>
            <label className="mb-2 block text-xs font-medium text-[var(--vyra-text-secondary)]">Universe name</label>
            <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Give your Universe a name" className="h-11 w-full rounded-xl border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-border)]" />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" size="md" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" size="md" disabled={!newName.trim()}>Create preview</Button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
