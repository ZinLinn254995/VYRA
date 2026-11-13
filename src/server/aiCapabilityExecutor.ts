import {
  getAiCapabilityPolicy,
  mayAiPerformCapability,
  type AiCapabilityPolicy,
} from './vyraAiCapabilityRegistry.ts';

export interface AiExecutionRequest {
  capabilityId: string;
  userId: string;
  requestId: string;
  input: Record<string, unknown>;
  approval?: {
    requestId: string;
    approvedAt: string;
    confirmationToken: string;
  } | null;
}

export interface AiExecutionContext {
  userId: string;
  requestId: string;
  signal?: AbortSignal;
  /** Server-only dependencies supplied by the authenticated runtime; never client input. */
  runtime?: unknown;
}

export type AiExecutionResult =
  | { ok: true; capabilityId: string; data: unknown; completedAt: string }
  | { ok: false; code: 'UNKNOWN_CAPABILITY' | 'AUTH_REQUIRED' | 'HUMAN_ONLY' | 'OWNER_ADMIN_REQUIRED' | 'APPROVAL_REQUIRED' | 'NO_EXECUTOR' | 'INVALID_REQUEST' | 'EXECUTION_FAILED'; message: string };

export interface AiCapabilityAdapter {
  capabilityId: string;
  validate(input: Record<string, unknown>, context: AiExecutionContext): Promise<boolean> | boolean;
  execute(input: Record<string, unknown>, context: AiExecutionContext): Promise<unknown>;
}

export interface AiCapabilityExecutionAuthority {
  userAuthenticated: boolean;
  isOwnerOrAdmin: boolean;
  /** Must be resolved server-side against the exact request, never from a client boolean. */
  verifyApproval: (request: AiExecutionRequest, policy: AiCapabilityPolicy) => Promise<boolean>;
  /** Must verify the signed-in user's identity/ownership against the backing system. */
  verifyOwner: (userId: string, input: Record<string, unknown>, policy: AiCapabilityPolicy) => Promise<boolean>;
  /** Persist a security audit event; failure prevents the action from being reported successful. */
  audit: (event: {
    userId: string;
    requestId: string;
    capabilityId: string;
    outcome: 'started' | 'succeeded' | 'denied' | 'failed';
    reason?: string;
  }) => Promise<void>;
}

const adapters = new Map<string, AiCapabilityAdapter>();

export function registerAiCapabilityAdapter(adapter: AiCapabilityAdapter): void {
  if (!getAiCapabilityPolicy(adapter.capabilityId)) {
    throw new Error(`Cannot register unknown AI capability: ${adapter.capabilityId}`);
  }
  if (adapters.has(adapter.capabilityId)) {
    throw new Error(`AI capability adapter already registered: ${adapter.capabilityId}`);
  }
  adapters.set(adapter.capabilityId, adapter);
}

export function hasAiCapabilityAdapter(capabilityId: string): boolean {
  return adapters.has(capabilityId);
}

/** Returns a stable snapshot of adapters actually registered in this runtime. */
export function listRegisteredAiCapabilityAdapterIds(): string[] {
  return [...adapters.keys()].sort();
}

/** Fail-closed dispatcher. No capability is executable merely because it exists in the catalogue. */
export async function executeAiCapability(
  request: AiExecutionRequest,
  authority: AiCapabilityExecutionAuthority,
  now = new Date(),
  runtime?: unknown,
): Promise<AiExecutionResult> {
  const policy = getAiCapabilityPolicy(request.capabilityId);
  if (!policy) return { ok: false, code: 'UNKNOWN_CAPABILITY', message: 'This AI capability is not recognized.' };
  if (!request.userId || !request.requestId || !/^[a-zA-Z0-9._:-]{8,128}$/.test(request.requestId) ||
      !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'The action request is invalid.' };
  }
  if (!authority.userAuthenticated) {
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'denied', reason: 'authentication-required' });
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in before asking VYRA AI to perform this action.' };
  }
  const approvalGranted = policy.access === 'approval-required'
    ? await authority.verifyApproval(request, policy)
    : false;
  const access = mayAiPerformCapability(policy.id, {
    userAuthenticated: true,
    isOwnerOrAdmin: authority.isOwnerOrAdmin,
    approvalGranted,
  });
  if (!access.allowed) {
    const code = access.reason === 'human-only' ? 'HUMAN_ONLY'
      : access.reason === 'owner-admin-only' ? 'OWNER_ADMIN_REQUIRED'
      : access.reason === 'approval-required' ? 'APPROVAL_REQUIRED' : 'UNKNOWN_CAPABILITY';
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'denied', reason: access.reason });
    return { ok: false, code, message: 'This action is outside the current AI permission or approval boundary.' };
  }
  if (!await authority.verifyOwner(request.userId, request.input, policy)) {
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'denied', reason: 'owner-verification-failed' });
    return { ok: false, code: 'EXECUTION_FAILED', message: 'VYRA could not verify access to the requested resource.' };
  }
  const adapter = adapters.get(policy.id);
  if (!adapter) {
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'denied', reason: 'executor-not-implemented' });
    return { ok: false, code: 'NO_EXECUTOR', message: 'This capability is recognized but its secure VYRA executor is not connected yet.' };
  }
  const context: AiExecutionContext = { userId: request.userId, requestId: request.requestId, runtime };
  try {
    if (!await adapter.validate(request.input, context)) {
      await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'denied', reason: 'input-validation-failed' });
      return { ok: false, code: 'INVALID_REQUEST', message: 'The requested action parameters did not pass validation.' };
    }
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'started' });
    const data = await adapter.execute(request.input, context);
    if (data && typeof data === 'object' && !Array.isArray(data) &&
        (data as Record<string, unknown>).ok === false) {
      const message = typeof (data as Record<string, unknown>).message === 'string'
        ? String((data as Record<string, unknown>).message)
        : 'The VYRA action could not be completed.';
      await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'failed', reason: 'adapter-reported-failure' });
      return { ok: false, code: 'EXECUTION_FAILED', message };
    }
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'succeeded' });
    return { ok: true, capabilityId: policy.id, data, completedAt: now.toISOString() };
  } catch {
    await authority.audit({ userId: request.userId, requestId: request.requestId, capabilityId: policy.id, outcome: 'failed', reason: 'adapter-error' });
    return { ok: false, code: 'EXECUTION_FAILED', message: 'The VYRA action could not be completed. No success is being reported.' };
  }
}
