import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('AI Chat renders safe Markdown blocks and inline formatting', () => {
  const renderer = read('src/components/ai/AIChatMessageContent.tsx');
  const page = read('src/components/ai/AIChatPage.tsx');
  assert.match(page, /<AIChatMessageContent content=\{message\.content\} \/>/);
  assert.match(renderer, /\*\*\[\^\*\]\+\*\*/);
  assert.match(renderer, /<strong/);
  assert.match(renderer, /<em/);
  assert.match(renderer, /<ul/);
  assert.match(renderer, /<ol/);
  assert.match(renderer, /textPart\.split\('\\n'\)/);
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML|rehypeRaw/i);
});

test('AI Chat fenced code blocks support horizontal scrolling and copy', () => {
  const renderer = read('src/components/ai/AIChatMessageContent.tsx');
  assert.match(renderer, /content\.split\(\/\x60\x60\x60/);
  assert.match(renderer, /aria-label="Copy code"/);
  assert.match(renderer, /navigator\.clipboard\?\.writeText/);
  assert.match(renderer, /overflow-x-auto/);
  assert.match(renderer, /setCopiedBlock\(currentCodeIndex\)/);
});
