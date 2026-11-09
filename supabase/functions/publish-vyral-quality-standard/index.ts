import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import {
  evaluateVyralQualityV1,
  type VyralQualityStandardProfile,
} from '../../../src/services/vyralQualityGradingV1.ts';

type Row = Record<string, unknown>;

const json = (body: Row, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const publisherIds = () => new Set(
  (Deno.env.get('VYRAL_QUALITY_STANDARD_PUBLISHER_IDS') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(isUuid),
);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) {
    return json({ error: 'A valid signed-in publisher session is required.' }, authError?.status ?? 401);
  }
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!isUuid(userId)) return json({ error: 'Authenticated publisher identity is unavailable.' }, 401);

  const allowedPublishers = publisherIds();
  if (allowedPublishers.size === 0 || !allowedPublishers.has(userId.toLowerCase())) {
    return json({ error: 'This account is not authorized to publish quality standards.' }, 403);
  }

  let body: Row;
  try {
    const raw = await request.text();
    if (raw.length > 262144) return json({ error: 'Quality standard profile exceeds the 256 KB limit.' }, 413);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Request body must be a JSON object.' }, 400);
    }
    body = parsed as Row;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const profile = body.profile as VyralQualityStandardProfile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return json({ error: 'A complete versioned quality standard profile is required.' }, 400);
  }

  try {
    // Run the production deterministic validator before the privileged publication RPC.
    // Empty findings intentionally validate the rubric without issuing a grade.
    evaluateVyralQualityV1({
      vyralId: '00000000-0000-4000-8000-000000000001',
      snapshotFingerprint: '0'.repeat(64),
      profile,
      findings: [],
    });
  } catch (error) {
    return json({
      error: 'Quality standard profile validation failed.',
      detail: error instanceof Error ? error.message : 'Invalid profile.',
    }, 422);
  }

  const { data: publishedId, error: publishError } = await context.supabaseAdmin.rpc(
    'publish_vyral_quality_standard',
    { p_profile: profile, p_created_by: userId },
  );
  if (publishError || !isUuid(publishedId)) {
    return json({
      error: 'Quality standard publication failed. The previous active standard remains protected by the database transaction.',
    }, 409);
  }

  return json({
    published: true,
    standardRowId: publishedId,
    standardId: profile.id,
    standardVersion: profile.version,
    active: true,
  }, 201);
});
