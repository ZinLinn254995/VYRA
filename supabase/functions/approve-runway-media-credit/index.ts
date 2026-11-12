import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

  if (body.action !== 'approve' || body.confirmed !== true)
    return json({ error: 'Explicit maximum-credit confirmation is required.' }, 400);
  if (typeof body.quoteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.quoteId))
    return json({ error: 'A valid quote ID is required.' }, 400);
  if (typeof body.maxCreditUnits !== 'number' || !Number.isSafeInteger(body.maxCreditUnits) || body.maxCreditUnits <= 0)
    return json({ error: 'A positive whole-number maximum credit amount is required.' }, 400);
  if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.idempotencyKey))
    return json({ error: 'A valid credit approval idempotency key is required.' }, 400);

  const { data, error } = await context.supabaseAdmin.rpc('approve_media_generation_credit_ceiling', {
    p_user_id: userId,
    p_quote_id: body.quoteId,
    p_approved_max_credit_units: body.maxCreditUnits,
    p_idempotency_key: body.idempotencyKey,
  });
  if (error || !data || !isRecord(data)) {
    const message = error?.message ?? '';
    const status = message.includes('CREDIT_PRICING_NOT_CONFIGURED') ? 409 :
      message.includes('Quote not found') ? 404 : message.includes('expired') ? 410 :
      message.includes('below the policy-derived') ? 422 :
      message.includes('already has a different') ? 409 :
      message.includes('must have an explicit USD approval') ? 409 : 503;
    return json({ error: status === 409 && message.includes('CREDIT_PRICING_NOT_CONFIGURED')
      ? 'VYRA credit pricing is not configured yet. No credit approval or reservation was recorded.'
      : status === 404 ? 'Quote not found.'
      : status === 410 ? 'Quote expired. Request a new estimate.'
      : status === 422 ? 'The maximum credit amount is below the required policy-based limit.'
      : status === 409 ? 'This quote cannot accept that credit approval.'
      : 'The credit approval could not be recorded securely.' }, status);
  }

  return json({
    approval: {
      quoteId: data.id,
      status: data.status,
      approvedMaxCreditUnits: data.approved_max_credit_units,
      creditConfirmedAt: data.credit_approval_confirmed_at,
      pricingPolicyId: data.pricing_policy_id,
    },
    message: 'Maximum credit consent recorded. No generation job was created and no credits were reserved or charged.',
  });
});
