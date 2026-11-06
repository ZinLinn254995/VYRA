import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [chat, service, server, entry] = await Promise.all([
  readFile(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/aiService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/server/ai.ts', import.meta.url), 'utf8'),
  readFile(new URL('../server.ts', import.meta.url), 'utf8'),
]);

test('Vyral chat verifies DNA before creating a separate vision derivative', () => {
  assert.match(chat, /reconstructVyralDnaV3FromPackage/);
  assert.match(chat, /encodeVyralDnaV3PngFromPackage/);
  assert.match(chat, /createVyralVisionPreview/);
  assert.match(chat, /lossless DNA remains unchanged/);
});

test('Vyral vision image is forwarded only through the authenticated Gemini server proxy', () => {
  assert.match(chat, /visionImage:\s*\{\s*mimeType:\s*visionImage\.mimeType,\s*data:\s*visionImage\.data\s*\}/);
  assert.match(service, /request\.visionImage\s*\?\s*\{\s*visionImage:\s*request\.visionImage\s*\}/);
  assert.match(service, /if \(request\.visionImage\) \{/);
  assert.match(service, /No text-only preview was substituted/);
  assert.match(server, /if \(\!\(await requireVerifiedVYraSession\(req, res\)\)\) return;/);
  assert.match(server, /inlineData:\s*\{\s*mimeType:\s*visionImage\.mimeType,\s*data:\s*visionImage\.data\s*\}/);
});

test('server rejects oversized, malformed, or MIME-mismatched vision payloads', () => {
  assert.match(server, /data\.length > 1_200_000/);
  assert.match(server, /imageBytes\.length > 900 \* 1024/);
  assert.match(server, /imageBytes\.toString\('base64'\) !== data/);
  assert.match(server, /MIME type does not match its file signature/);
  assert.match(entry, /express\.json\(\{ limit: '4mb' \}\)/);
});
