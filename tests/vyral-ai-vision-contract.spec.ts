import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [chat, service, server, entry] = await Promise.all([
  readFile(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/aiService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/server/ai.ts', import.meta.url), 'utf8'),
  readFile(new URL('../server.ts', import.meta.url), 'utf8'),
]);

test('AI Chat prepares selected image previews locally without a DNA reconstruction prerequisite', () => {
  assert.match(chat, /createVisionImagePreview/);
  assert.match(chat, /createImageBitmap\(source\)/);
  assert.match(chat, /canvas\.toBlob/);
  assert.match(chat, /visionImages/);
  assert.doesNotMatch(chat, /reconstructVyralDnaV3FromPackage|validateVyralFileDnaV1Record/);
});

test('AI Chat samples selected video frames and sends them through the supported Vision path', () => {
  assert.match(chat, /extractSelectedVideoFrames/);
  assert.match(chat, /lastSafeFrameTime \* index \/ \(frameCount - 1\)/);
  assert.match(chat, /Math\.min\(0\.05, duration \/ 10\)/);
  assert.match(chat, /visionImages/);
  assert.ok(service.includes('if (request.mediaFiles?.length)'));
  assert.ok(service.includes('browser-sampled video frames use the platform OpenAI Vision path.'));
  assert.doesNotMatch(service, /Google Gemini|gemini-[0-9]/i);
  assert.match(server, /DOCUMENT_AUDIO_CONTEXT_NOT_ENABLED/);
  assert.ok(server.includes('visionImages.length ? { visionImages }'));
  assert.ok(server.includes('rawVisionImages.length > 4'));
  assert.doesNotMatch(server, /gemini|Google Gemini/i);
  assert.ok(entry.includes("express.json({ limit: '8mb' })"));
});
