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

  if (!observation.asset_version_id || typeof observation.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(observation.source_sha256)) {
    return json({ error: 'This observation is not pinned to a verifiable source Asset Version and SHA-256.', status: 'source_binding_missing' }, 409);
  }
  const { data: version, error: versionError } = await context.supabase
    .from('vyral_asset_versions').select('id,asset_id,user_id,sha256')
    .eq('id', observation.asset_version_id).eq('asset_id', asset.id).eq('user_id', userId).maybeSingle();
  if (versionError) return json({ error: 'Could not verify the observation source version.' }, 500);
  if (!version || typeof version.sha256 !== 'string' || version.sha256.toLowerCase() !== observation.source_sha256.toLowerCase()) {
    return json({ error: 'Observation source hash does not match the immutable Asset Version.', status: 'source_binding_mismatch' }, 409);
  }
  const { data: prior, error: priorError } = await context.supabaseAdmin
    .from('vyral_vision_creator_evidence').select('id')
    .eq('observation_id', observation.id).eq('evidence_kind','observation_review').maybeSingle();
  if (priorError) return json({ error: 'Could not check previous creator review.' }, 500);
  if (prior) return json({ error: 'This observation already has an immutable creator review.', status: 'review_exists' }, 409);

  const { data: review, error: insertError } = await context.supabaseAdmin
    .from('vyral_vision_creator_evidence')
    .insert({
      user_id: userId,
      asset_id: asset.id,
      asset_version_id: version.id,
      observation_id: observation.id,
      evidence_kind: 'observation_review',
      decision: body.decision,
      source_sha256: observation.source_sha256.toLowerCase(),
      note: note || null,
    })
    .select('id')
    .single();
  if (insertError?.code === '23505') return json({ error: 'This observation already has an immutable creator review.', status: 'review_exists' }, 409);
  if (insertError || !review) return json({ error: 'Could not save creator review evidence.' }, 500);
  return json({ status: 'review_recorded', reviewId: review.id, observationId: observation.id, decision: body.decision,
    sourceVersionId: version.id, sourceSha256: observation.source_sha256, dnaChanged: false }, 201);
});
