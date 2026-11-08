import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

type Row = Record<string, unknown>;
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!isUuid(userId)) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Row;
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = value as Row;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!isUuid(body.vyralId)) return json({ error: 'A valid Vyral ID is required.' }, 400);

  const admin = context.supabaseAdmin;
  const { data: vyral, error: vyralError } = await admin.from('vyrals')
    .select('id').eq('id', body.vyralId).eq('user_id', userId).maybeSingle();
  if (vyralError) return json({ error: 'Could not verify Vyral ownership.' }, 500);
  if (!vyral) return json({ error: 'Vyral not found or not owned by the signed-in user.' }, 404);

  const { data, error } = await admin.from('vyral_quality_evaluations')
    .select('id,created_at,master_dna_revision, snapshot_fingerprint,engine_version,standard_id,standard_version,status,score,grade,evaluation')
    .eq('vyral_id', body.vyralId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(20);
  if (error) return json({ error: 'Quality history could not be loaded safely.' }, 500);

  const rows = (data ?? []) as Row[];
  return json({
    vyralId: body.vyralId,
    count: rows.length,
    limit: 20,
    history: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      snapshotRevision: row.master_dna_revision,
      snapshotFingerprint: row.snapshot_fingerprint,
      engineVersion: row.engine_version,
      standardId: row.standard_id,
      standardVersion: row.standard_version,
      status: row.status,
      score: row.score,
      grade: row.grade,
      evaluation: row.evaluation,
    })),
  });
});
