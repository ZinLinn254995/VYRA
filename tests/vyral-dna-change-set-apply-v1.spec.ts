import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const edge=await readFile('supabase/functions/manage-vyral-asset-dna-proposal/index.ts','utf8');
const migration=await readFile('supabase/migrations/20261109240000_vyral_dna_change_set_apply.sql','utf8');
const chat=await readFile('src/components/ai/AIChatPage.tsx','utf8');
test('application requires validated evidence and matching hash',()=>{
 assert.match(edge,/report\.status !== 'validated'/);
 assert.match(edge,/report\.checks\?\.evidence !== 'pass'/);
 assert.match(edge,/p_expected_change_set_sha256:proposal\.change_set_sha256/);
});
test('application rechecks source version and DNA revision',()=>{
 assert.match(edge,/latestVersion\.data\?\.id !== proposal\.asset_version_id \|\| latestDna\.data\?\.id !== proposal\.dna_record_id/);
 assert.ok(migration.includes('Asset Version changed after validation'));
 assert.ok(migration.includes('DNA revision changed after validation'));
});
test('database rechecks creator review and exact accepted field value',()=>{
 assert.ok(migration.includes('Creator evidence does not authorize DNA patch operation'));
 assert.ok(migration.includes("e.field_path = field_path and e.accepted_value = operation->'after'"));
 assert.ok(migration.includes("r.evidence_kind = 'observation_review' and r.decision = 'creator_confirmed'"));
});
test('database reconstructs exact patch and preserves parent lineage',()=>{
 assert.ok(migration.includes('Submitted DNA payload does not equal the validated deterministic patch result'));
 assert.ok(migration.includes('parent_dna_record_id'));
 assert.ok(migration.includes('revision_number'));
});
test('application is idempotent',()=>{
 assert.ok(migration.includes("proposal.status = 'applied'"));
 assert.ok(migration.includes('return query select proposal.applied_dna_record_id'));
});
test('AI Chat exposes explicit apply command',()=>{
 assert.ok(chat.includes('const applyDnaChangeSet'));
 assert.ok(chat.includes("action:'apply_change_set'"));
});
