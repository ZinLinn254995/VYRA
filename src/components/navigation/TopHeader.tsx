/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  Menu,
  Sun,
  Moon,
  Search,
  Plus,
  Sparkles,
} from 'lucide-react';

interface TopHeaderProps {
  onOpenMobileMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenMobileMenu }) => {
  const {
    theme,
    toggleTheme,
    currentSection,
    setCurrentSection,
    activeProject,
    searchQuery,
    setSearchQuery,
    brandName,
  } = useStudio();

  const sectionTitles: Record<string, string> = {
    dashboard: 'Studio Dashboard',
    projects: 'Project Catalog',
    create: 'Video Generator & Storyboard Wizard',
    ideas: 'AI Content Ideas & Brainstorming Chat',
    workspace: activeProject ? `Storyboard: ${activeProject.title}` : 'Storyboard Workspace',
    media: 'Media Asset Library',
    review: 'Review & Quality Queue',
    publishing: 'Social Distribution & Channels',
    analytics: 'Workspace & Studio Telemetry',
    jobs: 'Video Job Recovery',
    usage: 'Provider Usage History',
    settings: 'Settings & Brand Identity',
  };

  return (
    <header className={`${currentSection === 'ideas' ? 'relative' : 'sticky top-0 z-30'} h-16 w-full flex items-center justify-between gap-4 px-4 sm:px-6 border-b bg-[#090B18]/90 light:bg-white/90 backdrop-blur-md border-[#1E2345] light:border-slate-200 transition-colors`}>
      {/* Zone 1: Mobile toggle & Breadcrumb Trail */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          aria-label="Open mobile menu"
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-[#171A35] light:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#55F4FF]"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Clean Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-400 light:text-slate-500 truncate">
          <span className="font-semibold text-slate-300 light:text-slate-700">{brandName}</span>
          <span aria-hidden="true" className="text-slate-600">/</span>
          <span className="font-medium text-slate-100 light:text-slate-900 truncate">
            {sectionTitles[currentSection] || 'Studio'}
          </span>
        </div>
      </div>

      {/* Zone 2: Live Quick Search Bar */}
      <div className="hidden lg:flex items-center flex-1 max-w-xs md:max-w-md mx-2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects, scenes, or assets..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#171A35] light:bg-slate-100 text-slate-100 light:text-slate-900 placeholder:text-slate-500 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] light:focus:border-indigo-500 focus:ring-1 focus:ring-[#55F4FF]/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Zone 3: Actions (Theme Toggle + New Project Button) */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="p-2 rounded-lg text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-[#171A35] light:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#55F4FF] transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-300 transition-transform duration-200 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-200 hover:-rotate-12" />
          )}
        </button>

        {/* Quick Create CTA */}
        {currentSection !== 'create' && (
          <button
            onClick={() => setCurrentSection('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55F4FF]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Video</span>
          </button>
        )}

        {/* User Workspace Profile Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#1E2345] light:border-slate-200">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#8D7CFF] to-[#55F4FF] p-[1.5px] shrink-0">
            <div className="w-full h-full rounded-full bg-[#090B18] flex items-center justify-center text-[10px] font-bold text-white">
              <Sparkles className="w-3.5 h-3.5 text-[#55F4FF]" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
