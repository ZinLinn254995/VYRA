import express, { type Request, type Response } from 'express';

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AuthVerification =
  | { ok: true; user: SupabaseUser }
  | { ok: false; reason: 'not_configured' | 'missing_token' | 'invalid_token' | 'provider_unavailable' };

type VerifyOptions = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  fetcher?: typeof fetch;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifySupabaseAccessToken(
  accessToken: string,
  options: VerifyOptions = {},
): Promise<AuthVerification> {
  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (options.supabaseAnonKey ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!supabaseUrl || !anonKey) return { ok: false, reason: 'not_configured' };
  if (!accessToken || accessToken.length > 8192 || /\s/.test(accessToken)) {
    return { ok: false, reason: 'missing_token' };
  }

  let endpoint: URL;
  try {
    endpoint = new URL('/auth/v1/user', supabaseUrl);
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
      return { ok: false, reason: 'not_configured' };
    }
  } catch {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'invalid_token' };
    if (!response.ok) return { ok: false, reason: 'provider_unavailable' };

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, reason: 'invalid_token' };
    }
    const data = payload as Record<string, unknown>;
    if (typeof data.id !== 'string' || !UUID_PATTERN.test(data.id)) {
      return { ok: false, reason: 'invalid_token' };
    }
    return {
      ok: true,
      user: {
        id: data.id,
        ...(typeof data.email === 'string' ? { email: data.email } : {}),
        ...(data.user_metadata && typeof data.user_metadata === 'object' && !Array.isArray(data.user_metadata)
          ? { user_metadata: data.user_metadata as Record<string, unknown> }
          : {}),
      },
    };
  } catch {
    return { ok: false, reason: 'provider_unavailable' };
  }
}

export function createSupabaseAuthRouter() {
  const router = express.Router();

  router.get('/session', async (req: Request, res: Response) => {
    const authorization = req.header('authorization') ?? '';
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) {
      return res.status(401).json({ authenticated: false, error: 'A Supabase access token is required.' });
    }

    const result = await verifySupabaseAccessToken(match[1]);
    if (!result.ok) {
      if (result.reason === 'not_configured') {
        return res.status(503).json({ authenticated: false, error: 'Cloud authentication is not configured.' });
      }
      if (result.reason === 'provider_unavailable') {
        return res.status(503).json({ authenticated: false, error: 'Authentication provider is temporarily unavailable.' });
      }
      return res.status(401).json({ authenticated: false, error: 'The session is invalid or expired.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ authenticated: true, user: result.user });
  });

  return router;
}
