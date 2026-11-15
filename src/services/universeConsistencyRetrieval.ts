/**
 * Bounded task-aware retrieval for Universe consistency context.
 *
 * This is the deterministic lexical + relationship-graph stage of a hybrid
 * retrieval pipeline. It deliberately does not pretend to be vector search:
 * semantic embeddings/reranking can be added behind this stable contract.
 */
export interface UniverseRetrievalAsset {
  assetId: string;
  name: string;
  type?: string | null;
  description?: string | null;
  tags?: string[];
  purpose?: string | null;
  role?: string | null;
  searchableEvidence?: string[];
}

export interface UniverseRetrievalEdge {
  type: string;
  fromAssetId?: string | null;
  toAssetId?: string | null;
  fromIsUniverse?: boolean;
  toIsUniverse?: boolean;
}

export interface UniverseRetrievalInput {
  query: string;
  assets: UniverseRetrievalAsset[];
  relationships: UniverseRetrievalEdge[];
  maxAssets?: number;
  maxRelationships?: number;
}

export interface UniverseRetrievalResult {
  mode: 'broad' | 'targeted' | 'fallback';
  selectedAssetIds: string[];
  selectedRelationshipIndexes: number[];
  reasons: Record<string, string[]>;
  queryTerms: string[];
  truncatedAssets: boolean;
  truncatedRelationships: boolean;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'create', 'do', 'for',
  'from', 'give', 'how', 'i', 'in', 'into', 'is', 'it', 'make', 'me', 'my',
  'of', 'on', 'or', 'please', 'put', 'show', 'some', 'that', 'the', 'this',
  'to', 'use', 'what', 'with', 'you', 'your', 'about', 'all', 'everything',
  'universe', 'assets', 'files', 'folders', 'တစ်ခု', 'တစ်ခုကို', 'ပေးပါ',
  'လုပ်ပေး', 'လုပ်ပါ', 'ပြပေး', 'ပြပါ', 'ထဲက', 'ထဲမှာ', 'အတွက်', 'နဲ့',
  'ကို', 'က', 'မှာ', 'တွေ', 'များ', 'အားလုံး',
]);

const BROAD_QUERY = /\b(all|everything|entire|whole|every asset|full inventory|universe overview)\b|အားလုံး|တစ်ခုလုံး|အကုန်လုံး|ဖိုင်အားလုံး|asset အားလုံး/i;
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
const tokens = (value: string) => (normalize(value).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [])
  .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const overlapScore = (queryTerms: string[], candidate: string, multiplier: number) => {
  if (!queryTerms.length) return 0;
  const normalizedCandidate = normalize(candidate);
  const candidateTerms = new Set(tokens(candidate));
  let score = 0;
  for (const term of queryTerms) {
    if (candidateTerms.has(term)) score += multiplier;
    else if (term.length >= 4 && normalizedCandidate.includes(term)) score += Math.max(1, multiplier * 0.5);
  }
  return score;
};

const isBroadQuery = (query: string) => BROAD_QUERY.test(query);

export function retrieveUniverseConsistencyContext(
  input: UniverseRetrievalInput,
): UniverseRetrievalResult {
  const maxAssets = Math.max(1, Math.min(30, Math.floor(input.maxAssets ?? 12)));
  const maxRelationships = Math.max(1, Math.min(120, Math.floor(input.maxRelationships ?? 24)));
  const query = typeof input.query === 'string' ? input.query.slice(0, 6000) : '';
  const queryTerms = [...new Set(tokens(query))].slice(0, 48);
  const assets = input.assets.slice(0, 120);
  const reasons: Record<string, string[]> = {};
  const scores = new Map<string, number>();
  const broad = isBroadQuery(query) || queryTerms.length === 0;

  for (const asset of assets) {
    const normalizedQuery = normalize(query);
    const normalizedName = normalize(asset.name);
    let score = 0;
    const why: string[] = [];
    if (normalizedName.length >= 2 && normalizedQuery.includes(normalizedName)) {
      score += 100;
      why.push('explicit_asset_name_mention');
    }
    const nameScore = overlapScore(queryTerms, asset.name, 14);
    if (nameScore) { score += nameScore; why.push('asset_name_match'); }
    const typeScore = overlapScore(queryTerms, asset.type ?? '', 5);
    if (typeScore) { score += typeScore; why.push('asset_type_match'); }
    const tagScore = overlapScore(queryTerms, (asset.tags ?? []).join(' '), 12);
    if (tagScore) { score += tagScore; why.push('tag_match'); }
    const purposeScore = overlapScore(queryTerms, asset.purpose ?? '', 8);
    if (purposeScore) { score += purposeScore; why.push('asset_purpose_match'); }
    const evidenceScore = overlapScore(queryTerms, (asset.searchableEvidence ?? []).join(' '), 6);
    if (evidenceScore) { score += evidenceScore; why.push('approved_evidence_match'); }
    const descriptionScore = overlapScore(queryTerms, asset.description ?? '', 4);
    if (descriptionScore) { score += descriptionScore; why.push('description_match'); }
    if (score > 0) {
      scores.set(asset.assetId, score);
      reasons[asset.assetId] = why;
    }
  }

  let mode: UniverseRetrievalResult['mode'];
  if (broad) {
    mode = 'broad';
    for (const asset of assets) {
      if (!scores.has(asset.assetId)) {
        scores.set(asset.assetId, 1);
        reasons[asset.assetId] = ['explicit_broad_universe_request'];
      }
    }
  } else if (scores.size) {
    mode = 'targeted';
  } else {
    mode = 'fallback';
    // No lexical hit is not proof of irrelevance (especially for Burmese and
    // mixed-language requests). Keep the inventory available, but mark it as fallback.
    for (const asset of assets) {
      scores.set(asset.assetId, asset.role === 'main' ? 10 : 1);
      reasons[asset.assetId] = [asset.role === 'main' ? 'main_asset_fallback' : 'no_confident_match_fallback'];
    }
  }

  // Expand from direct matches through up to two relationship hops. This keeps
  // connected continuity facts available without shipping the entire graph.
  const directIds = new Set(scores.keys());
  const frontier = new Set(directIds);
  const visited = new Set(directIds);
  for (let depth = 1; depth <= 2; depth += 1) {
    const next = new Set<string>();
    for (const edge of input.relationships) {
      const from = edge.fromAssetId ?? null;
      const to = edge.toAssetId ?? null;
      if (from && frontier.has(from) && to && !visited.has(to)) next.add(to);
      if (to && frontier.has(to) && from && !visited.has(from)) next.add(from);
    }
    for (const id of next) {
      visited.add(id);
      scores.set(id, Math.max(scores.get(id) ?? 0, depth === 1 ? 32 : 12));
      reasons[id] = [...(reasons[id] ?? []), depth === 1 ? 'one_hop_relationship_context' : 'two_hop_relationship_context'];
    }
    frontier.clear();
    for (const id of next) frontier.add(id);
    if (!frontier.size) break;
  }

  const ordered = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const selectedAssetIds = ordered.slice(0, maxAssets);
  const selected = new Set(selectedAssetIds);
  const selectedRelationshipIndexes = input.relationships
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => {
      const fromIncluded = edge.fromIsUniverse === true || Boolean(edge.fromAssetId && selected.has(edge.fromAssetId));
      const toIncluded = edge.toIsUniverse === true || Boolean(edge.toAssetId && selected.has(edge.toAssetId));
      return fromIncluded && toIncluded;
    })
    .slice(0, maxRelationships)
    .map(({ index }) => index);

  return {
    mode,
    selectedAssetIds,
    selectedRelationshipIndexes,
    reasons: Object.fromEntries(selectedAssetIds.map((id) => [id, reasons[id] ?? []])),
    queryTerms,
    truncatedAssets: ordered.length > selectedAssetIds.length,
    truncatedRelationships: input.relationships.filter((edge) => {
      const fromIncluded = edge.fromIsUniverse === true || Boolean(edge.fromAssetId && selected.has(edge.fromAssetId));
      const toIncluded = edge.toIsUniverse === true || Boolean(edge.toAssetId && selected.has(edge.toAssetId));
      return fromIncluded && toIncluded;
    }).length > selectedRelationshipIndexes.length,
  };
}
