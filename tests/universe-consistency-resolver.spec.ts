import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUniverseConsistencyContext, type UniverseConsistencyInput } from '../src/services/universeConsistencyResolver.ts';

const input: UniverseConsistencyInput = {
  universeId: 'universe-1',
  universeRevision: 7,
  assets: [
    { id: 'hero', versionId: 'hero-v2', revision: 2, kind: 'character' },
    { id: 'coat', versionId: 'coat-v1', revision: 1, kind: 'wardrobe' },
    { id: 'city', versionId: 'city-v1', revision: 1, kind: 'location' },
    { id: 'unrelated', versionId: 'unrelated-v1', revision: 1 },
    { id: 'archived', versionId: 'archived-v1', revision: 1, archived: true },
  ],
  relationships: [
    { id: 'rel-1', fromAssetId: 'hero', toAssetId: 'coat', type: 'wears', status: 'verified', evidenceClass: 'creator_declared', revision: 1 },
    { id: 'rel-2', fromAssetId: 'coat', toAssetId: 'city', type: 'appears_in', status: 'accepted', evidenceClass: 'verified_observation', revision: 1 },
    { id: 'rel-3', fromAssetId: 'hero', toAssetId: 'unrelated', type: 'suggested', status: 'proposed', evidenceClass: 'model_hypothesis', revision: 1 },
  ],
  knowledge: [
    { id: 'k-hero', subjectId: 'hero', predicate: 'identity', value: 'blue jacket hero', evidenceClass: 'creator_declared', status: 'accepted', strength: 'locked', revision: 1 },
    { id: 'k-city', subjectId: 'city', predicate: 'architecture', value: 'glass towers', evidenceClass: 'verified_observation', status: 'verified', revision: 1 },
    { id: 'k-world', subjectId: 'universe-1', predicate: 'visual_style', value: 'cinematic realism', evidenceClass: 'creator_declared', status: 'accepted', scope: 'universe', strength: 'preferred', revision: 1 },
    { id: 'k-tag', subjectId: 'universe-1', predicate: 'weather', value: 'rain', evidenceClass: 'creator_declared', status: 'accepted', appliesToTags: ['night-scene'], revision: 1 },
    { id: 'k-old', subjectId: 'hero', predicate: 'age', value: 18, evidenceClass: 'creator_declared', status: 'accepted', validUntil: '2026-01-01T00:00:00.000Z', revision: 1 },
    { id: 'k-hypothesis', subjectId: 'hero', predicate: 'eye_color', value: 'green', evidenceClass: 'model_hypothesis', status: 'proposed', revision: 1 },
    { id: 'k-conflict-a', subjectId: 'hero', predicate: 'eye_color', value: 'brown', evidenceClass: 'creator_declared', status: 'accepted', strength: 'locked', revision: 2 },
    { id: 'k-conflict-b', subjectId: 'hero', predicate: 'eye_color', value: 'blue', evidenceClass: 'creator_declared', status: 'accepted', strength: 'locked', revision: 3 },
  ],
};

test('retrieves only directly referenced Assets and accepted/verified related Assets', () => {
  const result = resolveUniverseConsistencyContext(input, {
    taskId: 'scene-1', operation: 'generate', referencedAssetIds: ['hero'], at: '2026-11-15T00:00:00Z',
  });
  assert.deepEqual(result.assets.map((asset) => asset.id), ['hero', 'coat', 'city']);
  assert.equal(result.assets.some((asset) => asset.id === 'unrelated'), false);
  assert.equal(result.assets.some((asset) => asset.id === 'archived'), false);
  assert.equal(result.relationships.length, 2);
});

test('includes Universe-wide and task-tag knowledge while excluding expired and untrusted hypotheses', () => {
  const result = resolveUniverseConsistencyContext(input, {
    taskId: 'scene-2', operation: 'edit', referencedAssetIds: ['hero'], tags: ['night-scene'], at: '2026-11-15T00:00:00Z',
  });
  const ids = result.knowledge.map((record) => record.id);
  assert.ok(ids.includes('k-world'));
  assert.ok(ids.includes('k-tag'));
  assert.ok(!ids.includes('k-old'));
  assert.ok(!ids.includes('k-hypothesis'));
  assert.equal(result.excludedHypothesisCount, 1);
});

test('reports incompatible locked facts instead of silently choosing one', () => {
  const result = resolveUniverseConsistencyContext(input, {
    taskId: 'scene-3', operation: 'generate', referencedAssetIds: ['hero'], at: '2026-11-15T00:00:00Z',
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].predicate, 'eye_color');
  assert.deepEqual(result.conflicts[0].knowledgeIds, ['k-conflict-a', 'k-conflict-b']);
});

test('reports missing references and supports disabling relationship expansion', () => {
  const result = resolveUniverseConsistencyContext(input, {
    taskId: 'scene-4', operation: 'analyze', referencedAssetIds: ['hero', 'missing'], includeRelated: false,
    at: '2026-11-15T00:00:00Z',
  });
  assert.deepEqual(result.assets.map((asset) => asset.id), ['hero']);
  assert.deepEqual(result.missingAssetIds, ['missing']);
  assert.equal(result.relationships.length, 0);
});

test('bounds context size and marks truncation instead of silently claiming completeness', () => {
  const result = resolveUniverseConsistencyContext(input, {
    taskId: 'scene-5', operation: 'generate', referencedAssetIds: ['hero'], maxAssets: 2,
    at: '2026-11-15T00:00:00Z',
  });
  assert.equal(result.assets.length, 2);
  assert.equal(result.truncated, true);
});

test('produces a stable cache key for the same revision-pinned task context', () => {
  const task = { taskId: 'scene-6', operation: 'generate' as const, referencedAssetIds: ['hero'], at: '2026-11-15T00:00:00Z' };
  const first = resolveUniverseConsistencyContext(input, task);
  const second = resolveUniverseConsistencyContext(input, task);
  assert.equal(first.cacheKey, second.cacheKey);
  const changed = resolveUniverseConsistencyContext({ ...input, universeRevision: 8 }, task);
  assert.notEqual(first.cacheKey, changed.cacheKey);
});

test('rejects duplicate Asset IDs and invalid limits', () => {
  assert.throws(() => resolveUniverseConsistencyContext({
    ...input, assets: [...input.assets, input.assets[0]],
  }, { taskId: 'bad', operation: 'generate', at: '2026-11-15T00:00:00Z' }), /Duplicate Universe Asset ID/);
  assert.throws(() => resolveUniverseConsistencyContext(input, {
    taskId: 'bad-limit', operation: 'generate', at: '2026-11-15T00:00:00Z', maxAssets: 0,
  }), /maxAssets/);
});
