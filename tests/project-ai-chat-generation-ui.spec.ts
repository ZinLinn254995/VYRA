import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
const storageTab = readFileSync(new URL('../src/components/workspace/ProjectStorageTab.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/components/workspace/MasterTimelineEditor.tsx', import.meta.url), 'utf8');

test('Project workspace exposes only Storage, Chat and Editor', () => {
  assert.match(workspace, /useState<'master' \| 'chat' \| 'storage'>\('chat'\)/);
  assert.match(workspace, />Chat<\/button>/);
  assert.match(workspace, />Editor<\/button>/);
  assert.match(workspace, />Storage<\/button>/);
  assert.doesNotMatch(workspace, /StoryboardUniverseTab|storyboardUniverse|My Universes/);
  assert.doesNotMatch(workspace, /Project Details|projectDetailSuggestions|Suggest with AI/);
  assert.match(workspace, /<ProjectStorageTab projectId=\{activeStoryboard\.id\}/);
  assert.match(workspace, /<MasterTimelineEditor/);
});

test('Project Chat receives the active Project identity and its current workspace context', () => {
  assert.match(workspace, /<AIChatPage[\s\S]*?storyboardId=\{activeStoryboard\.id\}/);
  assert.match(chat, /storyboardId\?: string/);
  assert.match(chat, /workspaceContext/);
});

test('Project Storage remains a generic file manager with no Vyral creation workflow', () => {
  assert.match(storageTab, /import \{ ProjectStoragePage \} from '\.\/ProjectStoragePage'/);\n  assert.match(storageTab, /<ProjectStoragePage[\s\S]*?projectId=\{projectId\}/);
  assert.doesNotMatch(storageTab, /from\('vyrals'\)|from\('vyral_assets'\)|DNA|Fingerprint|Universe/);
});

test('Editor retains timeline media editing and playback surfaces', () => {
  assert.match(editor, /export type TimelineClip/);
  assert.match(editor, /buildMasterTimelineAudioPlaybackPlan/);
  assert.match(editor, /buildMasterTimelineVideoPlaybackPlan/);
  assert.match(editor, /buildMasterTimelineTextOverlay/);
});
