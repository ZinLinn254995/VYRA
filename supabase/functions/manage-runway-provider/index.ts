import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const RUNWAY_API = 'https://api.dev.runwayml.com/v1/organization';
const RUNWAY_VERSION = '2024-11-06';
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

type Verification =
  | { ok: true; tier: unknown }
  | { ok: false; reason: 'invalid_key' | 'rate_limited' | 'provider_unavailable' };

async function verifyRunwayKey(apiKey: string): Promise<Verification> {
  try {
    // GET organization is a read-only credential check; it does not create a task or incur generation charges.
    const response = await fetch(RUNWAY_API, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'X-Runway-Version': RUNWAY_VERSION,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'invalid_key' };
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!response.ok) return { ok: false, reason: 'provider_unavailable' };
    const data = await response.json().catch(() => null) as { tier?: unknown; creditBalance?: unknown } | null;
    if (!data || typeof data !== 'object' || !('creditBalance' in data)) return { ok: false, reason: 'provider_unavailable' };
    return { ok: true, tier: data.tier ?? null };
  } catch {
    return { ok: false, reason: 'provider_unavailable' };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  const { data: admin, error: adminError } = await context.supabaseAdmin
    .from('platform_admins').select('role').eq('user_id', userId).maybeSingle();
  if (adminError) return json({ error: 'Could not verify platform administrator access.' }, 503);
  if (!admin || !['owner', 'admin'].includes(admin.role)) return json({ error: 'Administrator access is required.' }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

  if (body.action === 'status' || body.action === 'verify') {
    const { data: secret, error } = await context.supabaseAdmin.rpc('get_vyra_runway_secret');
    if (error) return json({ error: 'Could not read Runway credential status.' }, 503);
    if (typeof secret !== 'string' || !secret) {
      return json({ configured: false, credentialVerified: false, provider: 'runway' });
    }
    const verification = await verifyRunwayKey(secret);
    if (!verification.ok) {
      return json({
        configured: true,
        credentialVerified: false,
        provider: 'runway',
        verificationStatus: verification.reason,
        message: verification.reason === 'invalid_key'
          ? 'The stored Runway key was rejected. Replace it with a valid key.'
          : verification.reason === 'rate_limited'
            ? 'Runway rate limit reached. Credential verification can be retried later.'
            : 'Runway could not verify the stored key right now.',
      }, verification.reason === 'provider_unavailable' ? 502 : 200);
    }
    return json({ configured: true, credentialVerified: true, provider: 'runway', tier: verification.tier });
  }

  if (body.action !== 'save') return json({ error: 'Unsupported Runway provider action.' }, 400);
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    return json({ error: 'Enter a valid Runway API key.' }, 400);
  }

  const verification = await verifyRunwayKey(apiKey);
  if (!verification.ok) {
    return json({
      error: verification.reason === 'invalid_key'
        ? 'Runway rejected this API key. Check the key and try again.'
        : verification.reason === 'rate_limited'
          ? 'Runway rate limit reached. Try verifying the key again later.'
          : 'Runway could not verify this key right now. The key was not saved.',
    }, verification.reason === 'invalid_key' ? 400 : 502);
  }

  const { error: saveError } = await context.supabaseAdmin.rpc('set_vyra_runway_secret', { secret_value: apiKey });
  if (saveError) return json({ error: 'The key passed verification but could not be stored securely.' }, 503);
  return json({
    configured: true,
    credentialVerified: true,
    provider: 'runway',
    tier: verification.tier,
    message: 'Runway API key verified and saved securely.',
  });
});
