import React, { useState } from 'react';
import { ArrowUpRight, Coins, LockKeyhole, LogOut, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';

type HeaderProps = {
  userEmail: string | null;
  creditBalance: string | null;
  creditLoading: boolean;
  onWorkspaceRequest: () => void;
  onAuthRequest: (mode: 'login' | 'signup') => void;
  onSignOut: () => void;
};

export const MarketplaceHeader: React.FC<HeaderProps> = ({
  userEmail, creditBalance, creditLoading, onWorkspaceRequest, onAuthRequest, onSignOut,
}) => {
  const [accountOpen, setAccountOpen] = useState(false);
  const signedIn = Boolean(userEmail);
  const formattedBalance = creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[var(--vyra-content-width)] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <a href="#marketplace" aria-label="VYRA Marketplace home" className="flex shrink-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--vyra-accent-primary)] text-sm font-black text-slate-950">V</span>
          <span className="text-lg font-extrabold tracking-[0.16em] text-[var(--vyra-text-primary)]">VYRA</span>
        </a>

        <nav aria-label="Main navigation" className="flex h-full items-center gap-0.5 sm:gap-1">
          <a href="#marketplace" aria-current="page" className="flex h-full items-center border-b-2 border-[var(--vyra-accent-primary)] px-2 text-xs font-semibold text-[var(--vyra-text-primary)] sm:px-3 sm:text-sm">
            Marketplace
          </a>
          <button onClick={onWorkspaceRequest} className="flex h-full items-center gap-1 border-b-2 border-transparent px-2 text-xs font-medium text-[var(--vyra-text-secondary)] transition hover:text-[var(--vyra-text-primary)] sm:gap-1.5 sm:px-3 sm:text-sm">
            Workspace {!signedIn && <LockKeyhole size={12} className="opacity-60" />}
          </button>
        </nav>

        <div className="relative flex shrink-0 items-center gap-2">
          {signedIn ? (
            <>
              <div className="hidden items-center gap-1.5 rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--vyra-text-primary)] sm:flex" aria-label="Available credit balance" title="Available credits">
                <Coins size={14} className="text-amber-400" />
                <span>{creditLoading ? '…' : formattedBalance}</span>
                <span className="font-medium text-[var(--vyra-text-muted)]">Credits</span>
              </div>
              <button type="button" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-label="Open account menu" className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] py-1.5 pl-1.5 pr-2.5 transition hover:bg-[var(--vyra-bg-hover)]">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><UserRound size={15} /></span>
                <span className="hidden max-w-32 truncate text-xs font-semibold text-[var(--vyra-text-primary)] md:block">{userEmail}</span>
              </button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => onAuthRequest('login')}>Sign In</Button>
              <Button size="sm" onClick={() => onAuthRequest('signup')}>Create Account</Button>
            </>
          )}

          {signedIn && accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3 shadow-[var(--vyra-shadow-overlay)]">
              <p className="truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{userEmail}</p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--vyra-bg-subtle)] px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs text-[var(--vyra-text-secondary)]"><Coins size={14} className="text-amber-400" /> Available credits</span>
                <span className="text-sm font-bold tabular-nums text-[var(--vyra-text-primary)]">{creditLoading ? '…' : formattedBalance}</span>
              </div>
              <Button className="mt-3 w-full" size="sm" variant="secondary" startIcon={<LogOut size={14} />} onClick={() => { setAccountOpen(false); onSignOut(); }}>
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>
      {signedIn && (
        <div className="border-t border-[var(--vyra-border-subtle)] px-3 py-1.5 sm:hidden">
          <div className="mx-auto flex max-w-[var(--vyra-content-width)] items-center justify-between gap-2">
            <span className="max-w-[60%] truncate text-[10px] text-[var(--vyra-text-muted)]">{userEmail}</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--vyra-text-secondary)]"><Coins size={12} className="text-amber-400" /> {creditLoading ? '…' : formattedBalance} Credits</span>
          </div>
        </div>
      )}
    </header>
  );
};
