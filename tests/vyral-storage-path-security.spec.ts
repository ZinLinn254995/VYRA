import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCanonicalOwnedStoragePath } from '../supabase/functions/_shared/canonical-storage-path.ts';

test('accepts a canonical owner-scoped storage object path', () => {
  assert.equal(isCanonicalOwnedStoragePath(
    'user-1/vyral-1/asset-1/v1/original.png',
    'user-1/vyral-1/asset-1/v1/',
  ), true);
});

test('rejects paths outside the exact owner and asset prefix', () => {
  for (const path of [
    'user-2/vyral-1/asset-1/v1/original.png',
    'user-1/vyral-1/asset-2/v1/original.png',
    '/user-1/vyral-1/asset-1/v1/original.png',
    'user-1/vyral-1/asset-1/v1/../private.png',
    'user-1/vyral-1/asset-1/v1/./private.png',
    'user-1/vyral-1/asset-1/v1//private.png',
    'user-1/vyral-1/asset-1/v1\\private.png',
    'user-1/vyral-1/asset-1/v1/',
  ]) {
    assert.equal(isCanonicalOwnedStoragePath(path, 'user-1/vyral-1/asset-1/v1/'), false, path);
  }
});

test('rejects malformed expected prefixes and non-string inputs', () => {
  assert.equal(isCanonicalOwnedStoragePath('user-1/a/file.png', 'user-1/a'), false);
  assert.equal(isCanonicalOwnedStoragePath('user-1/a/file.png', 'user-1//'), false);
  assert.equal(isCanonicalOwnedStoragePath(null, 'user-1/a/'), false);
  assert.equal(isCanonicalOwnedStoragePath('user-1/a/file.png', null), false);
});

test('DNA extractor, DNA assessment and ORIGIN comparator all use the shared validator', () => {
  const functionPaths = [
    '../supabase/functions/extract-vyral-asset-dna-v3/index.ts',
    '../supabase/functions/assess-vyral-asset-dna/index.ts',
    '../supabase/functions/compare-origin-01-reconstruction/index.ts',
    '../supabase/functions/build-vyral-master-dna/index.ts',
    '../supabase/functions/verify-vyral-dna-v3/index.ts',
    '../supabase/functions/verify-origin-01-dna-v3/index.ts',
    '../supabase/functions/verify-vyral-asset/index.ts',
  ];
  for (const path of functionPaths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ isCanonicalOwnedStoragePath \} from '\.\.\/_shared\/canonical-storage-path\.ts'/, path);
    assert.match(source, /isCanonicalOwnedStoragePath\(/, path);
  }
});


test('DNA readback verifiers persist only database-allowed independent verification status', () => {
  const fileVerifier = readFileSync(new URL('../supabase/functions/verify-vyral-asset/index.ts', import.meta.url), 'utf8');
  const rasterVerifier = readFileSync(new URL('../supabase/functions/verify-vyral-dna-v3/index.ts', import.meta.url), 'utf8');

  assert.match(fileVerifier, /verification_status:\s*'independently_verified'/);
  assert.doesNotMatch(fileVerifier, /verification_status:\s*'verified'/);
  assert.match(rasterVerifier, /verification_status:\s*'independently_verified'/);
  assert.doesNotMatch(rasterVerifier, /verification_status:\s*'verified'/);
  assert.match(rasterVerifier, /if \(dnaUpdateError\) return reply/);
});


test('raster DNA extraction and verification share the supported ten-megapixel limit', () => {
  const extractor = readFileSync(new URL('../supabase/functions/extract-vyral-asset-dna-v3/index.ts', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../supabase/functions/verify-vyral-dna-v3/index.ts', import.meta.url), 'utf8');

  assert.match(extractor, /MAX_PIXELS = 10_000_000/);
  assert.match(verifier, /MAX_PIXELS = 10_000_000/);
  assert.match(extractor, /body\.reextractLegacy !== true/);
  assert.match(extractor, /alreadyUsesPinnedDecoder/);
  assert.match(verifier, /10-megapixel limit/);
});
