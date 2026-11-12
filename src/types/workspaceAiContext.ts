export type WorkspaceAiContext = {
  page: 'storyboards' | 'storyboard-editor' | 'my-vyrals' | 'my-media-library';
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
  selectedTimelineItem?: {
    kind: 'scene' | 'transition' | 'text-clip' | 'audio-clip';
    id: string;
    trackId?: string;
    label?: string;
  } | null;
  capturedAt: string;
};
