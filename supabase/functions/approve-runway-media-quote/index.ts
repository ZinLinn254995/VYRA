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
  if (body.action !== 'approve' || body.confirmed !== true) return json({ error: 'Explicit quote approval is required.' }, 400);
  if (typeof body.quoteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.quoteId))
    return json({ error: 'A valid quote ID is required.' }, 400);
  if (typeof body.maxCostUsd !== 'number' || !Number.isFinite(body.maxCostUsd) || body.maxCostUsd < 0)
    return json({ error: 'A valid maximum USD amount is required.' }, 400);
  if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.idempotencyKey))
    return json({ error: 'A valid approval idempotency key is required.' }, 400);
  const { data, error } = await context.supabaseAdmin.rpc('approve_media_generation_quote', {
    p_user_id: userId, p_quote_id: body.quoteId, p_max_cost_usd: body.maxCostUsd, p_idempotency_key: body.idempotencyKey,
  });
  if (error || !data || !isRecord(data)) {
    const message = error?.message ?? '';
    const status = message.includes('Quote not found') ? 404 : message.includes('expired') ? 410 :
      message.includes('below the quoted estimate') ? 422 : message.includes('idempotency key was already used') ||
      message.includes('not awaiting approval') ? 409 : 503;
    return json({ error: status === 404 ? 'Quote not found.' : status === 410 ? 'Quote expired. Request a new estimate.' :
      status === 422 ? 'The approved maximum is below the estimate.' : status === 409 ?
      'This quote approval conflicts with an earlier request.' : 'The quote could not be approved securely.' }, status);
  }
  return json({ approval: { quoteId: data.id, status: data.status, estimatedCostUsd: data.estimated_cost_usd,
    approvedMaxCostUsd: data.approved_max_cost_usd, confirmedAt: data.approval_confirmed_at },
    message: 'Approval recorded. No generation job was created and no VYRA credits were reserved or charged.' });
});
