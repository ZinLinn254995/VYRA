import React, { useState } from 'react';
import {
  ArrowLeft, Bell, Bookmark, ChartNoAxesCombined, ChevronRight, CircleHelp,
  CreditCard, FolderHeart, Globe2, Heart, KeyRound, Library, LockKeyhole,
  LogOut, Monitor, Moon, Package, Settings2, ShieldCheck, ShoppingBag, Sun, UserRound,
  Users, Wallet, WandSparkles, type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';

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
};

type PageKey =
  | 'home' | 'public-profile' | 'my-vyrals' | 'saved' | 'purchased'
  | 'collections' | 'following' | 'creator-dashboard' | 'notifications'
  | 'settings' | 'setting-account' | 'setting-security' | 'setting-appearance'
  | 'setting-notifications' | 'setting-billing' | 'setting-ai' | 'setting-legal'
  | 'setting-about' | 'help';

type NavItem = { key: PageKey; label: string; detail: string; icon: LucideIcon };

const groups: { title: string; items: NavItem[] }[] = [
  { title: 'My Space', items: [
    { key: 'public-profile', label: 'My Public Profile', detail: 'Your creator identity and public showcase', icon: UserRound },
    { key: 'my-vyrals', label: 'My Vyrals', detail: 'Manage drafts and published creative assets', icon: WandSparkles },
  ] },
  { title: 'My Library', items: [
    { key: 'saved', label: 'Saved', detail: 'Vyrals you bookmarked for later', icon: Bookmark },
    { key: 'purchased', label: 'Purchased', detail: 'Your purchases, licenses and usage rights', icon: ShoppingBag },
    { key: 'collections', label: 'My Collections', detail: 'Organize Vyrals into personal collections', icon: FolderHeart },
  ] },
  { title: 'Community', items: [
    { key: 'following', label: 'Following', detail: 'Creators you follow', icon: Users },
    { key: 'notifications', label: 'Notifications', detail: 'Updates, activity and important alerts', icon: Bell },
  ] },
  { title: 'Creator Tools', items: [
    { key: 'creator-dashboard', label: 'Creator Dashboard', detail: 'Views, uses, sales and earnings', icon: ChartNoAxesCombined },
  ] },
  { title: 'Account', items: [
    { key: 'settings', label: 'Settings', detail: 'Account, security, preferences and privacy', icon: Settings2 },
    { key: 'help', label: 'Help & Support', detail: 'Guides, FAQs and contact support', icon: CircleHelp },
  ] },
];

const pageInfo: Record<Exclude<PageKey, 'home'>, { title: string; description: string; icon: LucideIcon; note: string }> = {
  'public-profile': { title: 'My Public Profile', description: 'Manage the creator profile other people can visit.', icon: UserRound, note: 'Your public creator page and profile editor will appear here.' },
  'my-vyrals': { title: 'My Vyrals', description: 'Manage the creative assets you have created.', icon: WandSparkles, note: 'Your drafts, published Vyrals and visibility controls will appear here.' },
  saved: { title: 'Saved', description: 'Keep interesting Vyrals together for later.', icon: Bookmark, note: 'Vyrals you save from the Marketplace will appear here. Saved items are private by default.' },
  purchased: { title: 'Purchased', description: 'Access your purchased Vyrals and their license details.', icon: ShoppingBag, note: 'Your purchases, receipts, license terms and available updates will appear here. A purchase does not automatically grant resale rights.' },
  collections: { title: 'My Collections', description: 'Group Vyrals into collections that match your creative interests.', icon: FolderHeart, note: 'Create and manage private or public collections here.' },
  following: { title: 'Following', description: 'Keep up with creators whose work you enjoy.', icon: Users, note: 'Creators you follow will appear here. Your following list can be made private in Settings.' },
  'creator-dashboard': { title: 'Creator Dashboard', description: 'Understand how your published Vyrals are performing.', icon: ChartNoAxesCombined, note: 'Creator analytics for views, uses, sales and earnings will appear here.' },
  notifications: { title: 'Notifications', description: 'Stay informed about activity on your VYRA account.', icon: Bell, note: 'Follow alerts, purchases, Vyral updates and system notifications will appear here.' },
  settings: { title: 'Settings', description: 'Control your account and VYRA experience.', icon: Settings2, note: 'Settings categories are organized below.' },
  'setting-account': { title: 'Account & Profile', description: 'Manage your email, personal details and public profile.', icon: UserRound, note: 'Account and profile controls are coming soon.' },
  'setting-security': { title: 'Security & Privacy', description: 'Manage password, active sessions and privacy controls.', icon: ShieldCheck, note: 'Security and privacy controls are coming soon.' },
  'setting-appearance': { title: 'Language & Appearance', description: 'Choose your language and display theme.', icon: Globe2, note: 'Language preferences are coming soon.' },
  'setting-notifications': { title: 'Notifications', description: 'Choose which alerts and updates you receive.', icon: Bell, note: 'Notification preferences are coming soon.' },
  'setting-billing': { title: 'Plans & Billing', description: 'Manage your subscription, credits, payments and invoices.', icon: CreditCard, note: 'Plans and billing controls are coming soon.' },
  'setting-ai': { title: 'AI Providers & API Keys', description: 'Manage connected AI providers and API keys.', icon: KeyRound, note: 'AI provider and API key management is coming soon.' },
  'setting-legal': { title: 'Terms & Legal', description: 'Review VYRA terms of service and privacy information.', icon: LockKeyhole, note: 'Legal documents are coming soon.' },
  'setting-about': { title: 'About VYRA', description: 'Platform information, version and product details.', icon: Monitor, note: 'VYRA platform information is coming soon.' },
  help: { title: 'Help & Support', description: 'Find guidance and get help using VYRA.', icon: CircleHelp, note: 'Help articles, frequently asked questions and support contact options will appear here.' },
};

const settingsItems: { key: PageKey; label: string; detail: string; icon: LucideIcon }[] = [
  { key: 'setting-account', label: 'Account & Profile', detail: 'Email, personal details and public profile', icon: UserRound },
  { key: 'setting-security', label: 'Security & Privacy', detail: 'Password, sessions and visibility controls', icon: ShieldCheck },
  { key: 'setting-appearance', label: 'Language & Appearance', detail: 'Language, theme and display preferences', icon: Globe2 },
  { key: 'setting-notifications', label: 'Notifications', detail: 'Choose which alerts you receive', icon: Bell },
  { key: 'setting-billing', label: 'Plans & Billing', detail: 'Subscription, credits, payments and invoices', icon: CreditCard },
  { key: 'setting-ai', label: 'AI Providers & API Keys', detail: 'Manage connected AI services and keys', icon: KeyRound },
  { key: 'setting-legal', label: 'Terms & Legal', detail: 'Terms of service and privacy policy', icon: LockKeyhole },
  { key: 'setting-about', label: 'About VYRA', detail: 'Platform information and version', icon: Monitor },
];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  userEmail, creditBalance, creditLoading, themeMode, resolvedTheme, onThemeModeChange, onBack, backLabel, onSignOut,
}) => {
  const [activePage, setActivePage] = useState<PageKey>('home');
  const balance = creditLoading ? '…' : creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  const goHome = () => setActivePage('home');

  return (
    <main className="mx-auto w-full max-w-[var(--vyra-content-width)] px-4 py-6 sm:px-6 sm:py-10">
      {activePage === 'home' ? (
        <>
          <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><UserRound size={22} /></div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">VYRA Account</h2>
                <p className="mt-1 truncate text-sm text-[var(--vyra-text-secondary)]">{userEmail}</p>
                <button type="button" onClick={() => setActivePage('public-profile')} className="mt-1 text-xs font-semibold text-[var(--vyra-accent-primary)] hover:underline">View my public profile</button>
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
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
          <div className="border-b border-[var(--vyra-border-subtle)] p-5 sm:p-6">
            <button type="button" onClick={goHome} className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
              <ArrowLeft size={16} /> Back to Profile
            </button>
            {(() => {
              const info = pageInfo[activePage];
              const Icon = info.icon;
              return (
                <>
                  <div className="mb-3 grid size-11 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Icon size={21} /></div>
                  <h1 className="text-xl font-bold text-[var(--vyra-text-primary)] sm:text-2xl">{info.title}</h1>
                  <p className="mt-1 text-sm text-[var(--vyra-text-secondary)]">{info.description}</p>
                </>
              );
            })()}
          </div>
          <div className="p-5 sm:p-6">
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
            ) : activePage.startsWith('setting-') ? (
              <div className="rounded-xl border border-dashed border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-4 py-8 text-center">
                <Library size={24} className="mx-auto mb-3 text-[var(--vyra-text-muted)]" />
                <p className="mx-auto max-w-md text-sm text-[var(--vyra-text-secondary)]">{pageInfo[activePage].note}</p>
                <span className="mt-3 inline-flex rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--vyra-text-muted)]">Coming soon</span>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-4 py-8 text-center">
                <Library size={24} className="mx-auto mb-3 text-[var(--vyra-text-muted)]" />
                <p className="mx-auto max-w-md text-sm text-[var(--vyra-text-secondary)]">{pageInfo[activePage].note}</p>
                <p className="mt-2 text-xs text-[var(--vyra-text-muted)]">This section is part of the Profile navigation foundation; its data and actions are not connected yet.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
};
