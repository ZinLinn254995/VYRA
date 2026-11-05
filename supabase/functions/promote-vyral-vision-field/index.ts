import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
};
const getPath = (value: unknown, path: string): { found: boolean; value?: unknown } => {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
};

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
  if (typeof body.fieldPath !== 'string' || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(body.fieldPath) || body.fieldPath.length > 240) return json({ error: 'A valid dotted fieldPath is required.' }, 400);
  if (body.acceptedValue === undefined) return json({ error: 'acceptedValue is required.' }, 400);
  const serialized = JSON.stringify(body.acceptedValue);
  if (!serialized || serialized.length > 8000) return json({ error: 'Accepted value must be valid JSON and no larger than 8KB.' }, 400);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000) return json({ error: 'Promotion note must be 2,000 characters or fewer.' }, 400);

  const { data: observation, error: observationError } = await context.supabase
    .from('vyral_vision_observations')
    .select('id,asset_id,asset_version_id,user_id,task_kind,model_provider,model_id,observation,source_sha256')
    .eq('id', body.observationId).eq('user_id', userId).maybeSingle();
  if (observationError) return json({ error: 'Could not load Vision observation.' }, 500);
  if (!observation) return json({ error: 'Vision observation not found.' }, 404);
  const field = getPath(observation.observation, body.fieldPath);
  if (!field.found || stableJson(field.value) !== stableJson(body.acceptedValue)) return json({ error: 'Accepted value must exactly match the selected observation field. Creator edits must be recorded as a separate creator statement.', status: 'value_mismatch' }, 409);

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets').select('id,vyral_id,user_id').eq('id', observation.asset_id).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify source asset.' }, 500);
  if (!asset) return json({ error: 'Source asset not found.' }, 404);

  const { data: review, error: reviewError } = await context.supabaseAdmin
    .from('vyral_dna_records').select('id,payload,verification_status')
    .eq('asset_id', asset.id).eq('user_id', userId)
    .contains('payload', { vision_observation_review_id: observation.id, review_source: 'server_creator_review', decision: 'creator_confirmed' })
    .eq('source_kind', 'creator').eq('verification_status', 'creator_confirmed').maybeSingle();
  if (reviewError) return json({ error: 'Could not verify creator review.' }, 500);
  if (!review) return json({ error: 'This observation needs an explicit creator confirmation before promotion.', status: 'creator_confirmation_required' }, 403);

  const payload = {
    promotion_source: 'creator_approved_vision_field',
    promotion_observation_id: observation.id,
    promotion_review_record_id: review.id,
    promotion_field_path: body.fieldPath,
    accepted_value: body.acceptedValue,
    source_asset_id: observation.asset_id,
    source_asset_version_id: observation.asset_version_id,
    source_sha256: observation.source_sha256,
    task_kind: observation.task_kind,
    model_provider_claim: observation.model_provider,
    model_id_claim: observation.model_id,
    creator_note: note || null,
    promoted_at: new Date().toISOString(),
    promoted_by: userId,
    scope: 'single_observation_field_only',
    does_not_certify_entire_asset_or_vyral: true,
  };
  const { data: record, error: insertError } = await context.supabaseAdmin.from('vyral_dna_records')
    .insert({ vyral_id: asset.vyral_id, user_id: userId, asset_id: asset.id, scope: 'asset', schema_version: 1,
      dna_status: 'evolving', source_kind: 'creator', verification_status: 'creator_confirmed',
      payload, reconstruction_data: { eligible_for_dna_only_reconstruction: false, reason: 'A field-level creator promotion does not establish complete or lossless DNA.' } })
    .select('id').single();
  if (insertError?.code === '23505') return json({ error: 'This observation field has already been promoted. Promotion records are immutable.', status: 'promotion_exists' }, 409);
  if (insertError || !record) return json({ error: 'Could not save Knowledge DNA promotion.' }, 500);
  return json({ status: 'field_promoted', dnaRecordId: record.id, observationId: observation.id, fieldPath: body.fieldPath }, 201);
});