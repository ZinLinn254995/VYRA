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
  if (typeof body.fieldPath !== 'string' || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(body.fieldPath) || body.fieldPath.length > 240) return json({ error: 'A valid dotted DNA fieldPath is required.' }, 400);
  const observationFieldPath = typeof body.observationFieldPath === 'string' ? body.observationFieldPath : body.fieldPath;
  const dnaPathParts = body.fieldPath.split('.');
  const forbiddenDnaSegments = new Set(['__proto__','prototype','constructor','id','asset_id','asset_version_id','dna_record_id','source','identity','provenance','fingerprint','fingerprints','integrity','licensing','signature','revision_number','parent_dna_record_id']);
  if (dnaPathParts[0] !== 'knowledge' || dnaPathParts.length < 2 ||
      dnaPathParts.some((part) => forbiddenDnaSegments.has(part.toLowerCase()))) {
    return json({ error: 'Vision field promotion is limited to non-identity knowledge fields. Protected DNA identity, provenance, integrity and licensing fields cannot be promoted.' }, 400);
  }
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(observationFieldPath) || observationFieldPath.length > 240) return json({ error: 'A valid dotted observationFieldPath is required.' }, 400);
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
  const field = getPath(observation.observation, observationFieldPath);
  if (!field.found || stableJson(field.value) !== stableJson(body.acceptedValue)) return json({ error: 'Accepted value must exactly match the selected observation field. Creator edits must be recorded as a separate creator statement.', status: 'value_mismatch' }, 409);

  const { data: asset, error: assetError } = await context.supabase
    .from('vyral_assets').select('id,vyral_id,user_id').eq('id', observation.asset_id).eq('user_id', userId).maybeSingle();
  if (assetError) return json({ error: 'Could not verify source asset.' }, 500);
  if (!asset) return json({ error: 'Source asset not found.' }, 404);

  if (!observation.asset_version_id || typeof observation.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(observation.source_sha256)) {
    return json({ error: 'This observation is not pinned to a verifiable source Asset Version and SHA-256.', status: 'source_binding_missing' }, 409);
  }
  const { data: version, error: versionError } = await context.supabase
    .from('vyral_asset_versions').select('id,sha256').eq('id', observation.asset_version_id)
    .eq('asset_id', asset.id).eq('user_id', userId).maybeSingle();
  if (versionError) return json({ error: 'Could not verify the observation source version.' }, 500);
  if (!version || typeof version.sha256 !== 'string' || version.sha256.toLowerCase() !== observation.source_sha256.toLowerCase()) {
    return json({ error: 'Observation source hash does not match the immutable Asset Version.', status: 'source_binding_mismatch' }, 409);
  }
  const { data: review, error: reviewError } = await context.supabaseAdmin
    .from('vyral_vision_creator_evidence').select('id,asset_version_id,source_sha256')
    .eq('asset_id', asset.id).eq('user_id', userId).eq('observation_id', observation.id)
    .eq('evidence_kind','observation_review').eq('decision','creator_confirmed').maybeSingle();
  if (reviewError) return json({ error: 'Could not verify creator review evidence.' }, 500);
  if (!review) return json({ error: 'This observation needs an explicit creator confirmation before field promotion.', status: 'creator_confirmation_required' }, 403);
  if (review.asset_version_id !== version.id || review.source_sha256 !== observation.source_sha256.toLowerCase()) {
    return json({ error: 'Creator review evidence is not bound to this exact source version.', status: 'review_source_mismatch' }, 409);
  }

  const { data: existing, error: existingError } = await context.supabaseAdmin
    .from('vyral_vision_creator_evidence').select('id')
    .eq('observation_id', observation.id).eq('evidence_kind','field_confirmation').eq('field_path',body.fieldPath).maybeSingle();
  if (existingError) return json({ error: 'Could not check existing field confirmation.' }, 500);
  if (existing) return json({ error: 'This observation field already has immutable creator confirmation evidence.', status: 'promotion_exists' }, 409);

  const { data: record, error: insertError } = await context.supabaseAdmin.from('vyral_vision_creator_evidence')
    .insert({ user_id: userId, asset_id: asset.id, asset_version_id: version.id, observation_id: observation.id,
      evidence_kind: 'field_confirmation', decision: 'creator_confirmed', source_sha256: observation.source_sha256.toLowerCase(),
      field_path: body.fieldPath, accepted_value: body.acceptedValue, review_evidence_id: review.id, note: note || null })
    .select('id').single();
  if (insertError?.code === '23505') return json({ error: 'This observation field already has immutable creator confirmation evidence.', status: 'promotion_exists' }, 409);
  if (insertError || !record) return json({ error: 'Could not save field confirmation evidence.' }, 500);
  return json({ status: 'field_confirmed', evidenceId: record.id, observationId: observation.id, fieldPath: body.fieldPath,
    sourceVersionId: version.id, sourceSha256: observation.source_sha256, observationFieldPath, dnaChanged: false }, 201);
});