import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Project Chat has no selected-Vyral Asset handoff or DNA inventory tools', () => {
  const app = read('src/App.tsx');
  const workspace = read('src/components/workspace/WorkspacePage.tsx');
  const chat = read('src/components/ai/AIChatPage.tsx');
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const registry = read('src/server/vyraAiCapabilityRegistry.ts');

  for (const source of [app, workspace, chat]) {
    assert.doesNotMatch(source, /VyralChatAssetContext|initialSelectedAssets|onSelectedAssetsChange|pendingChatAssets|selectedAssets/);
  }
  assert.doesNotMatch(edge, /VYRAL_READ_TOOLS|executeVyralReadTool|list_my_vyrals|get_my_vyral_details|activeVyralInstruction/);
  assert.doesNotMatch(registry, /define\('vyral'|define\('assets'/);
  assert.doesNotMatch(edge, /'vyral\.list'|'asset\.list'|'vyral\.propose_create'|'asset\.propose_upload'/);
});

test('Project Chat retains only the active Storyboard and Editor read tools', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /const GLOBAL_READ_TOOLS = \[/);
  assert.match(edge, /name: 'list_my_storyboards'/);
  assert.match(edge, /name: 'get_my_storyboard_details'/);
  assert.match(edge, /name: 'get_master_timeline_state'/);
  assert.match(edge, /tools: GLOBAL_READ_TOOLS/);
});
