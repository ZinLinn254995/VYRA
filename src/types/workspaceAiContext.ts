export type WorkspaceSceneStateProposalHandoff = {
  id: string;
  storyboardId: string;
  sceneId: string;
  ledger: unknown;
  /** Exact ledger snapshot used during evaluation; prevents stale AI handoffs overwriting newer edits. */
  evaluatedAgainstLedger: unknown;
  validationStatus: 'consistent' | 'needs_review';
  violations: Array<{ path: string; kind: string; reason: string }>;
  capturedAt: string;
};

export type WorkspaceAiContext = {
  /** Local-only evaluation snapshot. AIService strips this before sending prompt context to the server. */
  continuityRuntime?: {
    storyboardId: string;
    sceneIds: string[];
    ledger: unknown;
    initialEntryState?: Record<string, unknown> | null;
  } | null;
  page: 'storyboards' | 'storyboard-editor' | 'scene-editor' | 'my-vyrals' | 'my-media-library';
  pageLabel: string;
  activeStoryboard?: {
    id: string;
    title: string;
    topic: string;
    sceneCount: number;
    sceneTitles: string[];
  } | null;
  editorView?: 'scenes' | 'master' | 'chat' | 'universe';
  storyboardUniverse?: { id: string; name: string; description: string } | null;
  selectedSceneIds?: string[];
  selectedSceneTitles?: string[];
  activeSceneId?: string | null;
  activeSceneTitle?: string | null;
  /** Current Scene description, bounded and treated as user-authored context rather than canon. */
  activeSceneDescription?: string | null;
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
