import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveUniverseConsistencyContext } from '../src/services/universeConsistencyRetrieval.ts';

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
  assert.ok(result.reasons.scarf.includes('one_hop_relationship_context'));
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
  assert.equal(result.truncatedRelationships, true);
});

test('Universe-root relationships are retained when their connected Asset is selected', () => {
  const result = retrieveUniverseConsistencyContext({
    query: 'Milo',
    assets,
    relationships: [{ type: 'belongs_to', fromAssetId: 'milo', toIsUniverse: true }],
  });
  assert.deepEqual(result.selectedRelationshipIndexes, [0]);
});
