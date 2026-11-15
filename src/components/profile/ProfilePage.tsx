import React, { useState } from 'react';
import {
  ChevronRight, Globe2, Images, KeyRound, Library, LogOut, Monitor, Moon,
  Settings2, Sun, UserRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { MyVyralsPage } from './MyVyralsPage';
import { MyMediaLibraryPage } from './MyMediaLibraryPage';
import { ApiKeySettings } from './ApiKeySettings';
import { ProfileSubpageHeader } from './ProfileSubpageHeader';
import { setCompactProgress, updateProfileHeaderCompact, handleHeaderWheel, handleHeaderTouchStart, handleHeaderTouchMove, handleHeaderTouchEnd } from './headerScrollMotion';
import type { VyralChatAssetContext } from '../../types/vyralChat';

type ProfilePageProps = {
  userEmail: string;
  creditBalance: string | null;
  creditLoading: boolean;
  themeMode: 'system' | 'light' | 'dark';
  resolvedTheme: 'light' | 'dark';
  onThemeModeChange: (mode: 'system' | 'light' | 'dark') => void;
  onBack: () => void;
  backLabel: string;
  onSignOut: () => void;
  onLoginRequired: () => void;
  initialPage?: 'my-vyrals' | 'my-media-library' | null;
  isActive?: boolean;
  onSendAssetsToChat?: (assets: VyralChatAssetContext[]) => void;
};

type PageKey = 'home' | 'my-vyrals' | 'my-media-library' | 'settings' | 'setting-appearance' | 'setting-ai';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;
type NavItem = { key: PageKey; label: string; detail: string; icon: IconComponent };

const groups: { title: string; items: NavItem[] }[] = [
  { title: 'My Space', items: [
    { key: 'my-vyrals', label: 'My Vyrals', detail: 'Manage your Creative Universes', icon: VyralIdentityIcon },
    { key: 'my-media-library', label: 'My Media Library', detail: 'Manage your uploaded and generated media', icon: Images },
  ] },
  { title: 'Platform', items: [
    { key: 'setting-ai', label: 'Admin Dashboard', detail: 'Manage VYRA platform API keys', icon: KeyRound },
  ] },
  { title: 'Account', items: [
    { key: 'settings', label: 'Settings', detail: 'Manage your display preferences', icon: Settings2 },
  ] },
];

const pageInfo: Record<Exclude<PageKey, 'home'>, { title: string; description: string; icon: IconComponent; note: string }> = {
  'my-vyrals': { title: 'My Vyrals', description: 'Manage your reusable Creative Universes.', icon: VyralIdentityIcon, note: 'Your Creative Universes appear here.' },
  'my-media-library': { title: 'My Media Library', description: 'Manage your uploaded and generated media.', icon: Images, note: 'Your media appears here.' },
  settings: { title: 'Settings', description: 'Control your VYRA experience.', icon: Settings2, note: 'Settings categories are organized below.' },
  'setting-appearance': { title: 'Language & Appearance', description: 'Choose your language and display theme.', icon: Globe2, note: 'Choose how VYRA looks on this device.' },
  'setting-ai': { title: 'Admin Dashboard', description: 'Manage VYRA platform API keys.', icon: KeyRound, note: 'Manage the API keys used by VYRA.' },
};

const settingsItems: { key: PageKey; label: string; detail: string; icon: LucideIcon }[] = [
  { key: 'setting-appearance', label: 'Language & Appearance', detail: 'Language, theme and display preferences', icon: Globe2 },
];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  userEmail, creditBalance, creditLoading, themeMode, resolvedTheme, onThemeModeChange, onBack, backLabel, onSignOut, onLoginRequired, initialPage = null, isActive = true, onSendAssetsToChat,
}) => {
  const [activePage, setActivePage] = useState<PageKey>(initialPage ?? 'home');
  const [visitedSubpages, setVisitedSubpages] = useState<Set<PageKey>>(() => new Set(initialPage ? [initialPage] : []));
  React.useEffect(() => {
    setVisitedSubpages((current) => current.has(activePage) ? current : new Set([...current, activePage]));
  }, [activePage]);
  React.useEffect(() => { setActivePage(initialPage ?? 'home'); }, [initialPage]);
  React.useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.dispatchEvent(new CustomEvent('vyra:page-activated', { detail: { page: isActive ? 'profile:' + activePage : 'profile:inactive' } }));
  }, [activePage, isActive]);
  React.useLayoutEffect(() => {
    // Every Profile subpage starts with the global header fully visible.
    // A page that supports header hiding must not leak that state into the next page.
    document.documentElement.style.setProperty('--vyra-main-header-progress', '0');
    document.documentElement.style.setProperty('--vyra-header-spacer-collapse', '0px');
    document.documentElement.classList.remove('is-header-dragging');
    window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: 0 }));
    const content = document.querySelector<HTMLElement>('.profile-subpage-content');
    if (content) updateProfileHeaderCompact(content);
  }, [activePage]);
  const balance = creditLoading ? '…' : creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  const goHome = () => setActivePage('home');

  return (
    <main className={`profile-page-main w-full ${activePage === "home" ? "mx-auto max-w-[var(--vyra-content-width)] px-4 py-6 sm:px-6 sm:py-10" : "min-w-0 p-0"}`}>
      {(activePage === 'my-vyrals' || visitedSubpages.has('my-vyrals')) && (
        <div hidden={activePage !== 'my-vyrals'} aria-hidden={activePage !== 'my-vyrals'} style={{ display: activePage !== 'my-vyrals' ? "none" : undefined }} className="min-w-0">
          <MyVyralsPage isAuthenticated={Boolean(userEmail)} isActive={isActive && activePage === 'my-vyrals'} onLoginRequired={onLoginRequired} onBack={initialPage ? onBack : goHome} backLabel={initialPage ? backLabel : 'Back to Profile'} onSendAssetsToChat={onSendAssetsToChat} />
        </div>
      )}
      {(activePage === 'my-media-library' || visitedSubpages.has('my-media-library')) && (
        <div hidden={activePage !== 'my-media-library'} aria-hidden={activePage !== 'my-media-library'} style={{ display: activePage !== 'my-media-library' ? "none" : undefined }} className="profile-subpage-scroll profile-subpage-viewport">
          <section className="profile-subpage-card">
            <div className="profile-subpage-content p-5 sm:p-6"><MyMediaLibraryPage isActive={isActive && activePage === 'my-media-library'} /></div>
          </section>
        </div>
      )}
      {activePage === 'home' ? (
        <>
          <section className="mb-7">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--vyra-accent-primary)] sm:text-[11px]"><UserRound size={14} /> PROFILE</p>
            <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Your Profile</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">Manage your creator identity, library, account and preferences.</p>
          </section>
          <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><UserRound size={22} /></div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">VYRA Account</h2>
                <p className="mt-1 truncate text-sm text-[var(--vyra-text-secondary)]">{userEmail}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--vyra-bg-subtle)] px-4 py-3 sm:min-w-40 sm:justify-start">
              <span className="flex items-center gap-2 text-xs text-[var(--vyra-text-secondary)]"><Wallet size={15} /> Available credits</span>
              <strong className="text-sm tabular-nums text-[var(--vyra-text-primary)]">{balance}</strong>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            {groups.map((group) => (
              <section key={group.title} className="overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
                <div className="border-b border-[var(--vyra-border-subtle)] px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">{group.title}</h2>
                </div>
                <div className="divide-y divide-[var(--vyra-border-subtle)]">
                  {group.items.map(({ key, label, detail, icon: Icon }) => (
                    <button key={key} type="button" onClick={() => setActivePage(key)} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--vyra-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-secondary)] group-hover:text-[var(--vyra-accent-primary)]"><Icon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[var(--vyra-text-primary)]">{label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--vyra-text-muted)]">{detail}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-6 flex justify-start">
            <Button variant="secondary" size="sm" startIcon={<LogOut size={15} />} onClick={onSignOut}>Sign Out</Button>
          </div>
        </>
      ) : activePage === 'my-vyrals' || activePage === 'my-media-library' ? null : (
        <div className="profile-subpage-scroll profile-subpage-viewport"><section className="profile-subpage-card">
          <ProfileSubpageHeader
            onBack={() => { if (initialPage) onBack(); else setActivePage(activePage === 'setting-appearance' || activePage === 'setting-ai' ? 'settings' : 'home'); }}
            backLabel={initialPage ? backLabel : activePage === 'setting-appearance' || activePage === 'setting-ai' ? 'Back to Settings' : 'Back to Profile'}
            icon={(() => { const Icon = pageInfo[activePage].icon; return <Icon size={21} />; })()}
            title={pageInfo[activePage].title}
            description={pageInfo[activePage].description}
          />
          <div className="profile-subpage-content p-5 sm:p-6" onWheel={handleHeaderWheel} onTouchStart={handleHeaderTouchStart} onTouchMove={handleHeaderTouchMove} onTouchEnd={handleHeaderTouchEnd} onTouchCancel={handleHeaderTouchEnd}>
            {activePage === 'settings' ? (
              <div className="divide-y divide-[var(--vyra-border-subtle)]">
                {settingsItems.map(({ key, label, detail, icon: Icon }) => (
                  <button key={key} type="button" onClick={() => setActivePage(key)} className="group flex w-full items-center gap-3 py-4 text-left transition hover:bg-[var(--vyra-bg-hover)] first:pt-0 last:pb-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-secondary)] group-hover:text-[var(--vyra-accent-primary)]"><Icon size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--vyra-text-primary)]">{label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--vyra-text-muted)]">{detail}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-[var(--vyra-text-muted)] transition group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            ) : activePage === 'setting-appearance' ? (
              <div className="max-w-xl">
                <div className="mb-5">
                  <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Display theme</h2>
                  <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Choose how VYRA looks on this device.</p>
                </div>
                <div className="mb-3 text-xs font-medium text-[var(--vyra-text-secondary)]">
                  {themeMode === 'system' ? `System theme · currently ${resolvedTheme}` : `${themeMode === 'light' ? 'Light' : 'Dark'} theme selected`}
                </div>
                <div role="group" aria-label="Display theme" className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-1.5">
                  {([
                    { value: 'light', label: 'Light', Icon: Sun },
                    { value: 'dark', label: 'Dark', Icon: Moon },
                    { value: 'system', label: 'System', Icon: Monitor },
                  ] as const).map(({ value, label, Icon }) => (
                    <button key={value} type="button" aria-pressed={themeMode === value} onClick={() => onThemeModeChange(value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold transition-colors ${themeMode === value ? 'bg-[var(--vyra-accent-primary)] text-slate-950' : 'text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}>
                      <Icon size={15} />{label}
                    </button>
                  ))}
                </div>
                <div className="mt-6 border-t border-[var(--vyra-border-subtle)] pt-5">
                  <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Language</h2>
                  <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Interface language preferences.</p>
                  <div className="mt-3 rounded-xl border border-dashed border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-4 py-5 text-center">
                    <span className="text-xs font-medium text-[var(--vyra-text-muted)]">Coming soon</span>
                    <p className="mt-1 text-xs text-[var(--vyra-text-secondary)]">Language selection will be available here.</p>
                  </div>
                </div>
              </div>
            ) : activePage === 'setting-ai' ? (
              <ApiKeySettings />
            ) : null}
          </div>
        </section></div>
      )}
    </main>
  );
};
