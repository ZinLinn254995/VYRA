/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Scene-level timeline editor prototype.
 * Generation remains owned by AI Chat; this view focuses on preview and manual editing.
 */
import React, { useMemo, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, Plus, Minus, Scissors,
  Volume2, Captions, Video, Image as ImageIcon, Music2, Layers3, FolderOpen,
  Sparkles, Undo2, Redo2, Settings2, MoreHorizontal, GripVertical, X,
  Clock3, Maximize2, ChevronDown, Check, Search, Trash2,
} from 'lucide-react';
import type { MediaAsset } from '../../types';

type TrackKind = 'video' | 'image' | 'audio' | 'subtitle';
type TimelineClip = { id: string; title: string; kind: TrackKind; start: number; duration: number; source: 'scene' | 'library' | 'vyral'; url?: string };

const TRACKS: { kind: TrackKind; label: string; icon: React.ElementType; tint: string }[] = [
  { kind: 'video', label: 'Video', icon: Video, tint: 'bg-cyan-400/20 border-cyan-300/40 text-cyan-100' },
  { kind: 'image', label: 'Image', icon: ImageIcon, tint: 'bg-violet-400/20 border-violet-300/40 text-violet-100' },
  { kind: 'audio', label: 'Audio', icon: Music2, tint: 'bg-emerald-400/20 border-emerald-300/40 text-emerald-100' },
  { kind: 'subtitle', label: 'Subtitle', icon: Captions, tint: 'bg-amber-400/20 border-amber-300/40 text-amber-100' },
];

export const SceneTimelineEditorView: React.FC<{ initialSceneId?: string; onBack?: () => void }> = ({ initialSceneId, onBack }) => {
  const { activeProject, projects, updateScene, mediaAssets, showToast, setCurrentSection } = useStudio();
  const project = activeProject || projects[0];
  const scene = project?.scenes.find((item) => item.id === initialSceneId) || project?.scenes[0];
  const [activeTrack, setActiveTrack] = useState<TrackKind>('video');
  const [picker, setPicker] = useState<'media' | 'vyral' | null>(null);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const baseClips = useMemo<TimelineClip[]>(() => {
    if (!scene) return [];
    const items: TimelineClip[] = [];
    if (scene.mediaUrl) items.push({ id: 'scene-visual', title: 'Scene visual', kind: 'video', start: 0, duration: scene.duration || 8, source: 'scene', url: scene.mediaUrl });
    if (scene.narration || scene.generatedAudioId) items.push({ id: 'scene-audio', title: 'Voice / narration', kind: 'audio', start: 0, duration: scene.duration || 8, source: 'scene' });
    if (scene.onScreenText || scene.dialogue) items.push({ id: 'scene-subtitle', title: 'Scene subtitles', kind: 'subtitle', start: 0, duration: scene.duration || 8, source: 'scene' });
    return [...items, ...clips];
  }, [scene, clips]);
  const filteredMedia = mediaAssets.filter((asset) => (!query || asset.title.toLowerCase().includes(query.toLowerCase())) && (asset.type === 'image' || asset.type === 'video' || asset.type === 'audio'));
  const references = project?.consistencyBible?.references.filter((item) => (!query || item.name.toLowerCase().includes(query.toLowerCase()) || item.description.toLowerCase().includes(query.toLowerCase()))) || [];
  const selected = baseClips.find((clip) => clip.id === selectedClip);

  const addMedia = (asset: MediaAsset) => {
    const kind: TrackKind = asset.type === 'audio' ? 'audio' : asset.type === 'image' ? 'image' : 'video';
    const clip: TimelineClip = { id: 'library-' + asset.id + '-' + Date.now(), title: asset.title, kind, start: 0, duration: scene?.duration || 8, source: 'library', url: asset.url };
    setClips((current) => [...current, clip]);
    setActiveTrack(kind);
    setSelectedClip(clip.id);
    if ((kind === 'image' || kind === 'video') && scene && project) updateScene(project.id, scene.id, { mediaUrl: asset.url });
    setPicker(null);
    setQuery('');
    showToast('Added to Scene Timeline', 'success');
  };

  const addReference = (reference: (typeof references)[number]) => {
    const clip: TimelineClip = { id: 'vyral-' + reference.id + '-' + Date.now(), title: reference.name, kind: 'image', start: 0, duration: scene?.duration || 8, source: 'vyral' };
    setClips((current) => [...current, clip]);
    setActiveTrack('image');
    setSelectedClip(clip.id);
    setPicker(null);
    setQuery('');
    showToast('Vyral reference added to this Scene', 'success');
  };

  const moveClip = (id: string, delta: number) => setClips((current) => {
    const index = current.findIndex((item) => item.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= current.length) return current;
    const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy;
  });

  if (!project || !scene) {
    return <div className="mx-auto max-w-3xl px-5 py-20 text-center text-slate-400"><FilmIconFallback /><h2 className="mt-4 text-lg font-semibold text-white">No Scene selected</h2><p className="mt-2 text-sm">Open a Scene from a Storyboard to start editing.</p></div>;
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#080B16] text-slate-100">
      <div className="sticky top-16 z-20 border-b border-slate-800 bg-[#0B1020]/95 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => onBack ? onBack() : setCurrentSection('workspace')} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white" aria-label="Back to workspace"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300">{project.title}</p><h1 className="truncate text-base font-semibold">Scene {scene.order} <span className="font-normal text-slate-500">/ Editor</span></h1></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPicker('vyral')} className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-400/20"><Layers3 className="h-4 w-4" /><span className="hidden sm:inline">Vyral Library</span></button>
            <button onClick={() => setPicker('media')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50"><FolderOpen className="h-4 w-4" /><span className="hidden sm:inline">Media Library</span></button>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-3 sm:p-5 lg:p-6">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0D1222]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div><h2 className="text-sm font-semibold">Preview</h2><p className="mt-0.5 text-[11px] text-slate-500">What this Scene will look like</p></div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500"><span>{project.aspectRatio}</span><button className="rounded-md p-1.5 hover:bg-slate-800" aria-label="Expand preview"><Maximize2 className="h-4 w-4" /></button></div>
          </div>
          <div className="flex min-h-[220px] items-center justify-center bg-black p-3 sm:min-h-[360px] lg:min-h-[480px]">
            {scene.mediaUrl ? <img src={scene.mediaUrl} alt="Scene preview" className="max-h-[62vh] w-full object-contain" /> : <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900"><Play className="h-6 w-6 text-cyan-300" /></div><p className="mt-3 text-sm font-medium text-slate-300">Scene preview</p><p className="mt-1 text-xs text-slate-500">Ask AI Chat to generate media or add it from a Library</p></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2"><button onClick={() => setPlaying(!playing)} className="rounded-lg bg-cyan-300 p-2 text-slate-950 hover:bg-cyan-200" aria-label={playing ? 'Pause preview' : 'Play preview'}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Previous frame"><SkipBack className="h-4 w-4" /></button><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Next frame"><SkipForward className="h-4 w-4" /></button><span className="ml-2 font-mono text-xs text-slate-400">00:00 / 00:{String(scene.duration || 8).padStart(2, '0')}</span></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><span>Scene duration</span><input aria-label="Scene duration" type="number" min="1" max="300" value={scene.duration || 8} onChange={(event) => updateScene(project.id, scene.id, { duration: Math.max(1, Number(event.target.value) || 1) })} className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-slate-200" /><span>sec</span></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0D1222]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div><h2 className="text-sm font-semibold">Timeline</h2><p className="mt-0.5 text-[11px] text-slate-500">Arrange clips freely. Drag clips between tracks and reorder them.</p></div>
            <div className="flex items-center gap-1"><button onClick={() => setZoom(Math.max(.6, zoom - .2))} className="rounded-md p-2 text-slate-400 hover:bg-slate-800" aria-label="Zoom out"><Minus className="h-4 w-4" /></button><span className="w-12 text-center text-[11px] text-slate-500">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(2, zoom + .2))} className="rounded-md p-2 text-slate-400 hover:bg-slate-800" aria-label="Zoom in"><Plus className="h-4 w-4" /></button><button className="ml-1 rounded-md p-2 text-slate-400 hover:bg-slate-800" aria-label="Timeline settings"><Settings2 className="h-4 w-4" /></button></div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[132px_1fr] border-b border-slate-800 bg-slate-950/50"><div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-600">Track</div><div className="flex justify-between px-3 py-2 font-mono text-[10px] text-slate-500"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span></div></div>
              {TRACKS.map(({ kind, label, icon: Icon, tint }) => {
                const laneClips = baseClips.filter((clip) => clip.kind === kind);
                return <div key={kind} className={`grid grid-cols-[132px_1fr] border-b border-slate-800/80 ${activeTrack === kind ? 'bg-cyan-300/[.025]' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (id) setClips((current) => current.map((clip) => clip.id === id ? { ...clip, kind } : clip)); setActiveTrack(kind); }}>
                  <button onClick={() => setActiveTrack(kind)} className="flex items-center gap-2 border-r border-slate-800 px-3 py-4 text-left hover:bg-slate-800/50"><Icon className="h-4 w-4 text-slate-400" /><span className="text-xs font-medium text-slate-300">{label}</span><span className="ml-auto text-[10px] text-slate-600">{laneClips.length}</span></button>
                  <div className="relative min-h-[68px] p-2" style={{ backgroundImage: 'linear-gradient(to right, rgba(148,163,184,.08) 1px, transparent 1px)', backgroundSize: `${80 * zoom}px 100%` }}>
                    {laneClips.length ? <div className="flex h-full min-h-[50px] flex-wrap items-center gap-2">{laneClips.map((clip) => <div key={clip.id} draggable={clip.source !== 'scene'} onDragStart={(event) => event.dataTransfer.setData('text/plain', clip.id)} className={`group flex min-w-[130px] max-w-[240px] items-center gap-2 rounded-lg border px-2.5 py-2 ${tint} ${selectedClip === clip.id ? 'ring-2 ring-cyan-300' : ''}`} style={{ flexGrow: Math.max(1, clip.duration * zoom / 4) }}><GripVertical className="h-3.5 w-3.5 shrink-0 opacity-60" /><button onClick={() => { setSelectedClip(clip.id); setActiveTrack(kind); }} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium">{clip.title}</button>{clip.source !== 'scene' && <button onClick={() => setClips((current) => current.filter((item) => item.id !== clip.id))} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Remove clip"><X className="h-3 w-3" /></button>}</div>)}</div> : <button onClick={() => { setActiveTrack(kind); setPicker('media'); }} className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 text-[11px] text-slate-600 hover:border-slate-600 hover:text-slate-400"><Plus className="h-3.5 w-3.5" /> Add {label}</button>}
                  </div>
                </div>;
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3"><div className="flex items-center gap-2"><button className="rounded-md p-2 text-slate-500 hover:bg-slate-800" aria-label="Undo"><Undo2 className="h-4 w-4" /></button><button className="rounded-md p-2 text-slate-500 hover:bg-slate-800" aria-label="Redo"><Redo2 className="h-4 w-4" /></button><span className="text-[10px] text-slate-600">Manual editing prototype</span></div><div className="flex gap-2"><button onClick={() => setPicker('vyral')} className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs text-violet-200">+ Vyral</button><button onClick={() => setPicker('media')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">+ Media</button></div></div>
        </section>

        {selected && <section className="rounded-2xl border border-slate-800 bg-[#0D1222] p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-wider text-cyan-300">Selected clip</p><h3 className="mt-1 text-sm font-semibold">{selected.title}</h3></div><div className="flex items-center gap-1"><button onClick={() => moveClip(selected.id, -1)} className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Move earlier</button><button onClick={() => moveClip(selected.id, 1)} className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Move later</button></div><button onClick={() => setSelectedClip(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800" aria-label="Close clip properties"><X className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-[11px] text-slate-400">Clip name<input value={selected.title} onChange={(event) => setClips((current) => current.map((clip) => clip.id === selected.id ? { ...clip, title: event.target.value } : clip))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /></label><label className="text-[11px] text-slate-400">Start time (sec)<input type="number" min="0" value={selected.start} onChange={(event) => setClips((current) => current.map((clip) => clip.id === selected.id ? { ...clip, start: Math.max(0, Number(event.target.value) || 0) } : clip))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /></label><label className="text-[11px] text-slate-400">Duration (sec)<input type="number" min="1" value={selected.duration} onChange={(event) => setClips((current) => current.map((clip) => clip.id === selected.id ? { ...clip, duration: Math.max(1, Number(event.target.value) || 1) } : clip))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /></label></div></section>}

        <section className="rounded-2xl border border-slate-800 bg-[#0D1222]">
          <button onClick={() => setDescriptionOpen(!descriptionOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" /><span className="text-sm font-semibold">AI Generation Description</span></span><ChevronDown className={`h-4 w-4 text-slate-500 transition ${descriptionOpen ? 'rotate-180' : ''}`} /></button>
          {descriptionOpen && <div className="border-t border-slate-800 p-4"><p className="mb-2 text-[11px] text-slate-500">AI Chat can record prompts, generation model, style, Vyral references and source details here.</p><textarea value={scene.visualPrompt} onChange={(event) => updateScene(project.id, scene.id, { visualPrompt: event.target.value })} rows={5} placeholder="Generation prompts and creative instructions..." className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-200 outline-none focus:border-cyan-400" /></div>}
        </section>
      </main>

      {picker && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[82dvh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-slate-700 bg-[#0D1222] shadow-2xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><h2 className="text-sm font-semibold">{picker === 'vyral' ? 'Vyral Library' : 'Media Library'}</h2><p className="mt-1 text-[11px] text-slate-500">Choose an item to add it to this Scene Timeline</p></div><button onClick={() => setPicker(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Close library"><X className="h-4 w-4" /></button></div><div className="border-b border-slate-800 p-3"><div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-500" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library..." className="w-full bg-transparent py-2.5 text-xs text-white outline-none" /></div></div><div className="max-h-[55dvh] overflow-y-auto p-3">{picker === 'media' ? (filteredMedia.length ? <div className="grid gap-2 sm:grid-cols-2">{filteredMedia.map((asset) => <button key={asset.id} onClick={() => addMedia(asset)} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:border-cyan-400/50"><div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">{asset.type === 'image' && asset.url ? <img src={asset.url} alt="" className="h-full w-full object-cover" /> : asset.type === 'audio' ? <Music2 className="h-5 w-5 text-emerald-300" /> : <Video className="h-5 w-5 text-cyan-300" />}</div><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{asset.title}</span><span className="mt-1 block text-[10px] uppercase text-slate-500">{asset.type}</span></span><Plus className="h-4 w-4 text-cyan-300" /></button>)}</div> : <EmptyLibrary label="No Media Library assets match your search." />) : (references.length ? <div className="space-y-2">{references.map((reference) => <button key={reference.id} onClick={() => addReference(reference)} className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:border-violet-400/50"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10"><Layers3 className="h-5 w-5 text-violet-300" /></div><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{reference.name}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{reference.kind} · {reference.description || 'Reusable consistency reference'}</span></span><Plus className="h-4 w-4 text-violet-300" /></button>)}</div> : <EmptyLibrary label="No Vyral references have been saved in this Storyboard yet." />)}</div></div></div>}
    </div>
  );
};

const EmptyLibrary: React.FC<{ label: string }> = ({ label }) => <div className="rounded-xl border border-dashed border-slate-800 px-5 py-12 text-center text-xs text-slate-500">{label}</div>;
const FilmIconFallback: React.FC = () => <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900"><Video className="h-6 w-6" /></div>;
