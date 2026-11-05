import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
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
  if (!isUuid(body.resolutionRequestId)) return json({ error: 'A valid resolutionRequestId is required.' }, 400);
  if (body.resolutionType !== 'prefer_one' && body.resolutionType !== 'keep_contextual') return json({ error: 'Unsupported resolution type.' }, 400);
  if (!Array.isArray(body.recordIds) || body.recordIds.length < 2 || body.recordIds.length > 20 || !body.recordIds.every(isUuid) || new Set(body.recordIds).size !== body.recordIds.length) return json({ error: 'Provide 2–20 unique promoted record IDs.' }, 400);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000) return json({ error: 'Resolution note must be 2,000 characters or fewer.' }, 400);
  if (body.resolutionType === 'keep_contextual' && note.length < 3) return json({ error: 'Explain why both values should remain context-dependent.' }, 400);
  if (body.resolutionType === 'prefer_one' && !isUuid(body.preferredRecordId)) return json({ error: 'Select the promoted record to prefer.' }, 400);

  const { data: records, error: recordsError } = await context.supabaseAdmin.from('vyral_dna_records')
    .select('id,vyral_id,asset_id,user_id,source_kind,verification_status,payload')
    .eq('user_id', userId).eq('source_kind', 'creator').eq('verification_status', 'creator_confirmed')
    .in('id', body.recordIds);
  if (recordsError) return json({ error: 'Could not verify the selected promoted records.' }, 500);
  if (!records || records.length !== body.recordIds.length) return json({ error: 'One or more selected records are unavailable or not owned by this creator.' }, 404);

  const first = records[0];
  const firstPayload = first.payload ?? {};
  const sameScope = records.every((record) => {
    const p = record.payload ?? {};
    return record.vyral_id === first.vyral_id && record.asset_id === first.asset_id &&
      p.promotion_source === 'creator_approved_vision_field' &&
      p.source_asset_version_id === firstPayload.source_asset_version_id &&
      p.task_kind === firstPayload.task_kind && p.promotion_field_path === firstPayload.promotion_field_path &&
      typeof p.promotion_observation_id === 'string' && Object.prototype.hasOwnProperty.call(p, 'accepted_value');
  });
  if (!sameScope || !first.asset_id || typeof firstPayload.source_asset_version_id !== 'string' || typeof firstPayload.promotion_field_path !== 'string') {
    return json({ error: 'Selected records must belong to one exact asset, source version, task kind and field conflict.' }, 409);
  }
  if (new Set(records.map((record) => stableJson(record.payload.accepted_value))).size < 2) return json({ error: 'The selected records do not contain different exact values.' }, 409);
  if (body.resolutionType === 'prefer_one' && !records.some((record) => record.id === body.preferredRecordId)) return json({ error: 'Preferred record must be one of the selected conflict records.' }, 400);

  const { data: asset, error: assetError } = await context.supabaseAdmin.from('vyral_assets')
    .select('id,vyral_id,user_id').eq('id', first.asset_id).eq('vyral_id', first.vyral_id).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify source asset ownership.' }, 500);
  if (!asset) return json({ error: 'Source asset is unavailable.' }, 404);

  const reviewIds = records.map((record) => record.payload.promotion_review_record_id).filter(isUuid);
  if (reviewIds.length !== records.length) return json({ error: 'A source creator-review reference is missing.' }, 409);
  const { data: reviews, error: reviewError } = await context.supabaseAdmin.from('vyral_dna_records')
    .select('id,payload,source_kind,verification_status').eq('user_id', userId).eq('asset_id', asset.id)
    .eq('source_kind', 'creator').eq('verification_status', 'creator_confirmed').in('id', reviewIds);
  if (reviewError) return json({ error: 'Could not verify source creator reviews.' }, 500);
  if (!reviews || reviews.length !== reviewIds.length || !reviews.every((review) =>
    review.payload?.review_source === 'server_creator_review' &&
    review.payload?.decision === 'creator_confirmed' &&
    records.some((record) => review.payload?.vision_observation_review_id === record.payload.promotion_observation_id)
  )) return json({ error: 'One or more promoted records do not have matching creator-confirmed review provenance.' }, 409);

  const preferred = body.resolutionType === 'prefer_one' ? records.find((record) => record.id === body.preferredRecordId) : null;
  const payload = {
    record_kind: 'vision_field_conflict_resolution',
    resolution_request_id: body.resolutionRequestId,
    resolution_type: body.resolutionType,
    conflict_scope: {
      asset_id: asset.id, source_asset_version_id: firstPayload.source_asset_version_id,
      task_kind: firstPayload.task_kind, field_path: firstPayload.promotion_field_path,
    },
    competing_promotion_record_ids: records.map((record) => record.id),
    competing_observation_ids: records.map((record) => record.payload.promotion_observation_id),
    competing_values: records.map((record) => ({ promotion_record_id: record.id, value: record.payload.accepted_value })),
    preferred_promotion_record_id: preferred?.id ?? null,
    preferred_value: preferred?.payload.accepted_value ?? null,
    creator_note: note,
    resolution_source: 'server_creator_conflict_resolution',
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
    scope: body.resolutionType === 'prefer_one' ? 'preference_for_this_conflict_scope_only' : 'retain_all_values_as_context_dependent',
    preserves_all_source_evidence: true,
    does_not_certify_entire_asset_or_vyral: true,
    eligible_for_dna_only_reconstruction: false,
  };
  const { data: resolution, error: insertError } = await context.supabaseAdmin.from('vyral_dna_records')
    .insert({ vyral_id: asset.vyral_id, user_id: userId, asset_id: asset.id, scope: 'asset', schema_version: 1,
      dna_status: 'evolving', source_kind: 'creator', verification_status: 'creator_confirmed',
      payload, reconstruction_data: { eligible_for_dna_only_reconstruction: false, reason: 'A contextual field-conflict decision does not establish complete or lossless DNA.' } })
    .select('id').single();
  if (insertError?.code === '23505') {
    const { data: existing } = await context.supabaseAdmin.from('vyral_dna_records').select('id')
      .eq('user_id', userId).contains('payload', { record_kind: 'vision_field_conflict_resolution', resolution_request_id: body.resolutionRequestId }).maybeSingle();
    return json({ status: 'already_recorded', resolutionRecordId: existing?.id ?? null }, 200);
  }
  if (insertError || !resolution) return json({ error: 'Could not save immutable conflict resolution.' }, 500);
  return json({ status: 'conflict_resolved', resolutionRecordId: resolution.id, resolutionType: body.resolutionType }, 201);
});
