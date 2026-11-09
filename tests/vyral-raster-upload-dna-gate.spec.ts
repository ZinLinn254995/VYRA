import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/profile/VyralDetailsContent.tsx', import.meta.url), 'utf8');
const rasterStart = source.indexOf("if (kind === 'image' && ['image/png', 'image/jpeg', 'image/webp'].includes(mime.toLowerCase()))");
assert.notEqual(rasterStart, -1, 'raster upload must use the server DNA v3 extractor');
const rasterEnd = source.indexOf("const { error: readyError }", rasterStart);
assert.notEqual(rasterEnd, -1, 'upload ready transition must remain after DNA extraction');
const rasterFlow = source.slice(rasterStart, rasterEnd);

test('raster uploads cannot become ready with identity-only File DNA when DNA v3 extraction fails', () => {
  assert.match(rasterFlow, /functions\.invoke\('extract-vyral-asset-dna-v3'/);
  assert.match(rasterFlow, /extraction\?\.status !== 'extracted'/);
  assert.match(rasterFlow, /Required raster DNA v3 extraction failed/);
  assert.doesNotMatch(rasterFlow, /saveFileDnaIdentity\(detail\)/);
  assert.match(rasterFlow, /dnaCommitted = true/);
});

test('identity-only File DNA remains limited to non-raster uploads', () => {
  assert.match(rasterFlow, /} else \{\s*await saveFileDnaIdentity\(\);\s*\}/);
  assert.ok(rasterEnd > rasterStart);
});
