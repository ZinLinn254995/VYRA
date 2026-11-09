import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthDialog } from './components/auth/AuthDialog';
import { AIChatPage } from './components/ai/AIChatPage';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';
import { ProfilePage } from './components/profile/ProfilePage';
import type { VyralChatAssetContext } from './types/vyralChat';
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

  useLayoutEffect(() => { window.scrollTo(0, 0); }, [activeSection, profileOpen]);
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
        onMarketplaceRequest={() => { setProfileOpen(false); setActiveSection('marketplace'); }}
        onWorkspaceRequest={() => { setProfileOpen(false); setActiveSection('workspace'); }}
        onAIChatRequest={() => { setProfileOpen(false); setActiveSection('ai-chat'); }}
        onAuthRequest={requestAuth}
        onProfileClick={() => { setProfileReturnSection(activeSection); setProfileInitialPage(null); setProfileOpen(true); }}
      />
      <div aria-hidden="true" className="h-[109px] w-full shrink-0 sm:h-16" />
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
            <AIChatPage isAuthenticated={hasPermanentAccount} onLoginRequired={() => requestAuth('login')} initialSelectedAssets={pendingChatAssets} onSelectedAssetsChange={setPendingChatAssets} />
          ) : activeSection === 'workspace' ? (
            <WorkspacePage
              storageKey={workspaceStorageKey} seedDemoStoryboards={seedDemoStoryboards}
              isAuthenticated={hasPermanentAccount} onLoginRequired={() => requestAuth('login')}
              onOpenLibraryPage={(page) => { setProfileReturnSection('workspace'); setProfileInitialPage(page); setProfileOpen(true); }}
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
