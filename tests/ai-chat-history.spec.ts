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
  assert.match(page, /user_id: historyOwnerId/);
  assert.match(page, /messages: storedMessages/);
  assert.match(page, /id: message\.id,[\s\S]*?role: message\.role,[\s\S]*?content: message\.content/);
  assert.doesNotMatch(page.slice(page.indexOf('const persistSession'), page.indexOf('const startNewChat')), /base64|dataUrl|arrayBuffer|fileBytes/i);
  assert.match(page, /Chat history could not be saved/);
  assert.match(page, /Please stay here and try again/);
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
  assert.doesNotMatch(service, /gemini|vyra-gemini-proxy/i);
  assert.doesNotMatch(profile, /GeminiProviderSettings/);
});
