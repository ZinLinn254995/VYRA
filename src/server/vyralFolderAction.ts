export type VyralFolderActionOperation = 'folder.create' | 'folder.rename' | 'folder.move' | 'asset.move_folder';

export interface VyralFolderActionPendingPlan {
  id: string;
  operation: VyralFolderActionOperation;
  target: { vyralId: string; folderId?: string; assetId?: string };
  parameters: {
    name?: string;
    previousName?: string;
    previousParentId?: string | null;
    nextParentId?: string | null;
    expectedUpdatedAt?: string;
    previousFolderId?: string | null;
  };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 100 &&
  !/[\\/\u0000-\u001f\u007f]/.test(v);

export function parseVyralFolderActionPendingPlan(value: unknown): VyralFolderActionPendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const target = p.target && typeof p.target === 'object' && !Array.isArray(p.target) ? p.target as Record<string, unknown> : null;
  const parameters = p.parameters && typeof p.parameters === 'object' && !Array.isArray(p.parameters) ? p.parameters as Record<string, unknown> : null;
  const operations: VyralFolderActionOperation[] = ['folder.create','folder.rename','folder.move','asset.move_folder'];
  if (!operations.includes(p.operation as VyralFolderActionOperation) || typeof p.id !== 'string' || !UUID.test(p.id) ||
      typeof p.summary !== 'string' || !p.summary.trim() || p.summary.length > 500 ||
      typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.expiresAt !== 'string' || !Number.isFinite(Date.parse(p.expiresAt)) ||
      !target || typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) || !parameters) return null;
  const op = p.operation as VyralFolderActionOperation;
  if (op === 'folder.create') {
    if (Object.keys(target).sort().join(',') !== 'folderId,vyralId' || !UUID.test(String(target.folderId)) ||
        Object.keys(parameters).sort().join(',') !== 'name,nextParentId' || !safeName(parameters.name) ||
        !(parameters.nextParentId === null || (typeof parameters.nextParentId === 'string' && UUID.test(parameters.nextParentId)))) return null;
  } else if (op === 'folder.rename') {
    if (Object.keys(target).sort().join(',') !== 'folderId,vyralId' || !UUID.test(String(target.folderId)) ||
        Object.keys(parameters).sort().join(',') !== 'name,previousName,previousParentId' ||
        !safeName(parameters.name) || !safeName(parameters.previousName) || parameters.name.trim() === parameters.previousName.trim() ||
        !(parameters.previousParentId === null || (typeof parameters.previousParentId === 'string' && UUID.test(parameters.previousParentId)))) return null;
  } else if (op === 'folder.move') {
    if (Object.keys(target).sort().join(',') !== 'folderId,vyralId' || !UUID.test(String(target.folderId)) ||
        Object.keys(parameters).sort().join(',') !== 'nextParentId,previousParentId' ||
        !(parameters.previousParentId === null || (typeof parameters.previousParentId === 'string' && UUID.test(parameters.previousParentId))) ||
        !(parameters.nextParentId === null || (typeof parameters.nextParentId === 'string' && UUID.test(parameters.nextParentId))) ||
        parameters.previousParentId === parameters.nextParentId) return null;
  } else {
    if (Object.keys(target).sort().join(',') !== 'assetId,vyralId' || !UUID.test(String(target.assetId)) ||
        Object.keys(parameters).sort().join(',') !== 'expectedUpdatedAt,nextParentId,previousFolderId' ||
        typeof parameters.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parameters.expectedUpdatedAt)) ||
        !(parameters.previousFolderId === null || (typeof parameters.previousFolderId === 'string' && UUID.test(parameters.previousFolderId))) ||
        !(parameters.nextParentId === null || (typeof parameters.nextParentId === 'string' && UUID.test(parameters.nextParentId))) ||
        parameters.previousFolderId === parameters.nextParentId) return null;
  }
  const created = Date.parse(p.createdAt), expires = Date.parse(p.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: p.id, operation: op,
    target: target as VyralFolderActionPendingPlan['target'],
    parameters: parameters as VyralFolderActionPendingPlan['parameters'],
    summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt,
  };
}

export function validateVyralFolderActionPendingAction(row: unknown, expected: {
  userId: string; sessionId: string; actionId: string; now?: number;
}): VyralFolderActionPendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>, now = expected.now ?? Date.now();
  if (r.id !== expected.actionId || r.user_id !== expected.userId || r.session_id !== expected.sessionId ||
      r.capability_id !== 'folder.update' || r.status !== 'pending' ||
      typeof r.expires_at !== 'string' || !Number.isFinite(Date.parse(r.expires_at)) || Date.parse(r.expires_at) <= now) return null;
  const plan = parseVyralFolderActionPendingPlan(r.plan);
  return plan && Date.parse(plan.expiresAt) > now ? plan : null;
}
