/**
 * Strict, side-effect-free validation helpers for the server-owned usage ledger.
 * These helpers deliberately do not write to Supabase or calculate customer credits.
 */

export type UsageCapability = 'text' | 'image' | 'audio' | 'video';

export type NormalizedProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd: number | null;
  generationId: string | null;
};

const GENERATION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,200}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9._:-]{1,160}$/;

export function isUsageCapability(value: unknown): value is UsageCapability {
  return value === 'text' || value === 'image' || value === 'audio' || value === 'video';
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);
}

/** Missing, malformed, negative, NaN and infinite provider costs remain unknown.
 * A provider-reported zero is valid and must not be confused with missing data.
 */
export function normalizeActualProviderCost(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Allowlist only usage metadata needed for accounting; never persist raw provider payloads. */
export function normalizeProviderUsage(input: unknown): NormalizedProviderUsage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { costUsd: null, generationId: null };
  }
  const value = input as Record<string, unknown>;
  const generationId = typeof value.generationId === 'string' && GENERATION_ID_PATTERN.test(value.generationId)
    ? value.generationId
    : null;
  const costUsd = normalizeActualProviderCost(value.costUsd);
  const promptTokens = normalizeTokenCount(value.promptTokens);
  const completionTokens = normalizeTokenCount(value.completionTokens);
  const totalTokens = normalizeTokenCount(value.totalTokens);
  return {
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    costUsd,
    generationId,
  };
}

/** True when an operator explicitly requested the usage ledger, even if its credentials are incomplete. */
export function isUsageLedgerRequested(env: Record<string, string | undefined> = process.env): boolean {
  return env.VYRA_USAGE_LEDGER_ENABLED === 'true';
}

/** The recorder is usable only when explicitly requested and all server-only credentials exist. */
export function isUsageLedgerServerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isUsageLedgerRequested(env)
    && Boolean(env.SUPABASE_URL?.trim())
    && Boolean(env.SUPABASE_ANON_KEY?.trim())
    && Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Client-supplied user IDs are never trusted for ledger ownership. */
export function resolveLedgerOwnerId(verifiedUserId: string, _untrustedBodyUserId?: unknown): string {
  return verifiedUserId;
}
