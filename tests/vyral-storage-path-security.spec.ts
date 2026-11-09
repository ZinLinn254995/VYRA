import test from 'node:test';
import assert from 'node:assert/strict';
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
  ];
  for (const path of functionPaths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ isCanonicalOwnedStoragePath \} from '\.\.\/_shared\/canonical-storage-path\.ts'/, path);
    assert.match(source, /isCanonicalOwnedStoragePath\(/, path);
  }
});
