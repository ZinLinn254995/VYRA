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
