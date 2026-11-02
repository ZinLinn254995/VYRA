import type { Request, Response } from 'express';
import { verifySupabaseAccessToken } from '../../src/server/supabaseAuth.js';

// Explicit Vercel function route. This avoids relying on catch-all path rewriting.
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authorization = req.headers.authorization ?? '';
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
  return res.status(200).json({ authenticated: true, user: result.user });
}
