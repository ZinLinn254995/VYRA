import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/20261109280000_vyral_asset_dna_auto_revision_allocator.sql', 'utf8').toLowerCase();
const authorityMigration = readFileSync('supabase/migrations/20261109290000_vyral_asset_dna_revision_allocator_authority.sql', 'utf8').toLowerCase();
const uniqueVersionMigration = readFileSync('supabase/migrations/20261109300000_vyral_asset_dna_source_version_unique.sql', 'utf8').toLowerCase();
const extractorSource = readFileSync('supabase/functions/extract-vyral-asset-dna-v3/index.ts', 'utf8');
const visionWriter = readFileSync('supabase/functions/record-vyral-vision-observation/index.ts', 'utf8');
const creatorWriter = readFileSync('supabase/functions/promote-vyral-vision-knowledge/index.ts', 'utf8');

test('database allocator is installed for every Asset DNA insert', () => {
  assert.match(migration, /before insert on public\.vyral_dna_records/);
  assert.match(migration, /create trigger vyral_dna_records_allocate_asset_revision/);
  assert.match(migration, /alter column revision_number drop default/);
});

test('allocator serializes writes and derives parent plus next revision from database state', () => {
  assert.match(migration, /for update/);
  assert.match(migration, /latest_revision \+ 1/);
  assert.match(migration, /new\.parent_dna_record_id := latest_id/);
  assert.match(migration, /a\.user_id = new\.user_id/);
});

test('legacy Asset DNA writers can omit revision fields and are covered by the trigger', () => {
  assert.doesNotMatch(visionWriter, /revision_number\s*:/);
  assert.doesNotMatch(creatorWriter, /revision_number\s*:/);
  assert.doesNotMatch(extractorSource, /revision_number:\s*revisionNumber/);
  assert.match(migration, /before insert on public\.vyral_dna_records/);
});

test('Vyral-scope DNA records remain outside Asset revision allocation', () => {
  assert.match(migration, /new\.scope <> 'asset' or new\.asset_id is null/);
});

test('each source Asset Version can have only one immutable DNA record', () => {
  assert.match(uniqueVersionMigration, /create unique index/);
  assert.ok(uniqueVersionMigration.includes("payload #>> '{dna_record,source,asset_version_id}'"));
  assert.match(extractorSource, /payload->dna_record->source->>asset_version_id/);
  assert.match(extractorSource, /DNA_SOURCE_VERSION_ALREADY_EXISTS/);
});

test('DNA extractor returns database-assigned revision lineage', () => {
  assert.match(extractorSource, /select\('id,revision_number,parent_dna_record_id'\)/);
  assert.match(extractorSource, /parentDnaRecordId: row\.parent_dna_record_id/);
  assert.match(extractorSource, /revisionNumber: row\.revision_number/);
  assert.doesNotMatch(extractorSource, /revision_number: revisionNumber/);
});
