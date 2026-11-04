import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthDialog } from './components/auth/AuthDialog';
import { AIChatPage } from './components/ai/AIChatPage';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';
import { ProfilePage } from './components/profile/ProfilePage';

type WalletResponse = {
  availableBalance?: string;
};

type MainSection = 'marketplace' | 'ai-chat';

function MarketplaceApp() {
  const { user, session, signOut } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>('marketplace');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [creditBalance, setCreditBalance] = useState<string | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

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

  return (
    <div className="dark flex min-h-screen flex-col bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]">
      <MarketplaceHeader
        userEmail={user?.email ?? null}
        creditBalance={creditBalance}
        creditLoading={creditLoading}
        activeSection={profileOpen ? 'marketplace' : activeSection}
        onMarketplaceRequest={() => { setProfileOpen(false); setActiveSection('marketplace'); }}
        onWorkspaceRequest={() => { if (!user) requestAuth('login'); }}
        onAIChatRequest={() => { setProfileOpen(false); setActiveSection('ai-chat'); }}
        onAuthRequest={requestAuth}
        onProfileClick={() => setProfileOpen(true)}
      />
      <div aria-hidden="true" className="h-[109px] w-full shrink-0 sm:h-16" />
      <div className="min-h-0 flex-1">
      {profileOpen && user ? (
        <ProfilePage
          userEmail={user.email ?? ''}
          creditBalance={creditBalance}
          creditLoading={creditLoading}
          onBack={() => setProfileOpen(false)}
          onSignOut={() => { void handleSignOut(); setProfileOpen(false); }}
        />
      ) : activeSection === 'ai-chat' ? (
        <AIChatPage isAuthenticated={Boolean(user)} onLoginRequired={() => requestAuth('login')} />
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
