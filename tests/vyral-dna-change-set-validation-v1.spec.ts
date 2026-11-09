import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256VyralJsonV1, validateVyralDnaChangeSetV1 } from '../src/services/vyralDnaChangeSetValidationV1.ts';

const source = { assetId: 'asset-1', assetVersionId: 'version-1', dnaRecordId: 'dna-1', sourceSha256: 'a'.repeat(64) };
const dna = { dna_record: { knowledge: { color: 'red', shape: 'circle' }, source: { asset_id: 'asset-1' } } };
const makeSet = (operations: unknown[]) => ({
  schema: 'vyra.dna-change-set', schemaVersion: 1, proposalId: 'proposal-1', source,
  operations,
});
const validate = async (changeSet: unknown, currentDnaRecord: unknown = dna, verifiedEvidenceRefs: string[] = []) =>
  validateVyralDnaChangeSetV1({ changeSet, expectedSha256: await sha256VyralJsonV1(changeSet), expectedSource: source, currentDnaRecord, verifiedEvidenceRefs });

test('blocks empty change sets instead of allowing empty DNA revisions', async () => {
  const result = await validate(makeSet([]));
  assert.equal(result.status, 'blocked');
  assert.equal(result.validatedOperationCount, 0);
});

test('validates a before/after patch with an evidence reference', async () => {
  const result = await validate(makeSet([{
    op: 'replace', path: '/dna_record/knowledge/color', before: 'red', after: 'crimson', evidenceRefs: ['observation:vision-42'],
  }]), dna, ['observation:vision-42']);
  assert.equal(result.status, 'validated');
  assert.equal(result.validatedOperationCount, 1);
});

test('rejects a stale before value', async () => {
  const result = await validate(makeSet([{
    op: 'replace', path: '/dna_record/knowledge/color', before: 'blue', after: 'crimson', evidenceRefs: ['evidence-1'],
  }]));
  assert.equal(result.status, 'invalid');
  assert.match(result.errors.join(' '), /before value does not exactly match/);
});

test('rejects identity, source and fingerprint mutations', async () => {
  for (const path of ['/dna_record/source/asset_id', '/dna_record/knowledge/fingerprint', '/dna_record/identity/name']) {
    const result = await validate(makeSet([{ op: 'replace', path, before: path.includes('asset_id') ? 'asset-1' : 'red', after: 'changed', evidenceRefs: ['evidence-1'] }]));
    assert.equal(result.status, 'invalid');
  }
});

test('rejects a change set whose pinned Asset or Version differs', async () => {
  const set = { ...makeSet([{ op: 'replace', path: '/dna_record/knowledge/color', before: 'red', after: 'crimson', evidenceRefs: ['evidence-1'] }]), source: { ...source, assetVersionId: 'version-other' } };
  const result = await validate(set);
  assert.equal(result.status, 'invalid');
  assert.equal(result.checks.sourceBinding, 'fail');
});

test('rejects tampered change-set hashes', async () => {
  const set = makeSet([{ op: 'replace', path: '/dna_record/knowledge/color', before: 'red', after: 'crimson', evidenceRefs: ['evidence-1'] }]);
  const result = await validateVyralDnaChangeSetV1({ changeSet: set, expectedSha256: '0'.repeat(64), expectedSource: source, currentDnaRecord: dna });
  assert.equal(result.status, 'invalid');
  assert.equal(result.checks.hash, 'fail');
});

test('rejects add operations when the target already exists', async () => {
  const result = await validate(makeSet([{ op: 'add', path: '/dna_record/knowledge/color', after: 'blue', evidenceRefs: ['evidence-1'] }]));
  assert.equal(result.status, 'invalid');
});

test('rejects paths outside the DNA knowledge and modality allowlist', async () => {
  const result = await validate(makeSet([{ op: 'replace', path: '/dna_record/source/new_field', before: 'x', after: 'y', evidenceRefs: ['evidence-1'] }]));
  assert.equal(result.status, 'invalid');
});

test('canonical hashing is independent of object key insertion order', async () => {
  const left = { a: 1, b: { x: true, y: 'z' } };
  const right = { b: { y: 'z', x: true }, a: 1 };
  assert.equal(await sha256VyralJsonV1(left), await sha256VyralJsonV1(right));
});

test('rejects malformed JSON Pointer escape sequences', async () => {
  const result = await validate(makeSet([{ op: 'replace', path: '/dna_record/knowledge/bad~2key', before: 'red', after: 'blue', evidenceRefs: ['evidence-1'] }]));
  assert.equal(result.status, 'invalid');
  assert.match(result.errors.join(' '), /path is outside/);
});

test('blocks syntactically valid patches until evidence references are independently resolved', async () => {
  const result = await validate(makeSet([{
    op: 'replace', path: '/dna_record/knowledge/color', before: 'red', after: 'crimson', evidenceRefs: ['observation:not-yet-verified'],
  }]));
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.evidence, 'blocked');
  assert.equal(result.validatedOperationCount, 0);
});

test('rejects no-op replacement operations', async () => {
  const result = await validate(makeSet([{
    op: 'replace', path: '/dna_record/knowledge/color', before: 'red', after: 'red', evidenceRefs: ['evidence-1'],
  }]), dna, ['evidence-1']);
  assert.equal(result.status, 'invalid');
  assert.match(result.errors.join(' '), /no-op operations/);
});
