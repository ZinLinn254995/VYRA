export interface VyralAssetRenamePendingPlan {
  id: string;
  operation: 'asset.rename';
  target: { vyralId: string; assetId: string };
  parameters: { previousName: string; nextName: string; expectedUpdatedAt: string };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 180 &&
  !/[\\/\u0000-\u001f\u007f]/.test(value);

export function parseVyralAssetRenamePendingPlan(value: unknown): VyralAssetRenamePendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  const target = plan.target && typeof plan.target === 'object' && !Array.isArray(plan.target)
    ? plan.target as Record<string, unknown> : null;
  const parameters = plan.parameters && typeof plan.parameters === 'object' && !Array.isArray(plan.parameters)
    ? plan.parameters as Record<string, unknown> : null;
  if (plan.operation !== 'asset.rename' || typeof plan.id !== 'string' || !UUID.test(plan.id) ||
      typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 500 ||
      typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) ||
      typeof plan.expiresAt !== 'string' || !Number.isFinite(Date.parse(plan.expiresAt)) ||
      !target || Object.keys(target).length !== 2 || typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      typeof target.assetId !== 'string' || !UUID.test(target.assetId) ||
      !parameters || Object.keys(parameters).length !== 3 ||
      !safeName(parameters.previousName) || !safeName(parameters.nextName) ||
      parameters.previousName.trim() === parameters.nextName.trim() ||
      typeof parameters.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parameters.expectedUpdatedAt))) return null;
  const created = Date.parse(plan.createdAt), expires = Date.parse(plan.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: plan.id,
    operation: 'asset.rename',
    target: { vyralId: target.vyralId, assetId: target.assetId },
    parameters: {
      previousName: parameters.previousName.trim(),
      nextName: parameters.nextName.trim(),
      expectedUpdatedAt: parameters.expectedUpdatedAt,
    },
    summary: plan.summary,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}

export function validateVyralAssetRenamePendingAction(
  row: unknown,
  expected: { userId: string; sessionId: string; actionId: string; now?: number },
): VyralAssetRenamePendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const pending = row as Record<string, unknown>;
  const now = expected.now ?? Date.now();
  if (pending.id !== expected.actionId || pending.user_id !== expected.userId ||
      pending.session_id !== expected.sessionId || pending.capability_id !== 'asset.update_metadata' ||
      pending.status !== 'pending' || typeof pending.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(pending.expires_at)) || Date.parse(pending.expires_at) <= now) return null;
  const plan = parseVyralAssetRenamePendingPlan(pending.plan);
  return plan && Date.parse(plan.expiresAt) > now ? plan : null;
}
