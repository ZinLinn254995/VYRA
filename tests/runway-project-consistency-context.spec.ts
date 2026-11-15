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
