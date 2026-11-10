import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Crop,
  Copy,
  Scissors,
  Gauge,
  Layers,
  MousePointer2,
  Redo2,
  RotateCw,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  BetweenHorizontalStart,
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

type Scene = {
  id: string;
  title: string;
  duration: number;
  projectId?: string;
  latestRenderRevisionId?: string | null;
};

type Props = {
  scenes: Scene[];
  value?: MasterTimelineData;
  onChange: (next: MasterTimelineData) => void;
  onSceneOrderChange: (sceneIds: string[]) => void;
  onSceneDuplicate: (scene: Scene, index: number) => Scene;
  onSceneDelete: (sceneId: string) => void;
};

const toolbarItems = [
  { label: 'Select', Icon: MousePointer2 },
  { label: 'Split', Icon: Scissors },
  { label: 'Trim', Icon: BetweenHorizontalStart },
  { label: 'Delete', Icon: Trash2 },
  { label: 'Duplicate', Icon: Copy },
  { label: 'Crop', Icon: Crop },
  { label: 'Speed', Icon: Gauge },
  { label: 'Rotate', Icon: RotateCw },
  { label: 'Transition', Icon: Layers },
  { label: 'Effects', Icon: Sparkles },
  { label: 'Text', Icon: Type },
  { label: 'Audio', Icon: AudioLines },
  { label: 'Undo', Icon: Undo2 },
  { label: 'Redo', Icon: Redo2 },
  { label: 'Layers', Icon: Layers },
];

/**
 * Master timeline foundation:
 * - ruler and scene blocks share one horizontal scroll surface
 * - zoom changes horizontal pixels-per-second only
 * - playhead is an overlay fixed at the center of the timeline viewport
 */
export const MasterTimelineEditor: React.FC<Props> = ({ scenes, value, onChange, onSceneDuplicate, onSceneDelete }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const pixelsPerSecondRef = useRef(80);
  const pinchRef = useRef<{ startDistance: number; startScale: number; anchorTime: number } | null>(null);\n  const trimRef = useRef<{ pointerId: number; sceneId: string; edge: 'start' | 'end'; startX: number; sourceIn: number; sourceOut: number; sceneDuration: number } | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const scale = pixelsPerSecondRef.current;
      pinchRef.current = {
        startDistance: Math.max(1, distance(event.touches)),
        startScale: scale,
        // Time currently aligned with the fixed center playhead.
        anchorTime: element.scrollLeft / scale,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const nextScale = Math.min(176, Math.max(32, pinch.startScale * distance(event.touches) / pinch.startDistance));
      setPixelsPerSecond(nextScale);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  useLayoutEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
    const element = scrollRef.current;
    const pinch = pinchRef.current;
    if (!element || !pinch) return;

    // Apply the scroll correction only after React has committed the new
    // timeline width; otherwise the browser clamps scrollLeft against the
    // previous (narrower) scroll range and the ruler drifts off the playhead.
    element.scrollLeft = pinch.anchorTime * pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateWidth = () => setViewportWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const orderedScenes = useMemo(() => {
    const instances = value?.sceneInstances || [];
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const ordered = instances
      .map((instance) => byId.get(instance.sceneId))
      .filter((scene): scene is Scene => Boolean(scene));
    const included = new Set(ordered.map((scene) => scene.id));
    return [...ordered, ...scenes.filter((scene) => !included.has(scene.id))];
  }, [scenes, value?.sceneInstances]);

  const sceneSegments = orderedScenes.map((scene) => {
    const instance = value?.sceneInstances?.find((item) => item.sceneId === scene.id);
    const range = value?.sceneRanges?.[scene.id];
    const sourceIn = Math.min(Math.max(0, Number(range?.sourceIn ?? instance?.sourceIn ?? 0)), Math.max(0, scene.duration - 0.1));
    const sourceOut = Math.min(Math.max(sourceIn + 0.1, Number(range?.sourceOut ?? instance?.sourceOut ?? scene.duration)), Math.max(0.1, scene.duration));
    return { sourceIn, sourceOut, duration: Math.max(0.1, sourceOut - sourceIn) };
  });
  const sceneDurations = sceneSegments.map((segment) => segment.duration);

  const updateSceneRange = (sceneId: string, sourceIn: number, sourceOut: number) => {
    const scene = scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    const nextIn = Math.max(0, Math.min(sourceIn, scene.duration - 0.1));
    const nextOut = Math.max(nextIn + 0.1, Math.min(sourceOut, scene.duration));
    onChange({
      sceneRanges: { ...(value?.sceneRanges || {}), [sceneId]: { sourceIn: nextIn, sourceOut: nextOut } },
      sceneInstances: (value?.sceneInstances || []).map((instance) => instance.sceneId === sceneId
        ? { ...instance, sourceIn: nextIn, sourceOut: nextOut }
        : instance),
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
      textTracks: value?.textTracks || [],
    });
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = trimRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const delta = (event.clientX - drag.startX) / pixelsPerSecondRef.current;
      if (drag.edge === 'start') {
        const nextIn = Math.max(0, Math.min(drag.sourceIn + delta, drag.sourceOut - 0.1));
        updateSceneRange(drag.sceneId, nextIn, drag.sourceOut);
      } else {
        const nextOut = Math.max(drag.sourceIn + 0.1, Math.min(drag.sourceOut + delta, drag.sceneDuration));
        updateSceneRange(drag.sceneId, drag.sourceIn, nextOut);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (trimRef.current?.pointerId === event.pointerId) trimRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [scenes, value, pixelsPerSecond]);
  const totalDuration = Math.max(1, sceneDurations.reduce((sum, duration) => sum + duration, 0));
  const timelineWidth = totalDuration * pixelsPerSecond;
  const leadingSpace = viewportWidth / 2;
  const rulerTicks = Array.from({ length: Math.floor(totalDuration) + 1 }, (_, second) => second);

  const toolbar = (
    <nav
      className="master-editor-bottom-nav relative z-20 flex w-full shrink-0 items-center gap-2 px-3 pt-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-0">
        {toolbarItems.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
          >
            <Icon size={22} strokeWidth={1.8} />
          </button>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={scrollRef}
          className="master-timeline-scroll h-full min-h-0 w-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ touchAction: "pan-x pan-y" }}
        >
          <div className="flex min-h-full w-max items-start">
            <div aria-hidden="true" style={{ width: leadingSpace, flex: '0 0 auto' }} />
            <div className="shrink-0" style={{ width: timelineWidth }}>
              <div className="relative h-10 border-b border-[var(--vyra-border)]">
                {rulerTicks.map((second) => (
                  <div key={second} className="absolute bottom-0 h-full" style={{ left: second * pixelsPerSecond }}>
                    <span className="absolute bottom-2 left-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-[var(--vyra-text-secondary)]">
                      {'00:' + String(second).padStart(2, '0')}
                    </span>
                    <span className="absolute bottom-0 h-2 w-px bg-[var(--vyra-text-muted)]/60" />
                  </div>
                ))}
              </div>
              <div className="flex h-16 items-center gap-px py-2">
                {orderedScenes.map((scene, index) => {
                  const segment = sceneSegments[index];
                  const instance = value?.sceneInstances?.find((item) => item.sceneId === scene.id);
                  return (
                    <div
                      key={scene.id}
                      title={scene.title}
                      className="group relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--vyra-accent-primary)]/50 bg-[var(--vyra-accent-primary)]/10 px-3"
                      style={{ width: Math.max(24, segment.duration * pixelsPerSecond) }}
                    >
                      <button
                        type="button"
                        aria-label={'Adjust start of ' + scene.title}
                        title="Drag to adjust start"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          trimRef.current = { pointerId: event.pointerId, sceneId: scene.id, edge: 'start', startX: event.clientX, sourceIn: segment.sourceIn, sourceOut: segment.sourceOut, sceneDuration: scene.duration };
                        }}
                        className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/45 opacity-80"
                      />
                      <span className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-[var(--vyra-text-secondary)]">{scene.title}</span>
                      <button
                        type="button"
                        aria-label={'Adjust end of ' + scene.title}
                        title="Drag to adjust end"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          trimRef.current = { pointerId: event.pointerId, sceneId: scene.id, edge: 'end', startX: event.clientX, sourceIn: segment.sourceIn, sourceOut: segment.sourceOut, sceneDuration: scene.duration };
                        }}
                        className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/45 opacity-80"
                      />
                      <div className="absolute right-1 top-0.5 z-20 flex gap-0.5">
                        <button type="button" title="Clone scene" aria-label="Clone scene" onClick={() => onSceneDuplicate(scene, index + 1)} className="rounded bg-[var(--vyra-bg-surface)]/90 p-0.5 text-[var(--vyra-text-primary)]"><Copy size={11} /></button>
                        <button type="button" title="Delete scene" aria-label="Delete scene" onClick={() => onSceneDelete(scene.id)} className="rounded bg-[var(--vyra-bg-surface)]/90 p-0.5 text-[var(--vyra-danger)]"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div aria-hidden="true" style={{ width: leadingSpace, flex: '0 0 auto' }} />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-[var(--vyra-accent-primary)]"
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-b-sm bg-[var(--vyra-accent-primary)]" />
        </div>
      </div>
      {toolbar}
    </div>
  );
};
