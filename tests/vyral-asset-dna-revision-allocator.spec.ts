import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/20261109280000_vyral_asset_dna_auto_revision_allocator.sql', 'utf8').toLowerCase();
const authorityMigration = readFileSync('supabase/migrations/20261109290000_vyral_asset_dna_revision_allocator_authority.sql', 'utf8').toLowerCase();
const extractor = readFileSync('supabase/functions/extract-vyral-asset-dna-v3/index.ts', 'utf8');
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
  assert.match(extractor, /revision_number:\s*revisionNumber/);
  assert.match(migration, /before insert on public\.vyral_dna_records/);
});

test('Vyral-scope DNA records remain outside Asset revision allocation', () => {
  assert.match(migration, /new\.scope <> 'asset' or new\.asset_id is null/);
});
