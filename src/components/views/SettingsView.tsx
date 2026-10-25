/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { BRAND_CONFIG } from '../../config/brand';
import { BrandLogo } from '../common/BrandLogo';
import {
  Settings,
  Sparkles,
  ShieldCheck,
  Palette,
  RotateCcw,
  Sun,
  Moon,
  Key,
  Check,
  Cpu,
  Database,
  Cloud,
} from 'lucide-react';
import { INITIAL_PROJECTS } from '../../data/seedData';
import { OpenRouterSettings } from './OpenRouterSettings';

export const SettingsView: React.FC = () => {
  const {
    brandName,
    setBrandName,
    brandTagline,
    setBrandTagline,
    theme,
    toggleTheme,
    showToast,
  } = useStudio();

  const [inputName, setInputName] = useState(brandName);
  const [inputTagline, setInputTagline] = useState(brandTagline);

  const handleSaveBrand = (e: React.FormEvent) => {
    e.preventDefault();
    setBrandName(inputName);
    setBrandTagline(inputTagline);
    showToast('Brand configuration updated across the studio!', 'success');
  };

  const handleResetBrand = () => {
    setInputName(BRAND_CONFIG.name);
    setInputTagline(BRAND_CONFIG.tagline);
    setBrandName(BRAND_CONFIG.name);
    setBrandTagline(BRAND_CONFIG.tagline);
    showToast('Brand reset to default provisional configuration', 'info');
  };

  const handleResetWorkspace = () => {
    if (window.confirm('Reset all projects and workspace data to factory defaults?')) {
      localStorage.removeItem('vyra_projects_v1');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
          Studio Settings & Configuration
        </h1>
        <p className="text-xs text-slate-400 light:text-slate-500 mt-0.5">
          Provisional brand identity parameters, theme rendering, and backend integration status
        </p>
      </div>

      {/* 1. Provisional Brand Identity Engine */}
      <section className="p-6 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2B3058]/60 light:border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#55F4FF]" />
              <span>Provisional Brand Identity Engine</span>
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              {BRAND_CONFIG.statusNotice}. Easily swap or rebrand the studio without modifying core code.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200">
            <BrandLogo size="sm" showWordmark={true} />
          </div>
        </div>

        <form onSubmit={handleSaveBrand} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300 light:text-slate-700">
                Application Brand Name
              </label>
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
              />
              <span className="text-[10px] text-slate-500">
                Current provisional identifier: {BRAND_CONFIG.name}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300 light:text-slate-700">
                Studio Tagline
              </label>
              <input
                type="text"
                value={inputTagline}
                onChange={(e) => setInputTagline(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
              />
              <span className="text-[10px] text-slate-500">
                Default: "Create beyond imagination."
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleResetBrand}
              className="text-xs text-slate-400 hover:text-white"
            >
              Reset to Original Brand
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold rounded-lg bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
            >
              Apply Brand Updates
            </button>
          </div>
        </form>
      </section>

      {/* 2. Theme & Accessibility Settings */}
      <section className="p-6 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4">
        <h2 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
          {theme === 'dark' ? (
            <Moon className="w-4 h-4 text-[#8D7CFF]" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
          <span>Theme & Visual Accessibility</span>
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200">
          <div>
            <div className="text-xs font-semibold text-white light:text-slate-900">
              Active Display Theme: <span className="capitalize">{theme} Mode</span>
            </div>
            <p className="text-[11px] text-slate-400 light:text-slate-500 mt-0.5">
              Midnight `#090B18` and Deep Space `#171A35` with Neon Accents in dark mode, or crisp Slate light surfaces.
            </p>
          </div>

          <button
            onClick={toggleTheme}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1E2345] light:bg-white border border-[#2B3058] light:border-slate-300 text-white light:text-slate-900 hover:bg-[#262B54] transition-colors shrink-0"
          >
            Switch to {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
      </section>

      <OpenRouterSettings />

      {/* 3. Service Integration Matrix (Readiness Status) */}
      <section className="p-6 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4">
        <h2 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
          <Key className="w-4 h-4 text-[#55F4FF]" />
          <span>Backend Service & API Integration Matrix</span>
        </h2>
        <p className="text-xs text-slate-400 light:text-slate-500">
          Architecture map for planned Work Package 2 integrations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              name: 'Google Gemini 2.5/Flash AI SDK',
              purpose: 'Server-side video prompt elaboration & scene synthesis',
              status: 'Ready for Key',
              statusColor: 'text-[#55F4FF]',
              icon: <Sparkles className="w-4 h-4 text-[#55F4FF]" />,
            },
            {
              name: 'Cloud GPU Video Synthesis Cluster',
              purpose: 'Compositing and high-resolution rendering pipeline',
              status: 'WP2 Target',
              statusColor: 'text-amber-400',
              icon: <Cpu className="w-4 h-4 text-amber-400" />,
            },
            {
              name: 'Cloud Storage & CDN Assets',
              purpose: 'Persistent cloud video and audio asset bucket',
              status: 'WP2 Target',
              statusColor: 'text-amber-400',
              icon: <Cloud className="w-4 h-4 text-amber-400" />,
            },
            {
              name: 'Social Media OAuth (YouTube / TikTok / Meta)',
              purpose: 'Direct 1-click publishing and scheduled delivery',
              status: 'WP2 Target',
              statusColor: 'text-amber-400',
              icon: <Key className="w-4 h-4 text-amber-400" />,
            },
          ].map((srv) => (
            <div
              key={srv.name}
              className="p-3.5 rounded-xl bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200 space-y-1"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-white light:text-slate-900">
                <span className="flex items-center gap-1.5">
                  {srv.icon}
                  {srv.name}
                </span>
                <span className={`text-[10px] font-mono ${srv.statusColor}`}>
                  {srv.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 light:text-slate-600">{srv.purpose}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Local Storage Maintenance */}
      <section className="p-6 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-3">
        <h2 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-slate-400" />
          <span>Local Workspace Reset</span>
        </h2>
        <p className="text-xs text-slate-400 light:text-slate-500">
          Restore initial seed projects or wipe local browser cache storage.
        </p>

        <button
          onClick={handleResetWorkspace}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Reset All Data to Factory Seed
        </button>
      </section>
    </div>
  );
};
