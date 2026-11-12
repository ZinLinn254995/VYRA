import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionMediaGenerationJob,
  validateMediaGenerationApproval,
  type MediaGenerationQuote,
} from '../src/server/mediaGenerationContract.ts';
import type { MediaModelSelection } from '../src/services/mediaModelSelection.ts';

const selection: Extract<MediaModelSelection, { ok: true }> = {
  ok: true,
  mode: 'auto',
  selectedBy: 'automatic',
  model: {
    id: 'video-model', provider: 'runway', displayName: 'Video Model',
    tasks: ['video'], enabled: true, qualityScore: 80,
    estimatedCostUsd: 0.75, estimatedLatencyMs: 10000, supportsDnaReferences: true,
  },
  estimatedCostUsd: 0.75,
  estimatedLatencyMs: 10000,
};

const quote: MediaGenerationQuote = {
  id: 'quote-2026-001',
  createdAt: '2026-11-13T00:00:00.000Z',
  expiresAt: '2026-11-13T00:05:00.000Z',
  selection,
  estimatedCostUsd: 0.75,
  requestFingerprint: 'sha256:request-fingerprint',
};
const approval = {
  quoteId: quote.id,
  confirmedAt: '2026-11-13T00:01:00.000Z',
  maxCostUsd: 1,
  idempotencyKey: 'generation_request_0001',
};
const now = new Date('2026-11-13T00:02:00.000Z');

test('requires explicit approval before a generation can be submitted', () => {
  assert.deepEqual(validateMediaGenerationApproval(quote, null, now), {
    ok: false, reason: 'approval-missing',
  });
});

test('accepts a matching, current quote within the confirmed budget', () => {
  assert.deepEqual(validateMediaGenerationApproval(quote, approval, now), {
    ok: true, idempotencyKey: approval.idempotencyKey, approvedCostUsd: 0.75,
  });
});

test('rejects expired quotes, mismatched quote IDs and budget overruns', () => {
  assert.deepEqual(validateMediaGenerationApproval(
    { ...quote, expiresAt: '2026-11-13T00:01:00.000Z' }, approval, now,
  ), { ok: false, reason: 'quote-expired' });
  assert.deepEqual(validateMediaGenerationApproval(
    quote, { ...approval, quoteId: 'another-quote' }, now,
  ), { ok: false, reason: 'quote-mismatch' });
  assert.deepEqual(validateMediaGenerationApproval(
    quote, { ...approval, maxCostUsd: 0.5 }, now,
  ), { ok: false, reason: 'budget-exceeded' });
});

test('rejects malformed quote, future approval and invalid idempotency key', () => {
  assert.deepEqual(validateMediaGenerationApproval(
    { ...quote, estimatedCostUsd: Number.NaN }, approval, now,
  ), { ok: false, reason: 'quote-invalid' });
  assert.deepEqual(validateMediaGenerationApproval(
    quote, { ...approval, confirmedAt: '2026-11-13T00:03:00.000Z' }, now,
  ), { ok: false, reason: 'approval-invalid' });
  assert.deepEqual(validateMediaGenerationApproval(
    quote, { ...approval, idempotencyKey: 'short' }, now,
  ), { ok: false, reason: 'invalid-idempotency-key' });
});

test('allows only forward generation-job transitions', () => {
  assert.equal(canTransitionMediaGenerationJob('pending', 'submitted'), true);
  assert.equal(canTransitionMediaGenerationJob('submitted', 'succeeded'), true);
  assert.equal(canTransitionMediaGenerationJob('processing', 'failed'), true);
  assert.equal(canTransitionMediaGenerationJob('pending', 'cancelled'), true);
  assert.equal(canTransitionMediaGenerationJob('succeeded', 'processing'), false);
  assert.equal(canTransitionMediaGenerationJob('failed', 'succeeded'), false);
  assert.equal(canTransitionMediaGenerationJob('cancelled', 'pending'), false);
});
