import React, { useEffect, useRef } from 'react';
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
  ZoomIn,
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
  { label: 'Zoom', Icon: ZoomIn },
];

/**
 * Master Editor toolbar shell. Editing actions are intentionally visual-only
 * while the timeline and editing engine are being built.
 */
export const MasterTimelineEditor: React.FC<Props> = () => {
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let gesture: 'pending' | 'horizontal' | 'vertical' = 'pending';

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        gesture = 'vertical';
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startScrollLeft = element.scrollLeft;
      gesture = 'pending';
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || gesture === 'vertical') return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (gesture === 'pending') {
        if (Math.abs(deltaX) < 7 && Math.abs(deltaY) < 7) return;
        gesture = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }

      if (gesture === 'horizontal') {
        event.preventDefault();
        element.scrollLeft = startScrollLeft - deltaX;
      }
    };

    const resetGesture = () => {
      gesture = 'pending';
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', resetGesture, { passive: true });
    element.addEventListener('touchcancel', resetGesture, { passive: true });

    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', resetGesture);
      element.removeEventListener('touchcancel', resetGesture);
    };
  }, []);

  return (
    <div className="relative flex min-h-[420px] w-full items-end justify-center pb-4 pt-6">
      <div className="sticky bottom-3 z-10 w-full max-w-full">
        <div
          ref={toolbarRef}
          className="master-editor-toolbar-scroll flex w-full max-w-full items-center gap-3 overflow-x-auto px-3 py-2"
          aria-label="Master Editor tools"
        >
          {toolbarItems.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              className="grid size-16 shrink-0 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)] shadow-sm transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
            >
              <Icon size={24} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
