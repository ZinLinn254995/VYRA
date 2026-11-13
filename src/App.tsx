import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthDialog } from './components/auth/AuthDialog';
import { AIChatPage } from './components/ai/AIChatPage';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';
import { ProfilePage } from './components/profile/ProfilePage';
import type { VyralChatAssetContext } from './types/vyralChat';
import type { WorkspaceAiContext } from './types/workspaceAiContext';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import { ErrorBoundary } from './components/common/ErrorBoundary';

type WalletResponse = { availableBalance?: string };
type MainSection = 'marketplace' | 'workspace' | 'ai-chat';

function MarketplaceApp() {
  const { user, session, signOut } = useAuth();
  const isGuestSession = Boolean(user?.is_anonymous);
  const hasPermanentAccount = Boolean(user && !user.is_anonymous);
  const profileLabel = isGuestSession ? 'Temporary Guest Session' : user?.email ?? null;
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>('marketplace');
  const [pendingChatAssets, setPendingChatAssets] = useState<VyralChatAssetContext[]>([]);
  const [workspaceAiContext, setWorkspaceAiContext] = useState<WorkspaceAiContext | null>(null);
  const [profileReturnSection, setProfileReturnSection] = useState<MainSection>('marketplace');
  const [profileInitialPage, setProfileInitialPage] = useState<'my-vyrals' | 'my-media-library' | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [creditBalance, setCreditBalance] = useState<string | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>(() => {
    const stored = localStorage.getItem('vyra_display_theme');
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const applyTheme = () => {
      const nextTheme = themeMode === 'system' ? (mediaQuery.matches ? 'light' : 'dark') : themeMode;
      setResolvedTheme(nextTheme);
      document.documentElement.classList.toggle('light', nextTheme === 'light');
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    };
    applyTheme();
    localStorage.setItem('vyra_display_theme', themeMode);
    if (themeMode === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [themeMode]);

  useEffect(() => {
    let active = true;
    if (!session?.access_token || isGuestSession) {
      setCreditBalance(null);
      setCreditLoading(false);
      return () => { active = false; };
    }
    setCreditLoading(true);
    fetch('/api/credits/wallet', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as WalletResponse;
        if (!response.ok || typeof payload.availableBalance !== 'string' && typeof payload.availableBalance !== 'number') {
          throw new Error('Credit balance is temporarily unavailable.');
        }
        return String(payload.availableBalance);
      })
      .then((balance) => { if (active) setCreditBalance(balance); })
      .catch(() => { if (active) setCreditBalance(null); })
      .finally(() => { if (active) setCreditLoading(false); });
    return () => { active = false; };
  }, [session?.access_token, isGuestSession]);

  const requestAuth = (mode: 'login' | 'signup' = 'login') => {
    setAuthMode(mode);
    setAuthDialogOpen(true);
  };
  const handleSignOut = async () => {
    try { await signOut(); setCreditBalance(null); }
    catch { /* Keep the current account visible if the remote sign-out could not be confirmed. */ }
  };

  useEffect(() => {
    // This dimension is static for the mounted app. Cache it outside the
    // progress listener to avoid a computed-style/layout read on every drag frame.
    const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vyra-global-header-height')) || 64;
    const handleHeaderProgress = (event: Event) => {
      const progress = Math.max(0, Math.min(1, Number((event as CustomEvent<number>).detail) || 0));
      const root = document.documentElement;
      root.style.setProperty('--vyra-main-header-progress', String(progress));
      root.style.setProperty('--vyra-header-spacer-collapse', `${headerHeight * progress}px`);
    };
    window.addEventListener('vyra:main-header-progress', handleHeaderProgress);
    return () => window.removeEventListener('vyra:main-header-progress', handleHeaderProgress);
  }, []);

  const resetMainHeaderVisibility = () => {
    const root = document.documentElement;
    root.style.setProperty('--vyra-main-header-progress', '0');
    root.style.setProperty('--vyra-header-spacer-collapse', '0px');
    root.classList.remove('is-header-dragging');
    window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: 0 }));
  };

  useEffect(() => {
    const handleGlobalChatNavigation = (event: Event) => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target;
      if (target === 'workspace' || target === 'marketplace') {
        resetMainHeaderVisibility();
        setProfileOpen(false);
        setProfileInitialPage(null);
        setActiveSection(target);
      } else if (target === 'my-vyrals' || target === 'my-media-library') {
        resetMainHeaderVisibility();
        setProfileReturnSection('ai-chat');
        setProfileInitialPage(target);
        setProfileOpen(true);
      }
    };
    window.addEventListener('vyra:global-chat-navigate', handleGlobalChatNavigation);
    return () => window.removeEventListener('vyra:global-chat-navigate', handleGlobalChatNavigation);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    resetMainHeaderVisibility();
  }, [activeSection, profileOpen]);
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  const workspaceStorageKey = 'vyra_storyboards_v1:' + (user?.id ?? user?.email ?? 'local');
  const seedDemoStoryboards = user?.email?.trim().toLowerCase() === 'zla264995@gmail.com';

  return (
    <div className={`flex ${(profileOpen && user) || activeSection === 'workspace' ? "h-svh overflow-hidden" : "min-h-svh"} flex-col bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]`}>
      <MarketplaceHeader
        userEmail={profileLabel} creditBalance={creditBalance} creditLoading={creditLoading}
        activeSection={profileOpen ? 'profile' : activeSection}
        onMarketplaceRequest={() => { resetMainHeaderVisibility(); setProfileOpen(false); setActiveSection('marketplace'); }}
        onWorkspaceRequest={() => { resetMainHeaderVisibility(); setProfileOpen(false); setActiveSection('workspace'); }}
        onAIChatRequest={() => { resetMainHeaderVisibility(); setProfileOpen(false); setActiveSection('ai-chat'); }}
        onAuthRequest={requestAuth}
        onProfileClick={() => { resetMainHeaderVisibility(); setProfileReturnSection(activeSection); setProfileInitialPage(null); setProfileOpen(true); }}
      />
      <div aria-hidden="true" className="vyra-global-header-spacer w-full shrink-0" style={{ height: 'calc(var(--vyra-global-header-height, 64px) - var(--vyra-header-spacer-collapse, 0px))', transition: 'height 180ms ease-out' }} />
      <div className={`min-h-0 flex-1 ${(profileOpen && user) || activeSection === 'workspace' ? "flex flex-col overflow-hidden" : ""}`}>
        <ErrorBoundary key={profileOpen ? 'profile' : activeSection}>
          {profileOpen && user ? (
            <ProfilePage
              userEmail={profileLabel ?? ''} creditBalance={creditBalance} creditLoading={creditLoading}
              themeMode={themeMode} resolvedTheme={resolvedTheme} onThemeModeChange={setThemeMode}
              onBack={() => { setProfileOpen(false); setProfileInitialPage(null); setActiveSection(profileReturnSection); }}
              backLabel={profileReturnSection === 'workspace' ? 'Back to Workspace' : profileReturnSection === 'ai-chat' ? 'Back to AI Chat' : 'Back to Marketplace'}
              onSignOut={() => { void handleSignOut(); setProfileOpen(false); setProfileInitialPage(null); }}
              onLoginRequired={() => requestAuth('login')} initialPage={profileInitialPage}
              onSendAssetsToChat={(assets) => { setPendingChatAssets(assets); setProfileOpen(false); setActiveSection('ai-chat'); }}
            />
          ) : activeSection === 'ai-chat' ? (
            <AIChatPage isAuthenticated={hasPermanentAccount} onLoginRequired={() => requestAuth('login')} initialSelectedAssets={pendingChatAssets} onSelectedAssetsChange={setPendingChatAssets} workspaceContext={workspaceAiContext} />
          ) : activeSection === 'workspace' ? (
            <WorkspacePage
              storageKey={workspaceStorageKey} seedDemoStoryboards={seedDemoStoryboards}
              isAuthenticated={hasPermanentAccount} onLoginRequired={() => requestAuth('login')}
              onOpenLibraryPage={(page) => { setWorkspaceAiContext({ page, pageLabel: page === 'my-vyrals' ? 'Workspace / My Vyrals' : 'Workspace / My Media Library', capturedAt: new Date().toISOString() }); setProfileReturnSection('workspace'); setProfileInitialPage(page); setProfileOpen(true); }}
              onAiContextChange={setWorkspaceAiContext}
            />
          ) : (
            <MarketplaceHome onLoginRequired={() => requestAuth('login')} />
          )}
        </ErrorBoundary>
      </div>
      <AuthDialog open={authDialogOpen} initialMode={authMode} onClose={() => setAuthDialogOpen(false)} />
    </div>
  );
}

export default function App() { return <AuthProvider><MarketplaceApp /></AuthProvider>; }
