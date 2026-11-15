export type WorkspaceAiContext = {
  page: 'storyboards' | 'storyboard-editor' | 'scene-editor' | 'my-vyrals' | 'my-media-library';
  pageLabel: string;
  activeStoryboard?: {
    id: string;
    title: string;
    topic: string;
    sceneCount: number;
    sceneTitles: string[];
  } | null;
  editorView?: 'scenes' | 'master';
  selectedSceneIds?: string[];
  selectedSceneTitles?: string[];
  activeSceneId?: string | null;
  activeSceneTitle?: string | null;
  /** Small, creator-approved continuity handoff for the active Scene; context only, never authorization. */
  sceneContinuity?: {
    previousSceneId: string | null;
    previousSceneApproved: boolean;
    entrySnapshotStale: boolean;
    previousExitState: Record<string, unknown> | null;
    currentEntryState: Record<string, unknown> | null;
    intendedChanges: Array<{ path: string; value: unknown; reason: string }>;
    contextComplete: boolean;
    validationStatus: 'not_evaluated' | 'needs_review' | 'consistent' | 'creator_approved';
  } | null;
  selectedTimelineItem?: {
    kind: 'scene' | 'transition' | 'text-clip' | 'audio-clip';
    id: string;
    trackId?: string;
    label?: string;
  } | null;
  capturedAt: string;
};
