import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUniverseConsistencyContext } from '../src/services/universeConsistencyContext.ts';

const assetDnaSource = {
  assetId: 'hero',
  assetVersionId: 'hero-v1',
  assetDnaRecordId: 'hero-dna-1',
  revision: 1,
  sourceSha256: 'b'.repeat(64),
  payload: {
    schema_id: 'vyra.asset-semantic-dna',
    schema_version: 1,
    record_id: 'semantic-dna-1',
    source: { asset_id: 'hero', asset_version_id: 'hero-v1', sha256: 'b'.repeat(64), size_bytes: 100, mime_type: 'image/png' },
    identity: { name: 'Hero', asset_type: 'character', original_filename: null },
    creator_description: { text: 'A red-haired pilot', evidence_status: 'creator_declared' },
    technical_metadata: { width: 512, height: 512, color_space: 'sRGB', channel_layout: 'RGB', decoded_samples_sha256: null },
    creator_confirmed_observations: [],
    context: { vyral_name: 'Legacy root', vyral_description: null, purpose: null, intended_uses: [] },
    reconstruction: { mode: 'semantic_generation', status: 'partial', exact_binary_recovery: false, decoded_sample_payload_included: false, evidence_count: 1, missing_information: [], limitations: [] },
  },
};

test('composes trusted Asset DNA knowledge with task-scoped graph retrieval', () => {
  const result = buildUniverseConsistencyContext({
    universeId: 'universe-1',
    universeRevision: 4,
    assets: [
      { id: 'hero', versionId: 'hero-v1', revision: 1 },
      { id: 'location', versionId: 'location-v1', revision: 1 },
    ],
    assetDnaSources: [assetDnaSource],
    relationships: [{
      id: 'edge-1', fromAssetId: 'hero', toAssetId: 'location', type: 'appears_in',
      status: 'verified', evidenceClass: 'creator_declared', revision: 1,
    }],
    task: { taskId: 'scene-1', operation: 'generate', referencedAssetIds: ['hero'], at: '2026-11-15T00:00:00Z' },
  });
  assert.ok(result.context.knowledge.some((record) => record.predicate === 'identity.name' && record.value === 'Hero'));
  assert.deepEqual(result.context.assets.map((asset) => asset.id), ['hero', 'location']);
  assert.deepEqual(result.missingDnaAssetIds, ['location']);
  assert.match(result.context.cacheKey, /dna-coverage:location/);
});

test('rejects multiple competing current DNA records for one Asset', () => {
  assert.throws(() => buildUniverseConsistencyContext({
    universeId: 'universe-1', universeRevision: 1, assets: [{ id: 'hero', versionId: 'hero-v1', revision: 1 }],
    assetDnaSources: [assetDnaSource, assetDnaSource],
    task: { taskId: 'scene-1', operation: 'generate', referencedAssetIds: ['hero'], at: '2026-11-15T00:00:00Z' },
  }), /Only one current Asset DNA source/);
});
