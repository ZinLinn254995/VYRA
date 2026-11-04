/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  Settings2,
  Sun,
  Moon,
  Sparkles,
  ShieldCheck,
  UserRound,
  SlidersHorizontal,
  Database,
  Cloud,
  ShoppingBag,
  Link2,
  Languages,
  Bell,
  LockKeyhole,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FolderOpen,
  KeyRound,
} from 'lucide-react';
import { OpenRouterSettings } from './OpenRouterSettings';

const cardClass = 'rounded-2xl border border-[#2B3058] bg-[#171A35] p-4 sm:p-5 light:border-slate-200 light:bg-white';
const mutedClass = 'text-xs leading-5 text-slate-400 light:text-slate-500';

type Status = 'ready' | 'planned' | 'manual';

const StatusLabel: React.FC<{ status: Status; children: React.ReactNode }> = ({ status, children }) => {
  const styles = status === 'ready'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    : status === 'manual'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
      : 'border-slate-500/20 bg-slate-500/10 text-slate-400';
  const Icon = status === 'ready' ? CheckCircle2 : status === 'manual' ? ShieldCheck : CircleDashed;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${styles}`}>
      <Icon className="h-3 w-3" />{children}
    </span>
  );
};

const InfoRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  status: Status;
  statusText: string;
}> = ({ icon, title, description, status, statusText }) => (
  <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#2B3058] bg-[#090B18] text-[#55F4FF] light:border-slate-200 light:bg-slate-50">{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold text-white light:text-slate-900">{title}</h3>
        <StatusLabel status={status}>{statusText}</StatusLabel>
      </div>
      <p className={`mt-1 ${mutedClass}`}>{description}</p>
    </div>
  </div>
);

export const SettingsView: React.FC = () => {
  const { theme, toggleTheme, showToast } = useStudio();

  const handleResetWorkspace = () => {
    const confirmed = window.confirm(
      'Reset local VYRA project data on this browser? This removes the locally stored project list and reloads the app. It does not delete cloud account data.'
    );
    if (!confirmed) return;
    localStorage.removeItem('vyra_projects_v1');
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-16 pt-5 sm:px-7">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[#55F4FF]">
          <Settings2 className="h-5 w-5" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Control Center</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white light:text-slate-900">Settings</h1>
        <p className={mutedClass}>Manage your VYRA experience, creative tools, connected services and account controls.</p>
      </header>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><SlidersHorizontal className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Workspace Preferences</h2>
            <p className={mutedClass}>Set the way your creative workspace looks and feels.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-[#2B3058] bg-[#090B18] p-4 sm:flex-row sm:items-center sm:justify-between light:border-slate-200 light:bg-slate-50">
          <div className="flex items-start gap-3">
            {theme === 'dark' ? <Moon className="mt-0.5 h-4 w-4 text-violet-300" /> : <Sun className="mt-0.5 h-4 w-4 text-amber-500" />}
            <div>
              <p className="text-xs font-semibold text-white light:text-slate-900">Appearance</p>
              <p className={mutedClass}>Currently using {theme === 'dark' ? 'Dark' : 'Light'} theme.</p>
            </div>
          </div>
          <button onClick={toggleTheme} className="rounded-lg border border-[#3A416D] bg-[#1E2345] px-4 py-2.5 text-xs font-semibold text-white transition hover:border-[#55F4FF]/60 light:border-slate-300 light:bg-white light:text-slate-900">
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </div>
        <div className="mt-3 divide-y divide-[#2B3058]/70 light:divide-slate-100">
          <InfoRow icon={<Languages className="h-4 w-4" />} title="Language" description="Burmese and English interface support is part of the product direction; the language switch is not connected in this build yet." status="planned" statusText="Planned" />
          <InfoRow icon={<Bell className="h-4 w-4" />} title="Notifications" description="Generation, storage and marketplace notification preferences will be managed here when notification delivery is connected." status="planned" statusText="Planned" />
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><Sparkles className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">AI & Generation</h2>
            <p className={mutedClass}>Choose the AI provider and models used by your creative tools.</p>
          </div>
        </div>
        <OpenRouterSettings />
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><FolderOpen className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Workspace, Vyral & Media</h2>
            <p className={mutedClass}>The places where your creative work and assets are organized.</p>
          </div>
        </div>
        <div className="divide-y divide-[#2B3058]/70 light:divide-slate-100">
          <InfoRow icon={<FolderOpen className="h-4 w-4" />} title="Workspace & Vyral Library" description="Your projects, Vyrals, folders and files are managed from their own workspaces. Workspace-level organization controls will live with those areas." status="ready" statusText="Available" />
          <InfoRow icon={<Database className="h-4 w-4" />} title="Media Library" description="Browse and preview saved images, videos and audio. Custom folder persistence and cross-device sync are not connected yet." status="manual" statusText="Device storage" />
          <InfoRow icon={<Cloud className="h-4 w-4" />} title="Cloud Storage & Backup" description="Cloud asset storage, storage quotas and backup controls will appear here after the storage service is implemented." status="planned" statusText="Planned" />
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><ShoppingBag className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Marketplace & Ownership</h2>
            <p className={mutedClass}>Manage what you own, what you create and what you are allowed to trade inside VYRA.</p>
          </div>
        </div>
        <div className="divide-y divide-[#2B3058]/70 light:divide-slate-100">
          <InfoRow icon={<ShoppingBag className="h-4 w-4" />} title="Purchases & Licenses" description="Purchase-time license terms should remain attached to each purchase. Basic use, modification, derivative creation and resale permissions are distinct rights." status="planned" statusText="Planned" />
          <InfoRow icon={<Link2 className="h-4 w-4" />} title="Vyral Versions & Branches" description="Root and Branch histories remain separate. Updating a Root does not silently overwrite a Branch; upstream changes require an explicit action." status="planned" statusText="Blueprint" />
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} title="Creative Freedom" description="VYRA manages permissions and transactions inside its own platform. It does not control how users reuse or publish exported work on external platforms." status="ready" statusText="Product principle" />
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><Link2 className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Connected Services</h2>
            <p className={mutedClass}>External accounts and platform integrations.</p>
          </div>
        </div>
        <div className="divide-y divide-[#2B3058]/70 light:divide-slate-100">
          <InfoRow icon={<KeyRound className="h-4 w-4" />} title="AI Provider Key" description="OpenRouter key and model selection are managed in AI & Generation above. The current key is held in this browser session." status="manual" statusText="Session only" />
          <InfoRow icon={<Link2 className="h-4 w-4" />} title="Social Publishing Accounts" description="TikTok and other publishing account connections will be managed here as each integration is completed and verified." status="planned" statusText="Integration status varies" />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/20 bg-[#171A35] p-4 sm:p-5 light:bg-white">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><LockKeyhole className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white light:text-slate-900">Human-Controlled Area</h2>
              <StatusLabel status="manual">Human approval required</StatusLabel>
            </div>
            <p className={`mt-1 ${mutedClass}`}>Critical account and ownership decisions stay under your direct control. AI may explain or prepare an action, but must not silently change these settings.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {['Account security & sign-in', 'API keys and payment approvals', 'Purchase, license and resale confirmation', 'Delete account or permanently remove data'].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border border-amber-400/10 bg-[#090B18]/70 px-3 py-2.5 text-[11px] text-slate-300 light:border-amber-200 light:bg-amber-50 light:text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" />{item}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">These controls are reserved in the design; they are not all available as working controls yet.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300"><AlertTriangle className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white light:text-slate-900">Local Data Reset</h2>
            <p className={`mt-1 ${mutedClass}`}>Removes the locally stored VYRA project list from this browser and reloads the app. This does not delete cloud account data or Media Library files.</p>
            <button onClick={handleResetWorkspace} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-3.5 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10">
              <RotateCcw className="h-3.5 w-3.5" />Reset local project data
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
