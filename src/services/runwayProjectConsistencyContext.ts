import { retrieveUniverseConsistencyContext, type UniverseRetrievalAsset } from './universeConsistencyRetrieval';

type ProjectContextDb = {
  from(table: string): any;
};
type JsonRecord = Record<string, unknown>;
type ProjectAssetRow = {
  id: string; name: string; asset_type?: string | null; mime_type?: string | null;
  metadata?: JsonRecord | null;
};
type AssetDnaRow = {
  asset_id: string; payload?: JsonRecord | null; dna_status?: string | null;
  verification_status?: string | null; scope?: string | null;
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeText = (value: unknown, max = 420): string =>
  typeof value === 'string' ? value.replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim().slice(0, max) : '';
const strings = (value: unknown, maxItems = 12): string[] =>
  Array.isArray(value) ? value.slice(0, maxItems).flatMap((item) => {
    const text = safeText(item, 100);
    return text ? [text] : [];
  }) : [];

function collectEvidence(value: unknown, depth = 0): string[] {
  if (!isRecord(value) || depth > 4) return [];
  const allowed = new Set([
    'description', 'visual_description', 'appearance', 'visual_identity',
    'style', 'style_description', 'color_palette', 'colors', 'materials',
    'shape', 'silhouette', 'wardrobe', 'environment', 'lighting',
    'camera', 'composition', 'prompt_summary', 'reconstruction_prompt',
  ]);
  const output: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key.toLowerCase())) continue;
    if (typeof item === 'string') {
      const text = safeText(item);
      if (text) output.push(key + ': ' + text);
    } else if (Array.isArray(item)) {
      output.push(...strings(item).map((entry) => key + ': ' + entry));
    } else if (isRecord(item)) {
      output.push(...collectEvidence(item, depth + 1));
    }
    if (output.length >= 16) break;
  }
  return output.slice(0, 16);
}

/**
 * Loads only ready Assets and their existing per-Asset DNA for this exact
 * Project. Observations are labelled as observed evidence; no AI suggestion
 * is promoted to creator-approved canon by this context builder.
 */
export async function buildRunwayProjectConsistencyContext(
  db: ProjectContextDb,
  input: { userId: string; targetVyralId: string; promptText: string },
): Promise<{ promptText: string; assetCount: number; selectedAssetCount: number; mode: 'broad' | 'targeted' | 'fallback' }> {
  const { data: rows, error } = await db.from('vyral_assets')
    .select('id,name,asset_type,mime_type,metadata')
    .eq('user_id', input.userId).eq('vyral_id', input.targetVyralId)
    .eq('processing_status', 'ready').order('created_at', { ascending: false }).limit(120);
  if (error) throw new Error('Project consistency Assets could not be loaded: ' + error.message);
  const assets = (Array.isArray(rows) ? rows : []) as ProjectAssetRow[];
  if (!assets.length) return { promptText: input.promptText, assetCount: 0, selectedAssetCount: 0, mode: 'fallback' };

  const ids = assets.map((asset) => asset.id).filter((id) => typeof id === 'string');
  const { data: dnaRows, error: dnaError } = await db.from('vyral_dna_records')
    .select('asset_id,payload,dna_status,verification_status,scope')
    .eq('user_id', input.userId).eq('vyral_id', input.targetVyralId)
    .eq('scope', 'asset').in('asset_id', ids).limit(240);
  if (dnaError) throw new Error('Project Asset DNA could not be loaded: ' + dnaError.message);

  const dnaByAsset = new Map<string, AssetDnaRow[]>();
  for (const row of (Array.isArray(dnaRows) ? dnaRows : []) as AssetDnaRow[]) {
    if (!ids.includes(row.asset_id)) continue;
    const current = dnaByAsset.get(row.asset_id) ?? [];
    current.push(row);
    dnaByAsset.set(row.asset_id, current);
  }

  const retrievalAssets: UniverseRetrievalAsset[] = assets.map((asset) => {
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const dna = dnaByAsset.get(asset.id) ?? [];
    const evidence = dna.flatMap((record) => collectEvidence(record.payload));
    const description = safeText(metadata.description ?? metadata.ai_description ?? metadata.summary);
    const tags = strings(metadata.tags);
    return {
      assetId: asset.id,
      name: safeText(asset.name, 180) || 'Untitled Asset',
      type: safeText(asset.asset_type ?? asset.mime_type, 80),
      description,
      tags,
      purpose: safeText(metadata.purpose, 160),
      role: safeText(metadata.role, 80),
      searchableEvidence: evidence,
    };
  });

  const retrieval = retrieveUniverseConsistencyContext({
    query: input.promptText,
    assets: retrievalAssets,
    relationships: [],
    maxAssets: 12,
    maxRelationships: 1,
  });
  const selected = new Set(retrieval.selectedAssetIds);
  const lines = assets.filter((asset) => selected.has(asset.id)).map((asset) => {
    const dna = dnaByAsset.get(asset.id) ?? [];
    const evidence = [...new Set(dna.flatMap((record) => collectEvidence(record.payload)))].slice(0, 8);
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const description = safeText(metadata.description ?? metadata.ai_description ?? metadata.summary);
    return [
      '- Asset: ' + safeText(asset.name, 180),
      '  Type: ' + safeText(asset.asset_type ?? asset.mime_type, 80),
      description ? '  Creator/Asset description: ' + description : '',
      evidence.length ? '  Recorded DNA observations: ' + evidence.join('; ') : '',
      dna.some((record) => record.verification_status === 'verified') ? '  DNA verification: verified' : '  DNA verification: observed / not fully verified',
    ].filter(Boolean).join('\\n');
  });
  const context = [
    'PROJECT CONSISTENCY CONTEXT (retrieved from this Project only)',
    'Use the following records as reference evidence when relevant to the requested output.',
    'IMPORTANT: Recorded DNA observations are evidence, not automatically creator-approved canon. Do not invent missing facts or silently turn suggestions into canon. If a detail conflicts with the user prompt, follow the user prompt and flag the conflict in your response.',
    ...lines,
  ].join('\\n');
  const promptText = (input.promptText + '\\n\\n' + context).slice(0, 14_000);
  return { promptText, assetCount: assets.length, selectedAssetCount: lines.length, mode: retrieval.mode };
}
