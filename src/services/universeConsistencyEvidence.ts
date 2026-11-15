export interface CreatorConfirmedFieldEvidence {
  fieldPath: string;
  acceptedValue: unknown;
  creatorNote?: string | null;
  evidenceId: string;
  observationId: string;
  sourceVersionId: string;
  sourceSha256: string;
  createdAt?: string | null;
}

export interface ResolvedCreatorField {
  fieldPath: string;
  acceptedValue: unknown;
  creatorNote: string | null;
  evidenceIds: string[];
  observationIds: string[];
  sourceVersionId: string;
  sourceSha256: string;
  status: 'creator_confirmed_consistent';
}

export interface ConflictedCreatorField {
  fieldPath: string;
  candidates: Array<{ value: unknown; evidenceIds: string[]; observationIds: string[] }>;
  status: 'unresolved_conflict';
  reason: 'multiple_creator_confirmed_values_for_same_field_and_time';
}

export interface CreatorFieldResolution {
  resolved: ResolvedCreatorField[];
  conflicts: ConflictedCreatorField[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Creator evidence contains a non-serializable value.');
    return serialized;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Creator evidence contains a non-finite number.');
    return String(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (!isRecord(value)) throw new Error('Creator evidence must be JSON-compatible.');
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
};

const temporalScope = (value: unknown): string => {
  if (!isRecord(value)) return '';
  for (const key of ['effective_at', 'valid_from', 'at', 'timestamp', 'event_id']) {
    const candidate = value[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') return key + ':' + String(candidate);
  }
  return '';
};

/**
 * Never silently select one creator-confirmed value when the same field and
 * temporal scope have conflicting attestations. Equal values are coalesced;
 * different temporal scopes remain separate facts.
 */
export function resolveCreatorConfirmedFieldEvidence(
  evidence: CreatorConfirmedFieldEvidence[],
): CreatorFieldResolution {
  const groups = new Map<string, CreatorConfirmedFieldEvidence[]>();
  for (const item of evidence) {
    const fieldPath = item.fieldPath.trim().normalize('NFC');
    if (!fieldPath || fieldPath.length > 240 || !item.evidenceId || !item.observationId) continue;
    const key = fieldPath + '\u0000' + temporalScope(item.acceptedValue);
    const group = groups.get(key) ?? [];
    group.push({ ...item, fieldPath });
    groups.set(key, group);
  }

  const resolved: ResolvedCreatorField[] = [];
  const conflicts: ConflictedCreatorField[] = [];
  for (const group of groups.values()) {
    const byValue = new Map<string, CreatorConfirmedFieldEvidence[]>();
    for (const item of group) {
      const valueKey = canonicalJson(item.acceptedValue);
      const sameValue = byValue.get(valueKey) ?? [];
      sameValue.push(item);
      byValue.set(valueKey, sameValue);
    }
    if (byValue.size > 1) {
      conflicts.push({
        fieldPath: group[0].fieldPath,
        candidates: [...byValue.values()].map((items) => ({
          value: items[0].acceptedValue,
          evidenceIds: items.map((item) => item.evidenceId).slice(0, 12),
          observationIds: items.map((item) => item.observationId).slice(0, 12),
        })),
        status: 'unresolved_conflict',
        reason: 'multiple_creator_confirmed_values_for_same_field_and_time',
      });
      continue;
    }
    const items = group.slice().sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const latest = items[0];
    resolved.push({
      fieldPath: latest.fieldPath,
      acceptedValue: latest.acceptedValue,
      creatorNote: latest.creatorNote ?? null,
      evidenceIds: items.map((item) => item.evidenceId).slice(0, 12),
      observationIds: items.map((item) => item.observationId).slice(0, 12),
      sourceVersionId: latest.sourceVersionId,
      sourceSha256: latest.sourceSha256.toLowerCase(),
      status: 'creator_confirmed_consistent',
    });
  }

  return {
    resolved: resolved.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)).slice(0, 48),
    conflicts: conflicts.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)).slice(0, 24),
  };
}
