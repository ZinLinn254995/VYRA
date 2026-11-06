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

test('AI Chat validates Universal File DNA and clearly separates byte identity from semantic inspection', () => {
  assert.match(chat, /validateVyralFileDnaV1Record/);
  assert.match(chat, /reconstructVyralFileDnaFromPackage/);
  assert.match(chat, /analyzeVyralFileStructureV1/);
  assert.match(chat, /File DNA record references a different Asset/);
  assert.match(chat, /pinned to a different Asset version/);
  assert.match(chat, /independently re-analyzed source bytes/);
  assert.match(chat, /full-package original version/);
  assert.match(chat, /exact source bytes reconstructed from DNA/);
  assert.match(chat, /structureProfile/);
  assert.match(chat, /structureFacts/);
  assert.match(chat, /structureNotes/);
  assert.match(chat, /semantic content was not inferred or attached to Vision/);
  assert.match(chat, /File DNA binaries are integrity-checked but their audio\/video\/document contents are not decoded or attached to Vision/);
});

test('up to four labelled Vyral asset previews are forwarded through the authenticated Gemini proxy', () => {
  assert.match(chat, /visionImages/);
  assert.match(chat, /v3Records\.slice\(0, 4\)/);
  assert.match(chat, /assetName/);
  assert.match(service, /request\.visionImages\?\.length/);
  assert.match(service, /visionImages:\s*request\.visionImages/);
  assert.match(service, /if \(request\.visionImages\?\.length\) \{/);
  assert.match(service, /No text-only preview was substituted/);
  assert.match(server, /if \(\!\(await requireVerifiedVYraSession\(req, res\)\)\) return;/);
  assert.match(server, /visionImages\.length > 4/);
  assert.match(server, /inlineData:\s*\{\s*mimeType:\s*item\.mimeType,\s*data:\s*item\.data\s*\}/);
});
test('server rejects oversized, malformed, or MIME-mismatched vision payloads', () => {
  assert.match(server, /data\.length > 1_200_000/);
  assert.match(server, /imageBytes\.byteLength > 600 \* 1024/);
  assert.match(server, /exceeds the 600 KB limit/);
  assert.match(server, /totalImageBytes > 2_400 \* 1024/);
  assert.match(server, /MIME type does not match its file signature/);
  assert.match(server, /totalImageBytes > 2_400 \* 1024/);
  assert.match(entry, /express\.json\(\{ limit: '4mb' \}\)/);
});
