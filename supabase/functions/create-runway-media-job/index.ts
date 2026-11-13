import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);
  let body: Record<string, unknown>;
  try { const parsed: unknown = await request.json(); if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400); body = parsed; }
  catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (body.action !== 'create') return json({ error: 'Unsupported generation job action.' }, 400);
  if (typeof body.quoteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.quoteId))
    return json({ error: 'A valid quote ID is required.' }, 400);
  if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(body.idempotencyKey))
    return json({ error: 'A valid generation idempotency key is required.' }, 400);
  const { data: quote, error: quoteError } = await context.supabaseAdmin.from('media_generation_quotes')
    .select('id,status,task,quality,provider,provider_model_id,approved_max_credit_units,credit_approval_confirmed_at,pricing_policy_id,expires_at')
    .eq('id', body.quoteId).eq('user_id', userId).maybeSingle();
  if (quoteError || !quote) return json({ error: 'Approved quote not found.' }, quoteError ? 503 : 404);
  if (!['approved', 'used'].includes(quote.status) || !quote.credit_approval_confirmed_at || !quote.pricing_policy_id ||
      !Number.isSafeInteger(Number(quote.approved_max_credit_units)) || Number(quote.approved_max_credit_units) <= 0)
    return json({ error: 'Explicit maximum-credit approval is required before creating a generation job.' }, 409);
  if (quote.status !== 'used' && Date.parse(quote.expires_at) <= Date.now()) return json({ error: 'Quote expired. Request a new estimate.' }, 410);
  const { data: job, error: jobError } = await context.supabaseAdmin.rpc('create_media_generation_job_and_reserve', {
    p_user_id: userId, p_quote_id: body.quoteId, p_idempotency_key: body.idempotencyKey,
    p_approved_max_credit_units: Number(quote.approved_max_credit_units),
  });
  if (jobError || !job || !isRecord(job)) {
    const message = jobError?.message ?? '';
    const status = message.includes('CREDIT_PRICING_POLICY_CHANGED') || message.includes('Explicit customer credit approval') ? 409 :
      message.toLowerCase().includes('expired') ? 410 :
      message.toLowerCase().includes('insufficient') ? 402 :
      message.includes('idempotency key was reused') ? 409 :
      message.toLowerCase().includes('not found') ? 404 : 503;
    return json({ error: status === 409 ? 'The quote approval or pricing policy changed. Review the quote again.'
      : status === 410 ? 'Quote expired. Request a new estimate.'
      : status === 402 ? 'Insufficient VYRA credits. No job or reservation was created.'
      : status === 404 ? 'Approved quote not found.' : 'The generation job could not be created safely.' }, status);
  }
  // Record the reserved-job milestone without storing prompts or media payloads.
  // This insert is best-effort and idempotent via the partial unique index on job_id.
  try {
    await context.supabaseAdmin.from('media_generation_job_events').insert({
      job_id: job.id,
      provider: quote.provider,
      task: quote.task,
      quality: quote.quality,
      event_type: 'reserved',
      model_id: quote.provider_model_id,
      started_at: job.created_at ?? new Date().toISOString(),
    });
  } catch { /* telemetry must never block a safely reserved job */ }

  return json({ job: { id: job.id, status: job.status, quoteId: body.quoteId, reservedCreditUnits: quote.approved_max_credit_units },
    message: 'Generation job created and approved maximum credits reserved atomically. No provider task has been submitted yet.' });
});