export interface VyralAssetArchivePendingPlan {
  id: string;
  operation: 'asset.archive';
  target: { vyralId: string; assetId: string };
  parameters: {
    assetName: string;
    previousStatus: 'ready';
    expectedUpdatedAt: string;
    confirmationCode: string;
  };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z0-9]{6}$/;

export function parseVyralAssetArchiveConfirmation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^ARCHIVE ASSET ([A-Z0-9]{6})$/i.exec(value.trim());
  return match ? match[1].toUpperCase() : null;
}

export function parseVyralAssetArchivePendingPlan(value: unknown): VyralAssetArchivePendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const target = p.target && typeof p.target === 'object' && !Array.isArray(p.target)
    ? p.target as Record<string, unknown> : null;
  const parameters = p.parameters && typeof p.parameters === 'object' && !Array.isArray(p.parameters)
    ? p.parameters as Record<string, unknown> : null;
  if (p.operation !== 'asset.archive' || typeof p.id !== 'string' || !UUID.test(p.id) ||
      typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 500 ||
      typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.expiresAt !== 'string' || !Number.isFinite(Date.parse(p.expiresAt)) ||
      !target || Object.keys(target).sort().join(',') !== 'assetId,vyralId' ||
      typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      typeof target.assetId !== 'string' || !UUID.test(target.assetId) || !parameters ||
      Object.keys(parameters).sort().join(',') !== 'assetName,confirmationCode,expectedUpdatedAt,previousStatus' ||
      typeof parameters.assetName !== 'string' || !parameters.assetName.trim() || parameters.assetName.length > 180 ||
      parameters.previousStatus !== 'ready' ||
      typeof parameters.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parameters.expectedUpdatedAt)) ||
      typeof parameters.confirmationCode !== 'string' || !CODE.test(parameters.confirmationCode)) return null;
  const created = Date.parse(p.createdAt), expires = Date.parse(p.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: p.id, operation: 'asset.archive',
    target: target as VyralAssetArchivePendingPlan['target'],
    parameters: parameters as VyralAssetArchivePendingPlan['parameters'],
    summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt,
  };
}

export function validateVyralAssetArchivePendingAction(row: unknown, expected: {
  userId: string; sessionId: string; actionId: string; now?: number;
}): VyralAssetArchivePendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>, now = expected.now ?? Date.now();
  if (r.id !== expected.actionId || r.user_id !== expected.userId || r.session_id !== expected.sessionId ||
      r.capability_id !== 'asset.archive' || r.status !== 'pending' ||
      typeof r.expires_at !== 'string' || !Number.isFinite(Date.parse(r.expires_at)) || Date.parse(r.expires_at) <= now) return null;
  const plan = parseVyralAssetArchivePendingPlan(r.plan);
  if (!plan || Date.parse(plan.expiresAt) !== Date.parse(r.expires_at)) return null;
  return plan;
}
