/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useStudio } from '../../context/StudioContext';
import { BrandLogo } from '../common/BrandLogo';
import { NavSection } from '../../types';
import {
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  Film,
  Image,
  CheckSquare,
  Share2,
  BarChart3,
  Activity,
  Receipt,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Zap,
  Bot,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen, collapsed, setCollapsed }) => {
  const { currentSection, setCurrentSection, projects, stats, conversations } = useStudio();

  const reviewPendingCount = projects.filter((p) => p.status === 'in_review').length;

  const navItems: {
    id: NavSection;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: <FolderKanban className="w-5 h-5 shrink-0" />,
      badgeCount: projects.filter((p) => p.status !== 'archived').length,
    },
    {
      id: 'create',
      label: 'Create Video',
      icon: <Sparkles className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'ideas',
      label: 'AI Ideas Chat',
      icon: <Bot className="w-5 h-5 shrink-0" />,
      badgeCount: conversations.length > 0 ? conversations.length : undefined,
    },
    {
      id: 'workspace',
      label: 'Storyboard',
      icon: <Film className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'media',
      label: 'Media Library',
      icon: <Image className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'review',
      label: 'Review Queue',
      icon: <CheckSquare className="w-5 h-5 shrink-0" />,
      badgeCount: reviewPendingCount > 0 ? reviewPendingCount : undefined,
    },
    {
      id: 'publishing',
      label: 'Publishing',
      icon: <Share2 className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: <BarChart3 className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'jobs',
      label: 'Video Job Recovery',
      icon: <Activity className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'usage',
      label: 'Provider Usage',
      icon: <Receipt className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5 shrink-0" />,
    },
  ];

  const handleNavClick = (sectionId: NavSection) => {
    setCurrentSection(sectionId);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col transition-all duration-200 border-r
          bg-[#090B18] text-slate-300 border-[#1E2345]
          light:bg-white light:text-slate-700 light:border-slate-200
          ${mobileOpen ? 'w-[260px]' : collapsed ? 'w-[72px]' : 'w-[260px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Brand Header */}
        <div className={`h-16 min-w-0 flex items-center border-b border-[#1E2345] light:border-slate-200 relative transition-all ${collapsed && !mobileOpen ? 'justify-center px-2' : 'justify-between px-3 gap-2'}`}>
          <button onClick={() => handleNavClick('dashboard')} aria-label="Go to Dashboard" title="Dashboard" className="min-w-0 flex-1 flex items-center overflow-hidden text-left">
            <BrandLogo size="sm" showWordmark={!collapsed || mobileOpen} className="min-w-0" />
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={`hidden md:flex shrink-0 items-center justify-center text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-[#171A35] light:hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55F4FF] transition-colors ${
              collapsed && !mobileOpen
                ? 'absolute -right-3 top-1/2 -translate-y-1/2 z-50 size-6 rounded-full bg-[#090B18] light:bg-white border border-[#2B3058] light:border-slate-300 shadow-lg'
                : 'size-8 rounded-md'
            }`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="md:hidden p-1.5 rounded text-slate-400 hover:text-white light:hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary CTA (Create Video) when expanded */}
        {(!collapsed || mobileOpen) && (
          <div className="p-3">
            <button
              onClick={() => handleNavClick('create')}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-semibold text-xs tracking-wide transition-all shadow-sm
                ${
                  currentSection === 'create'
                    ? 'bg-[#55F4FF] text-[#090B18] shadow-[#55F4FF]/20 shadow-md font-bold'
                    : 'bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF] text-[#090B18] hover:opacity-95'
                }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Create Video</span>
            </button>
          </div>
        )}

        {/* Navigation Items List */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={collapsed && !mobileOpen ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative
                  ${
                    isActive
                      ? 'bg-[#171A35] text-white light:bg-slate-100 light:text-slate-900 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 light:hover:text-slate-900 hover:bg-[#13162C] light:hover:bg-slate-50'
                  }
                  ${collapsed && !mobileOpen ? 'justify-center' : 'justify-start'}
                `}
              >
                {/* Active Neon Accent Indicator Bar */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#55F4FF] shadow-[0_0_8px_#55F4FF]"
                  />
                )}

                <span
                  className={`transition-colors ${
                    isActive
                      ? 'text-[#55F4FF] light:text-[#6366F1]'
                      : 'text-slate-400 group-hover:text-slate-200 light:group-hover:text-slate-700'
                  }`}
                >
                  {item.icon}
                </span>

                {!collapsed && (
                  <span className="min-w-0 truncate flex-1 text-left tracking-wide">{item.label}</span>
                )}

                {!collapsed && item.badgeCount !== undefined && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded text-slate-400 light:text-slate-500 bg-[#090B18] light:bg-slate-200">
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom AI Quota / Usage Footer (Honest, clean presentation) */}
        {!collapsed ? (
          <div className="p-3 m-2 rounded-lg bg-[#171A35]/60 light:bg-slate-100/80 border border-[#2B3058]/50 light:border-slate-200 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-400 light:text-slate-600 mb-1.5">
              <span>Studio Compute Quota</span>
              <span className="font-mono tabular-nums text-slate-300 light:text-slate-800">
                {stats.generationSecondsUsed}s / {stats.monthlyQuotaSeconds}s
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090B18] light:bg-slate-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF] rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    (stats.generationSecondsUsed / stats.monthlyQuotaSeconds) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 light:text-slate-500">
              <span>Plan: Creator Pro</span>
              <button
                onClick={() => handleNavClick('settings')}
                className="text-[#55F4FF] light:text-[#6366F1] hover:underline"
              >
                Manage
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 flex justify-center border-t border-[#1E2345] light:border-slate-200">
            <div
              title={`Compute quota: ${stats.generationSecondsUsed}s / ${stats.monthlyQuotaSeconds}s`}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[#171A35] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1]"
            >
              <Zap className="w-4 h-4" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
