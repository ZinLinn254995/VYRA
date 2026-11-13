import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('OpenAI Edge Function streams SSE and keeps provider credentials server-side', () => {
  const source = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(source, /createSupabaseContext\(request,\s*\{\s*auth:\s*'user'\s*\}\)/);
  assert.match(source, /get_vyra_openai_secret/);
  assert.match(source, /stream:\s*true/);
  assert.match(source, /stream_options:\s*\{\s*include_usage:\s*true\s*\}/);
  assert.match(source, /text\/event-stream/);
  assert.match(source, /slice\(-20\)/);
  assert.match(source, /totalChars > 30000/);
});

test('Authenticated server route forwards SSE incrementally with backpressure', () => {
  const source = read('src/server/ai.ts');
  assert.match(source, /Accept:\s*payload\.stream === true \? 'text\/event-stream'/);
  assert.match(source, /const wantsStream = body\.stream === true/);
  assert.match(source, /response\.body\.getReader\(\)/);
  assert.match(source, /res\.write\(decoder\.decode\(value, \{ stream: true \}\)\)/);
  assert.match(source, /res\.once\('close', cancelOnClose\)/);
});

test('Browser service parses OpenAI SSE deltas and usage without replacing the Vyral Vision path', () => {
  const source = read('src/services/aiService.ts');
  assert.match(source, /Accept:\s*'text\/event-stream'/);
  assert.match(source, /payload === '\[DONE\]'/);
  assert.match(source, /request\.onTextDelta\?\.\(chunk\)/);
  assert.match(source, /promptTokens:\s*event\.usage\.prompt_tokens/);
  assert.match(source, /if \(request\.visionImages\?\.length\)/);
});

test('AI Chat preserves partial streamed text on errors and keeps retry in the existing message actions', () => {
  const source = read('src/components/ai/AIChatPage.tsx');
  assert.match(source, /streamedText \+= chunk/);
  assert.match(source, /result\.status === 'error' && streamedText/);
  assert.match(source, /streamedText \+ '\\n\\n' \+ result\.content/);
  assert.match(source, /previousUserMessage/);
  assert.match(source, /sendMessage\(previousUserMessage\.content\)/);
});

test('Vyral AI tools are read-only, bounded and scoped to the authenticated owner and active Vyral', () => {
  const source = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(source, /const VYRAL_READ_TOOLS = \[/);
  assert.match(source, /name: 'search_vyral_assets'/);
  assert.match(source, /name: 'get_vyral_asset_details'/);
  assert.match(source, /name: 'list_vyral_asset_relationships'/);
  assert.match(source, /executeVyralReadTool\([\s\S]*?userId,[\s\S]*?activeVyralId/);
  assert.match(source, /\.eq\('vyral_id', vyralId\)\.eq\('user_id', userId\)/);
  assert.match(source, /parallel_tool_calls: false/);
  assert.match(source, /name: 'propose_master_timeline_edit'/);
  assert.match(source, /timeline\.move_clip/);
  assert.match(source, /timeline\.split_clip/);
  assert.match(source, /timeline\.update_clip/);
  assert.match(source, /applyMasterTimelineEdit\(timeline, parameters\)/);
  assert.match(source, /assistantTurn\.tool_calls\.filter\(\(call\) =>.*\.slice\(0, 3\)/);
  assert.match(source, /max\(1, Math\.min\(20, requestedLimit\)\)/);
  assert.match(source, /const validAssetId = \/\^\[0-9a-f\]/);
  assert.match(source, /assetId && !validAssetId/);
  assert.doesNotMatch(source, /name: '(?:delete|update|create|publish|generate)_/);
  assert.match(source, /data: ' \+ chunk \+ '\\n\\ndata: \[DONE\]\\n\\n'/);
});

test('VYRA interprets free-form multilingual intent and formats active context with real newlines', () => {
  const source = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(source, /Interpret meaning rather than matching fixed phrases/);
  assert.match(source, /paraphrases, indirect requests, casual Burmese, English, and mixed-language instructions/);
  assert.match(source, /activeVyralInstruction =\s*'\\n\\nCurrent user-selected Vyral context/);
  assert.doesNotMatch(source, /activeVyralInstruction =\s*'\\\\n/);
});
