export type ProjectDetailValue = string | number | boolean | ProjectDetailValue[] | { [key: string]: ProjectDetailValue } | null;
export type ProjectDetailSuggestion = { value: ProjectDetailValue; confidence?: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isSafeKey = (key: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) &&
  !['__proto__', 'prototype', 'constructor'].includes(key);

const isValidConfidence = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const normalizeValue = (value: unknown, depth = 0): ProjectDetailValue | undefined => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.trim().slice(0, 2000);
  if (Array.isArray(value)) {
    if (value.length > 50) return undefined;
    const normalized = value.map((item) => normalizeValue(item, depth + 1));
    if (normalized.some((item) => item === undefined)) return undefined;
    return normalized as ProjectDetailValue[];
  }
  if (isRecord(value) && depth < 3) {
    const entries = Object.entries(value).slice(0, 30);
    if (entries.some(([key]) => !isSafeKey(key))) return undefined;
    const normalized: Record<string, ProjectDetailValue> = {};
    for (const [key, item] of entries) {
      const next = normalizeValue(item, depth + 1);
      if (next === undefined) return undefined;
      normalized[key] = next;
    }
    return normalized;
  }
  return undefined;
};

export const parseProjectDetailSuggestions = (raw: string): Record<string, ProjectDetailSuggestion> => {
  const normalized = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/i, '');
  const parsed: unknown = JSON.parse(normalized);
  if (!isRecord(parsed)) throw new Error('AI returned invalid Project details.');
  const result = Object.create(null) as Record<string, ProjectDetailSuggestion>;
  for (const [rawKey, value] of Object.entries(parsed)) {
    if (!isSafeKey(rawKey) || !isRecord(value) || !('value' in value)) continue;
    const key = rawKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || !isSafeKey(key) || Object.hasOwn(result, key)) continue;
    const candidate = normalizeValue(value.value);
    if (candidate === undefined) continue;
    const confidence = isValidConfidence(value.confidence) ? value.confidence : undefined;
    result[key] = { value: candidate, ...(confidence === undefined ? {} : { confidence }) };
  }
  if (!Object.keys(result).length) throw new Error('AI did not return any usable Project details.');
  return result;
};
