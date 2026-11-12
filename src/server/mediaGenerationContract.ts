import type { MediaModelSelection } from '../services/mediaModelSelection.ts';

export type MediaGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface MediaGenerationQuote {
  id: string;
  createdAt: string;
  expiresAt: string;
  selection: Extract<MediaModelSelection, { ok: true }>;
  estimatedCostUsd: number;
  requestFingerprint: string;
}

export interface MediaGenerationApproval {
  quoteId: string;
  confirmedAt: string;
  maxCostUsd: number;
  idempotencyKey: string;
}

export type ApprovalFailure =
  | 'quote-expired'
  | 'quote-invalid'
  | 'quote-mismatch'
  | 'approval-missing'
  | 'approval-invalid'
  | 'budget-exceeded'
  | 'invalid-idempotency-key';

export type ApprovalResult =
  | { ok: true; idempotencyKey: string; approvedCostUsd: number }
  | { ok: false; reason: ApprovalFailure };

/** Validate explicit customer approval immediately before any billable provider submission. */
export function validateMediaGenerationApproval(
  quote: MediaGenerationQuote,
  approval: MediaGenerationApproval | null | undefined,
  now = new Date(),
): ApprovalResult {
  if (!quote.id || !quote.requestFingerprint ||
      !Number.isFinite(quote.estimatedCostUsd) || quote.estimatedCostUsd < 0 ||
      !Number.isFinite(Date.parse(quote.createdAt)) ||
      !Number.isFinite(Date.parse(quote.expiresAt))) {
    return { ok: false, reason: 'quote-invalid' };
  }
  if (Date.parse(quote.expiresAt) <= now.getTime()) {
    return { ok: false, reason: 'quote-expired' };
  }
  if (!approval) return { ok: false, reason: 'approval-missing' };
  if (approval.quoteId !== quote.id) return { ok: false, reason: 'quote-mismatch' };
  if (!Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd < 0 ||
      !Number.isFinite(Date.parse(approval.confirmedAt)) ||
      Date.parse(approval.confirmedAt) > now.getTime() ||
      Date.parse(approval.confirmedAt) < Date.parse(quote.createdAt)) {
    return { ok: false, reason: 'approval-invalid' };
  }
  if (quote.estimatedCostUsd > approval.maxCostUsd) {
    return { ok: false, reason: 'budget-exceeded' };
  }
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(approval.idempotencyKey)) {
    return { ok: false, reason: 'invalid-idempotency-key' };
  }
  return {
    ok: true,
    idempotencyKey: approval.idempotencyKey,
    approvedCostUsd: quote.estimatedCostUsd,
  };
}

const allowedTransitions: Record<MediaGenerationJobStatus, readonly MediaGenerationJobStatus[]> = {
  queued: ['running', 'failed', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionMediaGenerationJob(
  from: MediaGenerationJobStatus,
  to: MediaGenerationJobStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}
