import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveUniverseConsistencyContext } from '../src/services/universeConsistencyRetrieval.ts';
import { resolveCreatorConfirmedFieldEvidence } from '../src/services/universeConsistencyEvidence.ts';

const assets = [
  { assetId: 'milo', name: 'Milo', type: 'character', description: 'Small blue robot', tags: ['robot', 'blue'], role: 'main' },
  { assetId: 'scarf', name: 'Yellow Scarf', type: 'object', description: 'Milo always wears this scarf', tags: ['yellow', 'wardrobe'] },
  { assetId: 'workshop', name: 'Workshop', type: 'environment', description: 'Blue workbench and tool wall', tags: ['location'] },
  { assetId: 'villain', name: 'The Clockmaker', type: 'character', description: 'A mysterious antagonist', tags: ['antagonist'] },
];

const relationships = [
  { type: 'wears', fromAssetId: 'milo', toAssetId: 'scarf' },
  { type: 'lives_in', fromAssetId: 'milo', toAssetId: 'workshop' },
  { type: 'opposes', fromAssetId: 'villain', toAssetId: 'milo' },
];

test('retrieves a directly mentioned Asset and expands its connected continuity graph', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Keep Milo consistent in the next scene',
    assets,
    relationships,
  });
  assert.equal(result.mode, 'targeted');
  assert.ok(result.selectedAssetIds.includes('milo'));
  assert.ok(result.selectedAssetIds.includes('scarf'));
  assert.ok(result.selectedAssetIds.includes('workshop'));
  assert.ok(result.selectedAssetIds.includes('villain'));
  assert.ok(result.selectedRelationshipIndexes.includes(0));
  assert.ok(result.selectedRelationshipIndexes.includes(1));
  assert.ok(result.selectedRelationshipIndexes.includes(2));
  assert.ok(result.reasons.milo.includes('explicit_asset_name_mention'));
  assert.ok(result.reasons.workshop.includes('one_hop_relationship_context'));
  assert.ok(result.reasons.villain.includes('one_hop_relationship_context'));
});

test('retrieves by tags and approved searchable evidence without leaking unrelated Assets', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'yellow wardrobe details',
    assets,
    relationships: [],
  });
  assert.equal(result.mode, 'targeted');
  assert.ok(result.selectedAssetIds.includes('scarf'));
  assert.ok(!result.selectedAssetIds.includes('villain'));
});

test('Burmese word segmentation matches names even when Myanmar particles are attached', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'မီလိုကို ဆက်လက်ဖန်တီးပါ',
    assets: [{ assetId: 'burmese-milo', name: 'မီလို', type: 'character', description: 'အပြာရောင် စက်ရုပ်' }],
    relationships: [],
  });
  assert.equal(result.mode, 'targeted');
  assert.deepEqual(result.selectedAssetIds, ['burmese-milo']);
  assert.ok(result.queryTerms.includes('မီ'));
  assert.ok(result.queryTerms.includes('လို'));
});

test('broad inventory requests deliberately include all available Assets', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Show me the entire Universe',
    assets,
    relationships,
  });
  assert.equal(result.mode, 'broad');
  assert.deepEqual(new Set(result.selectedAssetIds), new Set(assets.map((asset) => asset.assetId)));
});

test('unknown or mixed-language queries fall back safely rather than silently omitting context', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'မသိသေးတဲ့ စကားလုံးဖြင့် ဆက်စပ်မှုရှာပေးပါ',
    assets,
    relationships,
  });
  assert.equal(result.mode, 'fallback');
  assert.ok(result.selectedAssetIds.length > 0);
  assert.ok(result.selectedAssetIds.includes('milo'));
});

test('bounded retrieval reports truncation and keeps the strongest match first', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Milo',
    assets,
    relationships,
    maxAssets: 2,
    maxRelationships: 1,
  });
  assert.equal(result.selectedAssetIds.length, 2);
  assert.equal(result.selectedAssetIds[0], 'milo');
  assert.equal(result.truncatedAssets, true);
  const relationshipBound = retrieveUniverseConsistencyContext({
    query: 'Show me the entire Universe',
    assets,
    relationships,
    maxAssets: 10,
    maxRelationships: 1,
  });
  assert.equal(relationshipBound.truncatedRelationships, true);
});

test('broad retrieval prioritizes declared Main Assets without treating inventory size as quality', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Show me the entire Universe',
    assets,
    relationships: [],
    maxAssets: 2,
  });
  assert.deepEqual(result.selectedAssetIds, ['milo', 'scarf']);
  assert.ok(result.reasons.milo.includes('main_asset_priority'));
  assert.equal(result.truncatedAssets, true);
});

test('Universe-root relationships are retained when their connected Asset is selected', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Milo',
    assets,
    relationships: [{ type: 'belongs_to', fromAssetId: 'milo', toIsUniverse: true }],
  });
  assert.deepEqual(result.selectedRelationshipIndexes, [0]);
});


const creatorEvidence = (acceptedValue: unknown, evidenceId: string, createdAt: string) => ({
  fieldPath: 'character.current_location',
  acceptedValue,
  evidenceId,
  observationId: 'observation-' + evidenceId,
  sourceVersionId: 'version-1',
  sourceSha256: 'A'.repeat(64),
  createdAt,
});

test('creator-confirmed timeline facts at different times remain separate instead of conflicting', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    creatorEvidence({ value: 'Workshop', effective_at: '2026-01-01T00:00:00Z' }, 'past', '2026-01-01T00:00:00Z'),
    creatorEvidence({ value: 'Harbor', effective_at: '2026-02-01T00:00:00Z' }, 'present', '2026-02-01T00:00:00Z'),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.resolved.length, 2);
  assert.deepEqual(result.resolved.map((item) => item.acceptedValue), [
    { value: 'Workshop', effective_at: '2026-01-01T00:00:00Z' },
    { value: 'Harbor', effective_at: '2026-02-01T00:00:00Z' },
  ]);
});

test('equivalent temporal aliases and timezone offsets share one conflict scope', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    creatorEvidence({ value: 'Workshop', effective_at: '2026-01-01T00:00:00Z' }, 'a', '2026-01-01T00:00:00Z'),
    creatorEvidence({ value: 'Harbor', valid_from: '2025-12-31T19:00:00-05:00' }, 'b', '2026-01-01T00:01:00Z'),
  ]);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].status, 'unresolved_conflict');
});

test('same fact with different temporal aliases coalesces without a false value conflict', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    creatorEvidence({ value: 'Workshop', effective_at: '2026-04-01T00:00:00Z' }, 'a', '2026-04-01T00:00:00Z'),
    creatorEvidence({ value: 'Workshop', temporal: { at: '2026-04-01T00:00:00Z' } }, 'b', '2026-04-01T00:01:00Z'),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.resolved.length, 1);
  assert.deepEqual(result.resolved[0].evidenceIds, ['b', 'a']);
});

test('nested temporal metadata is recognized while event IDs never split a conflict scope', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    creatorEvidence({ value: 'Workshop', temporal: { at: '2026-03-01T12:00:00Z', event_id: 'event-a' } }, 'a', '2026-03-01T12:00:00Z'),
    creatorEvidence({ value: 'Harbor', temporal_scope: { timestamp: '2026-03-01T12:00:00Z', event_id: 'event-b' } }, 'b', '2026-03-01T12:01:00Z'),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.resolved.length, 0);
});


test('additional effective and start/end aliases are normalized into the same temporal scope', () => {
  const result = resolveCreatorConfirmedFieldEvidence([
    creatorEvidence({ value: 'Workshop', effective_at: '2026-05-01T00:00:00Z' }, 'a', '2026-05-01T00:00:00Z'),
    creatorEvidence({ value: 'Harbor', period: { start_at: '2026-04-30T19:00:00-05:00' } }, 'b', '2026-05-01T00:01:00Z'),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.resolved.length, 0);
});
