import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthDialog } from './components/auth/AuthDialog';
import { AIChatPage } from './components/ai/AIChatPage';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';
import { ProfilePage } from './components/profile/ProfilePage';
import { WorkspacePage } from './components/workspace/WorkspacePage';

type WalletResponse = {
  availableBalance?: string;
};

type MainSection = 'marketplace' | 'workspace' | 'ai-chat';

function MarketplaceApp() {
  const { user, session, signOut } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>('marketplace');
  const [profileReturnSection, setProfileReturnSection] = useState<MainSection>('marketplace');
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
      const nextTheme = themeMode === 'system'
        ? (mediaQuery.matches ? 'light' : 'dark')
        : themeMode;
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
    if (!session?.access_token) {
      setCreditBalance(null);
      setCreditLoading(false);
      return () => { active = false; };
    }

    setCreditLoading(true);
    fetch('/api/credits/wallet', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store',
    })
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
  }, [session?.access_token]);

  const requestAuth = (mode: 'login' | 'signup' = 'login') => {
    setAuthMode(mode);
    setAuthDialogOpen(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setCreditBalance(null);
    } catch {
      // Keep the current account visible if the remote sign-out could not be confirmed.
    }
  };

  useLayoutEffect(() => {
    // Start each top-level page at its own top edge instead of inheriting
    // the previous page's document scroll position.
    window.scrollTo(0, 0);
  }, [activeSection, profileOpen]);

  useEffect(() => {
    // This is a single-page app; let page navigation manage scroll explicitly.
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  const workspaceStorageKey = 'vyra_storyboards_v1:' + (user?.id ?? user?.email ?? 'local');
  const seedDemoStoryboards = user?.email?.trim().toLowerCase() === 'zla264995@gmail.com';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]">
      <MarketplaceHeader
        userEmail={user?.email ?? null}
        creditBalance={creditBalance}
        creditLoading={creditLoading}
        activeSection={profileOpen ? profileReturnSection : activeSection}
        onMarketplaceRequest={() => { setProfileOpen(false); setActiveSection('marketplace'); }}
        onWorkspaceRequest={() => {
          if (!user) requestAuth('login');
          else { setProfileOpen(false); setActiveSection('workspace'); }
        }}
        onAIChatRequest={() => { setProfileOpen(false); setActiveSection('ai-chat'); }}
        onAuthRequest={requestAuth}
        onProfileClick={() => { setProfileReturnSection(activeSection); setProfileOpen(true); }}
      />
      <div aria-hidden="true" className="h-[109px] w-full shrink-0 sm:h-16" />
      <div className="min-h-0 flex-1">
        {profileOpen && user ? (
          <ProfilePage
            userEmail={user.email ?? ''}
            creditBalance={creditBalance}
            creditLoading={creditLoading}
            themeMode={themeMode}
            resolvedTheme={resolvedTheme}
            onThemeModeChange={setThemeMode}
            onBack={() => { setProfileOpen(false); setActiveSection(profileReturnSection); }}
            backLabel={profileReturnSection === 'workspace' ? 'Back to Workspace' : profileReturnSection === 'ai-chat' ? 'Back to AI Chat' : 'Back to Marketplace'}
            onSignOut={() => { void handleSignOut(); setProfileOpen(false); }}
          />
        ) : activeSection === 'ai-chat' ? (
          <AIChatPage isAuthenticated={Boolean(user)} onLoginRequired={() => requestAuth('login')} />
        ) : activeSection === 'workspace' && user ? (
          <WorkspacePage key={workspaceStorageKey} storageKey={workspaceStorageKey} seedDemoStoryboards={seedDemoStoryboards} />
        ) : (
          <MarketplaceHome onLoginRequired={() => requestAuth('login')} />
        )}
      </div>
      <AuthDialog open={authDialogOpen} initialMode={authMode} onClose={() => setAuthDialogOpen(false)} />
    </div>
  );
}

export default function App() {
  return <AuthProvider><MarketplaceApp /></AuthProvider>;
}
