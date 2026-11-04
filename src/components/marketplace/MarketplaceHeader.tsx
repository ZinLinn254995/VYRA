import React, { useState } from 'react';
import { ArrowUpRight, Coins, LockKeyhole, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';

type HeaderProps = {
  onWorkspaceRequest: () => void;
};

export const MarketplaceHeader: React.FC<HeaderProps> = ({ onWorkspaceRequest }) => {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[var(--vyra-content-width)] items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#marketplace" aria-label="VYRA Marketplace home" className="flex shrink-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--vyra-accent-primary)] text-sm font-black text-slate-950">V</span>
          <span className="text-lg font-extrabold tracking-[0.16em] text-[var(--vyra-text-primary)]">VYRA</span>
        </a>

        <nav aria-label="Main navigation" className="flex h-full items-center gap-1">
          <a href="#marketplace" aria-current="page" className="flex h-full items-center border-b-2 border-[var(--vyra-accent-primary)] px-3 text-sm font-semibold text-[var(--vyra-text-primary)]">
            Marketplace
          </a>
          <button onClick={onWorkspaceRequest} className="flex h-full items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-[var(--vyra-text-secondary)] transition hover:text-[var(--vyra-text-primary)]">
            Workspace <LockKeyhole size={13} className="opacity-60" />
          </button>
        </nav>

        <div className="relative flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2 text-xs text-[var(--vyra-text-secondary)] sm:flex" aria-label="Guest credit balance">
            <Coins size={14} className="text-amber-400" />
            <span>Sign in for credits</span>
          </div>
          <Button size="sm" onClick={() => setAccountOpen((open) => !open)} startIcon={<UserRound size={15} />}>
            Sign In
          </Button>
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3 shadow-[var(--vyra-shadow-overlay)]">
              <p className="text-sm font-semibold text-[var(--vyra-text-primary)]">Welcome to VYRA</p>
              <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">Sign in to access your credits and workspace.</p>
              <Button className="mt-3 w-full" size="sm" onClick={() => { window.location.hash = '#/login'; setAccountOpen(false); }}>
                Continue <ArrowUpRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
