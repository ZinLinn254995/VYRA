/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  Bell,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  HelpCircle,
  Languages,
  LockKeyhole,
  Moon,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wallet,
} from 'lucide-react';

type Availability = 'available' | 'planned';

const pageClass = 'mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-5 sm:px-7';
const cardClass = 'overflow-hidden rounded-2xl border border-[#2B3058] bg-[#171A35] light:border-slate-200 light:bg-white';
const mutedClass = 'text-xs leading-5 text-slate-400 light:text-slate-500';

const SectionHeading: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]">
      {icon}
    </div>
    <div className="min-w-0">
      <h2 className="text-sm font-bold text-white light:text-slate-900">{title}</h2>
      <p className={mutedClass}>{description}</p>
    </div>
  </div>
);

const SettingRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  availability?: Availability;
  trailing?: React.ReactNode;
}> = ({ icon, title, description, availability = 'planned', trailing }) => (
  <div className="flex items-center gap-3 border-t border-[#2B3058]/70 px-4 py-3.5 light:border-slate-100 sm:px-5">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#090B18] text-slate-300 light:bg-slate-50 light:text-slate-600">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-white light:text-slate-900">{title}</p>
      <p className={mutedClass}>{description}</p>
    </div>
    {trailing ?? (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${
        availability === 'available'
          ? 'bg-emerald-400/10 text-emerald-300'
          : 'bg-slate-500/10 text-slate-400'
      }`}>
        {availability === 'available' ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
        {availability === 'available' ? 'Available' : 'Coming soon'}
      </span>
    )}
  </div>
);

export const SettingsView: React.FC = () => {
  const { theme, toggleTheme } = useStudio();

  return (
    <div className={pageClass}>
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[#55F4FF]">
          <SlidersHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Your Control Center</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white light:text-slate-900">Settings</h1>
        <p className={mutedClass}>Manage your account, preferences and VYRA subscription.</p>
      </header>

      <section className={cardClass}>
        <SectionHeading
          icon={<UserRound className="h-5 w-5" />}
          title="Account"
          description="Your profile and sign-in details."
        />
        <SettingRow
          icon={<UserRound className="h-4 w-4" />}
          title="Profile & Sign-in"
          description="Manage your personal information, email and password."
        />
      </section>

      <section className={cardClass}>
        <SectionHeading
          icon={<SlidersHorizontal className="h-5 w-5" />}
          title="Preferences"
          description="Make VYRA feel right for you."
        />
        <div className="flex flex-col gap-3 border-t border-[#2B3058]/70 px-4 py-4 light:border-slate-100 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#090B18] text-slate-300 light:bg-slate-50 light:text-slate-600">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-white light:text-slate-900">Appearance</p>
              <p className={mutedClass}>Currently using {theme === 'dark' ? 'Dark' : 'Light'} mode.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-[#3A416D] bg-[#1E2345] px-4 py-2.5 text-xs font-semibold text-white transition hover:border-[#55F4FF]/60 light:border-slate-300 light:bg-white light:text-slate-900"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </div>
        <SettingRow
          icon={<Languages className="h-4 w-4" />}
          title="Language"
          description="Choose Burmese or English."
        />
        <SettingRow
          icon={<Bell className="h-4 w-4" />}
          title="Notifications"
          description="Choose which updates and activity alerts you receive."
        />
      </section>

      <section className={cardClass}>
        <SectionHeading
          icon={<Wallet className="h-5 w-5" />}
          title="Plans & Credits"
          description="Your VYRA plan, balance and spending."
        />
        <SettingRow
          icon={<CreditCard className="h-4 w-4" />}
          title="Subscription & Plan"
          description="View your plan, renewal and available features."
        />
        <SettingRow
          icon={<Wallet className="h-4 w-4" />}
          title="Credits & Usage"
          description="Check your credit balance, generation history and usage."
        />
        <SettingRow
          icon={<CreditCard className="h-4 w-4" />}
          title="Payments & Billing"
          description="Manage payment methods, invoices and top-ups."
        />
      </section>

      <section className={cardClass}>
        <SectionHeading
          icon={<Plug className="h-5 w-5" />}
          title="Connections"
          description="External accounts linked to your creative workflow."
        />
        <SettingRow
          icon={<Plug className="h-4 w-4" />}
          title="Social Accounts"
          description="Manage TikTok and other supported publishing connections."
        />
      </section>

      <section className={cardClass}>
        <SectionHeading
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Privacy & Security"
          description="You stay in control of your account and data."
        />
        <SettingRow
          icon={<LockKeyhole className="h-4 w-4" />}
          title="Security & Permissions"
          description="Review sign-in security and connected app permissions."
        />
        <SettingRow
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Data & Privacy"
          description="Review your data, export options and privacy choices."
        />
        <SettingRow
          icon={<UserRound className="h-4 w-4" />}
          title="Account & Data Deletion"
          description="Request permanent account or personal data deletion."
        />
      </section>

      <section className={cardClass}>
        <SectionHeading
          icon={<HelpCircle className="h-5 w-5" />}
          title="Help & Support"
          description="Get help when you need it."
        />
        <SettingRow
          icon={<HelpCircle className="h-4 w-4" />}
          title="Guides & Support"
          description="Find product guides, answers and ways to contact support."
        />
      </section>

      <div className="rounded-xl border border-[#2B3058] bg-[#090B18]/70 px-4 py-3 light:border-slate-200 light:bg-slate-50">
        <p className="text-xs font-semibold text-white light:text-slate-900">AI models are managed in Chat</p>
        <p className={`mt-1 ${mutedClass}`}>
          Choose your Chat model in the Chat interface. When you request image, video, audio or document generation, Chat will guide you through the available quality tiers and models, show the estimated credits, and ask for confirmation before generating.
        </p>
      </div>
    </div>
  );
};
