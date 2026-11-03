/**
 * Server-only wrapper for the append-only VYRA credit ledger RPC.
 *
 * This module does not expose an HTTP route and must never be imported by
 * browser code. BYOK provider usage is deliberately not charged to VYRA credits.
 */
export type CreditLedgerEntryType = 'grant' | 'reserve' | 'commit' | 'release' | 'refund' | 'adjustment';

export type CreditLedgerInput = {
  userId: string;
  generationJobId?: string | null;
  idempotencyKey: string;
  entryType: CreditLedgerEntryType;
  amount: string | number | bigint;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreditLedgerOptions = {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetcher?: typeof fetch;
};

export type CreditLedgerEntry = {
  id: string;
  userId: string;
  generationJobId: string | null;
  idempotencyKey: string;
  entryType: CreditLedgerEntryType;
  availableDelta: string;
  reservedDelta: string;
  note: string | null;
  createdAt: string;
};

export type CreditLedgerResult =
  | { ok: true; entry: CreditLedgerEntry }
  | { ok: false; reason: 'not_configured' | 'invalid_input' | 'insufficient_balance' | 'reservation_conflict' | 'idempotency_conflict' | 'unavailable' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const ENTRY_TYPES = new Set<CreditLedgerEntryType>(['grant', 'reserve', 'commit', 'release', 'refund', 'adjustment']);
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const PRIVATE_METADATA_KEY = /(api.?key|access.?token|refresh.?token|authorization|secret|password|prompt|message|content)/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeAmount(value: CreditLedgerInput['amount'], entryType: CreditLedgerEntryType): string | null {
  let amount: bigint;
  try {
    if (typeof value === 'bigint') amount = value;
    else if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) return null;
      amount = BigInt(value);
    } else {
      if (!/^-?\d{1,19}$/.test(value)) return null;
      amount = BigInt(value);
    }
  } catch {
    return null;
  }
  if (amount === 0n || amount < INT64_MIN || amount > INT64_MAX) return null;
  if (entryType !== 'adjustment' && amount < 0n) return null;
  return amount.toString();
}

function hasPrivateMetadataKey(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (Array.isArray(value)) return value.some((entry) => hasPrivateMetadataKey(entry, depth + 1));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    PRIVATE_METADATA_KEY.test(key) || hasPrivateMetadataKey(child, depth + 1)
  );
}

function parseEntry(value: unknown): CreditLedgerEntry | null {
  const row = asRecord(Array.isArray(value) ? value[0] : value);
  if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)
      || typeof row.user_id !== 'string' || !UUID_PATTERN.test(row.user_id)
      || typeof row.idempotency_key !== 'string'
      || typeof row.entry_type !== 'string'
      || !['grant', 'reserve', 'commit', 'release', 'refund', 'adjustment'].includes(row.entry_type)
      || (typeof row.available_delta !== 'number' && typeof row.available_delta !== 'string')
      || (typeof row.reserved_delta !== 'number' && typeof row.reserved_delta !== 'string')
      || typeof row.created_at !== 'string') return null;
  return {
    id: row.id,
    userId: row.user_id,
    generationJobId: typeof row.generation_job_id === 'string' ? row.generation_job_id : null,
    idempotencyKey: row.idempotency_key,
    entryType: row.entry_type as CreditLedgerEntryType,
    availableDelta: String(row.available_delta),
    reservedDelta: String(row.reserved_delta),
    note: typeof row.note === 'string' ? row.note : null,
    createdAt: row.created_at,
  };
}

export async function applyCreditLedgerEntry(
  input: CreditLedgerInput,
  options: CreditLedgerOptions = {},
): Promise<CreditLedgerResult> {
  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceRoleKey = (options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) return { ok: false, reason: 'not_configured' };

  const amount = normalizeAmount(input.amount, input.entryType);
  const generationJobId = input.generationJobId ?? null;
  const metadata = input.metadata ?? {};
  if (!ENTRY_TYPES.has(input.entryType)
      || !UUID_PATTERN.test(input.userId)
      || (generationJobId !== null && !UUID_PATTERN.test(generationJobId))
      || !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
      || !amount
      || (['reserve', 'commit', 'release'].includes(input.entryType) && !generationJobId)
      || (input.note !== undefined && input.note !== null && (typeof input.note !== 'string' || input.note.length > 500))
      || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || hasPrivateMetadataKey(metadata)) {
    return { ok: false, reason: 'invalid_input' };
  }

  let metadataJson: string;
  try {
    metadataJson = JSON.stringify(metadata);
  } catch {
    return { ok: false, reason: 'invalid_input' };
  }
  if (metadataJson.length > 8192) return { ok: false, reason: 'invalid_input' };

  try {
    const endpoint = new URL('/rest/v1/rpc/apply_credit_ledger_entry', supabaseUrl);
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_user_id: input.userId,
        p_generation_job_id: generationJobId,
        p_idempotency_key: input.idempotencyKey,
        p_entry_type: input.entryType,
        p_amount: amount,
        p_note: input.note ?? null,
        p_metadata: metadata,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const payload = asRecord(await response.json().catch(() => null));
      const code = typeof payload.code === 'string' ? payload.code : '';
      const message = typeof payload.message === 'string' ? payload.message.toLowerCase() : '';
      if (code === '23505' || message.includes('idempotency key was already used')) {
        return { ok: false, reason: 'idempotency_conflict' };
      }
      if (code === 'P0001' && message.includes('insufficient available')) {
        return { ok: false, reason: 'insufficient_balance' };
      }
      if (code === 'P0001' && message.includes('reserved')) {
        return { ok: false, reason: 'reservation_conflict' };
      }
      if (code === '22023') return { ok: false, reason: 'invalid_input' };
      return { ok: false, reason: 'unavailable' };
    }

    const entry = parseEntry(await response.json().catch(() => null));
    const expectedAvailableDelta = input.entryType === 'reserve' ? (-BigInt(amount)).toString()
      : input.entryType === 'commit' ? '0'
        : input.entryType === 'adjustment' ? amount : amount;
    const expectedReservedDelta = input.entryType === 'reserve' ? amount
      : input.entryType === 'commit' || input.entryType === 'release' ? (-BigInt(amount)).toString()
        : '0';
    if (!entry || entry.userId !== input.userId
        || entry.generationJobId !== generationJobId
        || entry.idempotencyKey !== input.idempotencyKey
        || entry.entryType !== input.entryType
        || entry.availableDelta !== expectedAvailableDelta
        || entry.reservedDelta !== expectedReservedDelta) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, entry };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
