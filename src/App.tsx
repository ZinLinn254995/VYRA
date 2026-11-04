import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthDialog } from './components/auth/AuthDialog';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';
import { ProfilePage } from './components/profile/ProfilePage';

type WalletResponse = {
  availableBalance?: string;
};

function MarketplaceApp() {
  const { user, session, signOut } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    <div className="dark min-h-screen bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]">
      <MarketplaceHeader
        userEmail={user?.email ?? null}
        creditBalance={creditBalance}
        creditLoading={creditLoading}
        onWorkspaceRequest={() => { if (!user) requestAuth('login'); }}
        onAuthRequest={requestAuth}
        onProfileClick={() => setProfileOpen(true)}
      />
      {profileOpen && user ? (
        <ProfilePage
          userEmail={user.email ?? ''}
          creditBalance={creditBalance}
          creditLoading={creditLoading}
          onBack={() => setProfileOpen(false)}
          onSignOut={() => { void handleSignOut(); setProfileOpen(false); }}
        />
      ) : (
        <MarketplaceHome onLoginRequired={() => requestAuth('login')} />
      )}
      <AuthDialog open={authDialogOpen} initialMode={authMode} onClose={() => setAuthDialogOpen(false)} />
    </div>
  );
}

export default function App() {
  return <AuthProvider><MarketplaceApp /></AuthProvider>;
}
