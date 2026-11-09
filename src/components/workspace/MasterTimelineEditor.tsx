import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, ChevronDown, Copy, Eye, EyeOff, Film, Magnet, Maximize2,
  Pause, Play, Plus, Redo2, Scissors, Trash2, Type, Undo2, Volume2,
  VolumeX, ZoomIn, ZoomOut,
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
type ClipType = 'audio' | 'text';
type Props = { scenes: Scene[]; value?: MasterTimelineData; onChange: (next: MasterTimelineData) => void; onSceneOrderChange: (sceneIds: string[]) => void; onSceneDuplicate: (scene: Scene, index: number) => Scene; onSceneDelete: (sceneId: string) => void };
type SelectedClip = { type: ClipType; trackId: string; clipId: string };
type DragState = SelectedClip & {
  pointerId: number;
  mode: 'move' | 'left' | 'right';
  startX: number;
  initialStart: number;
  initialDuration: number;
};

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'timeline-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number));
const emptyData = (): MasterTimelineData => ({ sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [] });
const formatTime = (seconds: number) => {
  const whole = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(whole / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((whole % 3600) / 60).toString().padStart(2, '0');
  const secs = (whole % 60).toString().padStart(2, '0');
  const tenths = Math.floor((Math.max(0, seconds) % 1) * 10);
  return `${hours}:${minutes}:${secs}.${tenths}`;
};
const trackLabelWidth = 96;

export const MasterTimelineEditor: React.FC<Props> = ({ scenes, value, onChange, onSceneOrderChange, onSceneDuplicate, onSceneDelete }) => {
  const data = value ?? emptyData();
  const dataRef = useRef(data);
  dataRef.current = data;
  const historyRef = useRef<{ past: MasterTimelineData[]; future: MasterTimelineData[] }>({ past: [], future: [] });
  const dragRef = useRef<DragState | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [zoom, setZoom] = useState(48);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<SelectedClip | null>(null);

  const sceneInstances = useMemo(() => {
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
    const instances = (data.sceneInstances || []).filter((instance) => sceneById.has(instance.sceneId)).map((instance) => {
      const scene = sceneById.get(instance.sceneId)!;
      const minimumRange = Math.min(0.1, Math.max(0.001, scene.duration));
      const sourceIn = clamp(Number(instance.sourceIn) || 0, 0, Math.max(0, scene.duration - minimumRange));
      const sourceOut = clamp(Number(instance.sourceOut) || scene.duration, sourceIn + minimumRange, scene.duration);
      return {
        ...instance,
        sourceIn,
        sourceOut,
        sceneProjectId: instance.sceneProjectId || scene.projectId,
        // Pin an existing revision forever; only newly placed Scene instances inherit the latest render.
        renderRevisionId: instance.renderRevisionId ?? scene.latestRenderRevisionId ?? null,
      };
    });
    const included = new Set(instances.map((instance) => instance.sceneId));
    for (const scene of scenes) {
      if (included.has(scene.id)) continue;
      const legacy = data.sceneRanges?.[scene.id];
      const minimumRange = Math.min(0.1, Math.max(0.001, scene.duration));
      const sourceIn = clamp(Number(legacy?.sourceIn) || 0, 0, Math.max(0, scene.duration - minimumRange));
      const sourceOut = clamp(Number(legacy?.sourceOut) || scene.duration, sourceIn + minimumRange, scene.duration);
      instances.push({ id: scene.id, sceneId: scene.id, sourceIn, sourceOut, sceneProjectId: scene.projectId, renderRevisionId: scene.latestRenderRevisionId ?? null });
    }
    return instances;
  }, [scenes, data.sceneInstances, data.sceneRanges]);

  const positionedScenes = useMemo(() => {
    let cursor = 0;
    return sceneInstances.map((instance, index) => {
      const scene = scenes.find((item) => item.id === instance.sceneId)!;
      const duration = Math.max(0, instance.sourceOut - instance.sourceIn);
      const transition = data.transitions?.[instance.id] ?? (instance.id === instance.sceneId ? data.transitions?.[instance.sceneId] : undefined);
      const overlap = index < sceneInstances.length - 1 && transition && transition.effect !== 'None'
        ? Math.min(Math.max(0, transition.duration), duration / 2)
        : 0;
      const start = cursor;
      cursor += duration - overlap;
      return { ...instance, scene, duration, start, overlap, transition };
    });
  }, [sceneInstances, scenes, data.transitions]);

  const audioTracks = data.audioTracks || [];
  const textTracks = data.textTracks || [];
  const totalDuration = Math.max(1, positionedScenes.length ? positionedScenes[positionedScenes.length - 1].start + positionedScenes[positionedScenes.length - 1].duration : 1);
  const timelineWidth = Math.max(640, totalDuration * zoom);
  const timeToPixel = (seconds: number) => seconds * zoom;
  const tickInterval = zoom >= 60 ? 1 : zoom >= 25 ? 5 : zoom >= 10 ? 10 : 30;
  const ticks = Array.from({ length: Math.floor(totalDuration / tickInterval) + 2 }, (_, index) => index * tickInterval).filter((time) => time <= totalDuration + 0.01);
  const selectedClipValue = selectedClip
    ? (selectedClip.type === 'audio' ? audioTracks : textTracks).find((track) => track.id === selectedClip.trackId)?.clips.find((clip) => clip.id === selectedClip.clipId)
    : null;

  const commit = (patch: Partial<MasterTimelineData>, recordHistory = true) => {
    const current = dataRef.current;
    if (recordHistory) {
      historyRef.current.past = [...historyRef.current.past.slice(-79), current];
      historyRef.current.future = [];
      setHistoryVersion((version) => version + 1);
    }
    const next = { ...current, ...patch };
    dataRef.current = next;
    onChange(next);
  };
  const recordGestureStart = () => {
    historyRef.current.past = [...historyRef.current.past.slice(-79), dataRef.current];
    historyRef.current.future = [];
    setHistoryVersion((version) => version + 1);
  };
  const undo = () => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(dataRef.current);
    dataRef.current = previous;
    onChange(previous);
    setHistoryVersion((version) => version + 1);
  };
  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(dataRef.current);
    dataRef.current = next;
    onChange(next);
    setHistoryVersion((version) => version + 1);
  };
  const updateInstances = (next: SceneTimelineInstance[]) => {
    const ranges = { ...dataRef.current.sceneRanges };
    for (const instance of next) {
      if (!ranges[instance.sceneId]) ranges[instance.sceneId] = { sourceIn: instance.sourceIn, sourceOut: instance.sourceOut };
    }
    commit({ sceneInstances: next, sceneRanges: ranges });
  };
  const updateRange = (instanceId: string, patch: Partial<Pick<SceneTimelineInstance, 'sourceIn' | 'sourceOut'>>) => {
    const instance = sceneInstances.find((item) => item.id === instanceId);
    const scene = instance && scenes.find((item) => item.id === instance.sceneId);
    if (!instance || !scene) return;
    const minimumRange = Math.min(0.1, Math.max(0.001, scene.duration));
    let sourceIn = clamp(patch.sourceIn ?? instance.sourceIn, 0, Math.max(0, scene.duration - minimumRange));
    let sourceOut = clamp(patch.sourceOut ?? instance.sourceOut, sourceIn + minimumRange, scene.duration);
    if (patch.sourceIn !== undefined && sourceOut - sourceIn < minimumRange) sourceIn = Math.max(0, sourceOut - minimumRange);
    if (patch.sourceOut !== undefined && sourceOut - sourceIn < minimumRange) sourceOut = Math.min(scene.duration, sourceIn + minimumRange);
    updateInstances(sceneInstances.map((item) => item.id === instanceId ? { ...item, sourceIn, sourceOut } : item));
  };
  const getTracks = (type: ClipType) => type === 'audio' ? (dataRef.current.audioTracks || []) : (dataRef.current.textTracks || []);
  const updateTracks = (type: ClipType, tracks: TimelineTrack[], recordHistory = true) => commit(type === 'audio' ? { audioTracks: tracks } : { textTracks: tracks }, recordHistory);
  const updateClip = (type: ClipType, trackId: string, clipId: string, patch: Partial<TimelineClip>, recordHistory = true) => {
    const tracks = getTracks(type);
    const next = tracks.map((track) => track.id !== trackId ? track : {
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        let start = clamp(patch.start ?? clip.start, 0, Math.max(0, totalDuration - 0.1));
        let duration = clamp(patch.duration ?? clip.duration, 0.1, Math.max(0.1, totalDuration - start));
        if (patch.start !== undefined && patch.duration === undefined) duration = Math.min(clip.duration, Math.max(0.1, totalDuration - start));
        if (patch.duration !== undefined && patch.start === undefined) start = Math.min(start, Math.max(0, totalDuration - duration));
        return { ...clip, ...patch, start, duration };
      }),
    });
    updateTracks(type, next, recordHistory);
  };
  const addTrack = (type: ClipType, withClip = false) => {
    const tracks = getTracks(type);
    const track: TimelineTrack = { id: makeId(), name: (type === 'audio' ? 'Audio ' : 'Text ') + (tracks.length + 1), clips: [], muted: false, volume: 1, visible: true, collapsed: false };
    const clip: TimelineClip = { id: makeId(), name: type === 'audio' ? 'New audio clip' : 'New text', start: clamp(playhead, 0, Math.max(0, totalDuration - 0.5)), duration: Math.min(3, totalDuration) };
    updateTracks(type, [...tracks, { ...track, clips: withClip ? [clip] : [] }]);
    if (withClip) setSelectedClip({ type, trackId: track.id, clipId: clip.id });
  };
  const addClip = (type: ClipType, trackId: string) => {
    const tracks = getTracks(type);
    const clip: TimelineClip = { id: makeId(), name: type === 'audio' ? 'New audio clip' : 'New text', start: clamp(playhead, 0, Math.max(0, totalDuration - 0.5)), duration: Math.min(3, totalDuration) };
    updateTracks(type, tracks.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track));
    setSelectedClip({ type, trackId, clipId: clip.id });
  };
  const duplicateClip = (selection: SelectedClip, clip: TimelineClip) => {
    const tracks = getTracks(selection.type);
    const copy = { ...clip, id: makeId(), name: clip.name + ' copy', start: clamp(clip.start + clip.duration, 0, Math.max(0, totalDuration - clip.duration)) };
    updateTracks(selection.type, tracks.map((track) => track.id === selection.trackId ? { ...track, clips: [...track.clips, copy] } : track));
    setSelectedClip({ ...selection, clipId: copy.id });
  };
  const splitClip = (selection: SelectedClip, clip: TimelineClip) => {
    if (playhead <= clip.start + 0.05 || playhead >= clip.start + clip.duration - 0.05) return;
    const firstDuration = playhead - clip.start;
    const second = { ...clip, id: makeId(), name: clip.name + ' (2)', start: playhead, duration: clip.duration - firstDuration };
    const tracks = getTracks(selection.type);
    updateTracks(selection.type, tracks.map((track) => track.id !== selection.trackId ? track : {
      ...track,
      clips: track.clips.flatMap((item) => item.id === clip.id ? [{ ...item, duration: firstDuration }, second] : [item]),
    }));
    setSelectedClip({ ...selection, clipId: second.id });
  };
  const removeSelectedClip = (selection: SelectedClip) => {
    const tracks = getTracks(selection.type);
    updateTracks(selection.type, tracks.map((track) => track.id === selection.trackId ? { ...track, clips: track.clips.filter((clip) => clip.id !== selection.clipId) } : track));
    setSelectedClip(null);
  };
  const snapTime = (time: number, ignoredClipId?: string) => {
    const bounded = clamp(time, 0, totalDuration);
    if (!snapEnabled) return bounded;
    const candidates = [Math.round(bounded * 4) / 4];
    for (const track of [...audioTracks, ...textTracks]) {
      for (const clip of track.clips) {
        if (clip.id === ignoredClipId) continue;
        candidates.push(clip.start, clip.start + clip.duration);
      }
    }
    for (const scene of positionedScenes) candidates.push(scene.start, scene.start + scene.duration);
    const closest = candidates.reduce((best, candidate) => Math.abs(candidate - bounded) < Math.abs(best - bounded) ? candidate : best, candidates[0]);
    return Math.abs(closest - bounded) * zoom <= 9 ? clamp(closest, 0, totalDuration) : bounded;
  };
  const onClipPointerDown = (event: React.PointerEvent<HTMLDivElement>, selection: SelectedClip, clip: TimelineClip) => {
    if (event.button !== 0) return;
    const edge = (event.target as HTMLElement).closest<HTMLElement>('[data-trim]')?.dataset.trim;
    const mode = edge === 'left' || edge === 'right' ? edge : 'move';
    setSelectedClip(selection);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...selection, pointerId: event.pointerId, mode, startX: event.clientX, initialStart: clip.start, initialDuration: clip.duration };
    recordGestureStart();
    event.preventDefault();
  };
  const onClipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = (event.clientX - drag.startX) / zoom;
    if (drag.mode === 'move') {
      const start = snapTime(drag.initialStart + delta, drag.clipId);
      updateClip(drag.type, drag.trackId, drag.clipId, { start }, false);
    } else if (drag.mode === 'left') {
      const end = drag.initialStart + drag.initialDuration;
      const start = clamp(snapTime(drag.initialStart + delta, drag.clipId), 0, end - 0.1);
      updateClip(drag.type, drag.trackId, drag.clipId, { start, duration: end - start }, false);
    } else {
      const end = clamp(snapTime(drag.initialStart + drag.initialDuration + delta, drag.clipId), drag.initialStart + 0.1, totalDuration);
      updateClip(drag.type, drag.trackId, drag.clipId, { duration: end - drag.initialStart }, false);
    }
  };
  const onClipPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const reorderScene = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const from = sceneInstances.findIndex((instance) => instance.id === sourceId);
    const to = sceneInstances.findIndex((instance) => instance.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...sceneInstances];
    const [instance] = next.splice(from, 1);
    next.splice(to, 0, instance);
    updateInstances(next);
    onSceneOrderChange(next.map((instance) => instance.sceneId));
  };
  const moveScene = (instanceId: string, offset: number) => {
    const from = sceneInstances.findIndex((instance) => instance.id === instanceId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= sceneInstances.length) return;
    const next = [...sceneInstances];
    [next[from], next[to]] = [next[to], next[from]];
    updateInstances(next);
    onSceneOrderChange(next.map((instance) => instance.sceneId));
  };
  const selectedScene = positionedScenes.find((scene) => scene.id === selectedSceneId);
  const setTransition = (sceneId: string, patch: { effect?: string; duration?: number }) => {
    const current = dataRef.current.transitions || {};
    const existing = current[sceneId] ?? { effect: 'Fade', duration: 0.5 };
    commit({ transitions: { ...current, [sceneId]: { ...existing, ...patch } } });
  };
  const fitTimeline = () => {
    const availableWidth = Math.max(240, (scrollerRef.current?.clientWidth || 480) - trackLabelWidth - 24);
    setZoom(clamp(availableWidth / totalDuration, 10, 120));
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayhead((current) => {
        const next = current + 0.04;
        if (next >= totalDuration) {
          setPlaying(false);
          return totalDuration;
        }
        return next;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [playing, totalDuration]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedClip && selectedClipValue) {
        event.preventDefault();
        duplicateClip(selectedClip, selectedClipValue);
      } else if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClip) {
        event.preventDefault();
        removeSelectedClip(selectedClip);
      } else if (event.key === 'ArrowLeft') setPlayhead((current) => Math.max(0, current - (event.shiftKey ? 1 : 0.1)));
      else if (event.key === 'ArrowRight') setPlayhead((current) => Math.min(totalDuration, current + (event.shiftKey ? 1 : 0.1)));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const renderTrack = (type: ClipType, track: TimelineTrack) => {
    const Icon = type === 'audio' ? AudioLines : Type;
    const muted = Boolean(track.muted);
    return <React.Fragment key={track.id}>
      <div className="sticky left-0 z-30 flex min-h-16 flex-col justify-center border-b border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 py-1.5 sm:px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon size={13} className={type === 'audio' ? 'shrink-0 text-[var(--vyra-accent-primary)]' : 'shrink-0 text-[var(--vyra-warning)]'} />
          <span className="truncate text-[10px] font-semibold text-[var(--vyra-text-primary)]">{track.name}</span>
        </div>
        <div className="mt-1 flex items-center gap-0.5">
          <button type="button" title="Add clip" aria-label={'Add clip to ' + track.name} onClick={() => addClip(type, track.id)} className="grid size-7 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"><Plus size={14} /></button>
          {type === 'audio' && <button type="button" title={muted ? 'Unmute track' : 'Mute track'} aria-label={muted ? 'Unmute ' + track.name : 'Mute ' + track.name} onClick={() => updateTracks(type, getTracks(type).map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item))} className="grid size-7 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>}
          <button type="button" title={track.visible === false ? 'Show track' : 'Hide track'} aria-label={(track.visible === false ? 'Show ' : 'Hide ') + track.name} onClick={() => updateTracks(type, getTracks(type).map((item) => item.id === track.id ? { ...item, visible: item.visible === false } : item))} className="grid size-7 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">{track.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          <button type="button" title={track.collapsed ? 'Expand track' : 'Collapse track'} aria-label={(track.collapsed ? 'Expand ' : 'Collapse ') + track.name} onClick={() => updateTracks(type, getTracks(type).map((item) => item.id === track.id ? { ...item, collapsed: !item.collapsed } : item))} className="grid size-7 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"><ChevronDown size={13} className={track.collapsed ? '-rotate-90' : ''} /></button>
          <button type="button" title="Remove track" aria-label={'Remove ' + track.name} onClick={() => { updateTracks(type, getTracks(type).filter((item) => item.id !== track.id)); if (selectedClip?.trackId === track.id) setSelectedClip(null); }} className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[color-mix(in_srgb,var(--vyra-danger)_12%,var(--vyra-bg-surface))] hover:text-[var(--vyra-danger)]"><Trash2 size={13} /></button>
        </div>
        {type === 'audio' && !track.collapsed && <label className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--vyra-text-secondary)]" title="Track volume">
          <Volume2 size={11} />
          <input aria-label={track.name + ' volume'} type="range" min="0" max="1" step="0.01" value={track.volume ?? 1} onChange={(event) => updateTracks(type, getTracks(type).map((item) => item.id === track.id ? { ...item, volume: Number(event.target.value) } : item))} className="h-1 w-full accent-[var(--vyra-accent-primary)]" />
        </label>}
      </div>
      <div className={'relative border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] ' + (track.collapsed ? 'h-8' : 'h-16')} style={{ width: timelineWidth, opacity: track.visible === false ? 0.4 : 1 }}>
        {ticks.map((tick) => <div key={tick} className="pointer-events-none absolute inset-y-0 border-l border-[var(--vyra-border-subtle)]" style={{ left: timeToPixel(tick) }} />)}
        {!track.collapsed && track.clips.map((clip) => {
          const isSelected = selectedClip?.trackId === track.id && selectedClip.clipId === clip.id;
          const waveform = type === 'audio' && clip.waveform?.length ? clip.waveform : null;
          return <div key={clip.id} role="button" tabIndex={0} aria-label={`${type === 'audio' ? 'Audio' : 'Text'} clip: ${clip.name}`} onClick={() => setSelectedClip({ type, trackId: track.id, clipId: clip.id })} onPointerDown={(event) => onClipPointerDown(event, { type, trackId: track.id, clipId: clip.id }, clip)} onPointerMove={onClipPointerMove} onPointerUp={onClipPointerUp} onPointerCancel={onClipPointerUp} className={'absolute top-2 flex h-12 touch-none select-none items-center overflow-hidden rounded border text-left shadow-sm ' + (type === 'audio' ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-warning)] bg-[var(--vyra-warning)]') + (isSelected ? ' z-20 ring-1 ring-[var(--vyra-accent-primary)]' : ' z-10 hover:brightness-110')} style={{ left: timeToPixel(clip.start), width: Math.max(30, timeToPixel(clip.duration)), cursor: dragRef.current?.clipId === clip.id ? 'grabbing' : 'grab' }} title={clip.name}>
            <button type="button" data-trim="left" aria-label={'Trim start of ' + clip.name} className="absolute inset-y-0 left-0 z-20 w-3 cursor-ew-resize border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/20" />
            {waveform ? <div className="pointer-events-none absolute inset-x-3 inset-y-1 flex items-center justify-around opacity-80">{waveform.slice(0, 32).map((height, index) => <i key={index} className="w-px rounded-full bg-[var(--vyra-accent-primary)]" style={{ height: `${clamp(Number(height) || 0, 4, 100)}%` }} />)}</div> : null}
            <span className="pointer-events-none z-10 truncate px-4 text-[10px] font-semibold text-[var(--vyra-bg-canvas)]">{clip.name}</span>
            <button type="button" data-trim="right" aria-label={'Trim end of ' + clip.name} className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize border-l border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]/20" />
          </div>;
        })}
      </div>
    </React.Fragment>;
  };

  const buttonClass = 'grid size-9 shrink-0 place-items-center rounded text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-border)] hover:text-[var(--vyra-text-primary)] disabled:cursor-not-allowed disabled:opacity-40';
  const headerClass = 'sticky left-0 z-30 flex items-center border-b border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-secondary)] sm:px-3';

  return <section aria-label="Master timeline editor" className="space-y-3 border-t border-[var(--vyra-border)] pt-5 text-[var(--vyra-text-primary)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Master Timeline</h2><p className="mt-0.5 text-[10px] text-[var(--vyra-text-secondary)]">Scenes, Audio and Text share one timeline.</p></div>
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] p-1">
        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!historyRef.current.past.length} onClick={undo} className={buttonClass}><Undo2 size={15} /></button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!historyRef.current.future.length} onClick={redo} className={buttonClass}><Redo2 size={15} /></button>
        <span className="mx-1 h-5 w-px bg-[var(--vyra-border)]" />
        <button type="button" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((current) => !current)} className={buttonClass}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <span className="min-w-[94px] px-1 text-center font-mono text-[10px] tabular-nums text-[var(--vyra-text-secondary)]">{formatTime(playhead)} <span className="text-[var(--vyra-text-muted)]">/ {formatTime(totalDuration)}</span></span>
        <span className="mx-1 h-5 w-px bg-[var(--vyra-border)]" />
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(8, current * 0.8))} className={buttonClass}><ZoomOut size={15} /></button>
        <button type="button" title="Fit timeline" aria-label="Fit timeline" onClick={fitTimeline} className={buttonClass}><Maximize2 size={14} /></button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(160, current * 1.25))} className={buttonClass}><ZoomIn size={15} /></button>
        <button type="button" title={snapEnabled ? 'Snapping on' : 'Snapping off'} aria-label={snapEnabled ? 'Turn snapping off' : 'Turn snapping on'} aria-pressed={snapEnabled} onClick={() => setSnapEnabled((current) => !current)} className={buttonClass + (snapEnabled ? ' text-[var(--vyra-accent-primary)]' : '')}><Magnet size={15} /></button>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => addTrack('audio', true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 text-xs font-medium text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)]"><AudioLines size={14} className="text-[var(--vyra-accent-primary)]" /> Add Audio</button>
      <button type="button" onClick={() => addTrack('text', true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 text-xs font-medium text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)]"><Type size={14} className="text-[var(--vyra-warning)]" /> Add Text</button>
    </div>

    <div ref={scrollerRef} className="overflow-auto overscroll-x-contain rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] [scrollbar-color:var(--vyra-text-muted)_var(--vyra-bg-canvas)] [scrollbar-width:thin]">
      <div className="relative" style={{ width: trackLabelWidth + timelineWidth, minWidth: '100%' }}>
        <div className="pointer-events-none absolute bottom-0 top-8 z-20 w-px bg-[var(--vyra-danger)] shadow-[0_0_8px_var(--vyra-danger)]" style={{ left: trackLabelWidth + timeToPixel(playhead) }} />
        <div className="grid" style={{ gridTemplateColumns: `${trackLabelWidth}px ${timelineWidth}px` }}>
          <div className={headerClass}>Time</div>
          <div className="relative h-8 cursor-crosshair border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(clamp((event.clientX - rect.left) / zoom, 0, totalDuration)); }}>
            {ticks.map((tick) => <div key={tick} className="pointer-events-none absolute inset-y-0 border-l border-[var(--vyra-border-subtle)] pl-1 pt-1 text-[9px] font-mono tabular-nums text-[var(--vyra-text-muted)]" style={{ left: timeToPixel(tick) }}>{formatTime(tick)}</div>)}
          </div>
          <div className={headerClass + ' min-h-[76px]'}>Scenes</div>
          <div className="relative h-[76px] border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
            {ticks.map((tick) => <div key={tick} className="pointer-events-none absolute inset-y-0 border-l border-[var(--vyra-border-subtle)]" style={{ left: timeToPixel(tick) }} />)}
            {positionedScenes.map((scene, index) => <React.Fragment key={scene.id}>
              <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-vyra-scene', scene.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderScene(event.dataTransfer.getData('application/x-vyra-scene'), scene.id); }} onClick={() => setSelectedSceneId(scene.id)} title={`${scene.scene.title} · ${scene.duration.toFixed(1)} seconds`} className={'absolute top-2 flex h-[60px] flex-col justify-between overflow-hidden rounded border p-1.5 text-left transition ' + (selectedSceneId === scene.id ? 'z-10 border-[var(--vyra-accent-primary)] bg-[var(--vyra-bg-subtle)] ring-1 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] hover:border-[var(--vyra-accent-primary)]/70')} style={{ left: timeToPixel(scene.start), width: Math.max(46, timeToPixel(scene.duration)) }}>
                <span className="flex min-w-0 items-center gap-1.5"><span className="grid size-7 shrink-0 place-items-center rounded bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]"><Film size={14} /></span><span className="truncate text-[10px] font-semibold text-[var(--vyra-text-primary)]">{scene.scene.title}</span></span>
                <span className="flex items-center justify-between gap-1 text-[9px] tabular-nums text-[var(--vyra-text-secondary)]"><span>Scene {index + 1}</span><span>{scene.duration.toFixed(1)}s</span></span>
                <span className="absolute bottom-0 left-0 h-0.5 bg-[var(--vyra-accent-primary)]" style={{ width: '100%' }} />
              </button>
              {index < positionedScenes.length - 1 && <button type="button" title="Configure transition" aria-label={'Transition after ' + scene.scene.title} onClick={() => setSelectedSceneId(scene.id)} className="absolute top-[27px] z-20 grid size-6 -translate-x-1/2 place-items-center rounded border border-dashed border-[var(--vyra-accent-primary)]/70 bg-[var(--vyra-bg-canvas)] text-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)]" style={{ left: timeToPixel(scene.start + scene.duration - scene.overlap / 2) }}><Plus size={12} /></button>}
            </React.Fragment>)}
            {!positionedScenes.length && <span className="px-3 py-5 text-[10px] text-[var(--vyra-text-muted)]">Add a Scene above to start the sequence.</span>}
          </div>
          <div className={headerClass + ' min-h-10'}>Audio</div>
          {audioTracks.length ? audioTracks.map((track) => renderTrack('audio', track)) : <div className="flex h-10 items-center border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-[10px] text-[var(--vyra-text-muted)]">Add an Audio track for music, voice or effects.</div>}
          <div className={headerClass + ' min-h-10'}>Text</div>
          {textTracks.length ? textTracks.map((track) => renderTrack('text', track)) : <div className="flex h-10 items-center border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-[10px] text-[var(--vyra-text-muted)]">Add a Text track for titles, dialogue or captions.</div>}
        </div>
      </div>
    </div>

    {selectedScene && <div className="grid gap-3 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2"><label className="text-[10px] font-semibold text-[var(--vyra-text-secondary)]">Source range <span className="font-normal text-[var(--vyra-text-muted)]">· original {selectedScene.scene.duration}s</span></label><div className="flex gap-1"><button type="button" title="Move Scene earlier" aria-label="Move Scene earlier" onClick={() => moveScene(selectedScene.id, -1)} className="grid size-8 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-border)]"><ChevronDown size={14} className="rotate-180" /></button><button type="button" title="Move Scene later" aria-label="Move Scene later" onClick={() => moveScene(selectedScene.id, 1)} className="grid size-8 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-border)]"><ChevronDown size={14} /></button><button type="button" title="Duplicate Scene instance" aria-label="Duplicate Scene instance" onClick={() => { const index = sceneInstances.findIndex((item) => item.id === selectedScene.id); const clonedScene = onSceneDuplicate(selectedScene.scene, index + 1); const copy: SceneTimelineInstance = { id: makeId(), sceneId: clonedScene.id, sourceIn: 0, sourceOut: clonedScene.duration }; const next = [...sceneInstances]; next.splice(index + 1, 0, copy); updateInstances(next); onSceneOrderChange(next.map((item) => item.sceneId)); setSelectedSceneId(copy.id); }} className="grid size-8 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-border)]"><Copy size={14} /></button><button type="button" title="Remove Scene from timeline" aria-label="Remove Scene from timeline" onClick={() => { const next = sceneInstances.filter((item) => item.id !== selectedScene.id); const transitions = { ...dataRef.current.transitions }; delete transitions[selectedScene.id]; delete transitions[selectedScene.sceneId]; commit({ sceneInstances: next, transitions }); onSceneDelete(selectedScene.sceneId); onSceneOrderChange(next.map((item) => item.sceneId)); setSelectedSceneId(null); }} className="grid size-8 place-items-center rounded text-[var(--vyra-danger)] hover:bg-[color-mix(in_srgb,var(--vyra-danger)_12%,var(--vyra-bg-surface))]"><Trash2 size={14} /></button></div></div>
        <div className="flex items-center gap-2"><label className="flex-1 text-[9px] text-[var(--vyra-text-muted)]">In<input aria-label="Scene source in" type="number" min="0" max={Math.max(0, selectedScene.scene.duration - 0.1)} step="0.1" value={Number(selectedScene.sourceIn.toFixed(2))} onChange={(event) => updateRange(selectedScene.id, { sourceIn: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label><label className="flex-1 text-[9px] text-[var(--vyra-text-muted)]">Out<input aria-label="Scene source out" type="number" min={selectedScene.sourceIn + 0.1} max={selectedScene.scene.duration} step="0.1" value={Number(selectedScene.sourceOut.toFixed(2))} onChange={(event) => updateRange(selectedScene.id, { sourceOut: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label></div>
      </div>
      <div><label className="mb-2 block text-[10px] font-semibold text-[var(--vyra-text-secondary)]">Transition to next Scene</label><div className="flex gap-2"><select aria-label="Transition effect" value={selectedScene.transition?.effect || 'None'} onChange={(event) => setTransition(selectedScene.id, { effect: event.target.value })} className="min-h-9 min-w-0 flex-1 rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]"><option>None</option><option>Fade</option><option>Dissolve</option><option>Wipe</option><option>Slide</option><option>Zoom</option></select><label className="w-24 text-[9px] text-[var(--vyra-text-muted)]">Duration<input aria-label="Transition duration" type="number" min="0" max={Math.min(selectedScene.duration / 2, 3)} step="0.1" value={selectedScene.transition?.duration ?? 0.5} disabled={!selectedScene.transition || selectedScene.transition.effect === 'None'} onChange={(event) => setTransition(selectedScene.id!, { duration: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)] disabled:opacity-40" /></label></div></div>
    </div>}

    {selectedClipValue && selectedClip && <div className="grid gap-3 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[9px] text-[var(--vyra-text-muted)]">{selectedClip.type === 'text' ? 'Text' : 'Clip name'}<input aria-label={selectedClip.type === 'text' ? 'Text content' : 'Clip name'} value={selectedClipValue.name} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selectedClipValue.id, { name: event.target.value })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
        <label className="text-[9px] text-[var(--vyra-text-muted)]">Start (seconds)<input aria-label="Clip start time" type="number" min="0" step="0.1" value={Number(selectedClipValue.start.toFixed(2))} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selectedClipValue.id, { start: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
        <label className="text-[9px] text-[var(--vyra-text-muted)]">Duration (seconds)<input aria-label="Clip duration" type="number" min="0.1" step="0.1" value={Number(selectedClipValue.duration.toFixed(2))} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selectedClipValue.id, { duration: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
      </div>
      <div className="flex items-end gap-1">
        <button type="button" title="Split at playhead" aria-label="Split selected clip" onClick={() => splitClip(selectedClip, selectedClipValue)} className="grid size-9 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-border)]"><Scissors size={15} /></button>
        <button type="button" title="Duplicate clip (Ctrl+D)" aria-label="Duplicate selected clip" onClick={() => duplicateClip(selectedClip, selectedClipValue)} className="grid size-9 place-items-center rounded text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-border)]"><Copy size={15} /></button>
        <button type="button" title="Delete clip" aria-label="Delete selected clip" onClick={() => removeSelectedClip(selectedClip)} className="grid size-9 place-items-center rounded text-[var(--vyra-danger)] hover:bg-[color-mix(in_srgb,var(--vyra-danger)_12%,var(--vyra-bg-surface))]"><Trash2 size={15} /></button>
      </div>
    </div>}
    <span className="sr-only" aria-live="polite">{historyVersion ? 'Timeline changed' : ''}</span>
  </section>;
};
