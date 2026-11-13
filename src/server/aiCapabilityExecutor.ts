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
  approval?: { requestId: string; approvedAt: string; confirmationToken: string } | null;
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
  verifyApproval: (request: AiExecutionRequest, policy: AiCapabilityPolicy) => Promise<boolean>;
  verifyOwner: (userId: string, input: Record<string, unknown>, policy: AiCapabilityPolicy) => Promise<boolean>;
  audit: (event: {
    userId: string; requestId: string; capabilityId: string;
    outcome: 'started' | 'succeeded' | 'denied' | 'failed'; reason?: string;
  }) => Promise<void>;
}

const adapters = new Map<string, AiCapabilityAdapter>();
export function registerAiCapabilityAdapter(adapter: AiCapabilityAdapter): void {
  if (!getAiCapabilityPolicy(adapter.capabilityId)) throw new Error('Cannot register unknown AI capability: ' + adapter.capabilityId);
  if (adapters.has(adapter.capabilityId)) throw new Error('AI capability adapter already registered: ' + adapter.capabilityId);
  adapters.set(adapter.capabilityId, adapter);
}
export function hasAiCapabilityAdapter(capabilityId: string): boolean { return adapters.has(capabilityId); }
export function listRegisteredAiCapabilityAdapterIds(): string[] { return [...adapters.keys()].sort(); }

const executionFailed = (message = 'The VYRA action could not be completed safely.') =>
  ({ ok: false as const, code: 'EXECUTION_FAILED' as const, message });

/** Fail-closed dispatcher. Authority, validation, execution and audit failures never grant access. */
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
  const audit = async (outcome: 'started' | 'succeeded' | 'denied' | 'failed', reason?: string) => {
    await authority.audit({
      userId: request.userId, requestId: request.requestId, capabilityId: policy.id,
      outcome, ...(reason ? { reason } : {}),
    });
  };
  const deny = async (
    code: 'AUTH_REQUIRED' | 'HUMAN_ONLY' | 'OWNER_ADMIN_REQUIRED' | 'APPROVAL_REQUIRED' | 'NO_EXECUTOR' | 'INVALID_REQUEST' | 'EXECUTION_FAILED',
    reason: string,
    message: string,
  ): Promise<AiExecutionResult> => {
    try { await audit('denied', reason); return { ok: false, code, message }; }
    catch { return executionFailed('VYRA could not persist the security audit. The action was not executed.'); }
  };

  if (!authority.userAuthenticated) {
    return await deny('AUTH_REQUIRED', 'authentication-required', 'Sign in before asking VYRA AI to perform this action.');
  }

  let approvalGranted = false;
  if (policy.access === 'approval-required') {
    try { approvalGranted = await authority.verifyApproval(request, policy); }
    catch { approvalGranted = false; }
  }
  const access = mayAiPerformCapability(policy.id, {
    userAuthenticated: true, isOwnerOrAdmin: authority.isOwnerOrAdmin, approvalGranted,
  });
  if (!access.allowed) {
    const code = access.reason === 'human-only' ? 'HUMAN_ONLY'
      : access.reason === 'owner-admin-only' ? 'OWNER_ADMIN_REQUIRED'
      : access.reason === 'approval-required' ? 'APPROVAL_REQUIRED' : 'UNKNOWN_CAPABILITY';
    if (code === 'UNKNOWN_CAPABILITY') return { ok: false, code, message: 'This AI capability is not recognized.' };
    return await deny(code, access.reason, 'This action is outside the current AI permission or approval boundary.');
  }

  let ownerVerified = false;
  try { ownerVerified = await authority.verifyOwner(request.userId, request.input, policy); }
  catch { ownerVerified = false; }
  if (!ownerVerified) {
    return await deny('EXECUTION_FAILED', 'owner-verification-failed', 'VYRA could not verify access to the requested resource.');
  }

  const adapter = adapters.get(policy.id);
  if (!adapter) {
    return await deny('NO_EXECUTOR', 'executor-not-implemented', 'This capability is recognized but its secure VYRA executor is not connected yet.');
  }

  const context: AiExecutionContext = { userId: request.userId, requestId: request.requestId, runtime };
  let valid = false;
  try { valid = await adapter.validate(request.input, context); }
  catch { valid = false; }
  if (!valid) {
    return await deny('INVALID_REQUEST', 'input-validation-failed', 'The requested action parameters did not pass validation.');
  }

  try { await audit('started'); }
  catch { return executionFailed('VYRA could not persist the start audit. The action was not executed.'); }

  let data: unknown;
  try { data = await adapter.execute(request.input, context); }
  catch {
    try { await audit('failed', 'adapter-error'); } catch { /* preserve the execution failure */ }
    return executionFailed('The VYRA action could not be completed. No success is being reported.');
  }

  if (data && typeof data === 'object' && !Array.isArray(data) &&
      (data as Record<string, unknown>).ok === false) {
    const message = typeof (data as Record<string, unknown>).message === 'string'
      ? String((data as Record<string, unknown>).message) : 'The VYRA action could not be completed.';
    try { await audit('failed', 'adapter-reported-failure'); } catch { /* preserve the adapter failure */ }
    return { ok: false, code: 'EXECUTION_FAILED', message };
  }

  try { await audit('succeeded'); }
  catch {
    return executionFailed('The action may have run, but VYRA could not persist its completion audit. Refresh the resource before retrying.');
  }
  return { ok: true, capabilityId: policy.id, data, completedAt: now.toISOString() };
}
