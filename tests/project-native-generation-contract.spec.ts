import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('new generation jobs can be reserved against a real Project without an Assets Vyral', () => {
  const edge = read('supabase/functions/create-runway-media-job/index.ts');
  assert.ok(edge.includes('body.targetProjectId'));
  assert.ok(edge.includes("rpc('create_runway_media_job_for_project'"));
  assert.ok(edge.includes('p_target_project_id: body.targetProjectId'));
  assert.ok(edge.includes('isProjectTarget === isLegacyVyralTarget'));
  assert.ok(edge.includes('targetProjectId: job.target_project_id'));
});

test('Project generation outputs are indexed as canonical Project Files, not Vyral Assets', () => {
  const transfer = read('supabase/functions/transfer-runway-media-output/index.ts');
  assert.ok(transfer.includes('claim.target_project_id'));
  assert.ok(transfer.includes('claim.output_id'));
  assert.ok(transfer.includes("userId + '/media-library/' + targetProjectId + '/' + projectFileId"));
  assert.ok(transfer.includes("source_kind: 'generated'"));
  assert.ok(transfer.includes('project_id: targetProjectId'));
  assert.ok(transfer.includes('source_asset_id: null'));
  assert.ok(transfer.includes("rpc('record_runway_project_output_transfer'"));
  assert.ok(!transfer.includes('ingestGeneratedVyralAsset'));
});

test('Project output completion verifies Project ownership and hash without Asset IDs', () => {
  const complete = read('supabase/functions/complete-runway-media-output/index.ts');
  assert.ok(complete.includes('if (job.target_project_id)'));
  assert.ok(complete.includes('.eq(\'project_id\', job.target_project_id)'));
  assert.ok(complete.includes('item.metadata?.generation_job_id'));
  assert.ok(complete.includes('item.metadata?.sha256 !== output.sha256'));
  assert.ok(complete.includes('p_project_file_id: projectFileId'));
  assert.ok(complete.includes('if (!job.target_vyral_id)'));
});

test('Project-native client generation restores outputs into Offline Storage with stable IDs', () => {
  const client = read('src/services/runwayProjectFileGeneration.ts');
  assert.ok(client.includes('targetProjectId: request.projectId'));
  assert.ok(client.includes("invoke(db, 'transfer-runway-media-output'"));
  assert.ok(client.includes('projectFileId: transferred.projectFileId'));
  assert.ok(client.includes('installProjectCloudFileToOfflineStorage'));
  assert.ok(client.includes("invoke(db, 'complete-runway-media-output'"));
  assert.ok(client.includes("status: 'ready' as const, quote, jobId, files"));
  assert.ok(!client.includes('targetVyralId'));
  assert.ok(!client.includes('vyral_assets'));
});

test('Project-native generation architecture preserves the legacy recovery boundary', () => {
  const doc = read('docs/architecture/PROJECT_NATIVE_GENERATION.md');
  assert.ok(doc.includes('Historical Vyral-targeted jobs continue'));
  assert.ok(doc.includes('New jobs set'));
  assert.ok(doc.includes('No new output requires'));
  assert.ok(doc.includes('Migration and rollout gates'));
});


test('Project Chat sends non-Scene generation to the Project File service and persists file identity', () => {
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(chat.includes("import { generateRunwayProjectFiles }"));
  assert.ok(chat.includes('if (!activeDirectorScenePlan && !repairRequest)'));
  assert.ok(chat.includes('projectId: storyboardId'));
  assert.ok(chat.includes('projectFiles.push({ projectFileId: file.projectFileId'));
  assert.ok(chat.includes('message.projectFiles?.length'));
  assert.ok(chat.includes('projectFiles: message.projectFiles.flatMap'));
  assert.ok(chat.includes(".eq('project_id', storyboardId).is('universe_id', null)"));
  assert.ok(chat.includes('File remains saved in Project Storage'));
  assert.ok(chat.includes('Scene shot sequences remain on the verified legacy continuity workflow'));
});


test('Project Chat can recover queued, submitted, and partially ingested Project-native jobs', () => {
  const client = read('src/services/runwayProjectFileGeneration.ts');
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(client.includes("if (job.status === 'queued')"));
  assert.ok(client.includes("invoke(db, 'submit-runway-media-job'"));
  assert.ok(client.includes("invoke(db, 'poll-runway-media-job'"));
  assert.ok(client.includes("invoke(db, 'transfer-runway-media-output'"));
  assert.ok(client.includes("invoke(db, 'complete-runway-media-output'"));
  assert.ok(chat.includes('recoverRunwayProjectFiles'));
  assert.ok(chat.includes("setProjectFileRecoveryJobs"));
  assert.ok(chat.includes("Project File generations"));
  assert.ok(chat.includes('recoverProjectFileGeneration(job.id)'));
});
