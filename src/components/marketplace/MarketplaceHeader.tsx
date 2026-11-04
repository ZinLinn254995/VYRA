import React from 'react';
import { Coins, LockKeyhole, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';

type HeaderProps = {
  userEmail: string | null;
  creditBalance: string | null;
  creditLoading: boolean;
  onWorkspaceRequest: () => void;
  onAuthRequest: (mode: 'login' | 'signup') => void;
  onProfileClick: () => void;
};

export const MarketplaceHeader: React.FC<HeaderProps> = ({
  userEmail, creditBalance, creditLoading, onWorkspaceRequest, onAuthRequest, onProfileClick,
}) => {
  const signedIn = Boolean(userEmail);
  const formattedBalance = creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/90 backdrop-blur-xl">
      {/* Desktop header: preserve the approved single-row layout. */}
      <div className="mx-auto hidden h-16 max-w-[var(--vyra-content-width)] items-center justify-between gap-2 px-3 sm:flex sm:gap-4 sm:px-6">
        <a href="#marketplace" aria-label="VYRA Marketplace home" className="flex shrink-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--vyra-accent-primary)] text-sm font-black text-slate-950">V</span>
          <span className="text-lg font-extrabold tracking-[0.16em] text-[var(--vyra-text-primary)]">VYRA</span>
        </a>

        <nav aria-label="Main navigation" className="flex h-full items-center gap-0.5 sm:gap-1">
          <a href="#marketplace" aria-current="page" className="flex h-full items-center border-b-2 border-[var(--vyra-accent-primary)] px-2 text-xs font-semibold text-[var(--vyra-text-primary)] sm:px-3 sm:text-sm">
            Marketplace
          </a>
          <button type="button" onClick={onWorkspaceRequest} className="flex h-full items-center gap-1 border-b-2 border-transparent px-2 text-xs font-medium text-[var(--vyra-text-secondary)] transition hover:text-[var(--vyra-text-primary)] sm:gap-1.5 sm:px-3 sm:text-sm">
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
              <button type="button" onClick={onProfileClick} aria-label="Open user profile" title="Profile" className="grid size-9 place-items-center rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] transition hover:bg-[var(--vyra-bg-hover)]">
                <UserRound size={17} />
              </button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => onAuthRequest('login')}>Sign In</Button>
              <Button size="sm" onClick={() => onAuthRequest('signup')}>Create Account</Button>
            </>
          )}
        </div>
      </div>

      {/* Mobile header: split into two compact rows to prevent crowding/overflow. */}
      <div className="mx-auto max-w-[var(--vyra-content-width)] px-3 sm:hidden">
        <div className="flex h-14 items-center justify-between gap-2">
          <a href="#marketplace" aria-label="VYRA Marketplace home" className="flex min-w-0 shrink-0 items-center gap-1.5">
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--vyra-accent-primary)] text-sm font-black text-slate-950">V</span>
            <span className="text-base font-extrabold tracking-[0.13em] text-[var(--vyra-text-primary)]">VYRA</span>
          </a>

          <div className="relative flex shrink-0 items-center gap-2">
            {signedIn ? (
              <>
                <span aria-label="Available credit balance" className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold tabular-nums text-[var(--vyra-text-primary)]">
                  <Coins size={13} className="text-amber-400" />
                  {creditLoading ? '…' : formattedBalance}
                  <span className="font-medium text-[var(--vyra-text-muted)]">Credits</span>
                </span>
                <button type="button" onClick={onProfileClick} aria-label="Open user profile" className="grid size-9 place-items-center rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] transition hover:bg-[var(--vyra-bg-hover)]">
                  <UserRound size={17} />
                </button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="min-h-8 px-2" onClick={() => onAuthRequest('login')}>Sign In</Button>
                <Button size="sm" className="min-h-8 px-2.5" onClick={() => onAuthRequest('signup')}>Create Account</Button>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-11 items-center justify-between gap-2 border-t border-[var(--vyra-border-subtle)]">
          <nav aria-label="Main navigation" className="flex min-w-0 items-center gap-1">
            <a href="#marketplace" aria-current="page" className="flex min-h-10 items-center border-b-2 border-[var(--vyra-accent-primary)] px-2 text-xs font-semibold text-[var(--vyra-text-primary)]">
              Marketplace
            </a>
            <button type="button" onClick={onWorkspaceRequest} className="flex min-h-10 items-center gap-1 border-b-2 border-transparent px-2 text-xs font-medium text-[var(--vyra-text-secondary)]">
              Workspace {!signedIn && <LockKeyhole size={11} className="opacity-60" />}
            </button>
          </nav>

        </div>
      </div>
    </header>
  );
};
