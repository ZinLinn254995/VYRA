import React, { useState } from 'react';
import { Plus } from 'lucide-react';
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

type MyUniverseHomeProps = { onCreateUniverse: () => void };

export function MyUniverseHome({ onCreateUniverse }: MyUniverseHomeProps) {
  const [universes] = useState(initialUniverses);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vyra-bg-canvas)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">My Universe</h1>
          <Button size="md" className="shrink-0" startIcon={<Plus size={16} strokeWidth={2.4} />} onClick={onCreateUniverse}>New</Button>
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

    </main>
  );
}
