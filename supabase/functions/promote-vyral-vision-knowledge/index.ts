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
  const statement = typeof body.creatorStatement === 'string' ? body.creatorStatement.trim() : '';
  if (!statement || statement.length > 4000) return json({ error: 'A creator statement of 1–4,000 characters is required.' }, 400);

  const { data: observation, error: observationError } = await context.supabase
    .from('vyral_vision_observations')
    .select('id,asset_id,asset_version_id,user_id,task_kind,model_provider,model_id,source_sha256,observation,evidence')
    .eq('id', body.observationId).eq('user_id', userId).maybeSingle();
  if (observationError) return json({ error: 'Could not load Vision observation.' }, 500);
  if (!observation) return json({ error: 'Vision observation not found.' }, 404);

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets').select('id,vyral_id,user_id').eq('id', observation.asset_id).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify source asset.' }, 500);
  if (!asset) return json({ error: 'Source asset not found.' }, 404);

  const { data: reviews, error: reviewError } = await context.supabaseAdmin
    .from('vyral_dna_records').select('id,verification_status,payload')
    .eq('asset_id', asset.id).eq('user_id', userId)
    .contains('payload', { vision_observation_review_id: observation.id, review_source: 'server_creator_review' })
    .order('created_at', { ascending: false }).limit(1);
  if (reviewError) return json({ error: 'Could not verify creator review.' }, 500);
  const review = reviews?.[0];
  if (!review || review.verification_status !== 'creator_confirmed') {
    return json({ error: 'Only an observation with an explicit creator-confirmed review can be promoted. Disputed or unreviewed observations are ineligible.' }, 409);
  }

  const { data: prior, error: priorError } = await context.supabaseAdmin
    .from('vyral_dna_records').select('id').eq('asset_id', asset.id).eq('user_id', userId)
    .contains('payload', { knowledge_promotion_source: 'creator_adopted_vision_observation', vision_observation_id: observation.id })
    .limit(1);
  if (priorError) return json({ error: 'Could not check existing promotion.' }, 500);
  if (prior?.length) return json({ error: 'This observation has already been promoted. Promotion records are immutable.', status: 'already_promoted' }, 409);

  const payload = {
    knowledge_kind: 'creator_adopted_vision_observation',
    knowledge_promotion_source: 'creator_adopted_vision_observation',
    vision_observation_id: observation.id,
    creator_review_id: review.id,
    creator_statement: statement,
    adopted_observation: observation.observation,
    source_evidence: {
      asset_id: observation.asset_id,
      asset_version_id: observation.asset_version_id,
      source_sha256: observation.source_sha256,
      task_kind: observation.task_kind,
      model_provider_claim: observation.model_provider,
      model_id_claim: observation.model_id,
    },
    authority: 'creator_explicitly_adopted_model_observation',
    promoted_at: new Date().toISOString(),
    scope: 'this_asset_observation_only',
    does_not_certify_entire_asset_or_vyral: true,
    does_not_certify_lossless_reconstruction: true,
  };
  const { data: record, error: insertError } = await context.supabaseAdmin
    .from('vyral_dna_records').insert({
      vyral_id: asset.vyral_id, user_id: userId, asset_id: asset.id, scope: 'asset',
      schema_version: 1, dna_status: 'evolving', source_kind: 'creator',
      verification_status: 'creator_confirmed', payload,
      reconstruction_data: {
        eligible_for_dna_only_reconstruction: false,
        reason: 'Creator adoption of one Vision observation does not establish complete or lossless DNA.',
      },
    }).select('id').single();
  if (insertError?.code === '23505') return json({ error: 'This observation has already been promoted.', status: 'already_promoted' }, 409);
  if (insertError || !record) return json({ error: 'Could not create promoted DNA knowledge.' }, 500);
  return json({ status: 'knowledge_promoted', recordId: record.id, observationId: observation.id }, 201);
});
