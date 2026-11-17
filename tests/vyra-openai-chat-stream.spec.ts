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
  const adminSettings = read('src/components/profile/ApiKeySettings.tsx');
  assert.match(edge, /body\.healthCheck === true/);
  assert.match(edge, /https:\/\/api\.openai\.com\/v1\/models/);
  assert.match(edge, /status: 'connected'/);
  assert.match(edge, /status: 'preview_mode'/);
  assert.match(edge, /status: 'error'/);
  assert.match(route, /callOpenAIChatFunction\(bearer\[1\], \{ healthCheck: true \}\)/);
  assert.match(service, /Authorization: 'Bearer ' \+ accessToken/);
  assert.match(adminSettings, /\/api\/providers\/openai\/settings/);
  assert.match(adminSettings, /Authorization: 'Bearer ' \+ token/);
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
  assert.ok(source.includes('if (request.mediaFiles?.length)'));
});

test('OpenAI Vision validates bounded Project image previews and attaches them to the latest user turn', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const service = read('src/services/aiService.ts');
  assert.match(edge, /rawVisionImages/);
  assert.ok(edge.includes('rawVisionImages.length > 4'));
  assert.match(edge, /820_000/);
  assert.match(edge, /3_300_000/);
  assert.ok(edge.includes('!/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)'));
  assert.match(edge, /type: 'image_url'/);
  assert.match(edge, /latestUserIndex/);
  assert.ok(edge.includes("url: 'data:' + item.mimeType + ';base64,' + item.data"));
  assert.ok(service.includes('if (request.mediaFiles?.length)'));
  assert.ok(!service.includes('request.visionImages?.length || request.mediaFiles?.length'));
  assert.ok(service.includes('request.visionImages?.length ? { visionImages: request.visionImages }'));
});

test('OpenAI Vision keeps PDF and audio inspection explicitly disabled', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const service = read('src/services/aiService.ts');
  assert.match(edge, /DOCUMENT_AUDIO_CONTEXT_NOT_ENABLED/);
  assert.match(service, /PDF and audio inspection are not enabled yet/);
});

test('AI Chat preserves partial streamed text on errors and keeps retry in the existing message actions', () => {
  const source = read('src/components/ai/AIChatPage.tsx');
  assert.match(source, /streamedText \+= chunk/);
  assert.match(source, /result\.status === 'error' && streamedText/);
  assert.match(source, /streamedText \+ '\\n\\n' \+ result\.content/);
  assert.match(source, /previousUserMessage/);
  assert.match(source, /sendMessage\(previousUserMessage\.content, previousUserMessage\.id\)/);
});

test('Active global Chat uses the authenticated platform-managed OpenAI service, not customer BYOK', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const service = read('src/services/aiService.ts');
  const server = read('src/server/ai.ts');
  assert.match(page, /getCurrentAccessToken\(\)/);
  assert.match(page, /aiService\.generateResponse\(\{/);
  assert.doesNotMatch(page, /openrouter|gemini/i);
  assert.match(service, /Authorization:\s*'Bearer ' \+ request\.accessToken/);
  assert.match(service, /private endpoint = '\/api\/ai\/chat'/);
  assert.doesNotMatch(server, /openrouter|x-openrouter-api-key/i);
  assert.match(server, /router\.post\('\/ai\/chat'/);
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

test('Global AI Chat routes text and visual requests through the platform OpenAI Vision path', () => {
  const server = read('src/server/ai.ts');
  const browser = read('src/services/aiService.ts');
  assert.ok(server.includes('callOpenAIChatFunction(bearer[1]'));
  assert.ok(server.includes('DOCUMENT_AUDIO_CONTEXT_NOT_ENABLED'));
  assert.ok(server.includes('visionImages.length ? { visionImages }'));
  assert.match(server, /AI_TASK_NOT_ENABLED/);
  assert.doesNotMatch(server, /gemini|Google Gemini/i);
  assert.doesNotMatch(browser, /Google Gemini|gemini-[0-9]/i);
  assert.match(browser, /providerName: 'OpenAI'/);
  assert.ok(browser.includes('if (request.mediaFiles?.length)'));
  assert.ok(browser.includes('request.visionImages?.length ? { visionImages: request.visionImages }'));
});


test('OpenAI browser stream supports explicit cancellation and reports truncated streams as retryable errors', () => {
  const service = read('src/services/aiService.ts');
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(service, /signal\?: AbortSignal/);
  assert.match(service, /signal: requestController\.signal/);
  assert.match(service, /request\.signal\?\.aborted/);
  assert.match(service, /cancelled: true/);
  assert.match(service, /if \(!finished\)/);
  assert.match(service, /connection ended before the response was complete/i);
  assert.match(page, /activeRequestControllerRef/);
  assert.match(page, /activeRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /signal: requestController\.signal/);
  assert.match(page, /result\.cancelled/);
  assert.match(page, /aria-label=\{isSending \? "Stop generation" : "Send message"\}/);
  assert.match(page, /type=\{isSending \? "button" : "submit"\}/);
  assert.match(page, /wasCancelled/);
});



test('OpenAI browser stream cancels the response reader after the terminal SSE event', () => {
  const service = read('src/services/aiService.ts');
  assert.match(service, /if \(finished \|\| streamError\) \{[\s\S]*?await reader\.cancel\(\)[\s\S]*?break;/);
  assert.match(service, /reader\.releaseLock\(\)/);
});

test('OpenAI browser stream has a bounded timeout distinct from user cancellation', () => {
  const service = read('src/services/aiService.ts');
  assert.match(service, /setTimeout\(\(\) => \{[\s\S]*?timedOut = true;[\s\S]*?requestController\.abort\(\);[\s\S]*?120_000/);
  assert.match(service, /signal: requestController\.signal/);
  assert.match(service, /if \(request\.signal\?\.aborted\)/);
  assert.match(service, /if \(timedOut\)/);
  assert.match(service, /This response took too long\. Please retry\./);
  assert.match(service, /clearTimeout\(timeoutId\)/);
  assert.match(service, /removeEventListener\('abort', abortFromCaller\)/);
});

test('Admin Dashboard exposes platform provider controls only under the Platform section', () => {
  const profile = read('src/components/profile/ProfilePage.tsx');
  const settings = read('src/components/profile/ApiKeySettings.tsx');
  assert.ok(profile.includes("title: 'Platform'"));
  assert.ok(profile.includes("label: 'Admin Dashboard'"));
  assert.ok(profile.includes("detail: 'Manage VYRA platform API keys'"));
  assert.ok(profile.includes("activePage === 'setting-ai'"));
  assert.ok(profile.includes('<ApiKeySettings />'));
  assert.ok(settings.includes("/api/providers/openai/settings"));
  assert.ok(settings.includes('Stored in Supabase Vault'));
  assert.ok(settings.includes('The saved key is never returned to the browser'));
});

test('OpenAI provider secret is Vault-backed and callable only by the server service role', () => {
  const migration = read('supabase/migrations/20261112172000_vyra_openai_api_key_vault.sql');
  const provider = read('supabase/functions/manage-openai-api-key/index.ts');
  for (const snippet of [
    'security definer',
    "set search_path = ''",
    'vault.create_secret',
    'vault.update_secret',
    'vault.decrypted_secrets',
    'revoke all on function public.set_vyra_openai_secret(text) from public, anon, authenticated',
    'revoke all on function public.get_vyra_openai_secret() from public, anon, authenticated',
    'grant execute on function public.set_vyra_openai_secret(text) to service_role',
    'grant execute on function public.get_vyra_openai_secret() to service_role',
  ]) assert.ok(migration.includes(snippet), 'Migration missing: ' + snippet);
  for (const snippet of [
    "createSupabaseContext(request, { auth: 'user' })",
    "from('platform_admins').select('role')",
    "!['owner', 'admin'].includes(admin.role)",
    'AbortSignal.timeout(12000)',
    "provider: 'openai'",
  ]) assert.ok(provider.includes(snippet), 'Provider function missing: ' + snippet);
  assert.doesNotMatch(provider, /json\(\{[^}]*apiKey[^}]*\}\)/);
});


test('AI Chat records user-stopped generations as cancelled rather than retryable failures', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /status\?: 'success' \| 'preview' \| 'error' \| 'cancelled'/);
  assert.match(page, /status: result\.cancelled \? 'cancelled' : result\.status/);
  assert.match(page, /content: streamedText \? streamedText \+ '\\n\\nGeneration stopped\.' : message, status: 'cancelled'/);
  assert.match(page, /message\.status === 'success' \|\| message\.status === 'preview' \|\| message\.status === 'error' \|\| message\.status === 'cancelled'/);
});


test('OpenAI Edge Function distinguishes upstream timeouts from connection failures', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /error\.name === 'TimeoutError'[\s\S]*?code: 'OPENAI_TIMEOUT'[\s\S]*?\}, 504/);
  assert.match(edge, /if \(request\.signal\.aborted\) return new Response\(null, \{ status: 499 \}\)/);
});

test('OpenAI Edge Function cancels upstream planner and response when the client disconnects', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /signal: AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout\(45000\)\]\)/);
  assert.match(edge, /signal: AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout\(60000\)\]\)/);
});


test('OpenAI Edge Function bounds raw request bytes and validates chat history before planning', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /const maxRequestBodyBytes = 1_048_576/);
  assert.match(edge, /declaredBodyBytes > maxRequestBodyBytes/);
  assert.match(edge, /receivedBytes > maxRequestBodyBytes/);
  assert.match(edge, /await reader\.cancel\(\)/);
  assert.match(edge, /parsed: unknown = JSON\.parse/);
  assert.match(edge, /body\.messages\.length > 40/);
  assert.match(edge, /content as string\)\.length > 12000/);
  assert.match(edge, /totalChars > 30000/);
});


test('OpenAI Edge Function preserves oversized-body responses and handles client aborts during body reads', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /try \{ await reader\.cancel\(\); \} catch \{[\s\S]*?Request body is too large/);
  assert.match(edge, /catch \{\s*if \(request\.signal\.aborted\) return new Response\(null, \{ status: 499 \}\);\s*return json\(\{ error: 'Request body must be valid JSON\.'/);
});

test('OpenAI Edge Function rejects malformed chat message roles and content types', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /incoming\.some\(\(item\) => !isPlainRecord\(item\)/);
  assert.match(edge, /item\.role !== 'user' && item\.role !== 'assistant'/);
  assert.match(edge, /typeof item\.content !== 'string'/);
});


test('OpenAI browser stream surfaces provider errors emitted after streaming begins', () => {
  const service = read('src/services/aiService.ts');
  assert.match(service, /error\?: \{ message\?: string; type\?: string; code\?: string \}/);
  assert.match(service, /if \(event\.error && typeof event\.error === 'object'\)/);
  assert.match(service, /streamError = typeof event\.error\.message === 'string'/);
  assert.match(service, /if \(streamError\) \{[\s\S]*?status: 'error',[\s\S]*?modelName: streamModel/);
  assert.match(service, /for \(const line of lines\) \{[\s\S]*?consumeLine\(line\);[\s\S]*?if \(finished \|\| streamError\) break;/);
  assert.match(service, /if \(finished \|\| streamError\) \{[\s\S]*?await reader\.cancel\(\)/);
  assert.match(service, /if \(!finished && !streamError && buffer\.trim\(\)\) consumeLine\(buffer\)/);
});


test('OpenAI chat route parses standard bearer tokens consistently for health checks and chat requests', () => {
  const source = read('src/server/ai.ts');
  const route = source.slice(source.indexOf("router.post('/ai/chat'"));
  assert.match(route, /const bearer = \/\^Bearer \(\[\^\\s\]\+\)\$\/i\.exec\(req\.header\('authorization'\) \?\? ''\);/);
  assert.doesNotMatch(route, /\[\^\\\\s\]/);
});
