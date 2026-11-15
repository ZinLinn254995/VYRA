import { buildRunwayProjectConsistencyContext } from '../src/services/runwayProjectConsistencyContext';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../src/services/runwayProjectConsistencyContext.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../src/services/runwayProjectGeneration.ts', import.meta.url), 'utf8');

test('Project consistency retrieval is isolated to the authenticated Project and ready Assets', () => {
  assert.ok(service.includes(".eq('user_id', input.userId)"));
  assert.ok(service.includes(".eq('vyral_id', input.targetVyralId)"));
  assert.ok(service.includes(".eq('processing_status', 'ready')"));
  assert.ok(service.includes(".eq('scope', 'asset')"));
  assert.ok(service.includes('.limit(120)'));
  assert.ok(service.includes('retrieveUniverseConsistencyContext'));
});

test('only bounded retrieved Asset DNA evidence is added to the generation prompt', () => {
  assert.ok(service.includes('maxAssets: 12'));
  assert.ok(service.includes('collectEvidence(record.payload)'));
  assert.ok(service.includes('not automatically creator-approved canon'));
  assert.ok(service.includes('Do not invent missing facts'));
  assert.ok(service.includes('.slice(0, 14_000)'));
  assert.ok(workflow.includes('buildRunwayProjectConsistencyContext'));
  assert.ok(workflow.includes('promptText: consistency.promptText'));
});

test('Project consistency context does not silently promote observations into canon', () => {
  assert.ok(service.includes('Recorded DNA observations are evidence'));
  assert.ok(service.includes('relationships: []'));
  assert.ok(!service.includes('creator_approved: true'));
  assert.ok(!service.includes('canon_status: approved'));
});

test('Project context contains matching nested DNA evidence and excludes other Projects', async () => {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const datasets: Record<string, unknown[]> = {
    vyral_assets: [
      { id: 'asset-red-fox', name: 'Red Fox', asset_type: 'image', mime_type: 'image/png', metadata: { description: 'Main character' } },
      { id: 'asset-blue-boat', name: 'Blue Boat', asset_type: 'image', mime_type: 'image/png', metadata: {} },
    ],
    vyral_dna_records: [
      { asset_id: 'asset-red-fox', scope: 'asset', verification_status: 'observed', payload: { dna_record: { visual_description: 'Rust red fur, white chest, amber eyes' } } },
    ],
  };
  const db = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      let data = datasets[table] ?? [];
      const query: any = {
        select() { return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        in(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const result = await buildRunwayProjectConsistencyContext(db, {
    userId: 'user-1', targetVyralId: 'project-assets-1', promptText: 'Create a scene with the Red Fox',
  });
  assert.equal(result.assetCount, 2);
  assert.equal(result.selectedAssetCount, 1);
  assert.match(result.promptText, /Rust red fur, white chest, amber eyes/);
  assert.match(result.promptText, /not automatically creator-approved canon/);
  assert.ok(calls.every((call) => call.filters.some(([column, value]) => column === 'user_id' && value === 'user-1')));
  assert.ok(calls.every((call) => call.filters.some(([column, value]) => column === 'vyral_id' && value === 'project-assets-1')));
});
