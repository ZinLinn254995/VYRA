/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blueprint-aligned application shell.
 * This file changes presentation/navigation only; existing service and data layers remain intact.
 */
import React, { useRef, useState } from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { AuthProvider } from './context/AuthContext';
import { ProjectWorkspaceView } from './components/views/ProjectWorkspaceView';
import { CreateVideoView } from './components/views/CreateVideoView';
import { AIIdeasChatView } from './components/views/AIIdeasChatView';
import { MediaLibraryView } from './components/views/MediaLibraryView';
import { ConsistencyLibraryView } from './components/views/ConsistencyLibraryView';
import { SettingsView } from './components/views/SettingsView';
import { Toast } from './components/common/Toast';
import { BrandLogo } from './components/common/BrandLogo';
import {
  ArrowLeft, ArrowRight, BookOpen, Clapperboard, Image, Layers3,
  MessageCircle, Plus, Settings, ShieldCheck, Sparkles, Film,
} from 'lucide-react';

type AppMode = 'workspace' | 'chat';
type WorkspacePage = 'home' | 'storyboards' | 'storyboard' | 'vyrals' | 'media' | 'settings' | 'human' | 'create';

const WorkspaceHome: React.FC<{ onNavigate: (page: WorkspacePage) => void }> = ({ onNavigate }) => {
  const { projects, activeProject, setActiveProjectId } = useStudio();
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-7 sm:py-9">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">VYRA Creative Studio</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Your creative workspace</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">Continue a Storyboard or choose a workspace area. Your AI Chat and visual workspace share the same creative data.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { page: 'storyboards' as const, label: 'Storyboards', detail: 'Browse and create', icon: Clapperboard },
          { page: 'vyrals' as const, label: 'Vyrals', detail: 'Reusable creative assets', icon: Layers3 },
          { page: 'media' as const, label: 'Media Library', detail: 'Your creative materials', icon: Image },
          { page: 'settings' as const, label: 'Settings', detail: 'Workspace preferences', icon: Settings },
        ].map(({ page, label, detail, icon: Icon }) => (
          <button key={page} onClick={() => onNavigate(page)} className="group min-h-32 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
            <Icon className="mb-5 h-5 w-5 text-cyan-300" />
            <span className="block text-sm font-semibold text-slate-100">{label}</span>
            <span className="mt-1 block text-xs text-slate-500">{detail}</span>
          </button>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent Storyboards</h2>
            <p className="mt-1 text-xs text-slate-500">Pick up where you left off.</p>
          </div>
          <button onClick={() => onNavigate('storyboards')} className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200">View all <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
        {recent.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((item) => (
              <button key={item.id} onClick={() => { setActiveProjectId(item.id); onNavigate('storyboard'); }} className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-cyan-400/50">
                <img src={item.coverImage} alt="" className="h-20 w-28 shrink-0 rounded-xl bg-slate-800 object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{item.scenes.length} items · Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300">Open Storyboard <ArrowRight className="h-3 w-3" /></span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center">
            <Film className="mx-auto h-8 w-8 text-slate-600" />
            <h3 className="mt-4 text-sm font-semibold text-white">No Storyboards yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">Start with an idea. VYRA will help shape the creative plan before building your first Storyboard.</p>
            <button onClick={() => onNavigate('create')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-4 w-4" /> Create New Storyboard</button>
          </div>
        )}
      </section>
      {activeProject && <p className="text-[11px] text-slate-600">Currently selected: {activeProject.title}</p>}
    </div>
  );
};

const StoryboardLibrary: React.FC<{ onOpen: (id: string) => void; onCreate: () => void }> = ({ onOpen, onCreate }) => {
  const { projects } = useStudio();
  const storyboards = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-7 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Your creative work</p><h1 className="mt-2 text-3xl font-semibold text-white">Storyboards</h1><p className="mt-2 text-sm text-slate-400">Each Storyboard contains the ordered creative items for one video.</p></div>
        <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-4 w-4" /> Create New Storyboard</button>
      </div>
      {storyboards.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{storyboards.map((item) => <button key={item.id} onClick={() => onOpen(item.id)} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 text-left transition hover:border-cyan-400/50"><img src={item.coverImage} alt="" className="aspect-video w-full object-cover" /><span className="block p-4"><span className="block truncate text-sm font-semibold text-white">{item.title}</span><span className="mt-1 block text-xs text-slate-400">{item.scenes.length} items · {item.status.replaceAll('_', ' ')}</span></span></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">Your Storyboards will appear here.</div>}
    </div>
  );
};

const HumanControlledArea: React.FC = () => (
  <div className="mx-auto flex min-h-[65vh] max-w-3xl flex-col justify-center px-5 py-12">
    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300"><ShieldCheck className="h-6 w-6" /></div>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Human authority</p>
    <h1 className="mt-2 text-3xl font-semibold text-white">Human-Controlled Area</h1>
    <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">This dedicated area is reserved for controls and decisions that must remain under the customer's direct control. The exact controls and AI visibility rules have not yet been defined in the Blueprint, so no account, security, financial, or publishing controls are being added here prematurely.</p>
  </div>
);

const StudioContent: React.FC = () => {
  const { theme, toggleTheme, currentSection, setCurrentSection, projects, setActiveProjectId, navigateToProjectWorkspace } = useStudio();
  const [mode, setMode] = useState<AppMode>('workspace');
  const [page, setPage] = useState<WorkspacePage>('home');
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const navigate = (next: WorkspacePage) => {
    setPage(next);
    const sectionMap: Partial<Record<WorkspacePage, string>> = { home: 'dashboard', storyboards: 'projects', storyboard: 'workspace', vyrals: 'consistency', media: 'media', settings: 'settings', create: 'create' };
    const section = sectionMap[next];
    if (section) setCurrentSection(section as any);
  };
  const openStoryboard = (id: string) => { setActiveProjectId(id); navigateToProjectWorkspace(id); setPage('storyboard'); };
  const startTouch = (event: React.TouchEvent) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; };
  const endTouch = (event: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 110 && Math.abs(dx) > Math.abs(dy) * 1.4) setMode(dx < 0 ? 'chat' : 'workspace');
    touchStart.current = null;
  };

  const title = page === 'home' ? 'Workspace' : page === 'storyboards' ? 'Storyboards' : page === 'storyboard' ? 'Storyboard' : page === 'vyrals' ? 'Vyrals' : page === 'media' ? 'Media Library' : page === 'settings' ? 'Settings' : page === 'human' ? 'Human-Controlled Area' : 'Create Storyboard';

  return (
    <div onTouchStart={startTouch} onTouchEnd={endTouch} className="min-h-screen bg-[#080B16] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080B16]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-7">
          <button onClick={() => { setMode('workspace'); navigate('home'); }} aria-label="VYRA Workspace" className="flex min-w-0 items-center gap-3"><BrandLogo size="sm" showWordmark /><span className="hidden border-l border-slate-700 pl-3 text-xs text-slate-400 sm:inline">Creative Studio</span></button>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode('workspace')} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${mode === 'workspace' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900'}`}><Clapperboard className="h-4 w-4" /><span className="hidden sm:inline">Workspace</span></button>
            <button onClick={() => setMode('chat')} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${mode === 'chat' ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:bg-slate-900'}`}><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">AI Chat</span></button>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="rounded-xl p-2 text-slate-400 hover:bg-slate-900">{theme === 'dark' ? <Sparkles className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}</button>
          </div>
        </div>
      </header>

      {mode === 'chat' ? (
        <main className="mx-auto h-[calc(100dvh-4rem)] max-w-[1440px] overflow-hidden p-2 sm:p-4"><AIIdeasChatView /></main>
      ) : (
        <>
          <nav className="border-b border-slate-800/70 bg-[#0B1020]">
            <div className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto px-4 py-3 sm:px-7">
              {([
                ['home', 'Workspace'], ['storyboards', 'Storyboards'], ['vyrals', 'Vyrals'], ['media', 'Media Library'], ['settings', 'Settings'], ['human', 'Human-Controlled'],
              ] as [WorkspacePage, string][]).map(([id, label]) => <button key={id} onClick={() => navigate(id)} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${page === id ? 'bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>{label}</button>)}
            </div>
          </nav>
          <main className="min-h-[calc(100dvh-7.5rem)]">
            {page === 'home' && <WorkspaceHome onNavigate={navigate} />}
            {page === 'storyboards' && <StoryboardLibrary onOpen={openStoryboard} onCreate={() => navigate('create')} />}
            {page === 'storyboard' && (projects.length ? <ProjectWorkspaceView /> : <WorkspaceHome onNavigate={navigate} />)}
            {page === 'vyrals' && <ConsistencyLibraryView />}
            {page === 'media' && <MediaLibraryView />}
            {page === 'settings' && <SettingsView />}
            {page === 'human' && <HumanControlledArea />}
            {page === 'create' && <CreateVideoView />}
          </main>
        </>
      )}
      <Toast />
      <div className="fixed bottom-4 right-4 z-20 hidden items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-2 text-[10px] text-slate-400 shadow-xl sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Swipe to switch modes</div>
    </div>
  );
};

export default function App() {
  return <AuthProvider><StudioProvider><StudioContent /></StudioProvider></AuthProvider>;
};
