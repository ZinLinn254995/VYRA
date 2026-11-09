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
  assert.match(source, /original\.storage_path !== originalVersion\.storage_path/);
  assert.match(source, /candidate\.storage_path !== candidateVersion\.storage_path/);
  assert.match(source, /const originalPrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
  assert.match(source, /const candidatePrefix = userId \+ '\/' \+ ORIGIN\.vyralId/);
});

test('ORIGIN-01 comparator only records creator-attested blindness for audited semantic-only packages', () => {
  assert.match(source, /blindness_scope/);
  assert.match(source, /package_audit_status/);
  assert.match(source, /package_sha256/);
  assert.match(source, /original_binary_payload_entries/);
  assert.match(source, /blindnessScope === 'semantic_only_no_media_payload'/);
  assert.match(source, /packageAuditStatus === 'passed'/);
  assert.match(source, /originalBinaryPayloadEntries === 0/);
  assert.match(source, /source_binary_provided_to_model === false && semanticPackageAuditPassed/);
  assert.match(source, /independentlyVerified: false/);
});
