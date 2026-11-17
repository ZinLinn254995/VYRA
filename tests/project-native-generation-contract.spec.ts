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
  assert.ok(complete.includes("item.source_kind !== 'generated'"));
  assert.ok(complete.includes('item.metadata?.generation_job_id'));
  assert.ok(complete.includes('item.metadata?.sha256 !== output.sha256'));
  assert.ok(complete.includes('p_project_file_id: projectFileId'));
  assert.ok(complete.includes('if (!job.target_vyral_id)'));
});

test('already-ingested Project output recovery revalidates the immutable output and file identity', () => {
  const transfer = read('supabase/functions/transfer-runway-media-output/index.ts');
  assert.ok(transfer.includes("output.transfer_status !== 'ingested'"));
  assert.ok(transfer.includes('output.project_file_id !== claim.project_file_id'));
  assert.ok(transfer.includes('item.storage_path !== output.storage_path'));
  assert.ok(transfer.includes('item.metadata?.generation_job_id !== body.jobId'));
  assert.ok(transfer.includes('item.metadata?.sha256 !== output.sha256'));
  assert.ok(transfer.includes('item.bucket_id !== BUCKET'));
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
  assert.ok(doc.includes('New generation jobs set'));
  assert.ok(doc.includes('No new output requires'));
  assert.ok(doc.includes('Migration and rollout gates'));
});


test('Project Chat sends non-Scene generation to the Project File service and persists file identity', () => {
  const chat = read('src/components/ai/AIChatPage.tsx');
  assert.ok(chat.includes('import { generateRunwayProjectFiles, recoverRunwayProjectFiles }'));
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

test('Project output transfer accepts Project destinations and fences stale retry workers', () => {
  const migration = read('supabase/migrations/20261117060000_project_output_transfer_lease_fencing.sql');
  const transfer = read('supabase/functions/transfer-runway-media-output/index.ts');
  assert.ok(migration.includes('v_job.target_project_id is null and v_job.target_vyral_id is null'));
  assert.ok(migration.includes('transfer_lease_token = v_lease_token'));
  assert.ok(migration.includes('v_output.transfer_lease_token is distinct from p_lease_token'));
  assert.ok(migration.includes('transfer_lease_expires_at <= pg_catalog.now()'));
  assert.ok(transfer.includes("typeof claim.lease_token === 'string'"));
  assert.ok(transfer.includes('p_lease_token: leaseToken'));
  const legacyTransfer = transfer.slice(transfer.indexOf('const targetVyralId ='));
  assert.ok(!legacyTransfer.includes('p_lease_token: leaseToken'));
});


test('Runway submission is claimed once before provider I/O and never auto-resubmitted', () => {
  const migration = read('supabase/migrations/20261116100000_runway_media_submission_claim.sql');
  const submit = read('supabase/functions/submit-runway-media-job/index.ts');
  assert.ok(migration.includes("set status = 'submitted'"));
  assert.ok(migration.includes("provider_submission_outcome = 'unknown'"));
  assert.ok(migration.includes("if v_job.status <> 'pending'"));
  assert.ok(migration.includes("provider_submission_outcome in ('accepted','rejected')"));
  assert.ok(submit.indexOf("rpc('claim_runway_media_job'") < submit.indexOf('submitRunwayTask({'));
  assert.ok(submit.includes('for (let attempt = 0; attempt < 3; attempt++)'));
  assert.ok(submit.includes('The provider submission is never repeated here') ||
    submit.includes('Provider submission is never repeated here'));
});

test('Runway polling serializes requests and protects terminal snapshots from stale responses', () => {
  const migration = read('supabase/migrations/20261116110000_runway_media_task_polling.sql');
  const poll = read('supabase/functions/poll-runway-media-job/index.ts');
  assert.ok(migration.includes("interval '5 seconds'"));
  assert.ok(migration.includes("v_job.provider_task_status = 'processing' and p_status = 'pending'"));
  assert.ok(migration.includes("v_job.status in ('succeeded','failed','cancelled')"));
  assert.ok(migration.includes('v_job.provider_task_id is distinct from p_provider_task_id'));
  assert.ok(poll.indexOf("rpc('claim_runway_media_task_poll'") < poll.indexOf('getRunwayTask(apiKey, taskId)'));
  assert.ok(poll.includes("snapshot.status === 'succeeded' && snapshot.outputUrls.length === 0"));
});

test('Project output transfer refuses to overwrite a colliding canonical Project File ID', () => {
  const transfer = read('supabase/functions/transfer-runway-media-output/index.ts');
  assert.ok(transfer.includes("select('id,user_id,project_id,universe_id,source_asset_id,source_kind,bucket_id,storage_path,mime_type,size_bytes,metadata')"));
  assert.ok(transfer.includes('.eq(\'id\', projectFileId).maybeSingle()'));
  assert.ok(transfer.includes("existingItem.source_kind !== 'generated'"));
  assert.ok(transfer.includes('existingItem.user_id !== userId'));
  assert.ok(transfer.includes('existingItem.project_id !== targetProjectId'));
  assert.ok(transfer.includes('existingItem.metadata?.generation_job_id !== body.jobId'));
  assert.ok(transfer.includes('existingItem.metadata?.sha256 !== digest'));
  assert.ok(transfer.includes('project_file_identity_conflict'));
  assert.ok(transfer.indexOf('existingItemError') < transfer.indexOf('storage.from(BUCKET).upload('));
});


test('Runway preflight failures are recorded as rejected before any provider request', () => {
  const submit = read('supabase/functions/submit-runway-media-job/index.ts');
  const payloadFailureIndex = submit.indexOf("p_failure_code: 'claimed_payload_invalid'");
  const secretFailureIndex = submit.indexOf("p_failure_code: 'provider_secret_unavailable'");
  const payloadFailure = submit.slice(Math.max(0, payloadFailureIndex - 120), payloadFailureIndex + 100);
  const secretFailure = submit.slice(Math.max(0, secretFailureIndex - 120), secretFailureIndex + 100);
  assert.ok(payloadFailure.includes("p_outcome: 'rejected'"));
  assert.ok(secretFailure.includes("p_outcome: 'rejected'"));
  assert.ok(submit.indexOf("p_failure_code: 'claimed_payload_invalid'") < submit.indexOf('submitRunwayTask({'));
  assert.ok(submit.indexOf("p_failure_code: 'provider_secret_unavailable'") < submit.indexOf('submitRunwayTask({'));
});
