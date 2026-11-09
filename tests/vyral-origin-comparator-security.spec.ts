import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCanonicalOwnedStoragePath } from '../supabase/functions/_shared/canonical-storage-path.ts';

const source = readFileSync(new URL('../supabase/functions/compare-origin-01-reconstruction/index.ts', import.meta.url), 'utf8');

test('ORIGIN-01 comparator uses the shared canonical storage path validator for both files', () => {
  assert.match(source, /import \{ isCanonicalOwnedStoragePath \} from '\.\.\/_shared\/canonical-storage-path\.ts'/);
  assert.match(source, /!isCanonicalOwnedStoragePath\(originalVersion\.storage_path, originalPrefix\)/);
  assert.match(source, /!isCanonicalOwnedStoragePath\(candidateVersion\.storage_path, candidatePrefix\)/);
});

test('shared path validator rejects traversal, empty segments and backslashes for ORIGIN paths', () => {
  const prefix = 'user-1/origin-vyral/original-asset/v1/';
  for (const suffix of ['../secret.png', './secret.png', '/secret.png', 'folder//secret.png', 'folder\\\\secret.png']) {
    assert.equal(isCanonicalOwnedStoragePath(prefix + suffix, prefix), false, suffix);
  }
});

test('ORIGIN-01 comparator continues to pin exact source and candidate versions', () => {
  assert.match(source, /originalVersion\.storage_path !== original\.storage_path/);
  assert.match(source, /candidateVersion\.storage_path !== candidate\.storage_path/);
  assert.match(source, /const originalPrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
  assert.match(source, /const candidatePrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
});
