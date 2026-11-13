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

test('OpenAI health checks verify the configured key server-side without returning it', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const route = read('src/server/ai.ts');
  const service = read('src/services/aiService.ts');
  const studio = read('src/context/StudioContext.tsx');
  assert.match(edge, /body\.healthCheck === true/);
  assert.match(edge, /https:\/\/api\.openai\.com\/v1\/models/);
  assert.match(edge, /status: 'connected'/);
  assert.match(edge, /status: 'preview_mode'/);
  assert.match(edge, /status: 'error'/);
  assert.match(route, /callOpenAIChatFunction\(bearer\[1\], \{ healthCheck: true \}\)/);
  assert.match(service, /Authorization: 'Bearer ' \+ accessToken/);
  assert.match(studio, /aiService\.checkStatus\(authSession\.access_token\)/);
});

test('Authenticated server route forwards SSE incrementally with backpressure', () => {
  const source = read('src/server/ai.ts');
  assert.match(source, /Accept:\s*payload\.stream === true \? 'text\/event-stream'/);
  assert.match(source, /const wantsStream = body\.stream === true/);
  assert.match(source, /response\.body\.getReader\(\)/);
  assert.match(source, /res\.write\(decoder\.decode\(value, \{ stream: true \}\)\)/);
  assert.match(source, /res\.once\('close', cancelOnClose\)/);
});

test('Browser service parses OpenAI SSE deltas and never routes media requests to Gemini', () => {
  const source = read('src/services/aiService.ts');
  assert.match(source, /Accept:\s*'text\/event-stream'/);
  assert.match(source, /payload === '\[DONE\]'/);
  assert.match(source, /request\.onTextDelta\?\.\(chunk\)/);
  assert.match(source, /promptTokens:\s*event\.usage\.prompt_tokens/);
  assert.match(source, /request\.visionImages\?\.length \|\| request\.mediaFiles\?\.length/);
});

test('AI Chat preserves partial streamed text on errors and keeps retry in the existing message actions', () => {
  const source = read('src/components/ai/AIChatPage.tsx');
  assert.match(source, /streamedText \+= chunk/);
  assert.match(source, /result\.status === 'error' && streamedText/);
  assert.match(source, /streamedText \+ '\\n\\n' \+ result\.content/);
  assert.match(source, /previousUserMessage/);
  assert.match(source, /sendMessage\(previousUserMessage\.content\)/);
});

test('Active global Chat uses the authenticated platform-managed OpenAI service, not customer BYOK', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const service = read('src/services/aiService.ts');
  const legacyStudio = read('src/context/StudioContext.tsx');
  assert.match(page, /getCurrentAccessToken\(\)/);
  assert.match(page, /aiService\.generateResponse\(\{/);
  assert.doesNotMatch(page, /openrouter|gemini/i);
  assert.match(service, /Authorization:\s*'Bearer ' \+ request\.accessToken/);
  assert.match(service, /private endpoint = '\/api\/ai\/chat'/);
  assert.doesNotMatch(legacyStudio, /Google Gemini|gemini-[0-9]|vyra_openrouter_key_session/i);
  assert.match(legacyStudio, /providerName: 'OpenAI \(VYRA Platform\)'/);
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
  assert.ok(source.includes("enum: ['add_text', 'add_audio', 'attach_video', 'move', 'trim', 'split', 'clone', 'update_text', 'delete']"));
  assert.ok(source.includes("addMasterTimelineAudioAssetClip"));
  assert.ok(source.includes("timeline.add_audio"));
  assert.ok(source.includes(".eq('vyral_id', activeVyralId).eq('user_id', userId)"));
  assert.ok(source.includes("if (timelineOperation === 'add_audio')"));
  assert.ok(source.includes("audioAssetVersionId"));
  assert.ok(source.includes("assetVersionId"));
  assert.match(source, /enum: \['add_text', 'add_audio', 'attach_video', 'move', 'trim', 'split', 'clone', 'update_text', 'delete'\]/);
  assert.match(source, /addMasterTimelineTextClip/);
  assert.match(source, /timeline\.add_text/);
  assert.match(source, /timelineOperation === 'add_text'/);
  assert.match(source, /Text overlays need non-empty copy/);
  assert.match(source, /name: 'propose_scene_reorder'/);
  assert.match(source, /'title', 'description', 'transition', 'duration'/);
  assert.match(source, /args\.value < 0\.1 \|\| args\.value > 3600/);
  assert.match(source, /timeline: \{ \.\.\.oldTimeline, duration, tracks \}/);
  assert.match(source, /sourceOut: Number\(item\.duration\) \|\| 0/);
  assert.match(source, /sceneRanges: \{\}/);
  assert.match(source, /name: 'propose_scene_mutation'/);
  assert.match(source, /enum: \['create', 'duplicate', 'delete'\]/);
  assert.match(source, /scene\.create/);
  assert.match(source, /const createdScene = operation === 'create'/);
  assert.match(source, /parameters\.createdScene/);
  assert.match(source, /sceneCreated: isSceneCreate/);
  assert.match(source, /createSceneMutationProposal/);
  assert.match(source, /scene\.duplicate/);
  assert.match(source, /scene\.delete/);
  assert.match(source, /DELETE SCENE \[0-9A-F\]/);
  assert.match(source, /deletedSceneSnapshot/);
  assert.match(source, /sceneDuplicated: isSceneDuplicate/);
  assert.match(source, /sceneDeleted: isSceneDelete/);
  assert.match(source, /createSceneReorderProposal/);
  assert.match(source, /scene\.reorder/);
  assert.match(source, /sceneOrderChanged/);
  assert.match(source, /SCENE_ORDER_STALE/);
  assert.match(source, /timeline\.move_clip/);
  assert.match(source, /timeline\.split_clip/);
  assert.match(source, /timeline\.update_clip/);
  assert.match(source, /timeline\.add_clip/);
  assert.match(source, /cloneMasterTimelineClip/);
  assert.match(source, /deleteMasterTimelineClip/);
  assert.match(source, /timeline\.remove_clip/);
  assert.match(source, /confirmationPhrase/);
  assert.match(source, /General approvals do not authorize deletion/);
  assert.match(source, /timelineOperation === 'clone'/);
  assert.match(source, /name: 'propose_master_timeline_transition'/);
  assert.match(source, /transitionBoundaries: orderedScenes\.slice\(0, -1\)/);
  assert.match(source, /timeline\.add_transition/);
  assert.match(source, /applyMasterTimelineEdit\(timeline, parameters, validTransitionKeys\)/);
  assert.match(source, /updateMasterTimelineTransition/);
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

test('AI Audio Asset Timeline insertion derives duration and waveform from source-version SHA-bound metadata', () => {
  const source = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(source, /audio_technical_metadata/);
  assert.match(source, /audioTechnical\.sourceSha256 !== audioVersion\.sha256/);
  assert.match(source, /durationSeconds/);
  assert.match(source, /waveformPeaks/);
  assert.match(source, /duration: audioDuration/);
  assert.match(source, /source-version-verified duration metadata/);
});


test('AI Scene Video attachment is owner-scoped, version-verified, approval-gated, and read back', () => {
  const source = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.ok(source.includes("enum: ['add_text', 'add_audio', 'attach_video'"));
  assert.ok(source.includes(".eq('asset_type', 'video')"));
  assert.ok(source.includes('video_technical_metadata'));
  assert.ok(source.includes('videoTechnical.sourceSha256 !== videoVersionResult.data.sha256'));
  assert.ok(source.includes('timeline.attach_video'));
  assert.ok(source.includes('attachMasterTimelineVideoAsset'));
  assert.ok(source.includes('VIDEO_ASSET_VERSION_CHANGED'));
  assert.ok(source.includes('attachedVideoAssetVersionId'));
  assert.ok(source.includes("assetVersionId: typeof instance.assetVersionId === 'string'"));
});

test('OpenAI platform key management is restricted to platform owners and admins', () => {
  const providerSource = read('supabase/functions/manage-openai-api-key/index.ts');
  const settingsSource = read('src/components/profile/ApiKeySettings.tsx');
  assert.match(providerSource, /from\('platform_admins'\)\.select\('role'\)/);
  assert.match(providerSource, /!\['owner', 'admin'\]\.includes\(admin\.role\)/);
  assert.match(providerSource, /Administrator access is required to manage platform AI providers/);
  assert.match(settingsSource, /response\.status === 403/);
  assert.match(settingsSource, /Administrator access required/);
  assert.match(providerSource, /get_vyra_openai_secret/);
  assert.match(providerSource, /set_vyra_openai_secret/);
});

test('Global AI Chat routes supported text conversations only through OpenAI', () => {
  const server = read('src/server/ai.ts');
  const browser = read('src/services/aiService.ts');
  assert.match(server, /callOpenAIChatFunction\(bearer\[1\]/);
  assert.match(server, /OPENAI_MULTIMODAL_NOT_ENABLED/);
  assert.match(server, /AI_TASK_NOT_ENABLED/);
  assert.doesNotMatch(server, /gemini|Google Gemini/i);
  assert.doesNotMatch(browser, /Google Gemini|gemini-[0-9]/i);
  assert.match(browser, /providerName: 'OpenAI'/);
  assert.match(browser, /request\.visionImages\?\.length \|\| request\.mediaFiles\?\.length/);
});
