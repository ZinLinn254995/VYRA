import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');

test('Project AI Chat exposes media creation without changing global chat composer behavior', () => {
  assert.ok(chat.includes('generateRunwayProjectMedia'));
  assert.ok(chat.includes('listRunwayProjectMediaRecovery'));
  assert.ok(chat.includes('recoverRunwayProjectMediaJob'));
  assert.ok(chat.includes('{storyboardId && ('));
  assert.ok(chat.includes('Create media'));
  assert.ok(chat.includes('Generate in this Project'));
  assert.ok(chat.includes("targetVyralId: storyboardUniverseId"));
  assert.ok(chat.includes('input: { promptText: prompt }'));
  assert.ok(chat.includes('sceneContext: workspaceContext ?'));
  assert.ok(chat.includes('sceneContinuity: workspaceContext.sceneContinuity'));
  assert.ok(chat.includes('selectedTimelineItem: workspaceContext.selectedTimelineItem'));
  assert.ok(chat.includes('editorView: workspaceContext.editorView'));
});

test('media generation requires a creator-set budget and explicit quote approval', () => {
  assert.ok(chat.includes('Maximum budget (USD)'));
  assert.ok(chat.includes('const budget = Number(mediaBudgetUsd)'));
  assert.ok(chat.includes('requestApproval: async (quote)'));
  assert.ok(chat.includes('window.confirm(details)'));
  assert.ok(chat.includes('Credits are reserved only after approval.'));
});

test('Project media progress distinguishes ready, pending and reconciliation states', () => {
  assert.ok(chat.includes("result.status === 'ready'"));
  assert.ok(chat.includes("result.status === 'submitted_pending'"));
  assert.ok(chat.includes("result.status === 'reconciliation_required'"));
  assert.ok(chat.includes('passed DNA / Fingerprint verification'));
});

test('media polling is aborted when the chat component unmounts', () => {
  assert.ok(chat.includes('mediaRequestControllerRef.current?.abort()'));
});

test('generated Project media is previewed in chat while only stable Asset references are persisted', () => {
  assert.ok(chat.includes('type ProjectMediaPreview'));
  assert.ok(chat.includes('message.mediaAssets.map'));
  assert.ok(chat.includes('<img src={asset.url}'));
  assert.ok(chat.includes('<video src={asset.url}'));
  assert.ok(chat.includes('<audio src={asset.url}'));
  assert.ok(chat.includes("createSignedUrl(asset.storage_path, 3600)"));
  assert.ok(chat.includes("createSignedUrl(asset.storagePath, 3600)"));
  assert.ok(chat.includes('mediaAssets: message.mediaAssets.map(({ assetId, name, mimeType }) => ({ assetId, name, mimeType }))'));
  assert.ok(!chat.includes('mediaAssets: message.mediaAssets.map((asset) => ({ ...asset, url: asset.url }))'));
});

test('Project editor has no redundant Scenes tab; scene operations stay inside Master Editor', () => {
  assert.ok(!workspace.includes("storyboardEditorView === 'scenes'"));
  assert.ok(!workspace.includes(">Scenes</button>"));
  assert.ok(workspace.includes("<MasterTimelineEditor"));
  assert.ok(workspace.includes("onSceneOrderChange="));
  assert.ok(workspace.includes("onSceneDuplicate="));
  assert.ok(workspace.includes("onSceneDelete="));
  assert.ok(workspace.includes("useState<'master' | 'chat' | 'universe'>('chat')"));
});
