import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Crop,
  Copy,
  Gauge,
  Layers,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Sparkles,
  Trash2,
  Type,
  Undo2,
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
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const pixelsPerSecondRef = useRef(80);
  const pinchRef = useRef<{ startDistance: number; startScale: number; anchorTime: number } | null>(null);

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

  useEffect(() => {
    setSelectedSceneIds((current) => current.filter((id) => scenes.some((scene) => scene.id === id)));
  }, [scenes]);

  const orderedScenes = useMemo(() => {
    const instances = value?.sceneInstances || [];
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const ordered = instances
      .map((instance) => byId.get(instance.sceneId))
      .filter((scene): scene is Scene => Boolean(scene));
    const included = new Set(ordered.map((scene) => scene.id));
    return [...ordered, ...scenes.filter((scene) => !included.has(scene.id))];
  }, [scenes, value?.sceneInstances]);

  // Timeline scenes are the same immutable-duration scenes shown in the
  // Scenes tab. Trimming and splitting are intentionally not supported.
  const sceneSegments = orderedScenes.map((scene) => ({
    sourceIn: 0,
    sourceOut: scene.duration,
    duration: Math.max(0.1, scene.duration),
  }));
  const sceneDurations = sceneSegments.map((segment) => segment.duration);
  const totalDuration = Math.max(1, sceneDurations.reduce((sum, duration) => sum + duration, 0));
  const timelineWidth = totalDuration * pixelsPerSecond;
  const leadingSpace = viewportWidth / 2;
  const rulerTicks = Array.from({ length: Math.floor(totalDuration) + 1 }, (_, second) => second);

  const selectedScenes = orderedScenes.filter((scene) => selectedSceneIds.includes(scene.id));
  const transitionOptions = [
    { label: 'Dissolve', value: 'dissolve' },
    { label: 'Fade', value: 'fade' },
    { label: 'Wipe', value: 'wipe' },
    { label: 'Slide', value: 'slide' },
    { label: 'Zoom', value: 'zoom' },
    { label: 'Blur', value: 'blur' },
  ];
  const selectedTransition = selectedTransitionKey ? value?.transitions?.[selectedTransitionKey] : undefined;
  const applyTransition = (effect: string) => {
    if (!selectedTransitionKey) return;
    onChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: {
        ...(value?.transitions || {}),
        [selectedTransitionKey]: { effect, duration: selectedTransition?.duration ?? 0.5 },
      },
      audioTracks: value?.audioTracks || [],
      textTracks: value?.textTracks || [],
    });
  };
  const runCloneSelected = () => {
    selectedScenes.forEach((scene) => {
      const index = orderedScenes.findIndex((item) => item.id === scene.id);
      onSceneDuplicate(scene, index + 1);
    });
    setSelectedSceneIds([]);
  };
  const runDeleteSelected = () => {
    selectedScenes.forEach((scene) => onSceneDelete(scene.id));
    setSelectedSceneIds([]);
  };

  const toolbar = (
    <nav
      className="master-editor-bottom-nav relative z-20 flex w-full shrink-0 items-center justify-center gap-2 px-3 pt-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll mx-auto flex w-max max-w-full min-w-0 items-center justify-start gap-2 overflow-x-auto px-0">
        {selectedTransitionKey ? (
          transitionOptions.map(({ label, value: effect }) => (
            <button
              key={effect}
              type="button"
              title={`${label} transition`}
              aria-label={`${label} transition`}
              aria-pressed={(selectedTransition?.effect || 'dissolve') === effect}
              onClick={() => applyTransition(effect)}
              className={`flex h-14 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-medium transition-colors ${(selectedTransition?.effect || 'dissolve') === effect ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/15 text-[var(--vyra-text-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] hover:border-[var(--vyra-accent-primary)]'}`}
            >
              {label}
            </button>
          ))
        ) : selectedSceneIds.length > 0 ? (
          <>
            <button type="button" title="Clone selected scenes" aria-label="Clone selected scenes" onClick={runCloneSelected} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
              <Copy size={22} strokeWidth={1.8} />
              <span className="sr-only">Clone</span>
            </button>
            <button type="button" title="Delete selected scenes" aria-label="Delete selected scenes" onClick={runDeleteSelected} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-danger)] transition-colors hover:border-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]">
              <Trash2 size={22} strokeWidth={1.8} />
              <span className="sr-only">Delete</span>
            </button>
          </>
        ) : toolbarItems.map(({ label, Icon }) => (
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
          onClick={(event) => {
            if (!(event.target as HTMLElement).closest("button")) {
              setSelectedSceneIds([]);
              setSelectedTransitionKey(null);
            }
          }}
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
              <div className="relative flex h-16 items-center gap-0 py-2">
                {orderedScenes.map((scene, index) => {
                  const segment = sceneSegments[index];
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      title={scene.title}
                      aria-pressed={selectedSceneIds.includes(scene.id)}
                      onClick={() => {
                        setSelectedTransitionKey(null);
                        setSelectedSceneIds((current) => current[0] === scene.id ? [] : [scene.id]);
                      }}
                      className={`group relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-md border px-3 transition-colors ${selectedSceneIds.includes(scene.id) ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/25 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-accent-primary)]/50 bg-[var(--vyra-accent-primary)]/10'}`}
                      style={{ width: Math.max(24, segment.duration * pixelsPerSecond) }}
                    >
                      <span className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-[var(--vyra-text-secondary)]">{scene.title}</span>
                    </button>
                  );
                })}
                {orderedScenes.slice(0, -1).map((scene, index) => {
                  const nextScene = orderedScenes[index + 1];
                  const transitionKey = `${scene.id}:${nextScene.id}`;
                  const boundary = sceneSegments.slice(0, index + 1).reduce((sum, segment) => sum + segment.duration, 0) * pixelsPerSecond;
                  const hiddenBySceneSelection = selectedSceneIds.includes(scene.id) || selectedSceneIds.includes(nextScene.id);
                  if (hiddenBySceneSelection) return null;
                  const transition = value?.transitions?.[transitionKey];
                  const effectLabel = transitionOptions.find((option) => option.value === transition?.effect)?.label || transition?.effect;
                  const isSelected = selectedTransitionKey === transitionKey;
                  return (
                    <button
                      key={transitionKey}
                      type="button"
                      title={transition ? `Edit ${effectLabel} transition` : 'Add transition'}
                      aria-label={`${transition ? `Edit ${effectLabel} transition` : 'Add transition'} between ${scene.title} and ${nextScene.title}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedSceneIds([]);
                        setSelectedTransitionKey(transitionKey);
                      }}
                      className={`absolute top-1/2 z-10 inline-flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors ${transition ? 'px-2 text-[10px] font-semibold' : 'w-7 p-0'} ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-white' : transition ? 'border-[var(--vyra-accent-primary)]/60 bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)] hover:border-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-muted)] hover:border-[var(--vyra-accent-primary)] hover:text-[var(--vyra-text-primary)]'}`}
                      style={{ left: boundary }}
                    >
                      {transition ? effectLabel : <Plus aria-hidden="true" className="block shrink-0" size={18} strokeWidth={1.6} />}
                    </button>
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
