import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { validateVyralMasterDnaV1 } from '../../../src/services/vyralMasterDnaV1.ts';
import { evaluateVyralSnapshotQualityV1 } from '../../../src/services/vyralSnapshotQualityEvaluationV1.ts';
import { buildVyralTrustedEvidenceFindingsV1 } from '../../../src/services/vyralTrustedEvidenceBuilderV1.ts';
import type { VyralQualityStandardProfile } from '../../../src/services/vyralQualityGradingV1.ts';

type Row = Record<string, any>;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isStandardId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value);

/** Supabase's default row cap must not silently truncate an Asset evidence inventory. */
const loadAll = async (buildQuery: () => any) => {
  const rows: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error('The Vyral evidence inventory exceeds the supported 10,000-row evaluation limit.');
};

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
  const hasStandardSelector = body.standardId !== undefined || body.standardVersion !== undefined;
  if (!isUuid(body.vyralId) || (hasStandardSelector &&
      (!isStandardId(body.standardId) || !Number.isSafeInteger(body.standardVersion) || body.standardVersion < 1))) {
    return json({ error: 'A valid Vyral ID and, when supplied, an exact versioned standard identity are required.' }, 400);
  }

  const admin = context.supabaseAdmin;
  const [vyralResult, standardQueryResult] = await Promise.all([
    admin.from('vyrals').select('id,user_id').eq('id', body.vyralId).eq('user_id', userId).maybeSingle(),
    (() => {
      let query = admin.from('vyral_quality_standards')
        .select('standard_id,standard_version,profile,is_active')
        .eq('is_active', true);
      if (hasStandardSelector) {
        query = query.eq('standard_id', body.standardId).eq('standard_version', body.standardVersion);
      }
      return query.order('standard_id', { ascending: true }).order('standard_version', { ascending: false });
    })(),
  ]);
  if (vyralResult.error) return json({ error: 'Could not verify Vyral ownership.' }, 500);
  if (!vyralResult.data) return json({ error: 'Vyral not found or not owned by the signed-in user.' }, 404);
  if (standardQueryResult.error) return json({ error: 'Could not load the approved quality standard.' }, 500);
  const activeStandards = standardQueryResult.data ?? [];
  if (activeStandards.length === 0) {
    return json({ error: 'No approved quality standard is active yet. VYRA will not invent a grade; a versioned standard must be published first.' }, 409);
  }
  if (activeStandards.length !== 1) {
    return json({ error: 'More than one quality standard is active. Select an exact standard version before evaluation.' }, 409);
  }

  const standardRow = activeStandards[0];
  const profile = standardRow.profile as VyralQualityStandardProfile;
  if (profile.id !== standardRow.standard_id || profile.version !== standardRow.standard_version) {
    return json({ error: 'Published quality standard identity is inconsistent.' }, 409);
  }

  const { data: revision, error: revisionError } = await admin.from('vyral_master_dna_revisions')
    .select('id,vyral_id,user_id,revision,vyral_fingerprint,snapshot')
    .eq('vyral_id', body.vyralId).eq('user_id', userId)
    .order('revision', { ascending: false }).limit(1).maybeSingle();
  if (revisionError) return json({ error: 'Could not load the immutable Master DNA snapshot.' }, 500);
  if (!revision) return json({ error: 'A verified Master DNA snapshot is required before quality evaluation.' }, 409);

  let masterDna: Awaited<ReturnType<typeof validateVyralMasterDnaV1>>;
  try {
    masterDna = await validateVyralMasterDnaV1(revision.snapshot);
  } catch {
    return json({ error: 'The stored Master DNA snapshot failed integrity verification.' }, 409);
  }
  if (masterDna.vyral.vyral_id !== body.vyralId ||
      masterDna.snapshot.revision !== revision.revision ||
      masterDna.integrity.vyral_fingerprint !== revision.vyral_fingerprint) {
    return json({ error: 'The Master DNA snapshot does not match its immutable revision record.' }, 409);
  }

  const assetIds = masterDna.assets.map((asset) => asset.asset_id);
  const versionIds = masterDna.assets.map((asset) => asset.asset_version_id);
  if (!assetIds.length || new Set(assetIds).size !== assetIds.length || new Set(versionIds).size !== versionIds.length) {
    return json({ error: 'The Master DNA snapshot contains an invalid or ambiguous Asset inventory.' }, 409);
  }

  try {
    const [assetVersions, fingerprints, reconstructionTests, visionObservations] = await Promise.all([
      loadAll(() => admin.from('vyral_asset_versions')
        .select('id,asset_id,sha256')
        .in('id', versionIds).in('asset_id', assetIds)
        .eq('vyral_id', body.vyralId).eq('user_id', userId).order('id', { ascending: true })),
      loadAll(() => admin.from('vyral_fingerprints')
        .select('id,asset_id,asset_version_id,fingerprint_kind,algorithm,value,metadata')
        .in('asset_version_id', versionIds).in('asset_id', assetIds).eq('user_id', userId).order('id', { ascending: true })),
      loadAll(() => admin.from('vyral_reconstruction_tests')
        .select('id,asset_id,asset_version_id,dna_record_id,comparison_mode,test_status,exact_match,model_id,created_at')
        .in('asset_version_id', versionIds).in('asset_id', assetIds)
        .eq('vyral_id', body.vyralId).eq('user_id', userId).order('id', { ascending: true })),
      loadAll(() => admin.from('vyral_vision_observations')
        .select('id,asset_id,asset_version_id,verification_status,source_sha256')
        .in('asset_version_id', versionIds).in('asset_id', assetIds).eq('user_id', userId).order('id', { ascending: true })),
    ]);

    const evidenceFindings = buildVyralTrustedEvidenceFindingsV1({
      masterDna,
      masterDnaRevisionId: revision.id,
      profile,
      assetVersions: assetVersions.map((row) => ({
        asset_id: row.asset_id,
        asset_version_id: row.id,
        sha256: row.sha256,
      })),
      fingerprints: fingerprints as Parameters<typeof buildVyralTrustedEvidenceFindingsV1>[0]['fingerprints'],
      reconstructionTests: reconstructionTests as Parameters<typeof buildVyralTrustedEvidenceFindingsV1>[0]['reconstructionTests'],
      visionObservations: visionObservations as Parameters<typeof buildVyralTrustedEvidenceFindingsV1>[0]['visionObservations'],
    });

    const result = await evaluateVyralSnapshotQualityV1({
      masterDna,
      profile,
      evidenceFindings,
    });

    const { data: saved, error: saveError } = await admin.from('vyral_quality_evaluations')
      .insert({
        vyral_id: body.vyralId,
        user_id: userId,
        master_dna_revision_id: revision.id,
        master_dna_revision: revision.revision,
        snapshot_fingerprint: masterDna.integrity.vyral_fingerprint,
        engine_version: result.evaluation.engineVersion,
        standard_id: profile.id,
        standard_version: profile.version,
        standard_profile: profile,
        status: result.evaluation.status,
        score: result.evaluation.score,
        grade: result.evaluation.grade,
        evaluation: result.evaluation,
        created_by: userId,
      })
      .select('id,created_at')
      .single();
    if (saveError || !saved) return json({ error: 'Quality evaluation could not be safely recorded.' }, 500);

    return json({
      evaluationId: saved.id,
      createdAt: saved.created_at,
      snapshot: result.snapshot,
      inventory: result.inventory,
      applicability: result.applicability,
      evaluation: result.evaluation,
    });
  } catch {
    // Internal database or evidence details are deliberately not exposed to the client.
    return json({ error: 'Trusted quality evidence could not be evaluated.' }, 409);
  }
});
