export type GlobalChatActionRisk = 'read' | 'reversible-write' | 'destructive' | 'billable';

export type GlobalChatActionOperation =
  | 'storyboard.list'
  | 'storyboard.read'
  | 'storyboard.create'
  | 'storyboard.update'
  | 'storyboard.delete'
  | 'scene.read'
  | 'scene.update'
  | 'timeline.update'
  | 'vyral.create'
  | 'asset.upload'
  | 'media.generate'
  | 'workspace.navigate';

type OperationPolicy = {
  risk: GlobalChatActionRisk;
  requiresVyral: boolean;
  requiresStoryboard: boolean;
  requiresScene: boolean;
  parameterKeys: readonly string[];
};

const POLICIES: Record<GlobalChatActionOperation, OperationPolicy> = {
  'storyboard.list': { risk: 'read', requiresVyral: false, requiresStoryboard: false, requiresScene: false, parameterKeys: [] },
  'storyboard.read': { risk: 'read', requiresVyral: false, requiresStoryboard: true, requiresScene: false, parameterKeys: [] },
  'storyboard.create': { risk: 'reversible-write', requiresVyral: false, requiresStoryboard: false, requiresScene: false, parameterKeys: ['title', 'topic'] },
  'storyboard.update': { risk: 'reversible-write', requiresVyral: false, requiresStoryboard: true, requiresScene: false, parameterKeys: ['field', 'value', 'expectedUpdatedAt'] },
  'storyboard.delete': { risk: 'destructive', requiresVyral: false, requiresStoryboard: true, requiresScene: false, parameterKeys: ['expectedUpdatedAt'] },
  'scene.read': { risk: 'read', requiresVyral: false, requiresStoryboard: true, requiresScene: true, parameterKeys: [] },
  'scene.update': { risk: 'reversible-write', requiresVyral: false, requiresStoryboard: true, requiresScene: true, parameterKeys: ['field', 'value', 'expectedUpdatedAt'] },
  'timeline.update': { risk: 'reversible-write', requiresVyral: false, requiresStoryboard: true, requiresScene: false, parameterKeys: ['itemKind', 'itemId', 'field', 'value', 'expectedUpdatedAt'] },
  'vyral.create': { risk: 'reversible-write', requiresVyral: false, requiresStoryboard: false, requiresScene: false, parameterKeys: ['name', 'description'] },
  'asset.upload': { risk: 'reversible-write', requiresVyral: true, requiresStoryboard: false, requiresScene: false, parameterKeys: ['fileToken', 'fileName', 'mimeType', 'sizeBytes'] },
  'media.generate': { risk: 'billable', requiresVyral: false, requiresStoryboard: false, requiresScene: false, parameterKeys: ['task', 'prompt', 'quality', 'quoteId', 'maxCredits'] },
  'workspace.navigate': { risk: 'read', requiresVyral: false, requiresStoryboard: false, requiresScene: false, parameterKeys: ['destination'] },
};

export interface GlobalChatActionPlan {
  id: string;
  operation: GlobalChatActionOperation;
  target?: {
    vyralId?: string;
    storyboardId?: string;
    sceneId?: string;
  };
  parameters?: Record<string, string | number | boolean | null>;
  summary: string;
  createdAt: string;
  expiresAt: string;
}

export interface GlobalChatActionContext {
  activeVyralId?: string | null;
  activeStoryboardId?: string | null;
  activeSceneId?: string | null;
}

export type GlobalChatActionApproval =
  | { kind: 'reversible'; planId: string; approvedAt: string }
  | { kind: 'destructive'; planId: string; challenge: string; confirmedAt: string }
  | { kind: 'billable'; planId: string; quoteId: string; maxCredits: number; confirmedAt: string };

export type GlobalChatActionValidationFailure =
  | 'invalid-plan'
  | 'unsupported-operation'
  | 'invalid-parameters'
  | 'missing-target'
  | 'context-mismatch'
  | 'plan-expired'
  | 'approval-required'
  | 'approval-mismatch'
  | 'approval-invalid'
  | 'owner-not-verified';

export type GlobalChatActionValidation =
  | { ok: true; risk: GlobalChatActionRisk; requiresApproval: boolean; operation: GlobalChatActionOperation }
  | { ok: false; reason: GlobalChatActionValidationFailure };

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function validateParameters(
  operation: GlobalChatActionOperation,
  parameters: unknown,
): boolean {
  if (parameters === undefined) return POLICIES[operation].parameterKeys.length === 0;
  if (!isPlainRecord(parameters)) return false;
  const allowed = POLICIES[operation].parameterKeys;
  const keys = Object.keys(parameters);
  if (keys.some((key) => !allowed.includes(key)) || keys.length > allowed.length) return false;
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.length > (key === 'prompt' || key === 'topic' || key === 'description' ? 4000 : 500)) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return false;
  }
  const hasExpectedVersion = typeof parameters.expectedUpdatedAt === 'string' &&
    Number.isFinite(Date.parse(parameters.expectedUpdatedAt));
  if (operation === 'storyboard.create') {
    return typeof parameters.title === 'string' && parameters.title.trim().length > 0 &&
      typeof parameters.topic === 'string' && parameters.topic.trim().length > 0;
  }
  if (operation === 'storyboard.update') {
    return ['title', 'topic'].includes(String(parameters.field)) &&
      typeof parameters.value === 'string' && parameters.value.trim().length > 0 && hasExpectedVersion;
  }
  if (operation === 'storyboard.delete') return hasExpectedVersion;
  if (operation === 'scene.update') {
    return ['title', 'description', 'duration', 'transition'].includes(String(parameters.field)) &&
      parameters.value !== undefined && parameters.value !== null && hasExpectedVersion;
  }
  if (operation === 'timeline.update') {
    return ['scene', 'transition', 'text-clip', 'audio-clip'].includes(String(parameters.itemKind)) &&
      typeof parameters.itemId === 'string' && parameters.itemId.length > 0 &&
      typeof parameters.field === 'string' && parameters.field.length > 0 &&
      parameters.value !== undefined && parameters.value !== null && hasExpectedVersion;
  }
  if (operation === 'vyral.create') return typeof parameters.name === 'string' && parameters.name.trim().length > 0;
  if (operation === 'asset.upload') {
    return typeof parameters.fileToken === 'string' && parameters.fileToken.length >= 8 &&
      typeof parameters.fileName === 'string' && parameters.fileName.trim().length > 0 &&
      typeof parameters.mimeType === 'string' && parameters.mimeType.length > 0 &&
      typeof parameters.sizeBytes === 'number' && Number.isSafeInteger(parameters.sizeBytes) && parameters.sizeBytes > 0;
  }
  if (operation === 'media.generate') {
    return ['image', 'video', 'audio', 'video-edit'].includes(String(parameters.task)) &&
      typeof parameters.prompt === 'string' && parameters.prompt.trim().length > 0 &&
      ['draft', 'standard', 'premium'].includes(String(parameters.quality)) &&
      typeof parameters.quoteId === 'string' && parameters.quoteId.length > 0 &&
      typeof parameters.maxCredits === 'number' && Number.isInteger(parameters.maxCredits) && parameters.maxCredits > 0;
  }
  if (operation === 'workspace.navigate') return typeof parameters.destination === 'string' &&
    ['workspace', 'marketplace', 'my-vyrals', 'my-media-library'].includes(parameters.destination);
  return true;
}

/** Validates a model-proposed plan without granting it database or provider access. */
export function validateGlobalChatActionPlan(
  plan: GlobalChatActionPlan,
  context: GlobalChatActionContext,
  now = new Date(),
): GlobalChatActionValidation {
  if (!plan || !isUuid(plan.id) || typeof plan.operation !== 'string' ||
      typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 500 ||
      !Number.isFinite(Date.parse(plan.createdAt)) || !Number.isFinite(Date.parse(plan.expiresAt))) {
    return { ok: false, reason: 'invalid-plan' };
  }
  if (Date.parse(plan.expiresAt) <= now.getTime() || Date.parse(plan.createdAt) > now.getTime()) {
    return { ok: false, reason: 'plan-expired' };
  }
  const policy = POLICIES[plan.operation as GlobalChatActionOperation];
  if (!policy) return { ok: false, reason: 'unsupported-operation' };
  if (!validateParameters(plan.operation, plan.parameters)) return { ok: false, reason: 'invalid-parameters' };

  const target = plan.target ?? {};
  if (Object.keys(target).some((key) => !['vyralId', 'storyboardId', 'sceneId'].includes(key)) ||
      Object.values(target).some((value) => !isUuid(value))) {
    return { ok: false, reason: 'missing-target' };
  }
  if (policy.requiresVyral && !(isUuid(target.vyralId) && target.vyralId === context.activeVyralId)) {
    return { ok: false, reason: 'missing-target' };
  }
  if (policy.requiresStoryboard && !(isUuid(target.storyboardId) && target.storyboardId === context.activeStoryboardId)) {
    return { ok: false, reason: 'missing-target' };
  }
  if (policy.requiresScene && !(isUuid(target.sceneId) && target.sceneId === context.activeSceneId)) {
    return { ok: false, reason: 'missing-target' };
  }
  // Explicit targets may refer to another user-owned resource. The active Workspace
  // context is a resolution hint, not an authorization boundary; the executor must
  // verify ownership and parent-child relationships against the database before use.
  return {
    ok: true,
    risk: policy.risk,
    requiresApproval: policy.risk !== 'read',
    operation: plan.operation,
  };
}

/** Final gate: server ownership checks and risk-specific approval are mandatory before execution. */
export function authorizeGlobalChatActionExecution(
  plan: GlobalChatActionPlan,
  validation: GlobalChatActionValidation,
  approval: GlobalChatActionApproval | null | undefined,
  ownerVerified: boolean,
  now = new Date(),
): GlobalChatActionValidation {
  if (!validation.ok) return validation;
  if (!ownerVerified) return { ok: false, reason: 'owner-not-verified' };
  if (Date.parse(plan.expiresAt) <= now.getTime()) return { ok: false, reason: 'plan-expired' };
  if (validation.risk === 'read') return validation;
  if (!approval) return { ok: false, reason: 'approval-required' };
  if (approval.planId !== plan.id) return { ok: false, reason: 'approval-mismatch' };
  const approvalTimestamp = approval.kind === 'reversible' ? approval.approvedAt : approval.confirmedAt;
  const approvalTime = Date.parse(approvalTimestamp);
  if (!Number.isFinite(approvalTime) || approvalTime < Date.parse(plan.createdAt) ||
      approvalTime > Date.parse(plan.expiresAt) || approvalTime > now.getTime()) {
    return { ok: false, reason: 'approval-invalid' };
  }
  if (validation.risk === 'reversible-write') {
    if (approval.kind !== 'reversible' || Date.parse(approval.approvedAt) > now.getTime()) {
      return { ok: false, reason: 'approval-invalid' };
    }
  } else if (validation.risk === 'destructive') {
    if (approval.kind !== 'destructive' || approval.challenge !== 'DELETE' ||
        Date.parse(approval.confirmedAt) > now.getTime()) return { ok: false, reason: 'approval-invalid' };
  } else if (validation.risk === 'billable') {
    const params = plan.parameters ?? {};
    if (approval.kind !== 'billable' || approval.quoteId !== params.quoteId ||
        !Number.isInteger(approval.maxCredits) || approval.maxCredits <= 0 ||
        typeof params.maxCredits !== 'number' || params.maxCredits > approval.maxCredits ||
        Date.parse(approval.confirmedAt) > now.getTime()) return { ok: false, reason: 'approval-invalid' };
  }
  return validation;
}

export function getGlobalChatActionRisk(operation: GlobalChatActionOperation): GlobalChatActionRisk {
  return POLICIES[operation].risk;
}
