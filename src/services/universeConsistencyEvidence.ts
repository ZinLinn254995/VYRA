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

const withoutTemporalMetadata = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const temporalKeys = new Set([
    'effective_at', 'effectiveAt', 'effective_from', 'effectiveFrom', 'valid_from', 'validFrom', 'valid_at', 'validAt', 'starts_at', 'startsAt', 'start_at', 'startAt',
    'at', 'timestamp', 'observed_at', 'observedAt', 'event_at', 'eventAt',
    'event_time', 'eventTime', 'as_of', 'asOf', 'valid_to', 'validTo',
    'effective_until', 'effectiveUntil', 'effective_to', 'effectiveTo', 'expires_at', 'expiresAt', 'ends_at', 'endsAt', 'end_at', 'endAt',
    'valid_until', 'validUntil', 'temporal', 'temporal_scope', 'temporalScope',
    'validity', 'time', 'period', 'event',
    'effective_from', 'effectiveFrom', 'valid_from', 'validFrom', 'starts_at', 'startsAt', 'start_at', 'startAt',
    'effective_to', 'effectiveTo', 'valid_to', 'validTo', 'ends_at', 'endsAt', 'end_at', 'endAt',
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !temporalKeys.has(key))
    .map(([key, item]) => [key, item]));
};

type TemporalInterval = { start: number; end: number };

const temporalInterval = (value: unknown): TemporalInterval | null => {
  if (!isRecord(value)) return null;
  const containers = [value, ...['temporal', 'temporal_scope', 'temporalScope', 'validity', 'time', 'period', 'event'].flatMap((key) =>
    isRecord(value[key]) ? [value[key] as Record<string, unknown>] : [])];
  const readInstant = (keys: string[]): number | null => {
    for (const container of containers) {
      for (const key of keys) {
        const candidate = container[key];
        if (typeof candidate !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T/i.test(candidate.trim())) continue;
        const parsed = Date.parse(candidate.trim());
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };
  const start = readInstant(['effective_at', 'effectiveAt', 'effective_from', 'effectiveFrom', 'valid_from', 'validFrom', 'valid_at', 'validAt', 'starts_at', 'startsAt', 'start_at', 'startAt', 'at', 'timestamp', 'observed_at', 'observedAt', 'event_at', 'eventAt', 'event_time', 'eventTime', 'as_of', 'asOf']);
  const end = readInstant(['valid_to', 'validTo', 'effective_until', 'effectiveUntil', 'expires_at', 'expiresAt', 'valid_until', 'validUntil', 'effective_to', 'effectiveTo', 'ends_at', 'endsAt', 'end_at', 'endAt']);
  if (start === null || (end !== null && end < start)) return null;
  return { start, end: end ?? start };
};

const intervalsOverlap = (a: TemporalInterval, b: TemporalInterval): boolean =>
  a.start <= b.end && b.start <= a.end;

const temporalScope = (value: unknown): string => {
  if (!isRecord(value)) return '';
  const containers = [
    value,
    ...['temporal', 'temporal_scope', 'temporalScope', 'validity', 'time', 'period', 'event'].flatMap((key) =>
      isRecord(value[key]) ? [value[key] as Record<string, unknown>] : []),
  ];
  const readTemporalValue = (keys: string[]) => {
    for (const container of containers) {
      for (const key of keys) {
        const candidate = container[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          const raw = candidate.trim().normalize('NFC');
          const parsed = Date.parse(raw);
          // Canonicalize equivalent ISO instants (including timezone offsets),
          // while retaining date-only and domain-specific labels verbatim.
          if (/^\d{4}-\d{2}-\d{2}T/i.test(raw) && Number.isFinite(parsed)) {
            return new Date(parsed).toISOString();
          }
          return raw;
        }
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
      }
    }
    return '';
  };
  // Aliases represent the same temporal concepts. Event IDs are provenance,
  // not time: using them as a scope would hide conflicting facts at the same time.
  const start = readTemporalValue([
    'effective_at', 'effectiveAt', 'effective_from', 'effectiveFrom', 'valid_from', 'validFrom', 'valid_at', 'validAt',
    'starts_at', 'startsAt', 'start_at', 'startAt', 'at', 'timestamp', 'observed_at', 'observedAt', 'event_at', 'eventAt',
    'event_time', 'eventTime', 'as_of', 'asOf',
  ]);
  const end = readTemporalValue([
    'valid_to', 'validTo', 'effective_until', 'effectiveUntil', 'expires_at',
    'expiresAt', 'valid_until', 'validUntil', 'effective_to', 'effectiveTo', 'ends_at', 'endsAt', 'end_at', 'endAt',
  ]);
  if (!start && !end) return '';
  return 'start:' + start + '|end:' + end;
};

/**
 * Never silently select one creator-confirmed value when the same field and
 * temporal scope have conflicting attestations. Equal values are coalesced;
 * different temporal scopes remain separate facts; overlapping dated intervals conflict.
 */
export function resolveCreatorConfirmedFieldEvidence(
  evidence: CreatorConfirmedFieldEvidence[],
): CreatorFieldResolution {
  const byField = new Map<string, CreatorConfirmedFieldEvidence[]>();
  for (const item of evidence) {
    const fieldPath = item.fieldPath.trim().normalize('NFC');
    if (!fieldPath || fieldPath.length > 240 || !item.evidenceId || !item.observationId) continue;
    const group = byField.get(fieldPath) ?? [];
    group.push({ ...item, fieldPath });
    byField.set(fieldPath, group);
  }
  const groups: CreatorConfirmedFieldEvidence[][] = [];
  for (const fieldItems of byField.values()) {
    const dated = fieldItems.map((item) => ({ item, interval: temporalInterval(item.acceptedValue) }))
      .filter((entry): entry is { item: CreatorConfirmedFieldEvidence; interval: TemporalInterval } => entry.interval !== null);
    const undated = fieldItems.filter((item) => temporalInterval(item.acceptedValue) === null);
    // Build overlap-connected temporal clusters. A fact valid across an interval
    // must conflict with a different creator-confirmed value at any overlapping time.
    const remaining = new Set(dated);
    while (remaining.size) {
      const seed = remaining.values().next().value as typeof dated[number];
      remaining.delete(seed);
      const cluster = [seed];
      for (let index = 0; index < cluster.length; index++) {
        for (const candidate of [...remaining]) {
          if (cluster.some((member) => intervalsOverlap(member.interval, candidate.interval))) {
            remaining.delete(candidate);
            cluster.push(candidate);
          }
        }
      }
      groups.push(cluster.map((entry) => entry.item));
    }
    // Non-ISO/domain-specific scopes retain the conservative exact-scope behavior.
    const undatedByScope = new Map<string, CreatorConfirmedFieldEvidence[]>();
    for (const item of undated) {
      const scope = temporalScope(item.acceptedValue);
      const group = undatedByScope.get(scope) ?? [];
      group.push(item);
      undatedByScope.set(scope, group);
    }
    groups.push(...undatedByScope.values());
  }

  const resolved: ResolvedCreatorField[] = [];
  const conflicts: ConflictedCreatorField[] = [];
  for (const group of groups.values()) {
    const byValue = new Map<string, CreatorConfirmedFieldEvidence[]>();
    for (const item of group) {
      const valueKey = canonicalJson(withoutTemporalMetadata(item.acceptedValue));
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
