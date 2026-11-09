import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/compare-origin-01-reconstruction/index.ts', import.meta.url), 'utf8');

test('ORIGIN-01 comparator validates both storage paths with canonical owner prefixes', () => {
  assert.match(source, /const isCanonicalOwnedStoragePath = \(path: string, expectedPrefix: string\)/);
  assert.match(source, /!isCanonicalOwnedStoragePath\(originalVersion\.storage_path, originalPrefix\)/);
  assert.match(source, /!isCanonicalOwnedStoragePath\(candidateVersion\.storage_path, candidatePrefix\)/);
});

test('ORIGIN-01 comparator rejects traversal, empty segments and backslashes', () => {
  assert.ok(source.includes("path.includes('\\\\')"));
  assert.match(source, /path\.startsWith\('\/'\)/);
  assert.match(source, /segments\.every\(\(segment\) => segment\.length > 0 && segment !== '\.' && segment !== '\.\.'\)/);
});

test('ORIGIN-01 comparator continues to pin the exact source and candidate versions', () => {
  assert.match(source, /originalVersion\.storage_path !== original\.storage_path/);
  assert.match(source, /candidateVersion\.storage_path !== candidate\.storage_path/);
  assert.match(source, /const originalPrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
  assert.match(source, /const candidatePrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
});
