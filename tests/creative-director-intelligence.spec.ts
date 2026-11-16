import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Creative Director Intelligence is part of the authenticated Project AI Chat system prompt', () => {
  const prompt = read('src/services/creativeDirectorIntelligence.ts');
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(prompt, /professional director/);
  assert.match(prompt, /Understand the outcome the user wants, not only the literal words/);
  assert.match(prompt, /Do not make them choose routine professional details/);
  assert.match(prompt, /divide the story into scenes and shots/);
  assert.match(prompt, /timing to fit the requested duration/);
  assert.match(prompt, /creator-approved Universe canon/);
  assert.match(prompt, /When the user approves, says to proceed, or clearly asks you to make the work/);
  assert.match(prompt, /Never invent a tool, provider feature, saved record, generated file/);
  assert.match(edge, /CREATIVE_DIRECTOR_SYSTEM_INSTRUCTION/);
  assert.match(edge, /SYSTEM_INSTRUCTION \+ CREATIVE_DIRECTOR_SYSTEM_INSTRUCTION/);
});

test('Creative Director preserves user authority and existing consequential-action approvals', () => {
  const prompt = read('src/services/creativeDirectorIntelligence.ts');
  assert.match(prompt, /do not replace its central premise/);
  assert.match(prompt, /Never silently rewrite them/);
  assert.match(prompt, /Do not ask for confirmation for ordinary reversible creative drafting/);
  assert.match(prompt, /destructive changes, external publishing, purchases, charges/);
  assert.match(prompt, /The user is the client and final creative authority/);
});
