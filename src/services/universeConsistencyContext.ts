import { buildUniverseKnowledgeFromAssetDna, type AssetDnaKnowledgeSource } from './universeKnowledgeBuilder.ts';
import {
  resolveUniverseConsistencyContext,
  type UniverseAssetRecord,
  type UniverseConsistencyInput,
  type UniverseConsistencyTask,
  type UniverseConsistencyContext,
  type UniverseKnowledgeRecord,
  type UniverseRelationshipRecord,
} from './universeConsistencyResolver.ts';

export interface BuildUniverseConsistencyContextInput {
  universeId: string;
  universeRevision: number;
  assets: UniverseAssetRecord[];
  assetDnaSources: AssetDnaKnowledgeSource[];
  creatorKnowledge?: UniverseKnowledgeRecord[];
  relationships?: UniverseRelationshipRecord[];
  task: UniverseConsistencyTask;
}

export interface BuiltUniverseConsistencyContext {
  context: UniverseConsistencyContext;
  missingDnaAssetIds: string[];
}

/**
 * The single composition entry point for task-scoped Universe context.
 * Call only after a trusted, owner-scoped server loader has fetched the
 * canonical Asset versions, DNA records, creator-approved knowledge and edges.
 */
export function buildUniverseConsistencyContext(
  input: BuildUniverseConsistencyContextInput,
): BuiltUniverseConsistencyContext {
  const knownAssetIds = new Set(input.assets.map((asset) => asset.id));
  const uniqueDnaAssets = new Set<string>();
  for (const source of input.assetDnaSources) {
    if (!knownAssetIds.has(source.assetId)) throw new Error('Asset DNA source is outside the canonical Universe inventory.');
    if (uniqueDnaAssets.has(source.assetId)) {
      throw new Error('Only one current Asset DNA source may be supplied per Asset.');
    }
    uniqueDnaAssets.add(source.assetId);
  }

  const base: UniverseConsistencyInput = {
    universeId: input.universeId,
    universeRevision: input.universeRevision,
    assets: input.assets,
    knowledge: input.creatorKnowledge ?? [],
    relationships: input.relationships ?? [],
  };
  const assetSelection = resolveUniverseConsistencyContext(base, input.task);
  const selectedIds = new Set(assetSelection.assets.map((asset) => asset.id));
  const dnaKnowledge = input.assetDnaSources
    .filter((source) => selectedIds.has(source.assetId))
    .flatMap((source) => buildUniverseKnowledgeFromAssetDna(source));
  const allKnowledge = [...(input.creatorKnowledge ?? []), ...dnaKnowledge];
  const context = resolveUniverseConsistencyContext({ ...base, knowledge: allKnowledge }, input.task);
  const dnaIds = new Set(input.assetDnaSources.map((source) => source.assetId));
  const missingDnaAssetIds = context.assets
    .filter((asset) => !dnaIds.has(asset.id))
    .map((asset) => asset.id)
    .sort();

  return {
    context: {
      ...context,
      cacheKey: context.cacheKey + ':dna-coverage:' + missingDnaAssetIds.join(','),
    },
    missingDnaAssetIds,
  };
}
