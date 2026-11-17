export interface VyralAssetUploadPendingPlan {
  id: string;
  operation: 'asset.upload';
  target: { vyralId: string };
  parameters: {
    clientDraftId: string;
    fileName: string;
    assetName: string;
    mimeType: string;
    sizeBytes: number;
  };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SAFE_MIME = /^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/i;

export function parseVyralAssetUploadPendingPlan(value: unknown): VyralAssetUploadPendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  if (plan.operation !== 'asset.upload' || typeof plan.id !== 'string' || !UUID.test(plan.id) ||
      typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 500 ||
      typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) ||
      typeof plan.expiresAt !== 'string' || !Number.isFinite(Date.parse(plan.expiresAt))) return null;
  const target = plan.target && typeof plan.target === 'object' && !Array.isArray(plan.target)
    ? plan.target as Record<string, unknown> : null;
  const parameters = plan.parameters && typeof plan.parameters === 'object' && !Array.isArray(plan.parameters)
    ? plan.parameters as Record<string, unknown> : null;
  if (!target || Object.keys(target).length !== 1 || typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      !parameters || Object.keys(parameters).some((key) => !['clientDraftId', 'fileName', 'assetName', 'mimeType', 'sizeBytes'].includes(key)) ||
      typeof parameters.clientDraftId !== 'string' || !UUID.test(parameters.clientDraftId) ||
      typeof parameters.fileName !== 'string' || !parameters.fileName.trim() || parameters.fileName.length > 255 ||
      /[\\/\u0000-\u001f\u007f]/.test(parameters.fileName) ||
      typeof parameters.assetName !== 'string' || !parameters.assetName.trim() || parameters.assetName.length > 180 ||
      /[\\/\u0000-\u001f\u007f]/.test(parameters.assetName) ||
      typeof parameters.mimeType !== 'string' || !SAFE_MIME.test(parameters.mimeType) ||
      typeof parameters.sizeBytes !== 'number' || !Number.isSafeInteger(parameters.sizeBytes) ||
      parameters.sizeBytes < 1 || parameters.sizeBytes > MAX_UPLOAD_BYTES) return null;
  const created = Date.parse(plan.createdAt), expires = Date.parse(plan.expiresAt);
  if (created > Date.now() || expires <= Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: plan.id,
    operation: 'asset.upload',
    target: { vyralId: target.vyralId },
    parameters: {
      clientDraftId: parameters.clientDraftId,
      fileName: parameters.fileName.trim(),
      assetName: parameters.assetName.trim(),
      mimeType: parameters.mimeType.toLowerCase(),
      sizeBytes: parameters.sizeBytes,
    },
    summary: plan.summary,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}

export function validateVyralAssetUploadPendingAction(
  row: unknown,
  expected: { userId: string; sessionId: string; actionId: string; now?: number },
): VyralAssetUploadPendingPlan | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const pending = row as Record<string, unknown>;
  if (pending.id !== expected.actionId || pending.user_id !== expected.userId ||
      pending.session_id !== expected.sessionId || pending.capability_id !== 'asset.upload' ||
      pending.status !== 'pending' || typeof pending.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(pending.expires_at)) ||
      Date.parse(pending.expires_at) <= (expected.now ?? Date.now())) return null;
  const plan = parseVyralAssetUploadPendingPlan(pending.plan);
  if (!plan || Date.parse(plan.expiresAt) <= (expected.now ?? Date.now())) return null;
  return plan;
}

export function matchesVyralAssetUploadFile(
  plan: VyralAssetUploadPendingPlan,
  file: { name: string; size: number; type: string },
): boolean {
  return file.name === plan.parameters.fileName &&
    file.size === plan.parameters.sizeBytes &&
    (file.type || 'application/octet-stream').toLowerCase() === plan.parameters.mimeType;
}
