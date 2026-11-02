import express, { type Request, type Response } from 'express';
import { verifySupabaseAccessToken, type SupabaseUser } from './supabaseAuth.js';

type CreditTransfersOptions = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  serviceRoleKey?: string;
  fetcher?: typeof fetch;
  verifyToken?: typeof verifySupabaseAccessToken;
};

type ApiError = { error: string; status: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const TRANSFER_SELECT = 'id,sender_user_id,recipient_user_id,amount,status,created_at';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function verifyRequestUser(
  req: Request,
  options: CreditTransfersOptions,
): Promise<{ user: SupabaseUser; accessToken: string } | ApiError> {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return { error: 'A Supabase access token is required.', status: 401 };

  const result = await (options.verifyToken ?? verifySupabaseAccessToken)(match[1], {
    supabaseUrl: options.supabaseUrl,
    supabaseAnonKey: options.supabaseAnonKey,
    fetcher: options.fetcher,
  });
  if (!result.ok) {
    if (result.reason === 'not_configured') return { error: 'Cloud credit transfers are not configured.', status: 503 };
    if (result.reason === 'provider_unavailable') return { error: 'Authentication provider is temporarily unavailable.', status: 503 };
    return { error: 'The session is invalid or expired.', status: 401 };
  }
  return { user: result.user, accessToken: match[1] };
}

function publicTransfer(value: unknown): Record<string, unknown> | null {
  const transfer = asRecord(Array.isArray(value) ? value[0] : value);
  if (typeof transfer.id !== 'string' || !UUID_PATTERN.test(transfer.id)
      || typeof transfer.sender_user_id !== 'string' || !UUID_PATTERN.test(transfer.sender_user_id)
      || typeof transfer.recipient_user_id !== 'string' || !UUID_PATTERN.test(transfer.recipient_user_id)
      || !['completed'].includes(String(transfer.status))
      || (typeof transfer.amount !== 'number' && typeof transfer.amount !== 'string')) {
    return null;
  }
  return {
    id: transfer.id,
    senderUserId: transfer.sender_user_id,
    recipientUserId: transfer.recipient_user_id,
    amount: transfer.amount,
    status: transfer.status,
    ...(typeof transfer.created_at === 'string' ? { createdAt: transfer.created_at } : {}),
  };
}

export function createCreditTransfersRouter(options: CreditTransfersOptions = {}) {
  const router = express.Router();
  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (options.supabaseAnonKey ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
  const serviceRoleKey = (options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const fetcher = options.fetcher ?? fetch;

  router.get('/credits/transfers', async (req: Request, res: Response) => {
    const identity = await verifyRequestUser(req, options);
    if ('error' in identity) return res.status(identity.status).json({ error: identity.error });
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Cloud credit transfers are not configured.' });

    try {
      const endpoint = new URL('/rest/v1/credit_transfers', supabaseUrl);
      endpoint.searchParams.set('select', TRANSFER_SELECT);
      endpoint.searchParams.set(
        'or',
        '(sender_user_id.eq.' + identity.user.id + ',recipient_user_id.eq.' + identity.user.id + ')',
      );
      endpoint.searchParams.set('order', 'created_at.desc');
      endpoint.searchParams.set('limit', '100');

      const response = await fetcher(endpoint, {
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + identity.accessToken,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return res.status(response.status === 401 || response.status === 403 ? 401 : 503)
          .json({ error: 'Could not load credit transfer history.' });
      }
      const payload: unknown = await response.json();
      const transfers = Array.isArray(payload)
        ? payload.map(publicTransfer).filter((item): item is Record<string, unknown> => item !== null)
        : [];
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ transfers });
    } catch {
      return res.status(503).json({ error: 'Credit transfer history is temporarily unavailable.' });
    }
  });

  router.post('/credits/transfers', async (req: Request, res: Response) => {
    const identity = await verifyRequestUser(req, options);
    if ('error' in identity) return res.status(identity.status).json({ error: identity.error });
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(503).json({ error: 'Credit transfer processing is not configured.' });
    }

    const body = asRecord(req.body);
    const recipientUserId = typeof body.recipientUserId === 'string' ? body.recipientUserId.trim() : '';
    const amount = body.amount;
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const note = body.note === undefined || body.note === null
      ? null
      : typeof body.note === 'string' ? body.note.trim() : undefined;

    if (!UUID_PATTERN.test(recipientUserId)) {
      return res.status(400).json({ error: 'Enter a valid VYRA recipient account ID.' });
    }
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Transfer amount must be a positive whole number.' });
    }
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return res.status(400).json({ error: 'A valid transfer request ID is required.' });
    }
    if (note === undefined || (typeof note === 'string' && note.length > 500)) {
      return res.status(400).json({ error: 'Transfer note must be 500 characters or fewer.' });
    }

    try {
      const endpoint = new URL('/rest/v1/rpc/transfer_credits', supabaseUrl);
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          p_sender_user_id: identity.user.id,
          p_recipient_user_id: recipientUserId,
          p_amount: amount,
          p_idempotency_key: idempotencyKey,
          p_note: note,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const payload = asRecord(await response.json().catch(() => null));
        const code = typeof payload.code === 'string' ? payload.code : '';
        if (code === 'P0001') return res.status(409).json({ error: 'There are not enough available credits for this transfer.' });
        if (code === '23505') return res.status(409).json({ error: 'This transfer request ID was already used with different details.' });
        if (code === '22023') return res.status(400).json({ error: 'The recipient account or transfer details are not valid.' });
        if (code === '42501') return res.status(503).json({ error: 'Credit transfer authorization is not configured correctly.' });
        console.error('[credit-transfers] Transfer RPC failed', { status: response.status, code: code.slice(0, 32) });
        return res.status(503).json({ error: 'Credit transfer could not be completed. No transfer was confirmed.' });
      }

      const payload: unknown = await response.json();
      const transfer = publicTransfer(payload);
      if (!transfer) return res.status(502).json({ error: 'Credit transfer response could not be verified.' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ transfer });
    } catch {
      return res.status(503).json({ error: 'Credit transfer service is temporarily unavailable. Check transaction history before retrying.' });
    }
  });

  return router;
}
