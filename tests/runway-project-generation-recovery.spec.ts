import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../src/services/runwayProjectGeneration.ts', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');

test('Project generation recovery lists only the signed-in owner and selected Project destination', () => {
  assert.ok(service.includes(".eq('user_id', auth.user.id).eq('target_vyral_id', targetVyralId)"));
  assert.ok(service.includes(".in('status', ['submitted', 'processing', 'unknown', 'succeeded'])"));
  assert.ok(service.includes(".neq('asset_ingestion_status', 'ready')"));
});

test('recovery never resubmits a provider task and only resumes canonical ingestion after success', () => {
  const start = service.indexOf('export async function recoverRunwayProjectMediaJob');
  const recovery = service.slice(start);
  assert.ok(recovery.includes("job.status === 'unknown'"));
  assert.ok(recovery.includes("invoke(db, 'poll-runway-media-job'"));
  assert.ok(recovery.includes('resumeRunwayProjectMediaIngestion(db, jobId, signal)'));
  assert.equal(recovery.includes("invoke(db, 'submit-runway-media-job'"), false);
});

test('Project AI Chat offers explicit resume actions for unfinished generation jobs', () => {
  assert.ok(chat.includes('Unfinished generations'));
  assert.ok(chat.includes('recoverRunwayProjectMediaJob'));
  assert.ok(chat.includes('projectRecoveryJobs.map'));
  assert.ok(chat.includes('Needs review'));
  assert.ok(chat.includes('void refreshProjectRecovery()'));
});
