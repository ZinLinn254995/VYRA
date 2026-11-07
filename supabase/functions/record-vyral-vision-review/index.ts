import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (!isUuid(body.observationId)) return json({ error: 'A valid observationId is required.' }, 400);
  if (body.decision !== 'creator_confirmed' && body.decision !== 'disputed') return json({ error: 'Decision must be creator_confirmed or disputed.' }, 400);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000) return json({ error: 'Review note must be 2,000 characters or fewer.' }, 400);

  const { data: observation, error: observationError } = await context.supabase
    .from('vyral_vision_observations')
    .select('id,asset_id,asset_version_id,user_id,task_kind,model_provider,model_id,source_sha256,evidence')
    .eq('id', body.observationId).eq('user_id', userId).maybeSingle();
  if (observationError) return json({ error: 'Could not load Vision observation.' }, 500);
  if (!observation) return json({ error: 'Vision observation not found.' }, 404);

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets').select('id,vyral_id,user_id').eq('id', observation.asset_id).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify source asset.' }, 500);
  if (!asset) return json({ error: 'Source asset not found.' }, 404);

  const { data: prior, error: priorError } = await context.supabaseAdmin
    .from('vyral_dna_records').select('id,payload,created_at')
    .eq('asset_id', asset.id).eq('user_id', userId)
    .contains('payload', { vision_observation_review_id: observation.id, review_source: 'server_creator_review' })
    .order('created_at', { ascending: false }).limit(1);
  if (priorError) return json({ error: 'Could not check previous creator review.' }, 500);
  if (prior?.length) return json({ error: 'This observation already has a creator review. Reviews are immutable; create a new observation to submit a new claim.', status: 'review_exists' }, 409);

  const payload = {
    review_source: 'server_creator_review',
    vision_observation_review_id: observation.id,
    reviewed_observation: {
      asset_id: observation.asset_id,
      asset_version_id: observation.asset_version_id,
      source_sha256: observation.source_sha256,
      task_kind: observation.task_kind,
      model_provider_claim: observation.model_provider,
      model_id_claim: observation.model_id,
    },
    decision: body.decision,
    note: note || null,
    reviewed_at: new Date().toISOString(),
    reviewer_user_id: userId,
    scope: 'single_observation_only',
    does_not_certify_entire_asset_or_vyral: true,
  };
  const { data: review, error: insertError } = await context.supabaseAdmin
    .from('vyral_dna_records')
    .insert({
      vyral_id: asset.vyral_id,
      user_id: userId,
      asset_id: asset.id,
      scope: 'asset',
      schema_version: 1,
      dna_status: 'evolving',
      source_kind: 'creator',
      verification_status: body.decision,
      payload,
      reconstruction_data: {
        eligible_for_dna_only_reconstruction: false,
        reason: 'A creator review of one observation is not proof of complete or lossless DNA.',
      },
    })
    .select('id')
    .single();
  if (insertError?.code === '23505') return json({ error: 'This observation already has a creator review. Reviews are immutable.', status: 'review_exists' }, 409);
  if (insertError || !review) return json({ error: 'Could not save creator review.' }, 500);
  return json({ status: 'review_recorded', reviewId: review.id, observationId: observation.id, decision: body.decision }, 201);
});
