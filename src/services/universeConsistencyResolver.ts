export type UniverseEvidenceClass =
  | 'deterministic'
  | 'verified_observation'
  | 'creator_declared'
  | 'model_hypothesis';

export type UniverseKnowledgeStatus = 'accepted' | 'verified' | 'proposed' | 'disputed';

export interface UniverseAssetRecord {
  id: string;
  versionId: string;
  revision: number;
  kind?: string;
  tags?: string[];
  archived?: boolean;
}

export interface UniverseKnowledgeRecord {
  id: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  evidenceClass: UniverseEvidenceClass;
  status: UniverseKnowledgeStatus;
  scope?: 'universe' | 'asset' | 'scene' | 'event';
  appliesToAssetIds?: string[];
  appliesToTags?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  strength?: 'locked' | 'preferred' | 'flexible';
  sourceAssetIds?: string[];
  revision: number;
}

export interface UniverseRelationshipRecord {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  type: string;
  status: 'accepted' | 'verified' | 'proposed' | 'disputed';
  evidenceClass: UniverseEvidenceClass;
  revision: number;
}

export interface UniverseConsistencyTask {
  taskId: string;
  operation: 'generate' | 'edit' | 'analyze';
  referencedAssetIds?: string[];
  tags?: string[];
  at: string;
  maxAssets?: number;
  includeRelated?: boolean;
}

export interface UniverseConsistencyInput {
  universeId: string;
  universeRevision: number;
  assets: UniverseAssetRecord[];
  knowledge: UniverseKnowledgeRecord[];
  relationships?: UniverseRelationshipRecord[];
}

export interface UniverseConsistencyConflict {
  subjectId: string;
  predicate: string;
  knowledgeIds: string[];
  values: unknown[];
  reason: 'conflicting_locked_facts';
}

export interface UniverseConsistencyContext {
  universeId: string;
  universeRevision: number;
  taskId: string;
  operation: UniverseConsistencyTask['operation'];
  assets: UniverseAssetRecord[];
  knowledge: UniverseKnowledgeRecord[];
  relationships: UniverseRelationshipRecord[];
  conflicts: UniverseConsistencyConflict[];
  missingAssetIds: string[];
  excludedHypothesisCount: number;
  truncated: boolean;
  cacheKey: string;
}

const clean = (value: string): string => value.trim().normalize('NFC');
const unique = <T,>(items: T[]): T[] => [...new Set(items)];
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stable(record[key])).join(',') + '}';
};

const isWithinTime = (record: UniverseKnowledgeRecord, at: number): boolean => {
  const from = record.validFrom ? Date.parse(record.validFrom) : Number.NEGATIVE_INFINITY;
  const until = record.validUntil ? Date.parse(record.validUntil) : Number.POSITIVE_INFINITY;
  if ((record.validFrom && !Number.isFinite(from)) || (record.validUntil && !Number.isFinite(until))) return false;
  return from <= at && at < until;
};

const isTrusted = (record: UniverseKnowledgeRecord): boolean =>
  record.status === 'accepted' || record.status === 'verified';

const valueKey = (value: unknown): string => stable(value);

/**
 * Deterministic, task-scoped Universe context resolver.
 *
 * This pure service only resolves records supplied by a trusted server-side
 * loader. It does not treat client/model-supplied records as verified, query
 * storage, or mutate Universe canon.
 */
export function resolveUniverseConsistencyContext(
  input: UniverseConsistencyInput,
  task: UniverseConsistencyTask,
): UniverseConsistencyContext {
  if (!input.universeId.trim() || !task.taskId.trim()) throw new Error('Universe and task IDs are required.');
  if (!Number.isInteger(input.universeRevision) || input.universeRevision < 0) throw new Error('Universe revision must be a non-negative integer.');
  if (!task.at) throw new Error('An explicit task time is required for reproducible temporal context.');
  const at = Date.parse(task.at);
  if (!Number.isFinite(at)) throw new Error('Task time must be a valid ISO date.');
  const maxAssets = task.maxAssets ?? 80;
  if (!Number.isInteger(maxAssets) || maxAssets < 1 || maxAssets > 500) throw new Error('maxAssets must be an integer between 1 and 500.');

  const assetMap = new Map<string, UniverseAssetRecord>();
  for (const asset of input.assets) {
    if (!asset.id.trim() || !asset.versionId.trim() || !Number.isInteger(asset.revision) || asset.revision < 0) {
      throw new Error('Every Universe Asset requires an ID, version ID, and non-negative revision.');
    }
    if (assetMap.has(asset.id)) throw new Error('Duplicate Universe Asset ID: ' + asset.id);
    if (!asset.archived) assetMap.set(asset.id, asset);
  }

  const missingAssetIds: string[] = [];
  const requestedIds = unique((task.referencedAssetIds ?? []).map(clean).filter(Boolean));
  const selected = new Set<string>();
  const queue: string[] = [];
  let truncated = false;
  for (const id of requestedIds) {
    if (!assetMap.has(id)) {
      missingAssetIds.push(id);
      continue;
    }
    if (selected.size >= maxAssets) {
      truncated = true;
      continue;
    }
    selected.add(id);
    queue.push(id);
  }

  const relationships = (input.relationships ?? []).filter((edge) =>
    (edge.status === 'accepted' || edge.status === 'verified') &&
    edge.evidenceClass !== 'model_hypothesis' &&
    assetMap.has(edge.fromAssetId) && assetMap.has(edge.toAssetId),
  );
  if (task.includeRelated !== false) {
    const adjacency = new Map<string, string[]>();
    for (const edge of relationships) {
      adjacency.set(edge.fromAssetId, [...(adjacency.get(edge.fromAssetId) ?? []), edge.toAssetId]);
      adjacency.set(edge.toAssetId, [...(adjacency.get(edge.toAssetId) ?? []), edge.fromAssetId]);
    }
    for (const [id, neighbors] of adjacency) adjacency.set(id, unique(neighbors).sort());
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (selected.has(next)) continue;
        if (selected.size >= maxAssets) {
          truncated = true;
          queue.length = 0;
          break;
        }
        selected.add(next);
        queue.push(next);
      }
    }
  }

  const taskTags = new Set((task.tags ?? []).map(clean).filter(Boolean));
  const relevantKnowledge = input.knowledge.filter((record) => {
    if (!isTrusted(record) || record.evidenceClass === 'model_hypothesis') return false;
    if (!isWithinTime(record, at)) return false;
    const explicitAssetMatch = (record.appliesToAssetIds ?? []).some((id) => selected.has(id)) ||
      selected.has(record.subjectId) ||
      (record.sourceAssetIds ?? []).some((id) => selected.has(id));
    const tagMatch = (record.appliesToTags ?? []).some((tag) => taskTags.has(clean(tag)));
    const universeWide = record.scope === 'universe' && !(record.appliesToAssetIds?.length) && !(record.appliesToTags?.length);
    return explicitAssetMatch || tagMatch || universeWide;
  });

  const boundedAssets = [...selected].map((id) => assetMap.get(id)!);
  const boundedIds = new Set(boundedAssets.map((asset) => asset.id));
  const boundedKnowledge = relevantKnowledge
    .filter((record) =>
      !record.appliesToAssetIds?.length || record.appliesToAssetIds.some((id) => boundedIds.has(id)),
    )
    .filter((record) => !record.subjectId || record.scope === 'universe' || boundedIds.has(record.subjectId) ||
      (record.appliesToAssetIds ?? []).some((id) => boundedIds.has(id)) ||
      (record.sourceAssetIds ?? []).some((id) => boundedIds.has(id)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const boundedRelationships = relationships
    .filter((edge) => boundedIds.has(edge.fromAssetId) && boundedIds.has(edge.toAssetId))
    .sort((a, b) => a.id.localeCompare(b.id));

  const groups = new Map<string, UniverseKnowledgeRecord[]>();
  for (const record of boundedKnowledge) {
    if (record.strength !== 'locked') continue;
    const key = record.subjectId + '\u0000' + record.predicate;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const conflicts: UniverseConsistencyConflict[] = [];
  for (const [key, records] of groups) {
    const distinct = new Map<string, UniverseKnowledgeRecord>();
    for (const record of records) distinct.set(valueKey(record.value), record);
    if (distinct.size > 1) {
      const [subjectId, predicate] = key.split('\u0000');
      conflicts.push({
        subjectId,
        predicate,
        knowledgeIds: records.map((record) => record.id).sort(),
        values: [...distinct.values()].map((record) => record.value),
        reason: 'conflicting_locked_facts',
      });
    }
  }

  const cachePayload = {
    universeId: input.universeId,
    universeRevision: input.universeRevision,
    task: { ...task, referencedAssetIds: requestedIds.sort(), tags: [...taskTags].sort(), at: new Date(at).toISOString() },
    assets: boundedAssets.map(({ id, versionId, revision }) => ({ id, versionId, revision })),
    knowledge: boundedKnowledge.map(({ id, revision }) => ({ id, revision })),
    relationships: boundedRelationships.map(({ id, revision }) => ({ id, revision })),
  };
  return {
    universeId: input.universeId,
    universeRevision: input.universeRevision,
    taskId: task.taskId,
    operation: task.operation,
    assets: boundedAssets,
    knowledge: boundedKnowledge,
    relationships: boundedRelationships,
    conflicts,
    missingAssetIds,
    excludedHypothesisCount: input.knowledge.filter((record) => record.evidenceClass === 'model_hypothesis' || record.status === 'proposed' || record.status === 'disputed').length,
    truncated,
    cacheKey: stable(cachePayload),
  };
}
