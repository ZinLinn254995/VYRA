import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, Copy, Film, Maximize2, Play, Plus,
  Scissors, Settings2, SkipBack, SkipForward, SlidersHorizontal, Trash2,
  Type, Undo2, Redo2, ZoomIn, ZoomOut,
} from 'lucide-react';

export type TimelineClip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  waveform?: number[];
};
export type TimelineTrack = {
  id: string;
  name: string;
  clips: TimelineClip[];
  muted?: boolean;
  volume?: number;
  visible?: boolean;
  collapsed?: boolean;
};
export type SceneTimelineInstance = {
  id: string;
  sceneId: string;
  sourceIn: number;
  sourceOut: number;
  sceneProjectId?: string;
  renderRevisionId?: string | null;
};
export type MasterTimelineData = {
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  sceneInstances?: SceneTimelineInstance[];
  transitions: Record<string, { effect: string; duration: number }>;
  audioTracks: TimelineTrack[];
  textTracks: TimelineTrack[];
};
type Scene = { id: string; title: string; duration: number; projectId?: string; latestRenderRevisionId?: string | null };
type Props = {
  scenes: Scene[];
  value?: MasterTimelineData;
  onChange: (next: MasterTimelineData) => void;
  onSceneOrderChange: (sceneIds: string[]) => void;
  onSceneDuplicate: (scene: Scene, index: number) => Scene;
  onSceneDelete: (sceneId: string) => void;
};

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : 'master-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (value: number) => {
  const seconds = Math.max(0, value);
  const minutes = Math.floor(seconds / 60);
  return minutes.toString().padStart(2, '0') + ':' + (seconds % 60).toFixed(1).padStart(4, '0');
};
const emptyData = (): MasterTimelineData => ({
  sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [],
});

export const MasterTimelineEditor: React.FC<Props> = ({
  scenes, value, onChange, onSceneOrderChange, onSceneDuplicate, onSceneDelete,
}) => {
  const data = value ?? emptyData();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(640);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(52);
  const [playhead, setPlayhead] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedTrackClip, setSelectedTrackClip] = useState<{ type: 'audio' | 'text'; trackId: string; clipId: string } | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'split'>('select');

  const instances = useMemo(() => {
    const source = data.sceneInstances || [];
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const ordered = source.filter((item) => byId.has(item.sceneId)).map((item) => {
      const scene = byId.get(item.sceneId)!;
      const range = data.sceneRanges?.[scene.id];
      const minimum = Math.min(0.1, Math.max(0.001, scene.duration));
      const sourceIn = clamp(Number(item.sourceIn ?? range?.sourceIn ?? 0), 0, Math.max(0, scene.duration - minimum));
      const sourceOut = clamp(Number(item.sourceOut ?? range?.sourceOut ?? scene.duration), sourceIn + minimum, scene.duration);
      return { ...item, sourceIn, sourceOut, scene };
    });
    const present = new Set(ordered.map((item) => item.sceneId));
    scenes.forEach((scene) => {
      if (present.has(scene.id)) return;
      const range = data.sceneRanges?.[scene.id];
      const minimum = Math.min(0.1, Math.max(0.001, scene.duration));
      const sourceIn = clamp(Number(range?.sourceIn ?? 0), 0, Math.max(0, scene.duration - minimum));
      const sourceOut = clamp(Number(range?.sourceOut ?? scene.duration), sourceIn + minimum, scene.duration);
      ordered.push({
        id: scene.id, sceneId: scene.id, sourceIn, sourceOut,
        sceneProjectId: scene.projectId, renderRevisionId: scene.latestRenderRevisionId ?? null, scene,
      });
    });
    return ordered;
  }, [scenes, data.sceneInstances, data.sceneRanges]);

  const positioned = useMemo(() => {
    let cursor = 0;
    return instances.map((item, index) => {
      const duration = Math.max(0.1, item.sourceOut - item.sourceIn);
      const transition = data.transitions?.[item.id] ?? data.transitions?.[item.sceneId];
      const overlap = index < instances.length - 1 && transition && transition.effect !== 'None'
        ? Math.min(Math.max(0, transition.duration), duration / 2) : 0;
      const start = cursor;
      cursor += duration - overlap;
      return { ...item, duration, start, overlap, transition };
    });
  }, [instances, data.transitions]);

  const audioTracks = data.audioTracks || [];
  const textTracks = data.textTracks || [];
  const totalDuration = Math.max(1, positioned.length
    ? positioned[positioned.length - 1].start + positioned[positioned.length - 1].duration : 1);
  const trackLabelWidth = 104;
  const sideInset = Math.max(24, (viewportWidth - trackLabelWidth) / 2);
  const timelineWidth = Math.max(640, totalDuration * pixelsPerSecond) + sideInset * 2;
  const timeX = (seconds: number) => sideInset + seconds * pixelsPerSecond;
  const selectedScene = positioned.find((item) => item.id === selectedSceneId) || null;
  const selectedClip = selectedTrackClip
    ? (selectedTrackClip.type === 'audio' ? audioTracks : textTracks)
      .find((track) => track.id === selectedTrackClip.trackId)?.clips
      .find((clip) => clip.id === selectedTrackClip.clipId) || null
    : null;

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = playhead * pixelsPerSecond;
  }, [playhead, pixelsPerSecond]);

  const update = (patch: Partial<MasterTimelineData>) => onChange({ ...data, ...patch });
  const updateInstances = (next: SceneTimelineInstance[]) => {
    const ranges = { ...data.sceneRanges };
    next.forEach((item) => { ranges[item.sceneId] = { sourceIn: item.sourceIn, sourceOut: item.sourceOut }; });
    update({ sceneInstances: next, sceneRanges: ranges });
  };
  const updateSceneRange = (instanceId: string, edge: 'sourceIn' | 'sourceOut', nextValue: number) => {
    const item = instances.find((entry) => entry.id === instanceId);
    if (!item) return;
    const minimum = Math.min(0.1, Math.max(0.001, item.scene.duration));
    const sourceIn = edge === 'sourceIn'
      ? clamp(nextValue, 0, item.sourceOut - minimum) : item.sourceIn;
    const sourceOut = edge === 'sourceOut'
      ? clamp(nextValue, item.sourceIn + minimum, item.scene.duration) : item.sourceOut;
    updateInstances(instances.map((entry) => entry.id === instanceId
      ? { ...entry, sourceIn, sourceOut } : entry));
  };
  const reorderScene = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const next = [...instances];
    const from = next.findIndex((item) => item.id === sourceId);
    const to = next.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moving] = next.splice(from, 1);
    next.splice(to, 0, moving);
    updateInstances(next);
    onSceneOrderChange(next.map((item) => item.sceneId));
  };
  const duplicateScene = () => {
    if (!selectedScene) return;
    const index = instances.findIndex((item) => item.id === selectedScene.id);
    const cloned = onSceneDuplicate(selectedScene.scene, index + 1);
    const next = [...instances];
    next.splice(index + 1, 0, {
      id: makeId(), sceneId: cloned.id, sourceIn: 0, sourceOut: cloned.duration,
      sceneProjectId: cloned.projectId, renderRevisionId: cloned.latestRenderRevisionId ?? null,
    });
    updateInstances(next);
    onSceneOrderChange(next.map((item) => item.sceneId));
    setSelectedSceneId(next[index + 1].id);
  };
  const deleteScene = () => {
    if (!selectedScene) return;
    const next = instances.filter((item) => item.id !== selectedScene.id);
    const transitions = { ...data.transitions };
    delete transitions[selectedScene.id];
    delete transitions[selectedScene.sceneId];
    update({ sceneInstances: next, transitions });
    onSceneDelete(selectedScene.sceneId);
    onSceneOrderChange(next.map((item) => item.sceneId));
    setSelectedSceneId(null);
  };
  const moveScene = (offset: number) => {
    if (!selectedScene) return;
    const index = instances.findIndex((item) => item.id === selectedScene.id);
    const target = index + offset;
    if (target < 0 || target >= instances.length) return;
    const next = [...instances];
    [next[index], next[target]] = [next[target], next[index]];
    updateInstances(next);
    onSceneOrderChange(next.map((item) => item.sceneId));
  };
  const addTrack = (type: 'audio' | 'text') => {
    const tracks = type === 'audio' ? audioTracks : textTracks;
    const nextTrack: TimelineTrack = {
      id: makeId(), name: (type === 'audio' ? 'Audio ' : 'Text ') + (tracks.length + 1),
      clips: [], muted: false, volume: 1, visible: true,
    };
    update(type === 'audio' ? { audioTracks: [...tracks, nextTrack] } : { textTracks: [...tracks, nextTrack] });
  };
  const addClip = (type: 'audio' | 'text', trackId: string) => {
    const tracks = type === 'audio' ? audioTracks : textTracks;
    const clip: TimelineClip = {
      id: makeId(), name: type === 'audio' ? 'Audio clip' : 'Text overlay',
      start: clamp(playhead, 0, Math.max(0, totalDuration - 0.1)),
      duration: Math.min(3, totalDuration),
    };
    const next = tracks.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track);
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
    setSelectedTrackClip({ type, trackId, clipId: clip.id });
  };
  const updateClip = (patch: Partial<TimelineClip>) => {
    if (!selectedTrackClip || !selectedClip) return;
    const tracks = selectedTrackClip.type === 'audio' ? audioTracks : textTracks;
    const next = tracks.map((track) => track.id !== selectedTrackClip.trackId ? track : {
      ...track, clips: track.clips.map((clip) => clip.id === selectedClip.id
        ? { ...clip, ...patch, start: Math.max(0, patch.start ?? clip.start),
          duration: Math.max(0.1, patch.duration ?? clip.duration) } : clip),
    });
    update(selectedTrackClip.type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const removeClip = () => {
    if (!selectedTrackClip) return;
    const tracks = selectedTrackClip.type === 'audio' ? audioTracks : textTracks;
    const next = tracks.map((track) => track.id === selectedTrackClip.trackId
      ? { ...track, clips: track.clips.filter((clip) => clip.id !== selectedTrackClip.clipId) } : track);
    update(selectedTrackClip.type === 'audio' ? { audioTracks: next } : { textTracks: next });
    setSelectedTrackClip(null);
  };
  const splitSelectedClip = () => {
    if (!selectedTrackClip || !selectedClip || playhead <= selectedClip.start + 0.05
      || playhead >= selectedClip.start + selectedClip.duration - 0.05) return;
    const tracks = selectedTrackClip.type === 'audio' ? audioTracks : textTracks;
    const second: TimelineClip = {
      ...selectedClip, id: makeId(), name: selectedClip.name + ' (2)',
      start: playhead, duration: selectedClip.start + selectedClip.duration - playhead,
    };
    const next = tracks.map((track) => track.id !== selectedTrackClip.trackId ? track : ({
      ...track, clips: track.clips.flatMap((clip) => clip.id === selectedClip.id
        ? [{ ...clip, duration: playhead - clip.start }, second] : [clip]),
    }));
    update(selectedTrackClip.type === 'audio' ? { audioTracks: next } : { textTracks: next });
    setSelectedTrackClip({ ...selectedTrackClip, clipId: second.id });
  };

  const buttonClass = 'grid size-9 shrink-0 place-items-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-30';
  const labelClass = 'sticky left-0 z-20 flex min-h-[68px] items-center gap-2 border-b border-white/10 bg-[#17181c] px-3 text-[11px] font-semibold text-white/75';
  const trackLaneClass = 'relative min-h-[68px] border-b border-white/10 bg-[#1d1e23]';

  return (
    <section aria-label="Master video editor" className="mx-auto flex w-full min-w-0 flex-col gap-3 text-[var(--vyra-text-primary)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Film size={17} /></span>
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">Master Editor</h2><p className="text-[10px] text-[var(--vyra-text-muted)]">Storyboard composition</p></div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Undo" title="Undo" disabled className={buttonClass}><Undo2 size={16} /></button>
          <button type="button" aria-label="Redo" title="Redo" disabled className={buttonClass}><Redo2 size={16} /></button>
          <button type="button" className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-white"><span>Export</span></button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-[#101115] text-white">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Preview</span>
          <button type="button" aria-label="Preview settings" className={buttonClass}><Settings2 size={15} /></button>
        </div>
        <div className="flex min-h-[190px] items-center justify-center bg-[#090a0d] px-4 py-5 sm:min-h-[280px]">
          <div className="flex aspect-video w-full max-w-[560px] items-center justify-center rounded-md border border-white/10 bg-[#15161b]">
            <div className="max-w-xs px-5 text-center">
              <Film size={30} className="mx-auto mb-3 text-white/30" />
              <p className="text-sm font-medium text-white/80">{selectedScene?.scene.title || 'Select a Scene'}</p>
              <p className="mt-1 text-[11px] leading-5 text-white/40">Media playback will appear here when Scene render assets are connected.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-white/10 px-3 py-2">
          <button type="button" aria-label="Go to start" onClick={() => { setPlayhead(0); if (scrollerRef.current) scrollerRef.current.scrollLeft = 0; }} className={buttonClass}><SkipBack size={16} /></button>
          <button type="button" aria-label="Playback unavailable until media engine integration" disabled className="grid size-10 place-items-center rounded-full bg-white/10 text-white/40"><Play size={17} /></button>
          <button type="button" aria-label="Go to end" onClick={() => setPlayhead(totalDuration)} className={buttonClass}><SkipForward size={16} /></button>
          <span className="ml-2 font-mono text-[11px] tabular-nums text-white/60">{formatTime(playhead)} <span className="text-white/30">/ {formatTime(totalDuration)}</span></span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#303139] bg-[#17181c] text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setActiveTool('select')} aria-pressed={activeTool === 'select'} className={'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] ' + (activeTool === 'select' ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10')}><SlidersHorizontal size={14} /> Select</button>
            <button type="button" onClick={() => setActiveTool('split')} aria-pressed={activeTool === 'split'} className={'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] ' + (activeTool === 'split' ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10')}><Scissors size={14} /> Split</button>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Zoom out" onClick={() => setPixelsPerSecond((current) => Math.max(12, current * 0.8))} className={buttonClass}><ZoomOut size={15} /></button>
            <button type="button" aria-label="Fit timeline" onClick={() => { const width = Math.max(240, viewportWidth - trackLabelWidth - 48); setPixelsPerSecond(clamp(width / totalDuration, 12, 140)); setPlayhead(0); if (scrollerRef.current) scrollerRef.current.scrollLeft = 0; }} className={buttonClass}><Maximize2 size={14} /></button>
            <button type="button" aria-label="Zoom in" onClick={() => setPixelsPerSecond((current) => Math.min(180, current * 1.25))} className={buttonClass}><ZoomIn size={15} /></button>
          </div>
        </div>

        <div ref={scrollerRef} onScroll={(event) => setPlayhead(clamp(event.currentTarget.scrollLeft / pixelsPerSecond, 0, totalDuration))}
          className="relative max-h-[48vh] min-h-[230px] overflow-auto overscroll-x-contain [scrollbar-color:#666_#17181c] [scrollbar-width:thin]">
          <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-[2px] bg-[#ff4058] shadow-[0_0_10px_#ff4058]" style={{ left: trackLabelWidth + (viewportWidth - trackLabelWidth) / 2 }} />
          <div className="relative" style={{ width: trackLabelWidth + timelineWidth, minWidth: '100%' }}>
            <div className="grid" style={{ gridTemplateColumns: trackLabelWidth + 'px ' + timelineWidth + 'px' }}>
              <div className="sticky left-0 z-30 flex h-9 items-center border-b border-r border-white/10 bg-[#17181c] px-3 text-[10px] font-semibold uppercase tracking-wide text-white/45">Time</div>
              <div className="relative h-9 border-b border-white/10 bg-[#1d1e23]">
                {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, index) => index * 5).map((tick) => <span key={tick} className="absolute top-2 border-l border-white/15 pl-1 text-[9px] font-mono text-white/35" style={{ left: timeX(tick) }}>{formatTime(tick)}</span>)}
              </div>

              <div className={labelClass}><Film size={14} /> Video</div>
              <div className={trackLaneClass}>
                {positioned.map((item, index) => <React.Fragment key={item.id}>
                  <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-vyra-master-scene', item.id)}
                    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderScene(event.dataTransfer.getData('application/x-vyra-master-scene'), item.id); }}
                    onClick={() => { setSelectedSceneId(item.id); if (activeTool === 'split') setPlayhead(item.start + item.duration / 2); }}
                    className={'absolute top-2 flex h-[52px] flex-col justify-between overflow-hidden rounded-lg border px-2 py-1.5 text-left transition ' + (selectedSceneId === item.id ? 'z-10 border-[#ff4058] bg-[#573039] ring-1 ring-[#ff4058]' : 'border-white/15 bg-[#30323a] hover:border-white/40')}
                    style={{ left: timeX(item.start), width: Math.max(52, item.duration * pixelsPerSecond - 2) }}>
                    <span className="flex min-w-0 items-center gap-1.5"><Film size={12} className="shrink-0 text-white/65" /><span className="truncate text-[10px] font-semibold">{item.scene.title}</span></span>
                    <span className="text-[9px] tabular-nums text-white/45">Scene {index + 1} · {item.duration.toFixed(1)}s</span>
                  </button>
                </React.Fragment>)}
                {!positioned.length && <p className="px-3 py-6 text-[10px] text-white/35">Scenes added to this Storyboard will appear here.</p>}
              </div>

              {audioTracks.length ? audioTracks.map((track) => <React.Fragment key={track.id}>
                <div className={labelClass}><AudioLines size={14} /><span className="min-w-0 flex-1 truncate">{track.name}</span><button type="button" onClick={() => addClip('audio', track.id)} aria-label={'Add clip to ' + track.name} className="grid size-6 place-items-center rounded hover:bg-white/10"><Plus size={13} /></button></div>
                <div className={trackLaneClass}>
                  {track.clips.map((clip) => <button key={clip.id} type="button" onClick={() => setSelectedTrackClip({ type: 'audio', trackId: track.id, clipId: clip.id })}
                    className={'absolute top-3 h-10 overflow-hidden rounded-md border px-2 text-left text-[10px] ' + (selectedTrackClip?.clipId === clip.id ? 'border-[#37c8a0] bg-[#174c43]' : 'border-[#268d79] bg-[#1b554b]')}
                    style={{ left: timeX(clip.start), width: Math.max(36, clip.duration * pixelsPerSecond) }}>{clip.name}</button>)}
                </div>
              </React.Fragment>) : <><div className={labelClass}><AudioLines size={14} /> Audio <button type="button" onClick={() => addTrack('audio')} aria-label="Add audio track" className="ml-auto grid size-6 place-items-center rounded hover:bg-white/10"><Plus size={13} /></button></div><div className={trackLaneClass + ' flex items-center px-3 text-[10px] text-white/30'}>Add music, voice or sound effects</div></>}

              {textTracks.length ? textTracks.map((track) => <React.Fragment key={track.id}>
                <div className={labelClass}><Type size={14} /><span className="min-w-0 flex-1 truncate">{track.name}</span><button type="button" onClick={() => addClip('text', track.id)} aria-label={'Add clip to ' + track.name} className="grid size-6 place-items-center rounded hover:bg-white/10"><Plus size={13} /></button></div>
                <div className={trackLaneClass}>
                  {track.clips.map((clip) => <button key={clip.id} type="button" onClick={() => setSelectedTrackClip({ type: 'text', trackId: track.id, clipId: clip.id })}
                    className={'absolute top-3 h-10 overflow-hidden rounded-md border px-2 text-left text-[10px] ' + (selectedTrackClip?.clipId === clip.id ? 'border-[#e5b85c] bg-[#594a2d]' : 'border-[#a18442] bg-[#51442b]')}
                    style={{ left: timeX(clip.start), width: Math.max(36, clip.duration * pixelsPerSecond) }}>{clip.name}</button>)}
                </div>
              </React.Fragment>) : <><div className={labelClass}><Type size={14} /> Text <button type="button" onClick={() => addTrack('text')} aria-label="Add text track" className="ml-auto grid size-6 place-items-center rounded hover:bg-white/10"><Plus size={13} /></button></div><div className={trackLaneClass + ' flex items-center px-3 text-[10px] text-white/30'}>Add titles, captions or subtitles</div></>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => addTrack('audio')} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/8 px-2.5 text-[10px] font-medium text-white/75 hover:bg-white/15"><Plus size={13} /> Audio</button>
            <button type="button" onClick={() => addTrack('text')} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/8 px-2.5 text-[10px] font-medium text-white/75 hover:bg-white/15"><Plus size={13} /> Text</button>
          </div>
          <span className="text-[9px] text-white/35">Drag Scenes to reorder · Scroll timeline beneath the fixed playhead</span>
        </div>
      </div>

      {(selectedScene || selectedClip) && <div className="rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold">{selectedScene ? selectedScene.scene.title : selectedClip?.name}</div>
          <button type="button" onClick={() => { setSelectedSceneId(null); setSelectedTrackClip(null); }} className="text-[10px] text-[var(--vyra-text-muted)]">Close</button>
        </div>
        {selectedScene && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-[var(--vyra-text-muted)]">Source In (s)<input type="number" min="0" max={selectedScene.sourceOut - 0.1} step="0.1" value={Number(selectedScene.sourceIn.toFixed(2))} onChange={(event) => updateSceneRange(selectedScene.id, 'sourceIn', Number(event.target.value))} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
            <label className="text-[10px] text-[var(--vyra-text-muted)]">Source Out (s)<input type="number" min={selectedScene.sourceIn + 0.1} max={selectedScene.scene.duration} step="0.1" value={Number(selectedScene.sourceOut.toFixed(2))} onChange={(event) => updateSceneRange(selectedScene.id, 'sourceOut', Number(event.target.value))} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => moveScene(-1)} className="rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-[10px]">Move earlier</button>
            <button type="button" onClick={() => moveScene(1)} className="rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-[10px]">Move later</button>
            <button type="button" onClick={duplicateScene} className="inline-flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-[10px]"><Copy size={12} /> Duplicate</button>
            <button type="button" onClick={deleteScene} className="inline-flex items-center gap-1 rounded-lg border border-[var(--vyra-danger)]/40 px-3 py-2 text-[10px] text-[var(--vyra-danger)]"><Trash2 size={12} /> Remove</button>
          </div>
        </div>}
        {selectedClip && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] text-[var(--vyra-text-muted)]">Name<input value={selectedClip.name} onChange={(event) => updateClip({ name: event.target.value })} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
            <label className="text-[10px] text-[var(--vyra-text-muted)]">Start<input type="number" min="0" step="0.1" value={selectedClip.start} onChange={(event) => updateClip({ start: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
            <label className="text-[10px] text-[var(--vyra-text-muted)]">Duration<input type="number" min="0.1" step="0.1" value={selectedClip.duration} onChange={(event) => updateClip({ duration: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={splitSelectedClip} className="inline-flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-[10px]"><Scissors size={12} /> Split at playhead</button>
            <button type="button" onClick={removeClip} className="inline-flex items-center gap-1 rounded-lg border border-[var(--vyra-danger)]/40 px-3 py-2 text-[10px] text-[var(--vyra-danger)]"><Trash2 size={12} /> Delete</button>
          </div>
        </div>}
      </div>}
    </section>
  );
};
