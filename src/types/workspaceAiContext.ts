export type WorkspaceAiContext = {
  /** Local-only evaluation snapshot. AIService strips this before sending prompt context to the server. */
  continuityRuntime?: {
    storyboardId: string;
    sceneIds: string[];
    scenes?: Array<{
      id: string; title: string; description?: string;
      creativeDirection?: {
        productionTitle?: string; logline?: string; genre?: string; tone?: string;
        sceneIndex?: number; sceneCount?: number; purpose?: string; location?: string;
        characters?: string[]; entryState?: string; action?: string; exitState?: string;
        shots?: Array<{
          id: string; purpose: string; durationSeconds: number; framing: string; cameraAngle: string;
          cameraMovement: string; composition: string; lighting: string; focus: string; sound: string;
          action: string; continuityNotes: string[];
        }>;
      };
    }>;
    ledger: unknown;
    initialEntryState?: Record<string, unknown> | null;
  } | null;
  page: 'storyboards' | 'storyboard-editor' | 'scene-editor' | 'my-vyrals';
  pageLabel: string;
  activeStoryboard?: {
    id: string;
    title: string;
    topic: string;
    sceneCount: number;
    sceneTitles: string[];
  } | null;
  editorView?: 'scenes' | 'master' | 'chat' | 'storage';
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
  activeSceneDirectorShots?: Array<{ shotId: string; shotIndex: number; assetId: string; assetVersionId: string; mimeType: string }>;
  /** Prior repair outcomes for this Scene; diagnostic evidence only, never canon. */
  activeSceneRepairHistory?: Array<{ shotIndex: number; outcome: 'verified' | 'needs_review'; createdAt: string; baselineRevision: string | null; checkedBoundaryIndices: number[]; findings: string[]; approvedCostUsd: number }>;
  selectedTimelineItem?: {
    kind: 'scene' | 'transition' | 'text-clip' | 'audio-clip';
    id: string;
    trackId?: string;
    label?: string;
  } | null;
  capturedAt: string;
};
