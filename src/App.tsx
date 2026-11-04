import React, { useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import { Button } from './components/ui/Button';
import { MarketplaceHeader } from './components/marketplace/MarketplaceHeader';
import { MarketplaceHome } from './components/marketplace/MarketplaceHome';

export default function App() {
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  return (
    <div className="dark min-h-screen bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]">
      <MarketplaceHeader onWorkspaceRequest={() => setLoginPromptOpen(true)} />
      <MarketplaceHome onLoginRequired={() => setLoginPromptOpen(true)} />

      {loginPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginPromptOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="login-required-title" className="w-full max-w-sm rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-6 shadow-[var(--vyra-shadow-overlay)]">
            <div className="mb-4 flex items-start justify-between">
              <div className="grid size-11 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><LockKeyhole size={20} /></div>
              <button onClick={() => setLoginPromptOpen(false)} aria-label="Close dialog" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
            </div>
            <h2 id="login-required-title" className="text-lg font-bold">Sign in to continue</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">You can explore the Marketplace as a guest. Sign in is required before adding assets to your workspace or using creator features.</p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={() => setLoginPromptOpen(false)}>Got it</Button>
              <Button className="flex-1" variant="secondary" onClick={() => { setLoginPromptOpen(false); window.location.hash = '#/login'; }}>Sign In</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
