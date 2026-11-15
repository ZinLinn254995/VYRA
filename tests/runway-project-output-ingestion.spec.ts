import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../src/services/runwayProjectOutputIngestion.ts', import.meta.url), 'utf8');
const ingestion = readFileSync(new URL('../src/services/vyralAssetIngestion.ts', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../supabase/functions/complete-runway-media-output/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261116140000_runway_output_ingestion_state.sql', import.meta.url), 'utf8');

test('Runway output is bound to its approved job Project and persisted quote provenance', () => {
  assert.ok(service.includes("from('generation_jobs')"));
  assert.ok(service.includes('target_vyral_id'));
  assert.ok(service.includes("from('media_generation_quotes')"));
  assert.ok(service.includes('request_fingerprint'));
  assert.ok(service.includes('promptSha256'));
  assert.ok(service.includes('generationId:'));
});

test('output bytes are re-hashed and ingested through the canonical generated Asset service', () => {
  assert.ok(service.includes("redirect: 'error'"));
  assert.ok(service.includes('blob.size !== transfer.sizeBytes'));
  assert.ok(service.includes('digest !== transfer.sha256'));
  assert.ok(service.includes('ingestGeneratedVyralAsset(createSupabaseVyralAssetIngestionPort(db)'));
  assert.ok(service.includes('assetId,'));
  assert.ok(ingestion.includes('assetId?: string'));
  assert.ok(ingestion.includes('const assetId = input.assetId ?? globalThis.crypto.randomUUID()'));
  assert.ok(ingestion.includes('extract-vyral-asset-dna-v3'));
  assert.ok(ingestion.includes('createFingerprint'));
});

test('completion verifies owner, Project destination, Asset Version, DNA and Fingerprint before Ready', () => {
  assert.ok(completion.includes("createSupabaseContext(request, { auth: 'user' })"));
  assert.ok(completion.includes('asset.vyral_id !== job.target_vyral_id'));
  assert.ok(completion.includes("asset.processing_status !== 'ready'"));
  assert.ok(completion.includes('vyral_dna_records'));
  assert.ok(completion.includes('vyral_fingerprints'));
  assert.ok(completion.includes("p_status: 'ingested'"));
  assert.ok(completion.includes('.runway-staging/'));
  assert.ok(completion.includes('output.staging_storage_path'));
  assert.ok(completion.includes('storage.from(BUCKET).remove'));
  assert.ok(migration.includes('staging_storage_path text'));
});

test('output ingestion claim serializes active transfers and active ingestion retries', () => {
  assert.ok(migration.includes("transfer_status in ('downloading','ingesting')"));
  assert.ok(migration.includes("'target_vyral_id', v_job.target_vyral_id"));
});
