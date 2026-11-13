export type VyralAssetMetadataValues = {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  altText?: string;
};

export interface VyralAssetMetadataPendingPlan {
  id: string;
  operation: 'asset.update_metadata';
  target: { vyralId: string; assetId: string };
  parameters: {
    previous: { title: string; description: string; organization: Record<string, unknown> };
    next: VyralAssetMetadataValues;
    expectedUpdatedAt: string;
  };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cleanText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const safeLabel = (value: unknown, max: number): value is string =>
  cleanText(value, max) && value.trim().length > 0 && !/[\\/]/.test(value);

export function parseVyralAssetMetadataPendingPlan(value: unknown): VyralAssetMetadataPendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const target = p.target && typeof p.target === 'object' && !Array.isArray(p.target) ? p.target as Record<string, unknown> : null;
  const parameters = p.parameters && typeof p.parameters === 'object' && !Array.isArray(p.parameters) ? p.parameters as Record<string, unknown> : null;
  if (p.operation !== 'asset.update_metadata' || typeof p.id !== 'string' || !UUID.test(p.id) ||
      typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 700 ||
      typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.expiresAt !== 'string' || !Number.isFinite(Date.parse(p.expiresAt)) ||
      !target || Object.keys(target).length !== 2 || typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      typeof target.assetId !== 'string' || !UUID.test(target.assetId) || !parameters ||
      typeof parameters.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parameters.expectedUpdatedAt)) ||
      !parameters.previous || typeof parameters.previous !== 'object' || Array.isArray(parameters.previous) ||
      !parameters.next || typeof parameters.next !== 'object' || Array.isArray(parameters.next)) return null;
  const previous = parameters.previous as Record<string, unknown>;
  const next = parameters.next as Record<string, unknown>;
  const allowed = ['title', 'description', 'category', 'tags', 'keywords', 'altText'];
  if (Object.keys(previous).sort().join(',') !== 'description,organization,title' ||
      !cleanText(previous.title, 180) || !cleanText(previous.description, 2000) ||
      !previous.organization || typeof previous.organization !== 'object' || Array.isArray(previous.organization) ||
      !Object.keys(next).length || Object.keys(next).some((key) => !allowed.includes(key))) return null;
  if ('title' in next && !safeLabel(next.title, 180)) return null;
  if ('description' in next && !cleanText(next.description, 2000)) return null;
  if ('category' in next && !safeLabel(next.category, 80)) return null;
  for (const key of ['tags', 'keywords'] as const) {
    if (key in next && (!Array.isArray(next[key]) || next[key].length > 30 ||
        !(next[key] as unknown[]).every((v) => safeLabel(v, 48)))) return null;
  }
  if ('altText' in next && !cleanText(next.altText, 500)) return null;
  const created = Date.parse(p.createdAt), expires = Date.parse(p.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: p.id, operation: 'asset.update_metadata',
    target: { vyralId: target.vyralId, assetId: target.assetId },
    parameters: {
      previous: { title: previous.title, description: previous.description, organization: previous.organization as Record<string, unknown> },
      next: next as VyralAssetMetadataValues,
      expectedUpdatedAt: parameters.expectedUpdatedAt,
    },
    summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt,
  };
}

export function validateVyralAssetMetadataPendingAction(
  row: unknown,
  expected: { userId: string; sessionId: string; actionId: string; now?: number },
): VyralAssetMetadataPendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>, now = expected.now ?? Date.now();
  if (r.id !== expected.actionId || r.user_id !== expected.userId || r.session_id !== expected.sessionId ||
      r.capability_id !== 'asset.update_metadata' || r.status !== 'pending' ||
      typeof r.expires_at !== 'string' || !Number.isFinite(Date.parse(r.expires_at)) || Date.parse(r.expires_at) <= now) return null;
  const plan = parseVyralAssetMetadataPendingPlan(r.plan);
  return plan && Date.parse(plan.expiresAt) > now ? plan : null;
}
