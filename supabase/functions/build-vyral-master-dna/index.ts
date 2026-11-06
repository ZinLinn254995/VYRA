import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { createVyralMasterDnaV1 } from '../../../src/services/vyralMasterDnaV1.ts';

type Row = Record<string, any>;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

const asRecord = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

const getReconstructionClaim = (tests: Row[], assetId: string, versionId: string) => {
  const passed = tests.filter((item) =>
    item.asset_id === assetId &&
    item.asset_version_id === versionId &&
    item.test_status === 'passed' &&
    item.exact_match === true
  );
  if (passed.some((item) => item.comparison_mode === 'byte_exact')) return 'source_file_exact' as const;
  if (passed.some((item) => item.comparison_mode === 'decoded_exact')) return 'lossless_decoded' as const;
  return 'unavailable' as const;
};

const weakestClaim = (claims: Array<'lossless_decoded' | 'source_file_exact' | 'semantic_only' | 'model_reconstructed' | 'unavailable'>) => {
  const rank = { unavailable: 0, model_reconstructed: 1, semantic_only: 2, lossless_decoded: 3, source_file_exact: 4 };
  return claims.reduce((weakest, claim) => rank[claim] < rank[weakest] ? claim : weakest, 'source_file_exact' as typeof claims[number]);
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
  if (!isUuid(body.vyralId)) return json({ error: 'A valid vyralId is required.' }, 400);

  const { data: vyral, error: vyralError } = await context.supabase
    .from('vyrals')
    .select('id,user_id,name,visibility,master_dna_status,master_dna_revision,master_dna_purpose,master_dna_intended_uses')
    .eq('id', body.vyralId)
    .eq('user_id', userId)
    .maybeSingle();
  if (vyralError) return json({ error: 'Could not load the canonical Vyral.' }, 500);
  if (!vyral) return json({ error: 'Vyral not found or not owned by the signed-in user.' }, 404);

  const { data: assets, error: assetsError } = await context.supabase
    .from('vyral_assets')
    .select('id,vyral_id,user_id,name,asset_type,mime_type,size_bytes,sha256,master_dna_role,master_dna_purpose,license_override')
    .eq('vyral_id', vyral.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (assetsError) return json({ error: 'Could not load the canonical Vyral asset inventory.' }, 500);
  if (!assets?.length) return json({ error: 'A Vyral needs at least one Asset before Master DNA can be created.', status: 'empty_vyral' }, 409);

  const assetIds = assets.map((asset: Row) => asset.id);
  const [versionsResult, dnaResult, relationshipsResult, testsResult, latestResult] = await Promise.all([
    context.supabase.from('vyral_asset_versions')
      .select('id,asset_id,vyral_id,user_id,version_number,storage_path,mime_type,size_bytes,sha256')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('version_number', { ascending: false }),
    context.supabase.from('vyral_dna_records')
      .select('id,asset_id,vyral_id,user_id,scope,schema_version,payload,reconstruction_data,verification_status,created_at')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId).eq('scope', 'asset')
      .order('created_at', { ascending: false }),
    context.supabase.from('vyral_asset_relationships')
      .select('id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale,evidence_ref')
      .eq('vyral_id', vyral.id).eq('user_id', userId),
    context.supabase.from('vyral_reconstruction_tests')
      .select('asset_id,asset_version_id,comparison_mode,test_status,exact_match,tested_at')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('tested_at', { ascending: false }),
    context.supabase.from('vyral_master_dna_revisions')
      .select('id,revision,manifest_sha256,vyral_fingerprint')
      .eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('revision', { ascending: false }).limit(1).maybeSingle(),
  ]);

  for (const result of [versionsResult, dnaResult, relationshipsResult, testsResult, latestResult]) {
    if (result.error) return json({ error: 'Could not load all Master DNA source records.' }, 500);
  }

  const latestVersionByAsset = new Map<string, Row>();
  for (const version of versionsResult.data ?? []) {
    if (!latestVersionByAsset.has(version.asset_id)) latestVersionByAsset.set(version.asset_id, version);
  }

  const dnaByAsset = new Map<string, Row>();
  for (const record of dnaResult.data ?? []) {
    if (!dnaByAsset.has(record.asset_id)) dnaByAsset.set(record.asset_id, record);
  }

  const relationships = relationshipsResult.data ?? [];
  const reconstructionTests = testsResult.data ?? [];
  const mainAssetIds: string[] = [];
  const claims: Array<'lossless_decoded' | 'source_file_exact' | 'semantic_only' | 'model_reconstructed' | 'unavailable'> = [];

  const masterAssets = [];
  for (const asset of assets as Row[]) {
    if (!['main', 'supporting'].includes(asset.master_dna_role) ||
        typeof asset.master_dna_purpose !== 'string' || !asset.master_dna_purpose.trim()) {
      return json({
        error: 'Every Asset needs an explicit Main/Supporting role and a non-empty purpose before Master DNA can be created.',
        status: 'needs_classification',
        assetId: asset.id,
      }, 409);
    }

    const version = latestVersionByAsset.get(asset.id);
    if (!version) return json({ error: 'An Asset has no immutable source version.', status: 'missing_asset_version', assetId: asset.id }, 409);
    const expectedStoragePrefix = userId + '/' + vyral.id + '/' + asset.id + '/';
    if (typeof version.storage_path !== 'string' || !version.storage_path.startsWith(expectedStoragePrefix)) {
      return json({ error: 'An Asset version has an invalid canonical storage path.', status: 'invalid_asset_version', assetId: asset.id }, 409);
    }
    if (!isSha256(version.sha256)) return json({ error: 'An Asset version is missing its SHA-256 fingerprint.', status: 'missing_asset_fingerprint', assetId: asset.id }, 409);

    const dna = dnaByAsset.get(asset.id);
    if (!dna) return json({ error: 'An Asset is missing its own DNA record.', status: 'missing_asset_dna', assetId: asset.id }, 409);
    const payload = asRecord(dna.payload);
    const nestedDna = asRecord(payload.dna_record);
    const nestedSource = asRecord(nestedDna.source);
    const schemaId = typeof payload.dna_schema_id === 'string'
      ? payload.dna_schema_id
      : typeof nestedDna.schema_id === 'string' ? nestedDna.schema_id : '';
    const sourceVersionId = typeof nestedSource.asset_version_id === 'string'
      ? nestedSource.asset_version_id
      : typeof payload.source_version_id === 'string' ? payload.source_version_id : '';
    const sourceSha = typeof nestedSource.sha256 === 'string'
      ? nestedSource.sha256
      : typeof payload.source_file_sha256 === 'string' ? payload.source_file_sha256 : '';
    if (!schemaId || sourceVersionId !== version.id || sourceSha.toLowerCase() !== version.sha256.toLowerCase()) {
      return json({ error: 'An Asset DNA record does not match the latest immutable Asset version.', status: 'stale_asset_dna', assetId: asset.id }, 409);
    }

    const claim = getReconstructionClaim(reconstructionTests as Row[], asset.id, version.id);
    claims.push(claim);
    if (asset.master_dna_role === 'main') mainAssetIds.push(asset.id);

    masterAssets.push({
      asset_id: asset.id,
      asset_version_id: version.id,
      role: asset.master_dna_role,
      purpose: asset.master_dna_purpose.trim(),
      media_type: asset.mime_type || version.mime_type,
      dna_ref: {
        record_id: dna.id,
        schema_id: schemaId,
        schema_version: Number(dna.schema_version),
      },
      asset_fingerprint: version.sha256.toLowerCase(),
      reconstruction_claim: claim,
      provenance_ref: null,
      license_ref: null,
    });
  }

  if (!mainAssetIds.length) return json({ error: 'At least one Asset must be explicitly designated as Main.', status: 'missing_main_asset' }, 409);
  if (!Array.isArray(vyral.master_dna_intended_uses) || vyral.master_dna_intended_uses.length === 0 ||
      !vyral.master_dna_intended_uses.every((item: unknown) => typeof item === 'string' && item.trim())) {
    return json({ error: 'Declare the Vyral intended uses before creating Master DNA.', status: 'missing_intended_uses' }, 409);
  }
  if (typeof vyral.master_dna_purpose !== 'string' || !vyral.master_dna_purpose.trim()) {
    return json({ error: 'Declare the Vyral purpose before creating Master DNA.', status: 'missing_vyral_purpose' }, 409);
  }

  const masterRelationships = relationships.map((relationship: Row) => ({
    relationship_id: relationship.id,
    type: relationship.relationship_type,
    from: relationship.from_kind === 'vyral'
      ? { kind: 'vyral' as const, vyral_id: vyral.id }
      : { kind: 'asset' as const, asset_id: relationship.from_asset_id },
    to: relationship.to_kind === 'vyral'
      ? { kind: 'vyral' as const, vyral_id: vyral.id }
      : { kind: 'asset' as const, asset_id: relationship.to_asset_id },
    rationale: relationship.rationale,
    evidence_ref: relationship.evidence_ref ?? null,
  }));

  const latest = latestResult.data as Row | null;
  const currentRevision = Number(vyral.master_dna_revision ?? 0);
  if (vyral.master_dna_status === 'ready' && latest && latest.revision === currentRevision) {
    return json({
      status: 'ready',
      vyralId: vyral.id,
      masterDnaRevisionId: latest.id,
      revision: latest.revision,
      manifestSha256: latest.manifest_sha256,
      vyralFingerprint: latest.vyral_fingerprint,
      unchanged: true,
    }, 200);
  }
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0 ||
      (latest ? latest.revision !== currentRevision : currentRevision !== 0)) {
    return json({ error: 'Master DNA revision head is inconsistent; an administrator review is required.', status: 'revision_head_mismatch' }, 409);
  }

  const createdAt = new Date().toISOString();
  let masterDna;
  try {
    masterDna = await createVyralMasterDnaV1({
      master_dna_id: crypto.randomUUID(),
      vyral: { vyral_id: vyral.id, name: vyral.name, owner_ref: null, created_at: createdAt },
      snapshot: { revision: currentRevision + 1, created_at: createdAt, parent_master_dna_id: latest?.id ?? null },
      purpose: {
        summary: vyral.master_dna_purpose.trim(),
        intended_uses: vyral.master_dna_intended_uses.map((item: string) => item.trim()),
      },
      main_asset_ids: mainAssetIds,
      assets: masterAssets,
      relationships: masterRelationships,
      reconstruction_profile: {
        overall_claim: weakestClaim(claims),
        notes: ['Each Asset claim is derived only from a passing exact reconstruction test pinned to the included Asset version.'],
      },
      provenance: { creator_ref: null, license_ref: null, evidence_status: 'unknown' },
      source_resolution: {
        visibility: vyral.visibility,
        canonical_uri: null,
        resolution_policy: 'no_remote_resolution',
      },
      portable_projection: {
        profile: 'compact',
        includes_full_reconstruction_payloads: false,
        resolver_uri: null,
        retrieval_policy: 'no_remote_resolution',
        notes: ['This revision is self-describing. Remote source resolution is not enabled in this release.'],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master DNA validation failed.';
    return json({ error: message, status: 'master_dna_validation_failed' }, 409);
  }

  const { data: saved, error: saveError } = await context.supabaseAdmin
    .from('vyral_master_dna_revisions')
    .insert({
      vyral_id: vyral.id,
      user_id: userId,
      revision: masterDna.snapshot.revision,
      parent_revision_id: latest?.id ?? null,
      schema_id: masterDna.schema_id,
      schema_version: masterDna.schema_version,
      manifest_sha256: masterDna.integrity.manifest_sha256,
      vyral_fingerprint: masterDna.integrity.vyral_fingerprint,
      snapshot: masterDna,
      created_by: userId,
    })
    .select('id,revision,manifest_sha256,vyral_fingerprint,created_at')
    .single();

  if (saveError || !saved) {
    return json({
      error: saveError?.code === '23514'
        ? 'Database validation rejected the Master DNA snapshot because canonical Asset or relationship data changed. Refresh and rebuild.'
        : 'Could not save the immutable Master DNA revision.',
      status: 'master_dna_persistence_failed',
    }, 409);
  }

  return json({
    status: 'ready',
    vyralId: vyral.id,
    masterDnaRevisionId: saved.id,
    revision: saved.revision,
    manifestSha256: saved.manifest_sha256,
    vyralFingerprint: saved.vyral_fingerprint,
    reconstructionClaim: masterDna.reconstruction_profile.overall_claim,
    assetCount: masterDna.assets.length,
    relationshipCount: masterDna.relationships.length,
    createdAt: saved.created_at,
  }, 201);
});
