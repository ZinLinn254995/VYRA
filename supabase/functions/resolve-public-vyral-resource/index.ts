import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import {
  findVyralMasterDnaSnapshotAssetV1,
  isPublicVyralAssetVisibilityAllowedV1,
  isPublicVyralMasterDnaSnapshotAllowedV1,
  hasValidVyralMasterDnaRevisionBindingV1,
  isSafeVyralStoragePathV1,
  isVyralAssetDnaPinnedToVersionV1,
  isPublicVyralResourceAllowedV1,
} from '../_shared/vyralResourceResolverV1.ts';

type Row = Record<string, any>;

const SIGNED_URL_TTL_SECONDS = 60;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_DNA_TILES_PER_REQUEST = 500;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Authorization',
    },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const asRecord = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

const canonicalizeJson = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Public projection contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalizeJson).join(',') + ']';
  const record = asRecord(value);
  return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonicalizeJson(record[key])).join(',') + '}';
};

const createPublicMasterDnaProjection = (snapshot: Row) => {
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((value: unknown) => {
    const asset = asRecord(value);
    const dnaRef = asRecord(asset.dna_ref);
    return {
      asset_id: asset.asset_id,
      asset_version_id: asset.asset_version_id,
      media_type: asset.media_type,
      dna_ref: {
        record_id: dnaRef.record_id,
        schema_id: dnaRef.schema_id,
        schema_version: dnaRef.schema_version,
      },
      asset_fingerprint: asset.asset_fingerprint,
      reconstruction_claim: asset.reconstruction_claim,
    };
  }) : [];
  return {
    schema_id: snapshot.schema_id,
    schema_version: snapshot.schema_version,
    master_dna_id: snapshot.master_dna_id,
    vyral: { vyral_id: asRecord(snapshot.vyral).vyral_id, name: asRecord(snapshot.vyral).name },
    snapshot: snapshot.snapshot,
    assets,
    reconstruction_profile: { overall_claim: asRecord(snapshot.reconstruction_profile).overall_claim },
    source_resolution: { visibility: asRecord(snapshot.source_resolution).visibility },
    portable_projection: {
      profile: asRecord(snapshot.portable_projection).profile,
      retrieval_policy: asRecord(snapshot.portable_projection).retrieval_policy,
    },
  };
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const sourceVersionIdOf = (payload: Row) => {
  const nested = asRecord(payload.dna_record);
  const source = asRecord(nested.source);
  return typeof source.asset_version_id === 'string'
    ? source.asset_version_id
    : typeof payload.source_version_id === 'string' ? payload.source_version_id : '';
};

const getPinnedRevision = async (
  context: any,
  userId: string,
  vyralId: string,
  revision: unknown,
) => {
  let query = context.supabaseAdmin
    .from('vyral_master_dna_revisions')
    .select('id,vyral_id,user_id,revision,schema_id,schema_version,manifest_sha256,vyral_fingerprint,snapshot,created_at')
    .eq('vyral_id', vyralId)
    .eq('user_id', userId);

  if (revision !== undefined && revision !== null) {
    if (!Number.isSafeInteger(revision) || Number(revision) < 1) {
      return { data: null, error: 'A positive Master DNA revision number is required.' };
    }
    query = query.eq('revision', revision);
  } else {
    query = query.order('revision', { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { data: null, error: 'Could not resolve the requested Master DNA revision.' };
  if (!data) return { data: null, error: 'Master DNA revision not found.' };
  return { data, error: null };
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return json({ error: 'Request body is too large.' }, 413);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'none' });
  if (authError || !context) {
    return json({ error: 'Public VYRA resource resolution is unavailable.' }, authError?.status ?? 500);
  }

  let body: Row;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: 'Request body is too large.' }, 413);
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Request body must be a JSON object.' }, 400);
    }
    body = parsed as Row;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  if (!['master', 'asset_dna', 'asset_source'].includes(body.action)) {
    return json({ error: 'Unsupported resolver action.' }, 400);
  }
  if (!isUuid(body.vyralId)) return json({ error: 'A valid vyralId is required.' }, 400);

  // This endpoint is intentionally public-only. Private and unlisted Vyrals remain
  // available through the separate owner-authenticated resolver only.
  const { data: vyral, error: vyralError } = await context.supabaseAdmin
    .from('vyrals')
    .select('id,user_id,name,visibility,master_dna_status,master_dna_revision,license_policy')
    .eq('id', body.vyralId)
    .eq('visibility', 'public')
    .maybeSingle();

  if (vyralError) return json({ error: 'Could not resolve the public Vyral.' }, 500);
  if (!vyral) return json({ error: 'Public Vyral not found.' }, 404);
  const ownerId = String(vyral.user_id ?? '');
  if (!isUuid(ownerId)) return json({ error: 'The public Vyral owner identity is invalid.' }, 409);
  const licensePolicy = asRecord(vyral.license_policy);
  if (!isPublicVyralResourceAllowedV1({
    visibility: vyral.visibility,
    action: body.action,
    licensePolicy,
  })) {
    return json({ error: 'The creator has not permitted this public resource action.' }, 403);
  }

  // Public resolution is always pinned to the current ready revision. Historical
  // snapshots are not exposed through the public endpoint.
  if (vyral.master_dna_status !== 'ready' || !Number.isSafeInteger(vyral.master_dna_revision) ||
      Number(vyral.master_dna_revision) < 1) {
    return json({
      error: 'The current public Vyral reference is not ready yet.',
      status: vyral.master_dna_status ?? 'not_ready',
    }, 409);
  }
  if (body.revision !== undefined && body.revision !== null &&
      (!Number.isSafeInteger(body.revision) || Number(body.revision) !== Number(vyral.master_dna_revision))) {
    return json({ error: 'Public retrieval is limited to the current Vyral revision.' }, 409);
  }

  const revisionResult = await getPinnedRevision(context, ownerId, vyral.id, vyral.master_dna_revision);
  if (revisionResult.error || !revisionResult.data) {
    return json({ error: revisionResult.error ?? 'Master DNA revision not found.' }, 404);
  }
  const revision = revisionResult.data as Row;
  const snapshot = asRecord(revision.snapshot);

  if (!hasValidVyralMasterDnaRevisionBindingV1(revision)) {
    return json({ error: 'Stored Master DNA snapshot failed its database integrity binding.' }, 409);
  }

  if (body.action === 'master') {
    // A full snapshot exposes the entire Asset inventory; fail closed for mixed visibility.
    const { data: snapshotAssets, error: snapshotAssetsError } = await context.supabaseAdmin
      .from('vyral_assets')
      .select('id,metadata,license_override')
      .eq('vyral_id', vyral.id)
      .eq('user_id', ownerId);
    if (snapshotAssetsError) return json({ error: 'Could not verify public Asset visibility for the collection snapshot.' }, 500);
    if (!isPublicVyralMasterDnaSnapshotAllowedV1(vyral.visibility, snapshotAssets ?? [])) {
      return json({ error: 'The complete collection DNA is not publicly available because one or more Assets are private or do not permit AI analysis.' }, 403);
    }
    return json({
      status: 'resolved',
      access: 'public',
      source: 'canonical_vyra',
      vyral: { id: vyral.id, name: vyral.name },
      masterDna: {
        revisionId: revision.id,
        revision: revision.revision,
        schemaId: revision.schema_id,
        schemaVersion: revision.schema_version,
        manifestSha256: revision.manifest_sha256,
        vyralFingerprint: revision.vyral_fingerprint,
        snapshot: createPublicMasterDnaProjection(snapshot),
        projectionIntegrity: {
          schema: 'vyra.public-master-dna-projection.v1',
          sourceManifestSha256: revision.manifest_sha256,
          projectionSha256: await sha256Hex(canonicalizeJson(createPublicMasterDnaProjection(snapshot))),
        },
        createdAt: revision.created_at,
      },
      retrieval: {
        assetDna: 'Use action=asset_dna with an Asset ID and exact Asset Version ID.',
        originalAsset: 'Use action=asset_source with an Asset ID and exact Asset Version ID.',
        signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
      },
    });
  }

  if (!isUuid(body.assetId) || !isUuid(body.assetVersionId)) {
    return json({ error: 'Valid assetId and assetVersionId are required.' }, 400);
  }

  const snapshotAsset = findVyralMasterDnaSnapshotAssetV1(snapshot, body.assetId, body.assetVersionId);
  if (!snapshotAsset) {
    return json({ error: 'The requested Asset version is not part of this pinned Master DNA revision.' }, 404);
  }

  const { data: asset, error: assetError } = await context.supabaseAdmin
    .from('vyral_assets')
    .select('id,vyral_id,user_id,name,mime_type,license_override,metadata')
    .eq('id', body.assetId)
    .eq('vyral_id', vyral.id)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (assetError) return json({ error: 'Could not resolve the requested Asset.' }, 500);
  if (!asset) return json({ error: 'Asset not found or access denied.' }, 404);
  const assetMetadata = asRecord(asset.metadata);
  if (!isPublicVyralAssetVisibilityAllowedV1(vyral.visibility, assetMetadata.visibility)) {
    return json({ error: 'The creator has not made this Asset public.' }, 403);
  }
  if (!isPublicVyralResourceAllowedV1({
    visibility: vyral.visibility,
    action: body.action,
    licensePolicy,
    assetPolicy: asset.license_override,
  })) {
    return json({ error: 'The creator has not permitted access to this Asset.' }, 403);
  }

  const { data: version, error: versionError } = await context.supabaseAdmin
    .from('vyral_asset_versions')
    .select('id,asset_id,vyral_id,user_id,version_number,storage_path,mime_type,size_bytes,sha256')
    .eq('id', body.assetVersionId)
    .eq('asset_id', asset.id)
    .eq('vyral_id', vyral.id)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (versionError) return json({ error: 'Could not resolve the requested Asset version.' }, 500);
  if (!version) return json({ error: 'Asset version not found or access denied.' }, 404);

  const storagePrefix = ownerId + '/' + vyral.id + '/' + asset.id + '/';
  if (!isSafeVyralStoragePathV1(version.storage_path, storagePrefix)) {
    return json({ error: 'Canonical Asset storage reference failed its ownership/path check.' }, 409);
  }

  if (body.action === 'asset_source') {
    if (typeof snapshotAsset.asset_fingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(snapshotAsset.asset_fingerprint) ||
        typeof version.sha256 !== 'string' ||
        snapshotAsset.asset_fingerprint.toLowerCase() !== version.sha256.toLowerCase()) {
      return json({ error: 'The source version fingerprint does not match the pinned Vyral snapshot.' }, 409);
    }
    if (Number(version.size_bytes) > 100 * 1024 * 1024) {
      return json({ error: 'The requested public Asset exceeds the 100 MB retrieval limit.' }, 413);
    }
    const { data: signed, error: signedError } = await context.supabaseAdmin.storage
      .from('vyral-assets')
      .createSignedUrl(version.storage_path, SIGNED_URL_TTL_SECONDS, { download: true });
    if (signedError || !signed?.signedUrl) {
      return json({ error: 'Could not create a short-lived source download authorization.' }, 502);
    }
    return json({
      status: 'resolved',
      access: 'public',
      asset: {
        id: asset.id,
        name: asset.name,
        versionId: version.id,
        versionNumber: version.version_number,
        mimeType: version.mime_type || asset.mime_type,
        sizeBytes: version.size_bytes,
        sha256: version.sha256,
      },
      source: {
        signedUrl: signed.signedUrl,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        integrity: 'Recompute SHA-256 after download and compare with asset.sha256.',
      },
    });
  }

  const { data: dnaRows, error: dnaError } = await context.supabaseAdmin
    .from('vyral_dna_records')
    .select('id,asset_id,vyral_id,user_id,scope,schema_version,payload,created_at')
    .eq('asset_id', asset.id)
    .eq('vyral_id', vyral.id)
    .eq('user_id', ownerId)
    .eq('scope', 'asset')
    .order('created_at', { ascending: false })
    .limit(50);
  if (dnaError) return json({ error: 'Could not load the canonical Asset DNA record.' }, 500);

  const dnaRow = (dnaRows ?? []).find((row: Row) =>
    sourceVersionIdOf(asRecord(row.payload)) === version.id
  ) as Row | undefined;
  if (!dnaRow) return json({ error: 'No Asset DNA record is pinned to this exact source version.' }, 404);

  const payload = asRecord(dnaRow.payload);
  const nestedDna = asRecord(payload.dna_record);
  const tilePaths = Array.isArray(payload.tile_storage_paths) ? payload.tile_storage_paths : [];
  const nestedSource = asRecord(nestedDna.source);
  const dnaRecordId = typeof nestedDna.record_id === 'string' ? nestedDna.record_id : dnaRow.id;
  if (!isVyralAssetDnaPinnedToVersionV1({
    snapshotAsset,
    dnaRecordId,
    dnaSchemaVersion: Number(dnaRow.schema_version),
    assetId: asset.id,
    assetVersionId: version.id,
    assetSha256: version.sha256,
    dnaSource: nestedSource,
    dnaFileSha256: asRecord(nestedDna.file).sha256,
  })) {
    return json({ error: 'Asset DNA, immutable source version, and pinned Master DNA inventory do not agree.' }, 409);
  }

  if (Number(dnaRow.schema_version) === 3) {
    const declaredTiles = Array.isArray(asRecord(nestedDna.lossless_payload).tiles)
      ? asRecord(nestedDna.lossless_payload).tiles as Row[]
      : [];
    if (tilePaths.length === 0 || tilePaths.length > MAX_DNA_TILES_PER_REQUEST ||
        declaredTiles.length !== tilePaths.length || new Set(tilePaths).size !== tilePaths.length) {
      return json({ error: 'DNA v3 tile manifest is empty or exceeds the resolver safety limit.' }, 409);
    }
    const firstPath = tilePaths[0];
    if (!isSafeVyralStoragePathV1(firstPath, storagePrefix)) {
      return json({ error: 'DNA tile storage reference failed its ownership/path check.' }, 409);
    }
    const directory = firstPath.slice(0, firstPath.lastIndexOf('/'));
    if (tilePaths.some((path: unknown) =>
      !isSafeVyralStoragePathV1(path, storagePrefix) ||
      path.slice(0, path.lastIndexOf('/')) !== directory
    )) {
      return json({ error: 'DNA tile references must remain in the same private Asset folder.' }, 409);
    }

    const { data: signedTiles, error: tileSignError } = await context.supabaseAdmin.storage
      .from('vyral-assets')
      .createSignedUrls(tilePaths, SIGNED_URL_TTL_SECONDS);
    if (tileSignError || !signedTiles || signedTiles.length !== tilePaths.length ||
        signedTiles.some((item: Row) => !item.signedUrl || item.error)) {
      return json({ error: 'Could not authorize every DNA tile. No partial tile list was returned.' }, 502);
    }

    return json({
      status: 'resolved',
      access: 'public',
      asset: {
        id: asset.id,
        name: asset.name,
        versionId: version.id,
        versionNumber: version.version_number,
        mimeType: version.mime_type || asset.mime_type,
        sizeBytes: version.size_bytes,
        sha256: version.sha256,
      },
      assetDna: {
        recordId: dnaRow.id,
        schemaVersion: dnaRow.schema_version,
        createdAt: dnaRow.created_at,
        record: nestedDna,
        tilePayloads: signedTiles.map((item: Row, index: number) => ({
          packagePath: declaredTiles[index]?.package_path ?? null,
          signedUrl: item.signedUrl,
          expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        })),
      },
      verification: {
        required: 'Verify every tile byte_length and SHA-256, then verify decoded_samples_sha256 after reconstruction.',
        originalFileBytes: 'DNA v3 reconstructs decoded samples; it does not recreate the original encoded PNG/JPEG bytes.',
      },
    });
  }

  // Non-raster File DNA may be identity-only. Do not imply that a hash is a
  // reconstruction payload; callers can request the exact source version separately.
  return json({
    status: 'resolved',
    access: 'public',
    asset: {
      id: asset.id,
      name: asset.name,
      versionId: version.id,
      versionNumber: version.version_number,
      mimeType: version.mime_type || asset.mime_type,
      sizeBytes: version.size_bytes,
      sha256: version.sha256,
    },
    assetDna: {
      recordId: dnaRow.id,
      schemaVersion: dnaRow.schema_version,
      createdAt: dnaRow.created_at,
      record: nestedDna,
      reconstruction: 'Inspect the record claim. Identity-only File DNA verifies bytes but cannot reconstruct them.',
    },
    retrieval: {
      originalAsset: 'Use action=asset_source to request a short-lived URL for this exact source version.',
    },
  });
});
