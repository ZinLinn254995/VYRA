export type VyralCreatorInventoryAssetV1 = {
  id: string;
  name?: string | null;
  asset_type?: string | null;
  mime_type?: string | null;
};

export type VyralCreatorInventoryContextV1 = {
  assetCount: number;
  typeCounts: Record<string, number>;
  declaredPurpose: string | null;
  intendedUses: string[];
  workflowDeclared: boolean;
  relationshipsCount: number;
};

const clean = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const inferTypeFromMime = (mimeType: string | null): string => {
  if (!mimeType) return 'unknown';
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('text/')) return 'document';
  if (normalized === 'application/pdf' || normalized.includes('document') || normalized.includes('word')) return 'document';
  if (normalized.includes('json') || normalized.includes('xml')) return 'data';
  if (normalized.includes('3d') || normalized.includes('model') || normalized.includes('gltf')) return '3d';
  return 'other';
};

/**
 * Produces factual Creator Assistant context from the verified portable
 * inventory. Explicit asset_type wins; MIME is only a coarse fallback.
 * This is inventory description, not a quality grade or semantic judgment.
 */
export const buildVyralCreatorInventoryContextV1 = (input: {
  assets: VyralCreatorInventoryAssetV1[];
  purpose?: { summary?: string | null; intended_uses?: string[] } | null;
  workflowDeclared?: boolean;
  relationships?: unknown[];
}): VyralCreatorInventoryContextV1 => {
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error('A non-empty verified Vyral asset inventory is required.');
  }
  const typeCounts: Record<string, number> = {};
  for (const asset of input.assets) {
    if (!asset || typeof asset.id !== 'string' || !asset.id.trim()) {
      throw new Error('Every Vyral inventory Asset must have a stable ID.');
    }
    const type = clean(asset.asset_type)?.toLowerCase() ?? inferTypeFromMime(clean(asset.mime_type));
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }
  const intendedUses = input.purpose?.intended_uses ?? [];
  if (!Array.isArray(intendedUses) || !intendedUses.every((value) => typeof value === 'string' && value.trim())) {
    throw new Error('Declared intended uses must be non-empty strings.');
  }
  const relationships = input.relationships ?? [];
  if (!Array.isArray(relationships)) throw new Error('Vyral relationships must be an array.');

  return {
    assetCount: input.assets.length,
    typeCounts,
    declaredPurpose: clean(input.purpose?.summary ?? null),
    intendedUses: intendedUses.map((value) => value.trim()),
    workflowDeclared: input.workflowDeclared === true,
    relationshipsCount: relationships.length,
  };
};
