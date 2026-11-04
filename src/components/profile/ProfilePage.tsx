import React from 'react';
import {
  ArrowLeft, Bell, CreditCard, HelpCircle, KeyRound, LockKeyhole,
  LogOut, Monitor, ShieldCheck, UserRound, Wallet, Globe2,
} from 'lucide-react';
import { Button } from '../ui/Button';

type ProfilePageProps = {
  userEmail: string;
  creditBalance: string | null;
  creditLoading: boolean;
  onBack: () => void;
  onSignOut: () => void;
};

const sections = [
  { title: 'Account', items: [{ label: 'My Profile', detail: 'Personal information and email', icon: UserRound }, { label: 'Security', detail: 'Password and account security', icon: ShieldCheck }] },
  { title: 'Preferences', items: [{ label: 'Language & Appearance', detail: 'Language and theme preferences', icon: Globe2 }, { label: 'Notifications', detail: 'Manage product updates and alerts', icon: Bell }] },
  { title: 'Plans & Usage', items: [{ label: 'Credits & Billing', detail: 'Balance, usage history and payments', icon: Wallet }, { label: 'Subscription', detail: 'Your current plan and plan details', icon: CreditCard }, { label: 'API Keys', detail: 'Manage your connected AI providers', icon: KeyRound }] },
  { title: 'Support', items: [{ label: 'Help & Support', detail: 'Guides and contact information', icon: HelpCircle }, { label: 'About VYRA', detail: 'Platform information and version', icon: Monitor }, { label: 'Terms & Privacy', detail: 'Policies and legal information', icon: LockKeyhole }] },
];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  userEmail, creditBalance, creditLoading, onBack, onSignOut,
}) => {
  const balance = creditLoading ? '…' : creditBalance === null ? '—' : Number(creditBalance).toLocaleString();

  return (
    <main className="mx-auto w-full max-w-[var(--vyra-content-width)] px-4 py-6 sm:px-6 sm:py-10">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--vyra-text-secondary)] transition hover:text-[var(--vyra-text-primary)]">
        <ArrowLeft size={16} /> Back to Marketplace
      </button>

      <div className="mb-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--vyra-accent-primary)]">Account Center</p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-3xl">Your Profile</h1>
        <p className="mt-2 text-sm text-[var(--vyra-text-secondary)]">Manage your VYRA account and preferences in one place.</p>
      </div>

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
        {sections.map((section) => (
          <section key={section.title} className="overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
            <div className="border-b border-[var(--vyra-border-subtle)] px-4 py-3.5">
              <h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">{section.title}</h2>
            </div>
            <div className="divide-y divide-[var(--vyra-border-subtle)]">
              {section.items.map(({ label, detail, icon: Icon }) => (
                <div key={label} aria-disabled="true" title="Coming soon" className="flex cursor-not-allowed items-center gap-3 px-4 py-3.5 opacity-75">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-secondary)]"><Icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--vyra-text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--vyra-text-muted)]">{detail}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[var(--vyra-border)] px-2 py-1 text-[10px] font-medium text-[var(--vyra-text-muted)]">Soon</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="sm" startIcon={<LogOut size={15} />} onClick={onSignOut}>Sign Out</Button>
      </div>
      <p className="mt-8 text-center text-xs text-[var(--vyra-text-muted)]">VYRA Account Center</p>
    </main>
  );
};
