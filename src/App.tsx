/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blueprint-aligned application shell.
 * This file changes presentation/navigation only; existing service and data layers remain intact.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { AuthProvider } from './context/AuthContext';
import { ProjectWorkspaceView } from './components/views/ProjectWorkspaceView';
import { CreateVideoView } from './components/views/CreateVideoView';
import { AIIdeasChatView } from './components/views/AIIdeasChatView';
import { MediaLibraryView } from './components/views/MediaLibraryView';
import { ConsistencyLibraryView } from './components/views/ConsistencyLibraryView';
import { SettingsView } from './components/views/SettingsView';
import { Toast } from './components/common/Toast';
import type { Project, AspectRatio } from './types';
import { BrandLogo } from './components/common/BrandLogo';
import {
  ArrowRight, BookOpen, Clapperboard, Image, Layers3, ChevronUp, ChevronDown, FileText, PlayCircle,
  MessageCircle, Plus, Settings, Sparkles, Film, X, Play, Pause, SkipBack, SkipForward,
} from 'lucide-react';

type AppMode = 'workspace' | 'chat';
type WorkspacePage = 'home' | 'storyboards' | 'storyboard' | 'scene' | 'vyrals' | 'media' | 'settings' | 'create';

const WorkspaceHome: React.FC<{ onNavigate: (page: WorkspacePage) => void; onCreateStoryboard: () => void }> = ({ onNavigate, onCreateStoryboard }) => {
  const { projects, activeProject, setActiveProjectId } = useStudio();
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-7 sm:py-9">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">VYRA Creative Studio</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Your creative workspace</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">Continue a Storyboard or choose a workspace area. Your AI Chat and visual workspace share the same creative data.</p>
      </section>

      {activeProject && (
        <section className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 to-slate-950">
          <div className="grid gap-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Continue your active Storyboard</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{activeProject.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{activeProject.scenes.length} creative items · {activeProject.status.replaceAll('_', ' ')}</p>
              <button onClick={() => onNavigate('storyboard')} className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200">Open Storyboard <ArrowRight className="h-4 w-4" /></button>
            </div>
            <img src={activeProject.coverImage} alt="" className="h-48 w-full object-cover sm:h-full sm:min-h-56" />
          </div>
        </section>
      )}

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
            <button onClick={onCreateStoryboard} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-4 w-4" /> Create New Storyboard</button>
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

const StoryboardSequence: React.FC<{ onOpenScene: (id: string) => void; onCreateScene: () => void }> = ({ onOpenScene, onCreateScene }) => {
  const { activeProject, updateProject, reorderScenes } = useStudio();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  if (!activeProject) return <div className="p-8 text-center text-sm text-slate-400">Choose a Storyboard to see its sequence.</div>;
  const orderedScenes = [...activeProject.scenes].sort((a, b) => a.order - b.order);
  const safeIndex = Math.min(previewIndex, Math.max(0, orderedScenes.length - 1));
  const previewScene = orderedScenes[safeIndex];
  useEffect(() => {
    if (!isPlaying || !previewScene || orderedScenes.length < 2) return;
    const timeout = window.setTimeout(() => setPreviewIndex((current) => current >= orderedScenes.length - 1 ? 0 : current + 1), Math.max(1, previewScene.duration || 8) * 1000);
    return () => window.clearTimeout(timeout);
  }, [isPlaying, safeIndex, previewScene?.id, previewScene?.duration, orderedScenes.length]);
  useEffect(() => { setPreviewIndex(0); setIsPlaying(false); }, [activeProject.id]);
  const previewRatio = activeProject.aspectRatio === '9:16' ? 'aspect-[9/16] max-h-[420px]' : activeProject.aspectRatio === '1:1' ? 'aspect-square max-h-[420px]' : 'aspect-video';
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-7 sm:py-9">
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Storyboard details</p>
          <input aria-label="Storyboard name" value={activeProject.title} onChange={(event) => updateProject(activeProject.id, { title: event.target.value })} className="mt-2 w-full max-w-2xl bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-slate-600 sm:text-3xl" />
          <textarea aria-label="Storyboard description" value={activeProject.topic} onChange={(event) => updateProject(activeProject.id, { topic: event.target.value })} placeholder="Add a description..." rows={2} className="mt-2 w-full max-w-2xl resize-y rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 outline-none placeholder:text-slate-600 focus:border-cyan-400/50" />
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-xs">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">{activeProject.status.replaceAll('_', ' ')}</span>
          <label className="inline-flex items-center gap-2 text-slate-400">Aspect ratio
            <select aria-label="Storyboard aspect ratio" value={activeProject.aspectRatio} onChange={(event) => updateProject(activeProject.id, { aspectRatio: event.target.value as AspectRatio })} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400">
              <option value="9:16">9:16 Portrait</option><option value="16:9">16:9 Landscape</option><option value="1:1">1:1 Square</option>
            </select>
          </label>
          <span className="text-slate-500">{orderedScenes.length} scenes · {orderedScenes.reduce((sum, scene) => sum + (scene.duration || 0), 0)}s total</span>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Storyboard Preview</h2><p className="mt-0.5 text-xs text-slate-500">Sequence overview · {activeProject.aspectRatio}</p></div><span className="text-xs text-slate-500">{orderedScenes.length ? `Scene ${safeIndex + 1} of ${orderedScenes.length}` : 'Waiting for scenes'}</span></div>
          {previewScene ? <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className={`relative mx-auto flex w-full max-w-[220px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black sm:mx-0 ${previewRatio}`}>
              {previewScene.mediaUrl ? <img src={previewScene.mediaUrl} alt={`Scene ${safeIndex + 1} preview`} className="h-full w-full object-contain" /> : <div className="p-5 text-center"><Film className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-2 text-xs text-slate-400">Scene preview will appear here</p></div>}
              <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">{previewScene.duration || 8}s</span>
            </div>
            <div className="min-w-0 flex-1"><p className="text-sm leading-6 text-slate-300">{previewScene.narration || previewScene.visualPrompt || 'Add scene details to see them here.'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => { setIsPlaying(false); setPreviewIndex((i) => Math.max(0, i - 1)); }} disabled={safeIndex === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-30">Previous</button>
                <button onClick={() => setIsPlaying((v) => !v)} disabled={orderedScenes.length < 2} className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{isPlaying ? 'Pause' : 'Play sequence'}</button>
                <button onClick={() => { setIsPlaying(false); setPreviewIndex((i) => Math.min(orderedScenes.length - 1, i + 1)); }} disabled={safeIndex >= orderedScenes.length - 1} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-30">Next</button>
              </div><p className="mt-3 text-[11px] text-slate-500">This is a storyboard preview, not the final rendered video.</p>
            </div>
          </div> : <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 text-center"><p className="text-xs text-slate-500">Your combined scene preview will appear here as you add scenes.</p></div>}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Scenes</h2><p className="mt-1 text-xs text-slate-500">Scenes are arranged in the order they will appear.</p></div><button onClick={onCreateScene} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-4 w-4" /> Add Scene</button></div>
        {orderedScenes.map((scene, index) => {
          const isVideo = Boolean(scene.generatedVideoId);
          const isImage = Boolean(scene.generatedImageId || scene.mediaUrl);
          return <div key={scene.id} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:gap-5 sm:p-4">
            <div className="flex shrink-0 flex-col gap-1"><button aria-label={`Move scene ${index + 1} up`} disabled={index === 0} onClick={() => reorderScenes(activeProject.id, index, index - 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><span className="text-center text-xs font-semibold tabular-nums text-slate-500">{index + 1}</span><button aria-label={`Move scene ${index + 1} down`} disabled={index === orderedScenes.length - 1} onClick={() => reorderScenes(activeProject.id, index, index + 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button></div>
            <button onClick={() => { setIsPlaying(false); setPreviewIndex(index); onOpenScene(scene.id); }} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-5">
              <div className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 sm:h-24 sm:w-40">{scene.mediaUrl ? <img src={scene.mediaUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-7 w-7 text-slate-500" />}<span className="absolute bottom-1 left-1 rounded-md bg-slate-950/80 px-2 py-1 text-[9px] font-semibold uppercase text-slate-200">{isVideo ? 'Video' : isImage ? 'Image' : 'Idea'}</span>{isVideo && <PlayCircle className="absolute right-2 top-2 h-5 w-5 text-white drop-shadow" />}</div>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">Scene {index + 1}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-400">{scene.narration || scene.visualPrompt || 'Creative idea — open to add details.'}</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">Open Scene Workspace <ArrowRight className="h-3 w-3" /></span></span>
            </button>
          </div>;
        })}
        {!orderedScenes.length && <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-300"><Plus className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-semibold text-white">No scenes yet</h3><p className="mt-1 text-xs text-slate-400">Create your first scene to start building the video.</p><button onClick={onCreateScene} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-4 w-4" /> Create New Scene</button></div>}
      </section>
    </div>
  );
};


const CreateStoryboardDialog: React.FC<{ onClose: () => void; onCreate: (title: string, description: string, aspectRatio: AspectRatio) => void }> = ({ onClose, onCreate }) => {
  const [title, setTitle] = useState('Untitled Storyboard');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const valid = title.trim().length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-storyboard-title">
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onCreate(title.trim(), description.trim(), aspectRatio); }} className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">New creative project</p><h2 id="create-storyboard-title" className="mt-2 text-xl font-semibold text-white">Create New Storyboard</h2><p className="mt-1 text-xs text-slate-400">Just the essentials. You can change these details later.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Name <span className="text-rose-400">*</span></span><input autoFocus required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400" placeholder="Name your Storyboard" /></label>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Description <span className="font-normal text-slate-500">(optional)</span></span><textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400" placeholder="What is this video about?" /></label>
        <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-300">Aspect ratio</legend><div className="grid grid-cols-3 gap-2">{([['9:16','Portrait','TikTok · Shorts'],['16:9','Landscape','YouTube'],['1:1','Square','Social feed']] as const).map(([value,label,detail]) => <button key={value} type="button" onClick={() => setAspectRatio(value)} className={`rounded-xl border p-3 text-left transition ${aspectRatio === value ? 'border-cyan-300 bg-cyan-300/10 text-white' : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-500'}`}><span className="block text-sm font-semibold">{value}</span><span className="mt-1 block text-xs">{label}</span><span className="mt-1 block text-[10px] text-slate-500">{detail}</span></button>)}</div></fieldset>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800">Cancel</button><button type="submit" disabled={!valid} className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">Create Storyboard</button></div>
      </form>
    </div>
  );
};

const StudioContent: React.FC = () => {
  const { theme, toggleTheme, currentSection, setCurrentSection, projects, setActiveProjectId, navigateToProjectWorkspace, createProject, addScene, activeProject } = useStudio();
  const [mode, setMode] = useState<AppMode>('workspace');
  const [page, setPage] = useState<WorkspacePage>('home');
  const [selectedSceneId, setSelectedSceneId] = useState<string | undefined>(undefined);
  const [showCreateStoryboard, setShowCreateStoryboard] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const routeMap: Partial<Record<string, WorkspacePage>> = {
      dashboard: 'home',
      projects: 'storyboards',
      workspace: 'storyboard',
      create: 'create',
      consistency: 'vyrals',
      media: 'media',
      settings: 'settings',
    };
    const nextPage = routeMap[currentSection];
    if (nextPage) setPage(nextPage);
  }, [currentSection]);

  const navigate = (next: WorkspacePage) => {
    setPage(next);
    const sectionMap: Partial<Record<WorkspacePage, string>> = { home: 'dashboard', storyboards: 'projects', storyboard: 'workspace', vyrals: 'consistency', media: 'media', settings: 'settings', create: 'create' };
    const section = sectionMap[next];
    if (section) setCurrentSection(section as any);
  };
  const createNewStoryboard = () => setShowCreateStoryboard(true);
  const handleCreateStoryboard = (title: string, description: string, aspectRatio: AspectRatio) => {
    const projectId = createProject({
      title,
      topic: description,
      category: 'Tech & AI',
      format: aspectRatio === '16:9' ? 'long_form' : 'short_form',
      aspectRatio,
      visualStyle: 'hyper_realistic',
      narrationStyle: 'conversational',
      subtitleStyle: 'minimal_lower',
      targetDuration: 30,
      targetPlatforms: [],
      coverImage: '',
      publishingCaption: '',
      selectedPlatformsForPublishing: [],
      scenes: [],
    });
    setShowCreateStoryboard(false);
    setSelectedSceneId(undefined);
    setPage('storyboard');
    setCurrentSection('workspace');
    return projectId;
  };
  const openStoryboard = (id: string) => { setActiveProjectId(id); navigateToProjectWorkspace(id); setPage('storyboard'); };
  const createScene = () => {
    if (!activeProject) return;
    addScene(activeProject.id, {
      narration: '',
      visualPrompt: '',
      cameraMovement: '',
      duration: 8,
      mediaUrl: '',
      status: 'scripted',
    });
    setSelectedSceneId(undefined);
  };
  const startTouch = (event: React.TouchEvent) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; };
  const endTouch = (event: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 110 && Math.abs(dx) > Math.abs(dy) * 1.4) setMode(dx < 0 ? 'chat' : 'workspace');
    touchStart.current = null;
  };

  const title = page === 'home' ? 'Workspace' : page === 'storyboards' ? 'Storyboards' : page === 'storyboard' ? 'Storyboard' : page === 'scene' ? 'Scene Workspace' : page === 'vyrals' ? 'Vyrals' : page === 'media' ? 'Media Library' : page === 'settings' ? 'Settings' : 'Create Storyboard';

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
                ['home', 'Workspace'], ['storyboards', 'Storyboards'], ['vyrals', 'Vyrals'], ['media', 'Media Library'], ['settings', 'Settings'],
              ] as [WorkspacePage, string][]).map(([id, label]) => <button key={id} onClick={() => navigate(id)} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${page === id ? 'bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>{label}</button>)}
            </div>
          </nav>
          <main className="min-h-[calc(100dvh-7.5rem)]">
            {page === 'home' && <WorkspaceHome onNavigate={navigate} onCreateStoryboard={createNewStoryboard} />}
            {page === 'storyboards' && <StoryboardLibrary onOpen={openStoryboard} onCreate={createNewStoryboard} />}
            {page === 'storyboard' && (activeProject ? <StoryboardSequence onOpenScene={(id) => { setSelectedSceneId(id); setPage('scene'); }} onCreateScene={createScene} /> : <WorkspaceHome onNavigate={navigate} onCreateStoryboard={createNewStoryboard} />)}
            {page === 'scene' && <ProjectWorkspaceView initialSceneId={selectedSceneId} />}
            {page === 'vyrals' && <ConsistencyLibraryView />}
            {page === 'media' && <MediaLibraryView />}
            {page === 'settings' && <SettingsView />}
            {page === 'create' && <CreateVideoView />}
          </main>
        </>
      )}
      {showCreateStoryboard && <CreateStoryboardDialog onClose={() => setShowCreateStoryboard(false)} onCreate={handleCreateStoryboard} />}\n      {showStoryboardPreview && activeProject && <StoryboardPreview project={activeProject} onClose={() => setShowStoryboardPreview(false)} />}\n      <Toast />
      <div className="fixed bottom-4 right-4 z-20 hidden items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-2 text-[10px] text-slate-400 shadow-xl sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Swipe to switch modes</div>
    </div>
  );
};

export default function App() {
  return <AuthProvider><StudioProvider><StudioContent /></StudioProvider></AuthProvider>;
};
