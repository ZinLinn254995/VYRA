export type VyralAssetRelationshipOperation = 'asset.relationship.add' | 'asset.relationship.remove';

export interface VyralAssetRelationshipPendingPlan {
  id: string;
  operation: VyralAssetRelationshipOperation;
  target: { vyralId: string; relationshipId: string };
  parameters: {
    relationship?: {
      relationshipType: string;
      fromKind: 'asset' | 'vyral';
      fromAssetId: string | null;
      toKind: 'asset' | 'vyral';
      toAssetId: string | null;
      rationale: string;
      evidenceRef: string | null;
    };
    previous?: {
      relationshipType: string;
      fromKind: 'asset' | 'vyral';
      fromAssetId: string | null;
      toKind: 'asset' | 'vyral';
      toAssetId: string | null;
      rationale: string;
      evidenceRef: string | null;
    };
    expectedUpdatedAt?: string;
  };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validNullableUuid = (value: unknown): value is string | null => value === null || (typeof value === 'string' && UUID.test(value));
const validRelationship = (value: unknown): value is NonNullable<VyralAssetRelationshipPendingPlan['parameters']['relationship']> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'evidenceRef,fromAssetId,fromKind,rationale,relationshipType,toAssetId,toKind') return false;
  if (typeof r.relationshipType !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(r.relationshipType) ||
      !['asset','vyral'].includes(String(r.fromKind)) || !['asset','vyral'].includes(String(r.toKind)) ||
      !validNullableUuid(r.fromAssetId) || !validNullableUuid(r.toAssetId) ||
      (r.fromKind === 'asset' ? !r.fromAssetId : r.fromAssetId !== null) ||
      (r.toKind === 'asset' ? !r.toAssetId : r.toAssetId !== null) ||
      (r.fromKind === 'vyral' && r.toKind === 'vyral') ||
      (r.fromKind === 'asset' && r.toKind === 'asset' && r.fromAssetId === r.toAssetId) ||
      typeof r.rationale !== 'string' || r.rationale.trim().length < 1 || r.rationale.length > 2000 ||
      !(r.evidenceRef === null || (typeof r.evidenceRef === 'string' && r.evidenceRef.length <= 512))) return false;
  return true;
};

export function parseVyralAssetRelationshipPendingPlan(value: unknown): VyralAssetRelationshipPendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const target = p.target && typeof p.target === 'object' && !Array.isArray(p.target) ? p.target as Record<string, unknown> : null;
  const parameters = p.parameters && typeof p.parameters === 'object' && !Array.isArray(p.parameters) ? p.parameters as Record<string, unknown> : null;
  if (!['asset.relationship.add','asset.relationship.remove'].includes(String(p.operation)) ||
      typeof p.id !== 'string' || !UUID.test(p.id) || typeof p.summary !== 'string' ||
      !p.summary.trim() || p.summary.length > 500 || typeof p.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(p.createdAt)) || typeof p.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(p.expiresAt)) || !target || !parameters ||
      Object.keys(target).sort().join(',') !== 'relationshipId,vyralId' ||
      typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      typeof target.relationshipId !== 'string' || !UUID.test(target.relationshipId)) return null;
  const op = p.operation as VyralAssetRelationshipOperation;
  if (op === 'asset.relationship.add') {
    if (Object.keys(parameters).join(',') !== 'relationship' || !validRelationship(parameters.relationship)) return null;
  } else {
    if (Object.keys(parameters).sort().join(',') !== 'expectedUpdatedAt,previous' ||
        typeof parameters.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parameters.expectedUpdatedAt)) ||
        !validRelationship(parameters.previous)) return null;
  }
  const created = Date.parse(p.createdAt), expires = Date.parse(p.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: p.id, operation: op,
    target: target as VyralAssetRelationshipPendingPlan['target'],
    parameters: parameters as VyralAssetRelationshipPendingPlan['parameters'],
    summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt,
  };
}

export function validateVyralAssetRelationshipPendingAction(row: unknown, expected: {
  userId: string; sessionId: string; actionId: string; now?: number;
}): VyralAssetRelationshipPendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>, now = expected.now ?? Date.now();
  if (r.id !== expected.actionId || r.user_id !== expected.userId || r.session_id !== expected.sessionId ||
      !['asset.add_relationship','asset.remove_relationship'].includes(String(r.capability_id)) ||
      r.status !== 'pending' || typeof r.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(r.expires_at)) || Date.parse(r.expires_at) <= now) return null;
  const plan = parseVyralAssetRelationshipPendingPlan(r.plan);
  if (!plan || Date.parse(plan.expiresAt) <= now) return null;
  if ((plan.operation === 'asset.relationship.add' && r.capability_id !== 'asset.add_relationship') ||
      (plan.operation === 'asset.relationship.remove' && r.capability_id !== 'asset.remove_relationship')) return null;
  return plan;
}
