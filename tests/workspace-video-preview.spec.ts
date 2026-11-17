import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/components/workspace/WorkspacePage.tsx'), 'utf8');

test('Scene Preview uses authenticated private Video Asset playback for the active Scene', () => {
  assert.match(source, /createVyralVideoPlaybackUrl\(supabase, \{ assetId, versionId \}\)/);
  assert.match(source, /sceneInstances\?\.find\(\(item\) => item\.sceneId === activeSceneId\)/);
  assert.match(source, /mimeType\.toLowerCase\(\)\.startsWith\('video\/'\)/);
  assert.match(source, /<video[\s\S]*?controls[\s\S]*?playsInline/);
  assert.match(source, /video\.currentTime = sceneVideoPreviewSourceIn/);
  assert.match(source, /sceneVideoPreviewSourceOut !== null[\s\S]*?event\.currentTarget\.pause\(\)/);
  assert.match(source, /cancelled = true/);
});

test('Scene Preview does not create a public URL or silently play an unverified Asset', () => {
  assert.doesNotMatch(source, /getPublicUrl\(/);
  assert.match(source, /Attach a Video Asset to this Scene through AI Chat\./);
  assert.match(source, /Private Video Storage is not configured\./);
});
