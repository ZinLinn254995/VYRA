import React, { useEffect, useRef } from 'react';
import { Bot, Clapperboard, Coins, Store, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';

type HeaderProps = {
  hideProgress?: number;
  userEmail: string | null;
  creditBalance: string | null;
  creditLoading: boolean;
  activeSection: 'marketplace' | 'workspace' | 'ai-chat' | 'profile';
  onMarketplaceRequest: () => void;
  onWorkspaceRequest: () => void;
  onAIChatRequest: () => void;
  onAuthRequest: (mode: 'login' | 'signup') => void;
  onProfileClick: () => void;
};

const BrandMark = ({ className = '' }: { className?: string }) => (
  <img src="/vyra-icon.svg" alt="" aria-hidden="true" className={className} />
);

export const MarketplaceHeader: React.FC<HeaderProps> = ({
  hideProgress = 0, userEmail, creditBalance, creditLoading, activeSection,
  onMarketplaceRequest, onWorkspaceRequest, onAIChatRequest, onAuthRequest, onProfileClick,
}) => {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const syncHeaderHeight = () => {
      document.documentElement.style.setProperty('--vyra-global-header-height', `${Math.ceil(element.getBoundingClientRect().height)}px`);
    };
    syncHeaderHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncHeaderHeight) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--vyra-global-header-height');
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncVisualViewport = () => {
      document.documentElement.style.setProperty('--vyra-visual-viewport-top', `${viewport.offsetTop}px`);
      document.documentElement.style.setProperty('--vyra-visual-viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--vyra-visual-viewport-bottom-gap', `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`);
    };
    syncVisualViewport();
    viewport.addEventListener('resize', syncVisualViewport);
    viewport.addEventListener('scroll', syncVisualViewport);
    return () => {
      viewport.removeEventListener('resize', syncVisualViewport);
      viewport.removeEventListener('scroll', syncVisualViewport);
      document.documentElement.style.removeProperty('--vyra-visual-viewport-top');
      document.documentElement.style.removeProperty('--vyra-visual-viewport-height');
      document.documentElement.style.removeProperty('--vyra-visual-viewport-bottom-gap');
    };
  }, []);

  const signedIn = Boolean(userEmail);
  const formattedBalance = creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  const navClass = (section: HeaderProps['activeSection']) =>
    `flex h-full items-center gap-1.5 border-b-2 px-2 text-xs transition sm:px-3 sm:text-sm ${activeSection === section
      ? 'border-[var(--vyra-accent-primary)] font-semibold text-[var(--vyra-text-primary)]'
      : 'border-transparent font-medium text-[var(--vyra-text-secondary)] hover:text-[var(--vyra-text-primary)]'}`;

  const mobileNavClass = (section: HeaderProps['activeSection']) =>
    `flex min-h-10 items-center gap-1.5 border-b-2 px-2 text-xs transition ${activeSection === section
      ? 'border-[var(--vyra-accent-primary)] font-semibold text-[var(--vyra-text-primary)]'
      : 'border-transparent font-medium text-[var(--vyra-text-secondary)]'}`;

  return (
    <header ref={headerRef} aria-hidden={hideProgress >= 0.999} style={{ transform: `translateY(${-100 * hideProgress}%)`, pointerEvents: hideProgress >= 0.999 ? "none" : "auto", transition: document.documentElement.classList.contains("is-header-dragging") ? "none" : "transform 180ms ease-out" }} className="fixed inset-x-0 top-[var(--vyra-visual-viewport-top,0px)] z-50 w-full border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/95 backdrop-blur-xl">
      <div className="mx-auto hidden h-16 max-w-[var(--vyra-content-width)] items-center justify-between gap-2 px-3 sm:flex sm:gap-4 sm:px-6">
        <button type="button" onClick={onMarketplaceRequest} aria-label="VYRA Marketplace home" className="flex shrink-0 items-center gap-2">
          <BrandMark className="size-9 rounded-xl" />
          <span className="text-lg font-extrabold tracking-[0.16em] text-[var(--vyra-text-primary)]">VYRA</span>
        </button>

        <nav aria-label="Main navigation" className="flex h-full items-center gap-0.5 sm:gap-1">
          <button type="button" onClick={onMarketplaceRequest} aria-current={activeSection === 'marketplace' ? 'page' : undefined} className={navClass('marketplace')}><Store size={15} /> Marketplace</button>
          <button type="button" onClick={onWorkspaceRequest} aria-current={activeSection === 'workspace' ? 'page' : undefined} className={navClass('workspace')}>
            <Clapperboard size={15} /> Workspace
          </button>
          <button type="button" onClick={onAIChatRequest} aria-current={activeSection === 'ai-chat' ? 'page' : undefined} className={navClass('ai-chat')}>
            <Bot size={15} /> AI Chat
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

      <div className="mx-auto max-w-[var(--vyra-content-width)] px-3 sm:hidden">
        <div className="flex h-14 items-center justify-between gap-2">
          <button type="button" onClick={onMarketplaceRequest} aria-label="VYRA Marketplace home" className="flex min-w-0 shrink-0 items-center gap-1.5">
            <BrandMark className="size-8 rounded-[10px]" />
            <span className="text-base font-extrabold tracking-[0.13em] text-[var(--vyra-text-primary)]">VYRA</span>
          </button>

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
                <Button size="sm" className="min-h-8 px-2.5" onClick={() => onAuthRequest('signup')}>Join</Button>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex min-h-11 items-center gap-1 border-t border-[var(--vyra-border-subtle)]">
          <button type="button" onClick={onMarketplaceRequest} aria-current={activeSection === 'marketplace' ? 'page' : undefined} className={mobileNavClass('marketplace')}><Store size={14} /> Marketplace</button>
          <button type="button" onClick={onWorkspaceRequest} aria-current={activeSection === 'workspace' ? 'page' : undefined} className={mobileNavClass('workspace')}>
            <Clapperboard size={14} /> Workspace
          </button>
          <button type="button" onClick={onAIChatRequest} aria-current={activeSection === 'ai-chat' ? 'page' : undefined} className={mobileNavClass('ai-chat')}>
            <Bot size={14} /> AI Chat
          </button>
        </nav>
      </div>
    </header>
  );
};
