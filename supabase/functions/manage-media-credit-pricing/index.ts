import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
const policyShape = (p: Record<string, unknown>) => ({
  id: p.id, version: p.version, creditsPerUsd: p.credits_per_usd,
  roundingMode: p.rounding_mode, status: p.status, effectiveAt: p.effective_at,
  createdAt: p.created_at, createdBy: p.created_by, activatedAt: p.activated_at,
  activatedBy: p.activated_by,
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  const { data: admin, error: adminError } = await context.supabaseAdmin.from('platform_admins')
    .select('role').eq('user_id', userId).maybeSingle();
  if (adminError) return json({ error: 'Could not verify administrator access.' }, 503);
  if (!admin || !['owner', 'admin'].includes(admin.role)) return json({ error: 'Platform administrator access is required.' }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

  if (body.action === 'status') {
    const { data, error } = await context.supabaseAdmin.from('media_credit_pricing_policies')
      .select('id,version,credits_per_usd,rounding_mode,status,effective_at,created_at,created_by,activated_at,activated_by')
      .order('created_at', { ascending: false }).limit(50);
    if (error) return json({ error: 'Pricing policy status is temporarily unavailable.' }, 503);
    return json({ policies: (data ?? []).map((p: Record<string, unknown>) => policyShape(p)),
      activePolicy: (data ?? []).find((p: Record<string, unknown>) => p.status === 'active') ?
        policyShape((data ?? []).find((p: Record<string, unknown>) => p.status === 'active') as Record<string, unknown>) : null });
  }

  if (body.action === 'create_draft') {
    const version = typeof body.version === 'string' ? body.version.trim() : '';
    const rate = typeof body.creditsPerUsd === 'string' ? body.creditsPerUsd.trim() :
      typeof body.creditsPerUsd === 'number' && Number.isFinite(body.creditsPerUsd) ? String(body.creditsPerUsd) : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(version)) return json({ error: 'Use a unique policy version (2–80 safe characters).' }, 400);
    if (!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,8})?$/.test(rate) || Number(rate) <= 0)
      return json({ error: 'creditsPerUsd must be a positive decimal with up to 8 fractional digits.' }, 400);
    const { data, error } = await context.supabaseAdmin.from('media_credit_pricing_policies')
      .insert({ version, credits_per_usd: rate, rounding_mode: 'ceil', status: 'draft', created_by: userId })
      .select('id,version,credits_per_usd,rounding_mode,status,effective_at,created_at,created_by,activated_at,activated_by')
      .single();
    if (error) return json({ error: error.code === '23505' ? 'That policy version already exists.' : 'Could not create the pricing draft.' }, error.code === '23505' ? 409 : 503);
    return json({ policy: policyShape(data), message: 'Draft saved. It is not active and cannot affect customer charges.' }, 201);
  }

  if (body.action === 'activate') {
    if (body.confirmed !== true) return json({ error: 'Explicit activation confirmation is required.' }, 400);
    if (typeof body.policyId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.policyId))
      return json({ error: 'A valid draft policy ID is required.' }, 400);
    const { data, error } = await context.supabaseAdmin.rpc('activate_media_credit_pricing_policy', {
      p_policy_id: body.policyId, p_actor_user_id: userId,
    });
    if (error || !data || !isRecord(data)) {
      const message = error?.message ?? '';
      const status = message.includes('not found') ? 404 : message.includes('Only a draft') ? 409 :
        message.includes('administrator') ? 403 : 503;
      return json({ error: status === 404 ? 'Pricing policy not found.' :
        status === 409 ? 'Only a draft policy can be activated.' :
        status === 403 ? 'Platform administrator access is required.' : 'Could not activate the pricing policy safely.' }, status);
    }
    return json({ policy: policyShape(data), message: 'Pricing policy activated. The previous active policy, if any, is retired atomically.' });
  }
  return json({ error: 'Unsupported pricing policy action.' }, 400);
});
