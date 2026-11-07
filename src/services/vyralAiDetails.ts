export type VyralDetailValue = string | number | boolean | string[] | Record<string, unknown> | null;
export type VyralDetailOrigin = 'ai_suggested' | 'creator_confirmed' | 'creator_edited';

export type VyralAiDetailField = {
  value: VyralDetailValue;
  origin: VyralDetailOrigin;
  confidence?: number;
  updated_at: string;
};

export type VyralAiDetails = {
  schema_version: 1;
  scope: 'asset' | 'vyral' | 'storyboard';
  source_version_id: string | null;
  source_revision: number | null;
  provider: string;
  model: string;
  generated_at: string;
  stale: boolean;
  fields: Record<string, VyralAiDetailField>;
};

export type VyralAiDetailsInput = {
  scope: VyralAiDetails['scope'];
  sourceVersionId?: string | null;
  sourceRevision?: number | null;
  provider: string;
  model: string;
  generatedAt: string;
  suggestions: Record<string, { value: VyralDetailValue; confidence?: number }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidConfidence = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export const mergeVyralAiDetails = (
  current: unknown,
  input: VyralAiDetailsInput,
): VyralAiDetails => {
  const previous = isRecord(current) && current.schema_version === 1 ? current : {};
  const previousFields = isRecord(previous.fields) ? previous.fields : {};
  const fields: Record<string, VyralAiDetailField> = {};

  for (const [key, raw] of Object.entries(previousFields)) {
    if (!isRecord(raw) || !('value' in raw) ||
        !['ai_suggested', 'creator_confirmed', 'creator_edited'].includes(String(raw.origin)) ||
        typeof raw.updated_at !== 'string') continue;
    fields[key] = {
      value: raw.value as VyralDetailValue,
      origin: raw.origin as VyralDetailOrigin,
      ...(isValidConfidence(raw.confidence) ? { confidence: raw.confidence } : {}),
      updated_at: raw.updated_at,
    };
  }

  for (const [key, suggestion] of Object.entries(input.suggestions)) {
    if (!key.trim() || !suggestion || !('value' in suggestion)) continue;
    const existing = fields[key];
    if (existing && existing.origin !== 'ai_suggested') continue;
    fields[key] = {
      value: suggestion.value,
      origin: 'ai_suggested',
      ...(isValidConfidence(suggestion.confidence) ? { confidence: suggestion.confidence } : {}),
      updated_at: input.generatedAt,
    };
  }

  return {
    schema_version: 1,
    scope: input.scope,
    source_version_id: input.sourceVersionId ?? null,
    source_revision: input.sourceRevision ?? null,
    provider: input.provider,
    model: input.model,
    generated_at: input.generatedAt,
    stale: false,
    fields,
  };
};

export const setVyralAiDetailField = (
  current: VyralAiDetails,
  key: string,
  value: VyralDetailValue,
  origin: 'creator_confirmed' | 'creator_edited',
  updatedAt: string,
): VyralAiDetails => ({
  ...current,
  fields: {
    ...current.fields,
    [key]: { value, origin, updated_at: updatedAt },
  },
});

export const markVyralAiDetailsStale = (current: VyralAiDetails): VyralAiDetails => ({
  ...current,
  stale: true,
});
