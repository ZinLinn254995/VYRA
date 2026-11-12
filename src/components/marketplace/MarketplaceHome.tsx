import React from 'react';
import { Store } from 'lucide-react';

type MarketplaceProps = {
  onLoginRequired: () => void;
};

export const MarketplaceHome: React.FC<MarketplaceProps> = () => {
  return (
    <main className="mx-auto flex w-full max-w-[var(--vyra-content-width)] flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <section className="mb-8">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--vyra-accent-primary)] sm:text-[11px]">
          <Store size={14} /> VYRA CREATIVE MARKET
        </p>
        <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Marketplace</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--vyra-text-secondary)]">
          Discover reusable creative assets from the VYRA creator community.
        </p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--vyra-border)] px-6 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-muted)]">
          <Store size={25} strokeWidth={1.6} />
        </div>
        <h2 className="mt-5 text-base font-semibold text-[var(--vyra-text-primary)]">No Vyrals listed yet</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--vyra-text-secondary)]">
          Published Vyrals from creators will appear here when they are available.
        </p>
      </section>
    </main>
  );
};
