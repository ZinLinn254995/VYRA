import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
export const MasterTimelineEditor: React.FC<Props> = ({ scenes, value }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const pinchRef = useRef<{ startDistance: number; startScale: number; anchorTime: number; midpointX: number } | null>(null);

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
      const rect = element.getBoundingClientRect();
      const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
      pinchRef.current = {
        startDistance: Math.max(1, distance(event.touches)),
        startScale: pixelsPerSecond,
        anchorTime: (element.scrollLeft + midpointX) / pixelsPerSecond,
        midpointX,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const nextScale = Math.min(176, Math.max(32, pinch.startScale * distance(event.touches) / pinch.startDistance));
      setPixelsPerSecond(nextScale);
      element.scrollLeft = pinch.anchorTime * nextScale - pinch.midpointX;
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

  const sceneDurations = orderedScenes.map((scene) => {
    const instance = value?.sceneInstances?.find((item) => item.sceneId === scene.id);
    const range = value?.sceneRanges?.[scene.id];
    const sourceIn = Math.max(0, Number(range?.sourceIn ?? instance?.sourceIn ?? 0));
    const sourceOut = Math.max(sourceIn + 0.1, Number(range?.sourceOut ?? instance?.sourceOut ?? scene.duration));
    return Math.min(Math.max(0.1, sourceOut - sourceIn), Math.max(0.1, scene.duration));
  });
  const totalDuration = Math.max(1, sceneDurations.reduce((sum, duration) => sum + duration, 0));
  const timelineWidth = totalDuration * pixelsPerSecond;
  const leadingSpace = viewportWidth / 2;
  const rulerTicks = Array.from({ length: Math.floor(totalDuration) + 1 }, (_, second) => second);

  const toolbar = (
    <nav
      className="master-editor-bottom-nav fixed inset-x-0 bottom-0 z-[100] flex w-screen max-w-none items-center gap-2 pt-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-3">
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
      <div
        ref={scrollRef}
        className="master-timeline-scroll relative h-full min-h-0 w-full flex-1 overflow-auto"
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
                {orderedScenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    title={scene.title}
                    className="flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--vyra-accent-primary)]/50 bg-[var(--vyra-accent-primary)]/10 px-2"
                    style={{ width: Math.max(8, sceneDurations[index] * pixelsPerSecond) }}
                  >
                    <span className="truncate text-[10px] font-medium text-[var(--vyra-text-secondary)]">{scene.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div aria-hidden="true" style={{ width: leadingSpace, flex: '0 0 auto' }} />
          </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-10 w-px -translate-x-1/2 bg-[var(--vyra-accent-primary)]"
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-b-sm bg-[var(--vyra-accent-primary)]" />
        </div>
      {typeof document !== 'undefined' ? createPortal(toolbar, document.body) : null}
    </div>
  );
};
