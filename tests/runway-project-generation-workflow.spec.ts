import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../src/services/runwayProjectGeneration.ts', import.meta.url), 'utf8');
const ingestion = readFileSync(new URL('../src/services/runwayProjectOutputIngestion.ts', import.meta.url), 'utf8');

test('generation verifies the signed-in owner and Project Assets destination before requesting a quote', () => {
  assert.ok(workflow.includes('db.auth.getUser()'));
  assert.ok(workflow.includes("from('vyrals')"));
  assert.ok(workflow.includes("metadata?.universe_scope !== 'storyboard'"));
  assert.ok(workflow.includes("'quote-runway-media'"));
});

test('generation requires explicit approval and enforces the quoted maximum before reservation', () => {
  assert.ok(workflow.includes("stage: 'approval-required'"));
  assert.ok(workflow.includes('request.requestApproval(quote)'));
  assert.ok(workflow.includes("status: 'approval_declined'"));
  assert.ok(workflow.includes('approval.maxCostUsd < quote.estimatedCostUsd'));
  assert.ok(workflow.includes("'approve-runway-media-quote'"));
  assert.ok(workflow.includes("'create-runway-media-job'"));
});

test('provider submission is never retried and unknown outcomes require reconciliation', () => {
  assert.ok(workflow.includes('Never automatically retry this request'));
  assert.ok(workflow.includes("'submit-runway-media-job'"));
  assert.ok(workflow.includes("status: 'reconciliation_required'"));
  assert.ok(!workflow.includes('for (let attempt'));
});

test('polling observes the five-second floor and ingests every confirmed output', () => {
  assert.ok(workflow.includes('Math.max(5200'));
  assert.ok(workflow.includes("'poll-runway-media-job'"));
  assert.ok(workflow.includes('[429, 502, 503]'));
  assert.ok(workflow.includes("status === 'succeeded'"));
  assert.ok(workflow.includes('outputIndex < outputCount'));
  assert.ok(workflow.includes('ingestRunwayProjectOutput(db'));
  assert.ok(ingestion.includes("'complete-runway-media-output'"));
});

test('browser cancellation after submission preserves the resumable server job', () => {
  assert.ok(workflow.includes("status: 'submitted_pending'"));
  assert.ok(workflow.includes('resumeRunwayProjectMediaIngestion'));
  assert.ok(workflow.includes("job.status !== 'succeeded'"));
  assert.ok(workflow.includes('Once submitted, cancellation only stops this browser'));
});
