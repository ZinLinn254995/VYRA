export interface VyralCreatePendingPlan {
  id: string;
  operation: 'vyral.create';
  target: { vyralId: string };
  parameters: { name: string; description: string };
  summary: string;
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVyralCreateApprovalText(input: string): boolean {
  return /^(?:yes|yes please|go ahead|do it|please do|confirm|approved|looks good|perfect|လုပ်ပါ|ဆက်လုပ်|ဆက်လုပ်ပါ|အေး|အေး လုပ်လိုက်|အတည်ပြု|အတည်ပြုမယ်)$/i.test(input.trim().toLowerCase());
}

export function parseVyralCreatePendingPlan(value: unknown): VyralCreatePendingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  if (plan.operation !== 'vyral.create' || typeof plan.id !== 'string' || !UUID.test(plan.id) ||
      typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 500 ||
      typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) ||
      typeof plan.expiresAt !== 'string' || !Number.isFinite(Date.parse(plan.expiresAt))) return null;
  const target = plan.target && typeof plan.target === 'object' && !Array.isArray(plan.target)
    ? plan.target as Record<string, unknown> : null;
  const parameters = plan.parameters && typeof plan.parameters === 'object' && !Array.isArray(plan.parameters)
    ? plan.parameters as Record<string, unknown> : null;
  if (!target || Object.keys(target).length !== 1 || typeof target.vyralId !== 'string' || !UUID.test(target.vyralId) ||
      !parameters || Object.keys(parameters).some((key) => !['name', 'description'].includes(key)) ||
      typeof parameters.name !== 'string' || !parameters.name.trim() || parameters.name.trim().length > 100 ||
      typeof parameters.description !== 'string' || parameters.description.length > 1000) return null;
  const created = Date.parse(plan.createdAt), expires = Date.parse(plan.expiresAt);
  if (created > Date.now() || expires <= created || expires - created > 15 * 60 * 1000) return null;
  return {
    id: plan.id,
    operation: 'vyral.create',
    target: { vyralId: target.vyralId },
    parameters: { name: parameters.name.trim(), description: parameters.description },
    summary: plan.summary,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}

export function isSameVyralCreateIdentity(
  existing: unknown,
  userId: string,
  vyralId: string,
  name: string,
  description: string,
): boolean {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return false;
  const row = existing as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown> : {};
  return row.id === vyralId && row.user_id === userId &&
    row.name === name && row.description === description &&
    metadata.creation_source === 'global_ai_chat' &&
    metadata.creation_draft_id === vyralId;
}
