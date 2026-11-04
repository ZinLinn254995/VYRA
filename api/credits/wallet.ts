import type { Request, Response } from 'express';
import { verifySupabaseAccessToken } from '../../src/server/supabaseAuth.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function integerString(value: unknown): string | null {
  if (typeof value === 'string' && /^-?\\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

/** Authenticated, read-only wallet endpoint for the Marketplace header and account menu. */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authorization = req.headers.authorization ?? '';
  const match = /^Bearer ([^\\s]+)$/i.exec(authorization);
  if (!match) return res.status(401).json({ error: 'A Supabase access token is required.' });

  const auth = await verifySupabaseAccessToken(match[1]);
  if (!auth.ok) {
    if (auth.reason === 'not_configured' || auth.reason === 'provider_unavailable') {
      return res.status(503).json({ error: 'Credit wallet is temporarily unavailable.' });
    }
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!supabaseUrl || !anonKey) {
    return res.status(503).json({ error: 'Credit wallet is not configured.' });
  }

  try {
    const endpoint = new URL('/rest/v1/rpc/get_credit_wallet', supabaseUrl);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + match[1],
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return res.status(response.status === 401 || response.status === 403 ? 401 : 503)
        .json({ error: 'Could not load your credit wallet.' });
    }

    const payload = asRecord(await response.json());
    const availableBalance = integerString(payload.availableBalance);
    const reservedBalance = integerString(payload.reservedBalance);
    const account = asRecord(payload.account);
    if (availableBalance === null || reservedBalance === null || !Array.isArray(payload.recentActivity)) {
      return res.status(502).json({ error: 'Wallet response could not be verified.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      account: {
        username: typeof account.username === 'string' ? account.username : null,
        displayName: typeof account.displayName === 'string' ? account.displayName.slice(0, 80) : null,
      },
      availableBalance,
      reservedBalance,
    });
  } catch {
    return res.status(503).json({ error: 'Credit wallet is temporarily unavailable.' });
  }
}
