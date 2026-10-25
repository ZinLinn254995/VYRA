/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { Sidebar } from './components/navigation/Sidebar';
import { TopHeader } from './components/navigation/TopHeader';
import { DashboardView } from './components/views/DashboardView';
import { ProjectsView } from './components/views/ProjectsView';
import { CreateVideoView } from './components/views/CreateVideoView';
import { ProjectWorkspaceView } from './components/views/ProjectWorkspaceView';
import { ReviewQueueView } from './components/views/ReviewQueueView';
import { PublishingView } from './components/views/PublishingView';
import { MediaLibraryView } from './components/views/MediaLibraryView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { SettingsView } from './components/views/SettingsView';
import { Toast } from './components/common/Toast';

const StudioContent: React.FC = () => {
  const { currentSection } = useStudio();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const renderActiveView = () => {
    switch (currentSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'projects':
        return <ProjectsView />;
      case 'create':
        return <CreateVideoView />;
      case 'workspace':
        return <ProjectWorkspaceView />;
      case 'media':
        return <MediaLibraryView />;
      case 'review':
        return <ReviewQueueView />;
      case 'publishing':
        return <PublishingView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#090B18] light:bg-[#F8FAFC] text-slate-100 light:text-slate-900 transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen} />

      {/* Main Content Area (padded for desktop sidebar) */}
      <div className="md:pl-[72px] lg:pl-[260px] flex flex-col min-h-screen transition-all duration-200">
        <TopHeader onOpenMobileMenu={() => setMobileNavOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderActiveView()}
        </main>

        {/* Global Toast */}
        <Toast />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <StudioProvider>
      <StudioContent />
    </StudioProvider>
  );
}
