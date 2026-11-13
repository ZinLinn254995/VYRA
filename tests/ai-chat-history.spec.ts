import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('AI Chat history is loaded only for the authenticated owner', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /supabaseClient\.auth\.getUser\(\)/);
  assert.match(page, /\.eq\('user_id', ownerId\)/);
  assert.match(page, /\.order\('updated_at', \{ ascending: false \}\)/);
  assert.match(page, /\.limit\(100\)/);
  assert.match(page, /historyOwnerRef\.current !== ownerId/);
});

test('AI Chat ignores stale authentication history loads before querying or restoring owner state', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const loadStart = page.indexOf('const loadHistory = async');
  const userLookup = page.indexOf('supabaseClient.auth.getUser()', loadStart);
  const earlyGuard = page.indexOf('if (!active) return;', userLookup);
  const historyQuery = page.indexOf("from('vyra_ai_chat_conversations')", earlyGuard);
  const ownerAssignment = page.indexOf('historyOwnerRef.current = ownerId;', historyQuery);
  const finalGuard = page.indexOf('if (!active) return;', ownerAssignment);
  assert.ok(loadStart >= 0 && userLookup > loadStart);
  assert.ok(earlyGuard > userLookup && earlyGuard < historyQuery);
  assert.ok(ownerAssignment > historyQuery && finalGuard > ownerAssignment);
});

test('AI Chat persists text transcripts and safe metadata without attachment bytes', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /from\('vyra_ai_chat_conversations'\)\.upsert\(/);
  assert.match(page, /user_id: ownerId/);
  assert.match(page, /messages: storedMessages/);
  assert.match(page, /id: message\.id,[\s\S]*?role: message\.role,[\s\S]*?content: message\.content/);
  assert.doesNotMatch(page.slice(page.indexOf('const persistSession'), page.indexOf('const startNewChat')), /base64|dataUrl|arrayBuffer|fileBytes/i);
  assert.match(page, /historyWriteQueueRef\.current\.then\(async \(\) =>/);
  assert.match(page, /Chat history could not be saved/);
  assert.match(page, /Please keep this page open and retry/);
});

test('AI Chat history database enforces owner-scoped RLS and bounded transcript size', () => {
  const migration = read('supabase/migrations/20261112175139_vyra_ai_chat_conversations.sql');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /octet_length\(messages::text\) <= 1048576/);
  assert.match(migration, /for select to authenticated[\s\S]*?auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /for insert to authenticated[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /for update to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /for delete to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.vyra_ai_chat_conversations from anon/i);
});

test('OpenAI key manager is mounted in Profile AI settings and restricted to platform admins', () => {
  const profile = read('src/components/profile/ProfilePage.tsx');
  const settings = read('src/components/profile/ApiKeySettings.tsx');
  const edge = read('supabase/functions/manage-openai-api-key/index.ts');
  assert.match(profile, /import \{ ApiKeySettings \} from '\.\/ApiKeySettings'/);
  assert.match(profile, /activePage === 'setting-ai'[\s\S]*?<ApiKeySettings \/>/);
  assert.match(settings, /\/api\/providers\/openai\/settings/);
  assert.match(settings, /Administrator access required/);
  assert.match(edge, /from\('platform_admins'\)/);
  assert.match(edge, /\['owner', 'admin'\]\.includes\(admin\.role\)/);
  assert.match(edge, /set_vyra_openai_secret/);
  assert.doesNotMatch(edge, /return json\(\{[^}]*apiKey/i);
});

test('Global AI Chat sends requests through OpenAI only; legacy Gemini UI is not mounted', () => {
  const service = read('src/services/aiService.ts');
  const profile = read('src/components/profile/ProfilePage.tsx');
  assert.match(service, /private endpoint = '\/api\/ai\/chat'/);
  assert.match(service, /OpenAI \(VYRA Platform\)/);
  assert.doesNotMatch(service, /vyra-gemini-proxy|GoogleGenerativeAI|generativelanguage\\.googleapis\\.com/i);
  assert.doesNotMatch(profile, /GeminiProviderSettings/);
});


test('AI Chat conversations support rename, archive restore, and owner-scoped deletion', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /const renameSession = async/);
  assert.match(page, /\.update\(\{ title, updated_at:/);
  assert.match(page, /const restoreSession = async/);
  assert.match(page, /\.update\(\{ archived: false, updated_at:/);
  assert.match(page, /const removeSession = async/);
  assert.match(page, /\.delete\(\)\.eq\('id', session\.id\)\.eq\('user_id', historyOwnerId\)/);
  assert.match(page, /window\.confirm\('Delete this conversation permanently\?'\)/);
  assert.match(page, /session\.archived === showArchivedChats/);
  assert.match(page, /showArchivedChats \? 'Recent' : 'Archived'/);
  assert.match(page, />Restore</);
  assert.match(page, />Rename</);
});


test('AI Chat renders safe Markdown and copyable fenced code blocks', () => {
  const renderer = read('src/components/ai/AIChatMessageContent.tsx');
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /<AIChatMessageContent content=\{message\.content\} \/>/);
  assert.match(renderer, /<strong/);
  assert.match(renderer, /<em/);
  assert.match(renderer, /<ul/);
  assert.match(renderer, /<ol/);
  assert.match(renderer, /aria-label="Copy code"/);
  assert.match(renderer, /navigator\.clipboard\?\.writeText/);
  assert.match(renderer, /overflow-x-auto/);
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML|rehypeRaw/i);
});


test('AI Chat follows streamed replies only while the user is near the latest message', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /const chatScrollRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(page, /shouldAutoScrollRef\.current = element\.scrollHeight - element\.scrollTop - element\.clientHeight < 120/);
  assert.match(page, /container\.scrollTo\(\{ top: container\.scrollHeight, behavior: isSending \? 'auto' : 'smooth' \}\)/);
  assert.ok(page.includes('const nextMessages = retryUserIndex >= 0'));
  assert.ok(page.includes(': [...messages, userMessage]'));
});

test('AI Chat Stop Generation remains enabled while a request is running', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /onClick=\{isSending \? stopGeneration : undefined\}/);
  assert.match(page, /disabled=\{isSending \? false : \(\(!draft\.trim\(\)/);
  assert.match(page, /aria-label=\{isSending \? "Stop generation" : "Send message"\}/);
});

test('AI Chat assistant responses use the available width for long-form reading', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /'w-full max-w-full sm:max-w-\[94%\]'/);
  assert.match(page, /overflow-y-auto overscroll-contain/);
});


test('AI Chat composer controls provide mobile-friendly 44px touch targets', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /grid-cols-\[44px_minmax\(0,1fr\)_44px\]/);
  assert.match(page, /size-11 min-h-11 min-w-11 place-items-center/);
  assert.match(page, /!size-11 !min-h-11 !min-w-11/);
  assert.match(page, /max-h-36 min-h-11 min-w-0 resize-none/);
});


test('AI Chat retries the original user turn without appending a duplicate prompt', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /sendMessage = async \(value = draft, retryUserMessageId\?: string\)/);
  assert.match(page, /messages\.findIndex\(\(message\) => message\.id === retryUserMessageId && message\.role === 'user'\)/);
  assert.match(page, /messages\.slice\(0, retryUserIndex \+ 1\)/);
  assert.match(page, /sendMessage\(previousUserMessage\.content, previousUserMessage\.id\)/);
});

test('AI Chat drops queued transcript writes when authentication changes accounts', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /const previousOwnerId = historyOwnerRef\.current;[\s\S]*?historyOwnerRef\.current = null;/);
  assert.match(page, /const ownerId = historyOwnerId;[\s\S]*?if \(historyOwnerRef\.current !== ownerId\) return false;/);
  assert.match(page, /user_id: ownerId/);
});


test('AI Chat aborts and isolates in-flight responses when switching conversations or unmounting', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /const cancelActiveRequest = \(\) => \{[\s\S]*?activeRequestControllerRef\.current = null;[\s\S]*?controller\.abort\(\)/);
  assert.match(page, /const startNewChat = async \(\) => \{\s*cancelActiveRequest\(\)/);
  assert.match(page, /const openSession = \(session: ChatSession\) => \{\s*cancelActiveRequest\(\)/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{\s*activeRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /if \(activeRequestControllerRef\.current !== requestController\) return;/);
  assert.match(page, /if \(!isAuthenticated \|\| !supabaseClient\) \{\s*cancelActiveRequest\(\)/);
  assert.match(page, /const previousOwnerId = historyOwnerRef\.current;[\s\S]*?if \(previousOwnerId\) cancelActiveRequest\(\);[\s\S]*?historyOwnerRef\.current = null;/);
  assert.match(page, /if \(activeRequestControllerRef\.current === requestController\) \{\s*activeRequestControllerRef\.current = null;\s*setIsSending\(false\);/);
});

test('AI Chat history mutations ignore results after the authenticated owner changes', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  for (const [name, nextName] of [
    ['const renameSession = async', 'const removeSession = async'],
    ['const removeSession = async', 'const restoreSession = async'],
    ['const restoreSession = async', 'const shareCurrentChat = async'],
  ]) {
    const start = page.indexOf(name);
    const end = page.indexOf(nextName, start + name.length);
    const block = page.slice(start, end);
    assert.ok(start >= 0 && end > start, `missing handler: ${name}`);
    assert.match(block, /const ownerId = historyOwnerId/);
    assert.match(block, /if \(historyOwnerRef\.current !== ownerId\) return;/);
    assert.match(block, /\.eq\('user_id', ownerId\)/);
  }
  const persistStart = page.indexOf('const persistSession');
  const persistEnd = page.indexOf('const startNewChat', persistStart);
  assert.match(page.slice(persistStart, persistEnd), /if \(historyOwnerRef\.current !== ownerId\) return false;/);
});

test('AI Chat reset and archive actions cannot clear a different account session', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  for (const [name, nextName] of [
    ['const startNewChat = async', 'const openSession ='],
    ['const archiveCurrentChat = async', 'const deleteCurrentChat ='],
    ['const deleteCurrentChat = async', 'const toggleLock ='],
  ]) {
    const start = page.indexOf(name);
    const end = page.indexOf(nextName, start + name.length);
    const block = page.slice(start, end);
    assert.ok(start >= 0 && end > start, `missing handler: ${name}`);
    assert.match(block, /const ownerAtStart = historyOwnerRef\.current/);
    assert.match(block, /if \(historyOwnerRef\.current !== ownerAtStart\) return;/);
  }
  const removeCurrent = page.slice(page.indexOf('const deleteCurrentChat = async'), page.indexOf('const toggleLock ='));
  assert.match(removeCurrent, /const sessionId = activeSessionId/);
  assert.match(removeCurrent, /if \(ownerId !== ownerAtStart\) return/);
  assert.match(removeCurrent, /\.eq\('user_id', ownerId\)/);
});

test('AI Chat does not clear a chat when saving it for archive or a new chat fails', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const saveStart = page.indexOf('const saveCurrentSession = async');
  const saveEnd = page.indexOf('const startNewChat = async', saveStart);
  const saveBlock = page.slice(saveStart, saveEnd);
  assert.match(saveBlock, /const saved = await persistSession\(session\)/);
  assert.match(saveBlock, /if \(!saved\) return false/);
  assert.match(saveBlock, /return true/);
  for (const name of ['const startNewChat = async', 'const archiveCurrentChat = async']) {
    const start = page.indexOf(name);
    const end = page.indexOf(name.includes('startNewChat') ? 'const openSession =' : 'const deleteCurrentChat =', start + name.length);
    const block = page.slice(start, end);
    assert.match(block, /const saved = await saveCurrentSession/);
    assert.match(block, /if \(!saved \|\| historyOwnerRef\.current !== ownerAtStart\) return/);
  }
});

test('AI Chat refuses to open a stale conversation from a previous account', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const start = page.indexOf('const openSession = (session: ChatSession) =>');
  const end = page.indexOf('const sendMessage = async', start);
  const block = page.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /const ownerId = historyOwnerId/);
  assert.match(block, /historyOwnerRef\.current !== ownerId/);
  assert.match(block, /!sessions\.some\(\(item\) => item\.id === session\.id\)/);
  assert.ok(block.indexOf('historyOwnerRef.current !== ownerId') < block.indexOf('setMessages(session.messages)'));
});

test('AI Chat ignores a completed response if its request was invalidated during post-response work', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const completion = page.indexOf('const completedMessage: ChatMessage =');
  const guard = page.lastIndexOf('if (activeRequestControllerRef.current !== requestController) return;', completion);
  const resultGuard = page.indexOf('if (activeRequestControllerRef.current !== requestController) return;', page.indexOf('const result = await aiService.generateResponse'));
  assert.ok(completion >= 0 && guard > resultGuard);
  assert.ok(guard < completion);
});

test('AI Chat binds asynchronous chat actions to the validated account owner', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const start = page.indexOf('const sendMessage = async');
  const end = page.indexOf('const handleFileSelection', start);
  const block = page.slice(start, end);
  assert.match(block, /const requestOwnerId = historyOwnerRef\.current/);
  assert.match(block, /requestOwnerId !== historyOwnerId/);
  assert.match(block, /const assertRequestCurrent = \(\) =>/);
  assert.match(block, /historyOwnerRef\.current !== requestOwnerId/);
  assert.match(block, /authData\.user\?\.id !== requestOwnerId/);
  assert.match(block, /historyOwnerRef\.current !== requestOwnerId\) return/);
  assert.ok(block.indexOf('assertRequestCurrent();') < block.indexOf('const result = await aiService.generateResponse'));
});

test('AI Chat revalidates account ownership before irreversible Workspace and Asset operations', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const start = page.indexOf('const sendMessage = async');
  const end = page.indexOf('const handleFileSelection', start);
  const block = page.slice(start, end);
  for (const marker of [
    'const { data: deletedRows, error: deleteError }',
    'const { error: updateError }',
    'const { error: createError }',
    'const ingested = await ingestVyralAsset',
    'const { data: completion, error: completionError }',
  ]) {
    const operation = block.indexOf(marker);
    assert.ok(operation > 0, `missing operation: ${marker}`);
    assert.ok(block.lastIndexOf('assertRequestCurrent();', operation) > block.lastIndexOf('const sendMessage = async', 0),
      `owner must be revalidated before: ${marker}`);
  }
  assert.ok(block.indexOf('assertRequestCurrent();', block.indexOf('const ingested = await ingestVyralAsset')) >
    block.indexOf('const ingested = await ingestVyralAsset'));
  const failureReporter = block.slice(block.indexOf('const reportUploadFailure = async'), block.indexOf('if (!supabase || !actionId', block.indexOf('const reportUploadFailure = async')));
  assert.match(failureReporter, /historyOwnerRef\.current !== requestOwnerId/);
  assert.match(failureReporter, /activeRequestControllerRef\.current !== requestController/);
  const masterSync = block.indexOf('const { data: masterResult');
  const uploadSummary = block.indexOf('assetUploadCompletionText =', masterSync);
  assert.ok(masterSync > 0 && uploadSummary > masterSync);
  assert.ok(block.lastIndexOf('assertRequestCurrent();', uploadSummary) > masterSync);
});

test('AI Chat checks request ownership after every Supabase await in a turn', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const start = page.indexOf('const sendMessage = async');
  const end = page.indexOf('const handleFileSelection', start);
  const block = page.slice(start, end);
  assert.match(block, /const awaitForCurrentRequest = async <T,>\(operation: PromiseLike<T>\)/);
  assert.doesNotMatch(block, /await supabase\s*\./);
  assert.ok((block.match(/await awaitForCurrentRequest\(supabase/g) || []).length >= 40);
  assert.match(block, /const accessToken = await getCurrentAccessToken\(\);\s*assertRequestCurrent\(\);/);
  assert.match(block, /fetch\(signed\.signedUrl, \{ signal: requestController\.signal \}\)/);
  assert.match(block, /const blob = await response\.blob\(\);\s*assertRequestCurrent\(\);/);
});


test('AI Chat ignores streamed chunks when their request no longer belongs to the active account', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /onTextDelta: \(chunk: string\) => \{\s*if \(activeRequestControllerRef\.current !== requestController \|\|\s*historyOwnerRef\.current !== requestOwnerId\) return;/);
});


test('AI Chat revalidates request ownership after asynchronous selected-asset processing and provider completion', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /createSelectedAssetVisionPreview\(blob\);\s*assertRequestCurrent\(\);/);
  assert.match(page, /const decodedBytes = await blob\.arrayBuffer\(\);\s*assertRequestCurrent\(\);/);
  assert.match(page, /const encodedMedia = await readBlobAsBase64\(blob\);\s*assertRequestCurrent\(\);/);
  assert.match(page, /extractSelectedVideoFrames\(blob, asset\.id, asset\.name, remaining\);\s*assertRequestCurrent\(\);/);
  assert.match(page, /const result = await aiService\.generateResponse\([\s\S]*?\);\s*assertRequestCurrent\(\);\s*let assetUploadCompletionText/);
});

test('AI Chat revalidates request ownership after asynchronous provider error-body parsing', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const start = page.indexOf('const sendMessage = async');
  const end = page.indexOf('const handleFileSelection', start);
  const block = page.slice(start, end);
  const parses = [...block.matchAll(/const payload = await [^\\n]*\\.clone\\(\\)\\.json\\(\\)[^\\n]*;\\s*assertRequestCurrent\\(\\);/g)];
  assert.equal(parses.length, 8);
  assert.doesNotMatch(block, /const payload = await [^\\n]*\\.clone\\(\\)\\.json\\(\\);\\s*(?!assertRequestCurrent\\(\\);)/);
});
