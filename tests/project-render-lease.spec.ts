import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimProjectRenderLease,
  releaseProjectRenderLease,
  renewProjectRenderLease,
  type ProjectRenderLeaseSnapshot,
} from '../src/services/projectRenderLease.ts';

const now = '2026-11-17T16:00:00.000Z';
const base = (): ProjectRenderLeaseSnapshot => ({
  jobId: 'render-job-lease-1',
  status: 'queued',
  revision: 1,
  attempt: 1,
  lease: null,
});

test('claims a queued job with a fresh fencing generation and bounded expiry', () => {
  const result = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'unguessable-token-a', now, leaseDurationMs: 30_000,
  });
  assert.equal(result.reclaimed, false);
  assert.equal(result.snapshot.revision, 2);
  assert.equal(result.snapshot.lease?.generation, 1);
  assert.equal(result.snapshot.lease?.workerId, 'worker-a');
  assert.equal(result.snapshot.lease?.expiresAt, '2026-11-17T16:00:30.000Z');
});

test('rejects stale revisions, invalid states and a second claim while a lease is live', () => {
  const claimed = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 30_000,
  }).snapshot;
  assert.throws(() => claimProjectRenderLease({
    snapshot: claimed, expectedRevision: 1, workerId: 'worker-b',
    leaseToken: 'token-b', now, leaseDurationMs: 30_000,
  }), /revision is stale/);
  assert.throws(() => claimProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-b',
    leaseToken: 'token-b', now, leaseDurationMs: 30_000,
  }), /unexpired worker lease/);
  assert.throws(() => claimProjectRenderLease({
    snapshot: { ...base(), status: 'completed' }, expectedRevision: 1,
    workerId: 'worker-a', leaseToken: 'token-a', now, leaseDurationMs: 30_000,
  }), /Only queued or active/);
});

test('reclaims an expired lease with a new token and incremented fencing generation', () => {
  const first = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;
  const recovered = claimProjectRenderLease({
    snapshot: first, expectedRevision: 2, workerId: 'worker-b',
    leaseToken: 'token-b', now: '2026-11-17T16:00:05.000Z', leaseDurationMs: 20_000,
  });
  assert.equal(recovered.reclaimed, true);
  assert.equal(recovered.snapshot.revision, 3);
  assert.equal(recovered.snapshot.lease?.generation, 2);
  assert.equal(recovered.snapshot.lease?.token, 'token-b');
  assert.equal(recovered.snapshot.attempt, 1, 'lease recovery is not a user retry');
});

test('only the current unexpired lease owner can renew; expired leases cannot be resurrected', () => {
  const claimed = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;
  assert.throws(() => renewProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-b',
    leaseToken: 'token-a', now, leaseDurationMs: 10_000,
  }), /current lease owner/);
  const renewed = renewProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-a',
    leaseToken: 'token-a', now: '2026-11-17T16:00:02.000Z', leaseDurationMs: 15_000,
  });
  assert.equal(renewed.revision, 3);
  assert.equal(renewed.lease?.expiresAt, '2026-11-17T16:00:17.000Z');
  assert.throws(() => renewProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-a',
    leaseToken: 'token-a', now: '2026-11-17T16:00:05.000Z', leaseDurationMs: 10_000,
  }), /expired worker lease/);
});


test('renewal rejects malformed or not-yet-active persisted leases', () => {
  const claimed = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;
  assert.throws(() => renewProjectRenderLease({
    snapshot: { ...claimed, lease: { ...claimed.lease!, expiresAt: 'not-a-date' } },
    expectedRevision: 2, workerId: 'worker-a', leaseToken: 'token-a',
    now: '2026-11-17T16:00:02.000Z', leaseDurationMs: 10_000,
  }), /lease is malformed/);
  assert.throws(() => renewProjectRenderLease({
    snapshot: { ...claimed, lease: { ...claimed.lease!, acquiredAt: '2026-11-17T16:00:03.000Z' } },
    expectedRevision: 2, workerId: 'worker-a', leaseToken: 'token-a',
    now: '2026-11-17T16:00:02.000Z', leaseDurationMs: 10_000,
  }), /not-yet-active/);
});

test('release requires exact worker, token and revision', () => {
  const claimed = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;
  assert.throws(() => releaseProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-b', leaseToken: 'token-a',
  }), /current lease owner/);
  const released = releaseProjectRenderLease({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-a', leaseToken: 'token-a',
  });
  assert.equal(released.revision, 3);
  assert.equal(released.lease, null);
});

test('rejects malformed lease envelopes and unsafe lease durations', () => {
  assert.throws(() => claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now: 'not-a-date', leaseDurationMs: 5_000,
  }), /valid timestamp/);
  assert.throws(() => claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 999,
  }), /lease duration/);
  const malformed = { ...base(), lease: { token: '', workerId: 'worker-a', generation: 1,
    acquiredAt: now, expiresAt: '2026-11-17T16:00:05.000Z' } };
  assert.throws(() => claimProjectRenderLease({
    snapshot: malformed, expectedRevision: 1, workerId: 'worker-b',
    leaseToken: 'token-b', now: '2026-11-17T16:00:06.000Z', leaseDurationMs: 5_000,
  }), /lease is malformed/);
});

test('worker writes require the current revision, token, worker and fencing generation', async () => {
  const { assertProjectRenderLeaseOwnership } = await import('../src/services/projectRenderLease.ts');
  const first = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;

  assert.doesNotThrow(() => assertProjectRenderLeaseOwnership({
    snapshot: first, expectedRevision: 2, workerId: 'worker-a',
    leaseToken: 'token-a', leaseGeneration: 1, now: '2026-11-17T16:00:02.000Z',
  }));

  const recovered = claimProjectRenderLease({
    snapshot: first, expectedRevision: 2, workerId: 'worker-b',
    leaseToken: 'token-b', now: '2026-11-17T16:00:05.000Z', leaseDurationMs: 20_000,
  }).snapshot;

  assert.throws(() => assertProjectRenderLeaseOwnership({
    snapshot: recovered, expectedRevision: 2, workerId: 'worker-a',
    leaseToken: 'token-a', leaseGeneration: 1, now: '2026-11-17T16:00:06.000Z',
  }), /revision is stale/);
  assert.throws(() => assertProjectRenderLeaseOwnership({
    snapshot: recovered, expectedRevision: 3, workerId: 'worker-a',
    leaseToken: 'token-a', leaseGeneration: 1, now: '2026-11-17T16:00:06.000Z',
  }), /does not match/);
  assert.doesNotThrow(() => assertProjectRenderLeaseOwnership({
    snapshot: recovered, expectedRevision: 3, workerId: 'worker-b',
    leaseToken: 'token-b', leaseGeneration: 2, now: '2026-11-17T16:00:06.000Z',
  }));
});

test('worker writes reject expired leases and malformed fencing metadata', async () => {
  const { assertProjectRenderLeaseOwnership } = await import('../src/services/projectRenderLease.ts');
  const claimed = claimProjectRenderLease({
    snapshot: base(), expectedRevision: 1, workerId: 'worker-a',
    leaseToken: 'token-a', now, leaseDurationMs: 5_000,
  }).snapshot;

  assert.throws(() => assertProjectRenderLeaseOwnership({
    snapshot: claimed, expectedRevision: 2, workerId: 'worker-a',
    leaseToken: 'token-a', leaseGeneration: 1, now: '2026-11-17T16:00:05.000Z',
  }), /lease has expired/);
  assert.throws(() => assertProjectRenderLeaseOwnership({
    snapshot: { ...claimed, lease: { ...claimed.lease!, generation: 0 } },
    expectedRevision: 2, workerId: 'worker-a', leaseToken: 'token-a',
    leaseGeneration: 0, now: '2026-11-17T16:00:02.000Z',
  }), /malformed/);
});
