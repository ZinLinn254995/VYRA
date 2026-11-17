import type { ProjectRenderJobStatus } from './projectRenderJob';

export type ProjectRenderLease = {
  token: string;
  workerId: string;
  generation: number;
  acquiredAt: string;
  expiresAt: string;
};

export type ProjectRenderLeaseSnapshot = {
  jobId: string;
  status: ProjectRenderJobStatus;
  revision: number;
  attempt: number;
  lease: ProjectRenderLease | null;
};

export type ProjectRenderLeaseClaim = {
  snapshot: ProjectRenderLeaseSnapshot;
  reclaimed: boolean;
};

/**
 * Pure lease-claim contract for a future transactional persistence adapter.
 * The adapter must still enforce expectedRevision atomically in the database.
 */
export function claimProjectRenderLease(input: {
  snapshot: ProjectRenderLeaseSnapshot;
  expectedRevision: number;
  workerId: string;
  leaseToken: string;
  now: string;
  leaseDurationMs: number;
}): ProjectRenderLeaseClaim {
  const { snapshot } = input;
  const nowMs = Date.parse(input.now);
  if (!snapshot || !snapshot.jobId?.trim() || !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 1 || !Number.isSafeInteger(snapshot.attempt) || snapshot.attempt < 1) {
    throw new Error('A valid persisted render job snapshot is required for lease claim.');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== snapshot.revision) {
    throw new Error('The render job revision is stale; reload before claiming a lease.');
  }
  if (!input.workerId.trim() || !input.leaseToken.trim()) {
    throw new Error('A worker ID and fresh lease token are required.');
  }
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < 1_000 || input.leaseDurationMs > 15 * 60_000) {
    throw new Error('A valid timestamp and lease duration between 1 second and 15 minutes are required.');
  }
  if (!['queued', 'preparing', 'rendering', 'uploading'].includes(snapshot.status)) {
    throw new Error('Only queued or active render jobs can acquire a worker lease.');
  }
  if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('The render job revision limit has been reached.');
  }

  let reclaimed = false;
  if (snapshot.lease) {
    const expiry = Date.parse(snapshot.lease.expiresAt);
    if (!snapshot.lease.token?.trim() || !snapshot.lease.workerId?.trim() ||
        !Number.isSafeInteger(snapshot.lease.generation) || snapshot.lease.generation < 1 ||
        !Number.isFinite(Date.parse(snapshot.lease.acquiredAt)) || !Number.isFinite(expiry) ||
        expiry <= Date.parse(snapshot.lease.acquiredAt)) {
      throw new Error('The persisted worker lease is malformed.');
    }
    if (expiry > nowMs) throw new Error('The render job already has an unexpired worker lease.');
    reclaimed = true;
    if (snapshot.lease.generation === Number.MAX_SAFE_INTEGER) {
      throw new Error('The render job lease generation limit has been reached.');
    }
  }

  const expiresAt = new Date(nowMs + input.leaseDurationMs).toISOString();
  return {
    reclaimed,
    snapshot: {
      ...snapshot,
      revision: snapshot.revision + 1,
      lease: {
        token: input.leaseToken,
        workerId: input.workerId,
        generation: (snapshot.lease?.generation ?? 0) + 1,
        acquiredAt: new Date(nowMs).toISOString(),
        expiresAt,
      },
    },
  };
}

/** Renew only a currently valid lease; a worker cannot resurrect an expired lease. */
export function renewProjectRenderLease(input: {
  snapshot: ProjectRenderLeaseSnapshot;
  expectedRevision: number;
  workerId: string;
  leaseToken: string;
  now: string;
  leaseDurationMs: number;
}): ProjectRenderLeaseSnapshot {
  const { snapshot } = input;
  const nowMs = Date.parse(input.now);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== snapshot.revision) {
    throw new Error('The render job revision is stale; reload before renewing the lease.');
  }
  if (!snapshot.lease || snapshot.lease.token !== input.leaseToken ||
      snapshot.lease.workerId !== input.workerId) {
    throw new Error('Only the current lease owner may renew this render job.');
  }
  if (!Number.isFinite(nowMs) || Date.parse(snapshot.lease.expiresAt) <= nowMs) {
    throw new Error('An expired worker lease cannot be renewed.');
  }
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs < 1_000 ||
      input.leaseDurationMs > 15 * 60_000) {
    throw new Error('A lease duration between 1 second and 15 minutes is required.');
  }
  if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('The render job revision limit has been reached.');
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    lease: {
      ...snapshot.lease,
      expiresAt: new Date(nowMs + input.leaseDurationMs).toISOString(),
    },
  };
}

/** Release is fenced by both worker identity and the unguessable current lease token. */
export function releaseProjectRenderLease(input: {
  snapshot: ProjectRenderLeaseSnapshot;
  expectedRevision: number;
  workerId: string;
  leaseToken: string;
}): ProjectRenderLeaseSnapshot {
  const { snapshot } = input;
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== snapshot.revision) {
    throw new Error('The render job revision is stale; reload before releasing the lease.');
  }
  if (!snapshot.lease || snapshot.lease.token !== input.leaseToken ||
      snapshot.lease.workerId !== input.workerId) {
    throw new Error('Only the current lease owner may release this render job.');
  }
  if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('The render job revision limit has been reached.');
  }
  return { ...snapshot, revision: snapshot.revision + 1, lease: null };
}
