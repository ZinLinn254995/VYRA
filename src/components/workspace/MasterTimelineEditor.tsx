import React from 'react';
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
export const MasterTimelineEditor: React.FC<Props> = () => (
  <div className="relative min-h-[420px] w-full pb-20 pt-6">
    <nav
      className="master-editor-bottom-nav sticky bottom-0 z-20 -mx-4 flex w-[calc(100%+2rem)] max-w-none items-center gap-2 border-t border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2 shadow-[0_-6px_18px_rgba(0,0,0,0.06)] sm:-mx-5 sm:w-[calc(100%+2.5rem)]"
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
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
  </div>
);
