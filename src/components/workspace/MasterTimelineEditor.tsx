import React, { useMemo, useState } from 'react';
import { AudioLines, Copy, Plus, Scissors, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react';

export type TimelineClip = { id: string; name: string; start: number; duration: number };
export type TimelineTrack = { id: string; name: string; clips: TimelineClip[] };
export type MasterTimelineData = {
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  transitions: Record<string, { effect: string; duration: number }>;
  audioTracks: TimelineTrack[];
  textTracks: TimelineTrack[];
};
type Scene = { id: string; title: string; duration: number };
type Props = { scenes: Scene[]; value?: MasterTimelineData; onChange: (next: MasterTimelineData) => void };

const makeId = () => crypto.randomUUID();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const emptyData = (): MasterTimelineData => ({ sceneRanges: {}, transitions: {}, audioTracks: [], textTracks: [] });

export const MasterTimelineEditor: React.FC<Props> = ({ scenes, value, onChange }) => {
  const data = value || emptyData();
  const [zoom, setZoom] = useState(48);
  const [playhead, setPlayhead] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<{ type: 'audio' | 'text'; trackId: string; clipId: string } | null>(null);

  const ranges = scenes.map((scene) => {
    const saved = data.sceneRanges[scene.id];
    const sourceIn = clamp(Number(saved?.sourceIn ?? 0), 0, Math.max(0, scene.duration - 0.1));
    const sourceOut = clamp(Number(saved?.sourceOut ?? scene.duration), sourceIn + 0.1, Math.max(sourceIn + 0.1, scene.duration));
    return { scene, sourceIn, sourceOut, duration: sourceOut - sourceIn };
  });
  const scenePositions = useMemo(() => {
    let cursor = 0;
    return scenes.map((scene) => {
      const saved = data.sceneRanges[scene.id];
      const sourceIn = clamp(Number(saved?.sourceIn ?? 0), 0, Math.max(0, scene.duration - 0.1));
      const sourceOut = clamp(Number(saved?.sourceOut ?? scene.duration), sourceIn + 0.1, Math.max(sourceIn + 0.1, scene.duration));
      const duration = sourceOut - sourceIn;
      const start = cursor;
      const transition = data.transitions[scene.id];
      const overlap = transition && transition.effect !== 'None' ? Math.min(Math.max(0, transition.duration), duration / 2) : 0;
      cursor += duration - overlap;
      return { scene, sourceIn, sourceOut, duration, start, overlap };
    });
  }, [scenes, data.sceneRanges, data.transitions]);
  const totalDuration = Math.max(1, scenePositions.length ? scenePositions[scenePositions.length - 1].start + scenePositions[scenePositions.length - 1].duration : 0);
  const timelineWidth = Math.max(640, totalDuration * zoom);
  const ticks = Array.from({ length: Math.floor(totalDuration / 5) + 2 }, (_, i) => i * 5).filter((n) => n <= totalDuration + 0.01);
  const update = (patch: Partial<MasterTimelineData>) => onChange({ ...data, ...patch });
  const updateRange = (id: string, patch: Partial<{ sourceIn: number; sourceOut: number }>) => {
    const scene = scenes.find((item) => item.id === id);
    if (!scene) return;
    const current = data.sceneRanges[id] || { sourceIn: 0, sourceOut: scene.duration };
    let sourceIn = patch.sourceIn ?? current.sourceIn;
    let sourceOut = patch.sourceOut ?? current.sourceOut;
    sourceIn = clamp(sourceIn, 0, Math.max(0, scene.duration - 0.1));
    sourceOut = clamp(sourceOut, sourceIn + 0.1, scene.duration);
    update({ sceneRanges: { ...data.sceneRanges, [id]: { sourceIn, sourceOut } } });
  };
  const addTrack = (type: 'audio' | 'text') => {
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = [...tracks, { id: makeId(), name: (type === 'audio' ? 'Audio ' : 'Text ') + (tracks.length + 1), clips: [] }];
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const addClip = (type: 'audio' | 'text', trackId: string) => {
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = tracks.map((track) => track.id !== trackId ? track : {
      ...track, clips: [...track.clips, { id: makeId(), name: type === 'audio' ? 'New audio clip' : 'New text', start: clamp(playhead, 0, Math.max(0, totalDuration - 0.1)), duration: Math.max(0.5, Math.min(3, totalDuration - playhead || 3)) }],
    });
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const updateClip = (type: 'audio' | 'text', trackId: string, clipId: string, patch: Partial<TimelineClip>) => {
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = tracks.map((track) => track.id !== trackId ? track : {
      ...track, clips: track.clips.map((clip) => clip.id === clipId ? {
        ...clip, ...patch,
        start: clamp(patch.start ?? clip.start, 0, Math.max(0, totalDuration - 0.1)),
        duration: clamp(patch.duration ?? clip.duration, 0.1, Math.max(0.1, totalDuration)),
      } : clip),
    });
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const removeClip = (type: 'audio' | 'text', trackId: string, clipId: string) => {
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = tracks.map((track) => track.id === trackId ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) } : track);
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
    setSelectedClip(null);
  };
  const duplicateClip = (type: 'audio' | 'text', trackId: string, clip: TimelineClip) => {
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = tracks.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, { ...clip, id: makeId(), start: Math.min(totalDuration - clip.duration, clip.start + clip.duration) }] } : track);
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const splitClip = (type: 'audio' | 'text', trackId: string, clip: TimelineClip) => {
    if (playhead <= clip.start + 0.05 || playhead >= clip.start + clip.duration - 0.05) return;
    const firstDuration = playhead - clip.start;
    const second = { ...clip, id: makeId(), name: clip.name + ' (2)', start: playhead, duration: clip.duration - firstDuration };
    const tracks = type === 'audio' ? data.audioTracks : data.textTracks;
    const next = tracks.map((track) => track.id !== trackId ? track : { ...track, clips: track.clips.flatMap((item) => item.id === clip.id ? [{ ...item, duration: firstDuration }, second] : [item]) });
    update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
  };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>, type: 'audio' | 'text', trackId: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-vyra-clip');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { type: 'audio' | 'text'; trackId: string; clipId: string };
    if (parsed.type !== type || parsed.trackId !== trackId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = clamp((event.clientX - rect.left) / zoom, 0, Math.max(0, totalDuration - 0.1));
    updateClip(type, trackId, parsed.clipId, { start });
  };
  const selected = selectedClip ? (selectedClip.type === 'audio' ? data.audioTracks : data.textTracks).find((track) => track.id === selectedClip.trackId)?.clips.find((clip) => clip.id === selectedClip.clipId) : null;

  const renderTracks = (type: 'audio' | 'text', tracks: TimelineTrack[]) => (
    <div className="space-y-2">
      {tracks.map((track, index) => (
        <div key={track.id} className="flex min-w-0 overflow-hidden rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
          <div className="flex w-28 shrink-0 flex-col justify-between border-r border-[var(--vyra-border)] p-2 sm:w-36">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--vyra-text-primary)]">{type === 'audio' ? <AudioLines size={13} /> : <Type size={13} />}<span className="truncate">{track.name}</span></div>
            <div className="mt-2 flex items-center gap-1">
              <button type="button" onClick={() => addClip(type, track.id)} aria-label={'Add clip to ' + track.name} className="rounded-md p-1.5 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><Plus size={14} /></button>
              <button type="button" onClick={() => {
                const next = tracks.filter((item) => item.id !== track.id);
                update(type === 'audio' ? { audioTracks: next } : { textTracks: next });
              }} aria-label={'Remove ' + track.name} className="rounded-md p-1.5 text-[var(--vyra-text-muted)] hover:text-[var(--vyra-danger)]"><Trash2 size={13} /></button>
            </div>
          </div>
          <div className="relative h-[58px] min-w-0 flex-1 overflow-hidden bg-[var(--vyra-bg-canvas)]" style={{ minWidth: timelineWidth }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, type, track.id)}>
            {ticks.map((tick) => <div key={tick} className="pointer-events-none absolute inset-y-0 border-l border-[var(--vyra-border-subtle)]" style={{ left: tick * zoom }} />)}
            {track.clips.map((clip) => {
              const isSelected = selectedClip?.trackId === track.id && selectedClip.clipId === clip.id;
              return <div key={clip.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-vyra-clip', JSON.stringify({ type, trackId: track.id, clipId: clip.id }))} onClick={() => setSelectedClip({ type, trackId: track.id, clipId: clip.id })} title={clip.name} className={'absolute top-2 flex h-[42px] cursor-grab items-center overflow-hidden rounded-md border px-2 text-[10px] font-semibold text-white active:cursor-grabbing ' + (type === 'audio' ? 'border-teal-300/40 bg-teal-700' : 'border-purple-300/40 bg-purple-700') + (isSelected ? ' ring-2 ring-[var(--vyra-accent-primary)] ring-offset-1 ring-offset-[var(--vyra-bg-canvas)]' : '')} style={{ left: clip.start * zoom, width: Math.max(34, clip.duration * zoom) }}><span className="truncate">{clip.name}</span></div>;
            })}
          </div>
        </div>
      ))}
      {!tracks.length && <div className="rounded-lg border border-dashed border-[var(--vyra-border)] px-3 py-4 text-center text-[11px] text-[var(--vyra-text-muted)]">No {type === 'audio' ? 'audio' : 'text'} tracks yet. Add one when you need it.</div>}
    </div>
  );

  return (
    <section className="space-y-4 border-t border-[var(--vyra-border)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Timeline Editor</h2><p className="mt-0.5 text-[11px] text-[var(--vyra-text-secondary)]">One shared timeline for Scenes, Audio and Text.</p></div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] p-1">
          <button type="button" onClick={() => setZoom((current) => Math.max(18, current - 8))} aria-label="Zoom out" className="rounded-md p-1.5 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><ZoomOut size={15} /></button>
          <span className="min-w-10 text-center text-[10px] tabular-nums text-[var(--vyra-text-muted)]">{Math.round(zoom / 48 * 100)}%</span>
          <button type="button" onClick={() => setZoom((current) => Math.min(120, current + 8))} aria-label="Zoom in" className="rounded-md p-1.5 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><ZoomIn size={15} /></button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
        <div className="border-b border-[var(--vyra-border)] px-3 py-2">
          <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-wide text-[var(--vyra-text-secondary)]">SCENES</span><span className="text-[10px] tabular-nums text-[var(--vyra-text-muted)]">{totalDuration.toFixed(1)}s total</span></div>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-stretch gap-1.5">
              {scenePositions.map((item, index) => (
                <React.Fragment key={item.scene.id}>
                  <button type="button" onClick={() => setSelectedSceneId(item.scene.id)} className={'relative flex h-[66px] shrink-0 flex-col justify-between overflow-hidden rounded-lg border p-2 text-left transition ' + (selectedSceneId === item.scene.id ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-bg-hover)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]')} style={{ width: Math.max(92, item.duration * Math.max(18, zoom * 0.72)) }}>
                    <span className="truncate text-[10px] font-semibold text-[var(--vyra-text-primary)]">{item.scene.title}</span>
                    <span className="text-[10px] tabular-nums text-[var(--vyra-text-secondary)]">{item.duration.toFixed(1)}s</span>
                    <span className="absolute bottom-0 left-0 h-1 bg-[var(--vyra-accent-primary)]/70" style={{ width: '100%' }} />
                  </button>
                  {index < scenePositions.length - 1 && <div className="flex w-9 shrink-0 flex-col items-center justify-center gap-1">
                    <button type="button" onClick={() => update({ transitions: { ...data.transitions, [item.scene.id]: { effect: data.transitions[item.scene.id]?.effect || 'Fade', duration: data.transitions[item.scene.id]?.duration || 0.5 } } })} title="Add transition" className="flex size-7 items-center justify-center rounded-full border border-dashed border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:border-[var(--vyra-accent-primary)] hover:text-[var(--vyra-accent-primary)]"><Plus size={13} /></button>
                    <span className="text-[8px] text-[var(--vyra-text-muted)]">FX</span>
                  </div>}
                </React.Fragment>
              ))}
              {!scenePositions.length && <span className="py-5 text-[11px] text-[var(--vyra-text-muted)]">Add a Scene above to start your timeline.</span>}
            </div>
          </div>
        </div>

        {selectedSceneId && (() => {
          const item = scenePositions.find((entry) => entry.scene.id === selectedSceneId);
          if (!item) return null;
          const transition = data.transitions[selectedSceneId];
          return <div className="grid gap-3 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] p-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-[10px] font-semibold text-[var(--vyra-text-secondary)]">Source range · Original {item.scene.duration}s</label><div className="flex items-center gap-2"><label className="flex-1 text-[10px] text-[var(--vyra-text-muted)]">In <input type="number" min="0" max={item.scene.duration - 0.1} step="0.1" value={item.sourceIn} onChange={(event) => updateRange(item.scene.id, { sourceIn: Number(event.target.value) })} className="mt-1 min-h-8 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label><label className="flex-1 text-[10px] text-[var(--vyra-text-muted)]">Out <input type="number" min={item.sourceIn + 0.1} max={item.scene.duration} step="0.1" value={item.sourceOut} onChange={(event) => updateRange(item.scene.id, { sourceOut: Number(event.target.value) })} className="mt-1 min-h-8 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label></div></div>
            <div><label className="mb-1 block text-[10px] font-semibold text-[var(--vyra-text-secondary)]">Transition to next Scene</label><div className="flex gap-2"><select value={transition?.effect || 'None'} onChange={(event) => update({ transitions: { ...data.transitions, [selectedSceneId]: { effect: event.target.value, duration: transition?.duration || 0.5 } } })} className="min-h-8 flex-1 rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)]"><option>None</option><option>Fade</option><option>Dissolve</option><option>Wipe</option><option>Slide</option><option>Zoom</option></select><label className="w-20 text-[10px] text-[var(--vyra-text-muted)]">Duration<input type="number" min="0" max={Math.min(item.duration / 2, 3)} step="0.1" value={transition?.duration ?? 0.5} disabled={!transition || transition.effect === 'None'} onChange={(event) => update({ transitions: { ...data.transitions, [selectedSceneId]: { effect: transition?.effect || 'Fade', duration: Number(event.target.value) } } })} className="mt-1 min-h-8 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2 text-xs text-[var(--vyra-text-primary)] disabled:opacity-40" /></label></div></div>
          </div>;
        })()}

        <div className="flex min-w-0 overflow-x-auto">
          <div className="w-28 shrink-0 border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] p-2 sm:w-36"><span className="text-[10px] font-semibold text-[var(--vyra-text-secondary)]">TRACKS</span></div>
          <div className="relative h-8 bg-[var(--vyra-bg-canvas)]" style={{ minWidth: timelineWidth }}>
            {ticks.map((tick) => <div key={tick} className="absolute inset-y-0 border-l border-[var(--vyra-border-subtle)] pl-1 pt-1 text-[9px] tabular-nums text-[var(--vyra-text-muted)]" style={{ left: tick * zoom }}>{tick}s</div>)}
          </div>
        </div>
        <div className="flex min-w-0 overflow-x-auto border-b border-[var(--vyra-border)]">
          <div className="flex w-28 shrink-0 items-center border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 sm:w-36"><span className="text-[10px] font-semibold text-[var(--vyra-text-secondary)]">PLAYHEAD</span></div>
          <div className="relative h-8 bg-[var(--vyra-bg-canvas)]" style={{ minWidth: timelineWidth }}>
            <input aria-label="Timeline playhead" type="range" min="0" max={totalDuration} step="0.1" value={Math.min(playhead, totalDuration)} onChange={(event) => setPlayhead(Number(event.target.value))} className="absolute inset-x-2 top-2 h-4 w-[calc(100%-16px)] accent-[var(--vyra-accent-primary)]" />
          </div>
        </div>

        <div className="space-y-2 p-2">
          <div className="flex min-w-0 overflow-x-auto rounded-lg border border-[var(--vyra-border)]">
            <div className="flex w-28 shrink-0 items-center border-r border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 sm:w-36"><span className="text-[10px] font-semibold text-[var(--vyra-text-secondary)]">SCENE ORDER</span></div>
            <div className="relative flex h-[58px] items-center gap-1 bg-[var(--vyra-bg-canvas)] px-1" style={{ minWidth: timelineWidth }}>
              {scenePositions.map((item) => <div key={item.scene.id} className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-blue-300/30 bg-blue-800 px-2 text-[10px] font-semibold text-white" style={{ width: Math.max(24, item.duration * zoom) }} title={item.scene.title}>{item.scene.title}</div>)}
            </div>
          </div>
          {renderTracks('audio', data.audioTracks)}
          {renderTracks('text', data.textTracks)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => addTrack('audio')} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]"><AudioLines size={14} /> Add Audio Track</button>
        <button type="button" onClick={() => addTrack('text')} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]"><Type size={14} /> Add Text Track</button>
      </div>

      {selected && selectedClip && <div className="grid gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[10px] text-[var(--vyra-text-muted)]">Clip name / text<input value={selected.name} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selected.id, { name: event.target.value })} className="mt-1 min-h-9 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
          <label className="text-[10px] text-[var(--vyra-text-muted)]">Start position (s)<input type="number" min="0" step="0.1" value={selected.start} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selected.id, { start: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
          <label className="text-[10px] text-[var(--vyra-text-muted)]">Duration (s)<input type="number" min="0.1" step="0.1" value={selected.duration} onChange={(event) => updateClip(selectedClip.type, selectedClip.trackId, selected.id, { duration: Number(event.target.value) })} className="mt-1 min-h-9 w-full rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]" /></label>
        </div>
        <div className="flex items-end gap-1">
          <button type="button" onClick={() => splitClip(selectedClip.type, selectedClip.trackId, selected)} title="Split at playhead" className="rounded-lg p-2 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><Scissors size={15} /></button>
          <button type="button" onClick={() => duplicateClip(selectedClip.type, selectedClip.trackId, selected)} title="Duplicate clip" className="rounded-lg p-2 text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><Copy size={15} /></button>
          <button type="button" onClick={() => removeClip(selectedClip.type, selectedClip.trackId, selected.id)} title="Delete clip" className="rounded-lg p-2 text-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]"><Trash2 size={15} /></button>
        </div>
      </div>}
      <p className="text-[10px] leading-4 text-[var(--vyra-text-muted)]">Scene source ranges are trimmed from the original only; the original Scene duration is never changed. Audio and Text clips share this timeline ruler. Drag a clip horizontally to change its position.</p>
    </section>
  );
};
