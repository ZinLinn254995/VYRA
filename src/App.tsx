/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/navigation/Sidebar';
import { TopHeader } from './components/navigation/TopHeader';
import { DashboardView } from './components/views/DashboardView';
import { ProjectsView } from './components/views/ProjectsView';
import { CreateVideoView } from './components/views/CreateVideoView';
import { AIIdeasChatView } from './components/views/AIIdeasChatView';
import { ProjectWorkspaceView } from './components/views/ProjectWorkspaceView';
import { ReviewQueueView } from './components/views/ReviewQueueView';
import { PublishingView } from './components/views/PublishingView';
import { MediaLibraryView } from './components/views/MediaLibraryView';
import { ConsistencyLibraryView } from './components/views/ConsistencyLibraryView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { SettingsView } from './components/views/SettingsView';
import { VideoJobRecoveryView } from './components/views/VideoJobRecoveryView';
import { ProviderUsageView } from './components/views/ProviderUsageView';
import { CreditsWalletView } from './components/views/CreditsWalletView';
import { Toast } from './components/common/Toast';
import { navigateVYRA, type PublicRoute } from './utils/navigation';
import {
  AuthLoadingScreen,
  AuthPage,
  OnboardingPage,
  PublicLandingPage,
} from './components/auth/AuthPages';

function readRoute(): PublicRoute {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'reset') return 'reset-password';
  const route = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  if (['welcome', 'login', 'signup', 'forgot-password', 'onboarding'].includes(route)) return route as PublicRoute;
  return 'workspace';
}

const StudioContent: React.FC = () => {
  const { currentSection } = useStudio();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const renderActiveView = () => {
    switch (currentSection) {
      case 'dashboard': return <DashboardView />;
      case 'projects': return <ProjectsView />;
      case 'create': return <CreateVideoView />;
      case 'ideas': return <AIIdeasChatView />;
      case 'workspace': return <ProjectWorkspaceView />;
      case 'media': return <MediaLibraryView />;
      case 'consistency': return <ConsistencyLibraryView />;
      case 'review': return <ReviewQueueView />;
      case 'publishing': return <PublishingView />;
      case 'analytics': return <AnalyticsView />;
      case 'jobs': return <VideoJobRecoveryView />;
      case 'usage': return <ProviderUsageView />;
      case 'credits': return <CreditsWalletView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#090B18] light:bg-[#F8FAFC] text-slate-100 light:text-slate-900 transition-colors">
      <Sidebar
        mobileOpen={mobileNavOpen}
        setMobileOpen={setMobileNavOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />
      <div className={`${sidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-[260px]'} flex flex-col min-h-screen transition-all duration-200`}>
        <TopHeader onOpenMobileMenu={() => setMobileNavOpen(true)} />
        <main className={`flex-1 min-h-0 ${currentSection === 'ideas' ? 'h-[calc(100dvh-4rem)] min-h-[32rem] overflow-hidden p-2 sm:p-4 lg:p-6' : 'overflow-y-auto p-4 sm:p-6 lg:p-8'}`}>
          {renderActiveView()}
        </main>
        <Toast />
      </div>
    </div>
  );
};

const AppRouter: React.FC = () => {
  const { loading, configured, user } = useAuth();
  const [route, setRoute] = useState<PublicRoute>(readRoute);

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  if (loading) return <AuthLoadingScreen />;
  if (route === 'welcome' || (route === 'workspace' && configured && !user)) return <PublicLandingPage />;
  if (route === 'onboarding') return <OnboardingPage />;
  if (route === 'login' || route === 'signup' || route === 'forgot-password' || route === 'reset-password') {
    return <AuthPage mode={route} />;
  }
  return <StudioContent />;
};

export default function App() {
  return (
    <AuthProvider>
      <StudioProvider>
        <AppRouter />
      </StudioProvider>
    </AuthProvider>
  );
}
