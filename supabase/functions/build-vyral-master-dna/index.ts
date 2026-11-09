import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { isCanonicalOwnedStoragePath } from '../_shared/canonical-storage-path.ts';
import { createVyralMasterDnaV1 } from '../../../src/services/vyralMasterDnaV1.ts';
import { preflightVyralMasterDna } from '../../../src/services/vyralMasterDnaPreflight.ts';
import { validateVyralDnaV3Record } from '../../../src/services/vyralDnaV3.ts';
import { validateVyralFileDnaV1Record } from '../../../src/services/vyralFileDnaV1.ts';

type Row = Record<string, any>;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getPublicResolverUri = (): string | null => {
  const projectUrl = Deno.env.get('SUPABASE_URL');
  if (!projectUrl) return null;
  try {
    const url = new URL(projectUrl);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)) return null;
    return url.origin + '/functions/v1/resolve-public-vyral-resource';
  } catch {
    return null;
  }
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

const asRecord = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

const sha256Bytes = async (bytes: Uint8Array): Promise<string> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
};

const getReconstructionClaim = (tests: Row[], assetId: string, versionId: string, dnaRecordId: string, semanticDnaAvailable: boolean) => {
  // Reconstruction evidence must prove this exact DNA record, not merely another
  // record attached to the same Asset version.
  const pinned = tests.filter((item) =>
    item.asset_id === assetId &&
    item.asset_version_id === versionId &&
    item.dna_record_id === dnaRecordId &&
    item.test_status === 'passed'
  );
  if (pinned.some((item) => item.comparison_mode === 'byte_exact' && item.exact_match === true)) return 'source_file_exact' as const;
  if (pinned.some((item) => item.comparison_mode === 'decoded_exact' && item.exact_match === true)) return 'lossless_decoded' as const;
  if (pinned.some((item) => item.exact_match === false)) return 'model_reconstructed' as const;
  if (semanticDnaAvailable) return 'semantic_only' as const;
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
    .select('id,user_id,name,created_at,updated_at,visibility,license_policy,master_dna_status,master_dna_revision,master_dna_purpose,master_dna_intended_uses')
    .eq('id', body.vyralId)
    .eq('user_id', userId)
    .maybeSingle();
  if (vyralError) return json({ error: 'Could not load the canonical Vyral.' }, 500);
  if (!vyral) return json({ error: 'Vyral not found or not owned by the signed-in user.' }, 404);

  const { data: assets, error: assetsError } = await context.supabase
    .from('vyral_assets')
    .select('id,vyral_id,user_id,name,asset_type,mime_type,size_bytes,sha256,license_override,created_at,updated_at')
    .eq('vyral_id', vyral.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (assetsError) return json({ error: 'Could not load the canonical Vyral asset inventory.' }, 500);
  if (!assets?.length) return json({ error: 'A Vyral needs at least one Asset before Master DNA can be created.', status: 'empty_vyral' }, 409);

  const assetIds = assets.map((asset: Row) => asset.id);
  const [versionsResult, dnaResult, relationshipsResult, testsResult, latestResult, metadataResult] = await Promise.all([
    context.supabase.from('vyral_asset_versions')
      .select('id,asset_id,vyral_id,user_id,version_number,storage_path,mime_type,size_bytes,sha256')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('version_number', { ascending: false }),
    context.supabase.from('vyral_dna_records')
      .select('id,asset_id,vyral_id,user_id,scope,schema_version,revision_number,parent_dna_record_id,payload,reconstruction_data,verification_status,created_at')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId).eq('scope', 'asset')
      .order('revision_number', { ascending: false }).order('created_at', { ascending: false }),
    context.supabase.from('vyral_asset_relationships')
      .select('id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale,evidence_ref')
      .eq('vyral_id', vyral.id).eq('user_id', userId),
    context.supabase.from('vyral_reconstruction_tests')
      .select('asset_id,asset_version_id,dna_record_id,comparison_mode,test_status,exact_match,model_id,created_at')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('created_at', { ascending: false }),
    context.supabase.from('vyral_master_dna_revisions')
      .select('id,revision,manifest_sha256,vyral_fingerprint,snapshot')
      .eq('vyral_id', vyral.id).eq('user_id', userId)
      .order('revision', { ascending: false }).limit(1).maybeSingle(),
    context.supabase.from('vyral_master_dna_asset_metadata')
      .select('asset_id,role,purpose')
      .in('asset_id', assetIds).eq('vyral_id', vyral.id).eq('user_id', userId),
  ]);

  for (const result of [versionsResult, dnaResult, relationshipsResult, testsResult, latestResult, metadataResult]) {
    if (result.error) return json({ error: 'Could not load all Master DNA source records.' }, 500);
  }

  const latest = latestResult.data as Row | null;
  const currentRevision = Number(vyral.master_dna_revision ?? 0);
  const licensePolicy = asRecord(vyral.license_policy);
  const publicResolverUri = vyral.visibility === 'public' && licensePolicy.allow_ai_analysis !== false
    ? getPublicResolverUri()
    : null;
  const latestSnapshot = asRecord(latest?.snapshot);
  const latestProjection = asRecord(latestSnapshot.portable_projection);
  const resolverProjectionStale = (typeof latestProjection.resolver_uri === 'string' ? latestProjection.resolver_uri : null) !== publicResolverUri;
  if (vyral.master_dna_status === 'ready' && latest && latest.revision === currentRevision && !resolverProjectionStale) {
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

  const latestVersionByAsset = new Map<string, Row>();
  for (const version of versionsResult.data ?? []) {
    if (!latestVersionByAsset.has(version.asset_id)) latestVersionByAsset.set(version.asset_id, version);
  }

  const metadataByAsset = new Map<string, Row>();
  for (const item of metadataResult.data ?? []) metadataByAsset.set(item.asset_id, item);

  const dnaByAsset = new Map<string, Row>();
  const dnaPriorityByAsset = new Map<string, number>();
  for (const record of dnaResult.data ?? []) {
    const payload = asRecord(record.payload);
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
    const version = latestVersionByAsset.get(record.asset_id);
    const matchesCurrentVersion = Boolean(version && sourceVersionId === version.id &&
      typeof version.sha256 === 'string' && sourceSha.toLowerCase() === version.sha256.toLowerCase());
    const isSupportedReconstructionDna =
      (schemaId === 'vyra.asset-dna' && Number(record.schema_version) === 3) ||
      (schemaId === 'vyra.asset-file-dna' && Number(record.schema_version) === 1);
    const priority = matchesCurrentVersion && isSupportedReconstructionDna ? 2 : matchesCurrentVersion ? 1 : 0;
    const currentPriority = dnaPriorityByAsset.get(record.asset_id) ?? -1;
    // Results are revision-first (then timestamp). Prefer a supported exact-reconstruction record
    // for the current immutable version over newer legacy/semantic records.
    if (priority > currentPriority) {
      dnaByAsset.set(record.asset_id, record);
      dnaPriorityByAsset.set(record.asset_id, priority);
    }
  }

  const relationships = relationshipsResult.data ?? [];
  const reconstructionTests = testsResult.data ?? [];
  const preflight = preflightVyralMasterDna({
    assets: (assets as Row[]).map((asset) => {
      const version = latestVersionByAsset.get(asset.id);
      const dna = dnaByAsset.get(asset.id);
      const payload = asRecord(dna?.payload);
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
      const supported = (schemaId === 'vyra.asset-dna' && Number(dna?.schema_version) === 3) ||
        (schemaId === 'vyra.asset-file-dna' && Number(dna?.schema_version) === 1);
      const dnaRecordId = typeof nestedDna.record_id === 'string' ? nestedDna.record_id : dna?.id;
      const expectedComparisonMode = schemaId === 'vyra.asset-file-dna' ? 'byte_exact' : 'decoded_exact';
      const hasExactReconstruction = Boolean(version && dna && dnaRecordId && reconstructionTests.some((item: Row) =>
        item.asset_id === asset.id &&
        item.asset_version_id === version.id &&
        item.dna_record_id === dnaRecordId &&
        item.comparison_mode === expectedComparisonMode &&
        item.test_status === 'passed' &&
        item.exact_match === true &&
        (schemaId === 'vyra.asset-file-dna'
          ? item.model_id === 'universal-file-dna-v1-readback-verifier'
          : item.model_id === 'ORIGIN-01-readback-verifier' || item.model_id === 'vyral-dna-v3-readback-verifier')
      ));
      return {
        asset_id: asset.id,
        has_latest_version: Boolean(version),
        has_matching_dna: Boolean(version && dna && supported &&
          sourceVersionId === version.id && typeof version.sha256 === 'string' &&
          sourceSha.toLowerCase() === version.sha256.toLowerCase()),
        has_exact_reconstruction: hasExactReconstruction,
      };
    }),
  });
  if (preflight.length) {
    return json({
      error: 'Master DNA is not ready yet. Resolve the listed requirements, then build again.',
      status: 'master_dna_preflight_failed',
      blockerCount: preflight.length,
      blockers: preflight,
    }, 409);
  }
  const mainAssetIds: string[] = [];
  const claims: Array<'lossless_decoded' | 'source_file_exact' | 'semantic_only' | 'model_reconstructed' | 'unavailable'> = [];

  const masterAssets = [];
  for (const asset of assets as Row[]) {
    const assetMetadata = metadataByAsset.get(asset.id);
    const version = latestVersionByAsset.get(asset.id);
    if (!version) return json({ error: 'An Asset has no immutable source version.', status: 'missing_asset_version', assetId: asset.id }, 409);
    const expectedStoragePrefix = userId + '/' + vyral.id + '/' + asset.id + '/';
    if (!isCanonicalOwnedStoragePath(version.storage_path, expectedStoragePrefix)) {
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

    if (Number(dna.schema_version) === 3) {
      const bucket = typeof payload.storage_bucket === 'string' ? payload.storage_bucket : 'vyral-assets';
      const losslessPayload = asRecord(nestedDna.lossless_payload);
      const tiles = Array.isArray(losslessPayload.tiles) ? losslessPayload.tiles as Row[] : [];
      const tilePaths = Array.isArray(payload.tile_storage_paths) ? payload.tile_storage_paths : [];
      if (bucket !== 'vyral-assets' || tiles.length === 0 || tilePaths.length !== tiles.length) {
        return json({ error: 'An Asset DNA v3 record is missing a complete lossless tile storage map.', status: 'incomplete_lossless_dna', assetId: asset.id }, 409);
      }
      try {
        validateVyralDnaV3Record(nestedDna);
        const assetStoragePrefix = userId + '/' + vyral.id + '/' + asset.id + '/';
        const firstPath = tilePaths[0];
        if (!isCanonicalOwnedStoragePath(firstPath, assetStoragePrefix)) {
          throw new Error('DNA tile storage path escaped its canonical Asset prefix.');
        }
        const directory = firstPath.slice(0, firstPath.lastIndexOf('/'));
        const requiredNames = tilePaths.map((path) => {
          if (!isCanonicalOwnedStoragePath(path, assetStoragePrefix) ||
              path.slice(0, path.lastIndexOf('/')) !== directory) {
            throw new Error('DNA tile storage paths must remain in one canonical private Asset folder.');
          }
          return path.slice(path.lastIndexOf('/') + 1);
        });
        if (new Set(requiredNames).size !== requiredNames.length) throw new Error('DNA tile storage map contains duplicate object paths.');

        const storedNames = new Set<string>();
        for (let offset = 0; offset < requiredNames.length; offset += 1000) {
          const { data: objects, error: listError } = await context.supabaseAdmin.storage
            .from(bucket).list(directory, { limit: 1000, offset });
          if (listError) throw new Error('Could not verify private DNA tile objects in Storage.');
          for (const object of objects ?? []) storedNames.add(object.name);
          if ((objects ?? []).length < 1000) break;
        }
        if (requiredNames.some((name) => !storedNames.has(name))) {
          throw new Error('One or more lossless DNA tile objects are missing from private Storage.');
        }
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : 'Lossless DNA manifest validation failed.',
          status: 'lossless_dna_manifest_invalid',
          assetId: asset.id,
        }, 409);
      }
    }

    if (schemaId === 'vyra.asset-file-dna') {
      try {
        const fileDna = validateVyralFileDnaV1Record(nestedDna);
        if (fileDna.source.asset_version_id !== version.id ||
            fileDna.source.asset_id !== asset.id ||
            fileDna.file.sha256.toLowerCase() !== version.sha256.toLowerCase() ||
            fileDna.file.size_bytes !== Number(version.size_bytes) ||
            fileDna.file.mime_type !== String(version.mime_type || asset.mime_type).toLowerCase()) {
          throw new Error('Universal File DNA does not match the exact latest source version.');
        }
        if (fileDna.reconstruction.claim !== 'source_file_exact' ||
            fileDna.reconstruction.payload_encoding !== 'raw-chunks-v1') {
          throw new Error('File DNA exact reconstruction is still being prepared; Master DNA cannot claim completion yet.');
        }
        if (fileDna.reconstruction.claim === 'source_file_exact') {
          const chunkPaths = Array.isArray(payload.chunk_storage_paths) ? payload.chunk_storage_paths : [];
          const chunks = fileDna.reconstruction.chunks;
          const expectedPrefix = userId + '/' + vyral.id + '/' + asset.id + '/';
          if (chunkPaths.length !== chunks.length || chunks.length === 0 || chunks.length > 100 ||
              new Set(chunkPaths).size !== chunkPaths.length ||
              chunkPaths.some((path: unknown) => typeof path !== 'string' ||
                !path.startsWith(expectedPrefix) || !path.startsWith(expectedPrefix + 'dna/file/v1/' + fileDna.record_id + '/chunks/') ||
                path.includes('\\') || path.split('/').some((part: string) => !part || part === '.' || part === '..'))) {
            throw new Error('Universal File DNA has an invalid persisted reconstruction chunk map.');
          }
          const rebuilt = new Uint8Array(fileDna.file.size_bytes);
          let offset = 0;
          for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const { data: stored, error: storedError } = await context.supabaseAdmin.storage
              .from('vyral-assets').download(chunkPaths[index]);
            if (storedError || !stored) throw new Error('A persisted File DNA reconstruction chunk is missing.');
            const bytes = new Uint8Array(await stored.arrayBuffer());
            if (bytes.byteLength !== chunk.byte_length || await sha256Bytes(bytes) !== chunk.sha256.toLowerCase()) {
              throw new Error('A persisted File DNA reconstruction chunk failed its integrity check.');
            }
            rebuilt.set(bytes, offset);
            offset += bytes.byteLength;
          }
          if (offset !== fileDna.file.size_bytes || await sha256Bytes(rebuilt) !== fileDna.file.sha256.toLowerCase()) {
            throw new Error('Persisted File DNA chunks do not reconstruct the exact source file.');
          }
        }
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : 'Universal File DNA validation failed.',
          status: 'file_dna_invalid',
          assetId: asset.id,
        }, 409);
      }
    }

    const semanticDnaAvailable = Boolean(
      schemaId && schemaId !== 'vyra.asset-file-dna' &&
      Number(dna.schema_version) < 3 && Object.keys(payload).length > 0
    );
    const dnaRecordId = typeof nestedDna.record_id === 'string' ? nestedDna.record_id : dna.id;
    const claim = getReconstructionClaim(reconstructionTests as Row[], asset.id, version.id, dnaRecordId, semanticDnaAvailable);
    claims.push(claim);
    if (assetMetadata?.role === 'main') mainAssetIds.push(asset.id);

    masterAssets.push({
      asset_id: asset.id,
      asset_version_id: version.id,
      name: asset.name,
      asset_type: asset.asset_type,
      updated_at: asset.updated_at ?? asset.created_at ?? null,
      ...(assetMetadata?.role === 'main' || assetMetadata?.role === 'supporting' ? { role: assetMetadata.role } : {}),
      ...(typeof assetMetadata?.purpose === 'string' && assetMetadata.purpose.trim() ? { purpose: assetMetadata.purpose.trim() } : {}),
      media_type: asset.mime_type || version.mime_type,
      dna_ref: {
        record_id: typeof nestedDna.record_id === 'string' ? nestedDna.record_id : dna.id,
        schema_id: schemaId,
        schema_version: Number(dna.schema_version),
      },
      asset_fingerprint: version.sha256.toLowerCase(),
      reconstruction_claim: claim,
      provenance_ref: null,
      license_ref: null,
    });
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

  let masterDna;
  try {
    masterDna = await createVyralMasterDnaV1({
      master_dna_id: vyral.id,
      vyral: { vyral_id: vyral.id, name: vyral.name, owner_ref: null, created_at: vyral.created_at },
      snapshot: { revision: currentRevision + 1, created_at: vyral.updated_at ?? vyral.created_at, parent_master_dna_id: latest?.id ?? null },
      purpose: {
        summary: typeof vyral.master_dna_purpose === 'string' && vyral.master_dna_purpose.trim()
          ? vyral.master_dna_purpose.trim() : null,
        intended_uses: Array.isArray(vyral.master_dna_intended_uses)
          ? vyral.master_dna_intended_uses.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).map((item: string) => item.trim())
          : [],
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
        resolution_policy: publicResolverUri ? 'public_assets' : 'no_remote_resolution',
      },
      portable_projection: {
        profile: 'compact',
        includes_full_reconstruction_payloads: false,
        resolver_uri: publicResolverUri,
        retrieval_policy: publicResolverUri ? 'authorized_selective_retrieval' : 'no_remote_resolution',
        notes: [publicResolverUri
          ? 'Public Asset retrieval uses the canonical resolver and is limited by the creator license policy.'
          : 'Remote retrieval is disabled for this visibility or AI-analysis permission setting.'],
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
    relationshipCount: (masterDna.relationships ?? []).length,
    createdAt: saved.created_at,
  }, 201);
});
