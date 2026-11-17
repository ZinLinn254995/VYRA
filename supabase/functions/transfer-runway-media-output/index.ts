import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const BUCKET = 'vyral-assets';
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const SIGNED_URL_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function configuredOutputHosts(): Set<string> {
  return new Set((Deno.env.get('VYRA_RUNWAY_OUTPUT_HOSTS') ?? '')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
}

function validateProviderOutputUrl(raw: unknown, allowedHosts: Set<string>): URL | null {
  if (typeof raw !== 'string' || raw.length > 8192 || allowedHosts.size === 0) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !allowedHosts.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_OUTPUT_BYTES) throw new Error('output_too_large');
  if (!response.body) throw new Error('empty_provider_output');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_OUTPUT_BYTES) {
        await reader.cancel();
        throw new Error('output_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('empty_provider_output');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!UUID.test(userId)) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return json({ error: 'Request body must be a JSON object.' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (typeof body.jobId !== 'string' || !UUID.test(body.jobId)) {
    return json({ error: 'A valid generation job ID is required.' }, 400);
  }
  const outputIndex = body.outputIndex === undefined ? 0 : body.outputIndex;
  if (!Number.isInteger(outputIndex) || Number(outputIndex) < 0 || Number(outputIndex) > 15) {
    return json({ error: 'A valid output index is required.' }, 400);
  }

  // Fail closed until an administrator explicitly allowlists the provider's output hosts.
  const allowedHosts = configuredOutputHosts();
  if (allowedHosts.size === 0) {
    return json({ error: 'Runway output transfer is not configured by the VYRA platform.' }, 503);
  }

  const { data: claim, error: claimError } = await context.supabaseAdmin.rpc('claim_runway_output_transfer', {
    p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
  });
  if (claimError || !isRecord(claim)) {
    return json({ error: 'The Project output could not be claimed for secure transfer.' }, 503);
  }
  if (claim.claimed !== true) {
    return json({
      jobId: body.jobId, outputIndex, targetVyralId: claim.target_vyral_id ?? null,
      status: claim.status ?? 'pending',
      assetId: claim.asset_id ?? null, assetVersionId: claim.asset_version_id ?? null,
      message: claim.status === 'ingested' ? 'This output is already a ready Project Asset.'
        : claim.status === 'downloading' || claim.status === 'ingesting' ? 'This output is already being processed.'
        : claim.status === 'failed' ? 'This output needs recovery before it can be used.'
        : 'This output is not currently eligible for transfer.',
    }, claim.status === 'downloading' || claim.status === 'ingesting' ? 409 : 200);
  }

  // New jobs are Project-native: their output row ID is also the canonical
  // Project File ID. Store directly at the final Project path; never mint an Asset.
  const targetProjectId = typeof claim.target_project_id === 'string' ? claim.target_project_id : '';
  if (UUID.test(targetProjectId)) {
    const projectFileId = typeof claim.output_id === 'string' ? claim.output_id : '';
    if (!UUID.test(projectFileId)) {
      await context.supabaseAdmin.rpc('record_runway_project_output_transfer', {
        p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
        p_status: 'failed', p_error_code: 'project_output_identity_missing',
      });
      return json({ error: 'The Project output identity could not be verified.' }, 503);
    }
    const existingPath = typeof claim.storage_path === 'string' ? claim.storage_path : '';
    if (existingPath) {
      const { data: indexed, error: indexedError } = await context.supabaseAdmin.from('media_library_items')
        .select('id,storage_path,mime_type,size_bytes,metadata')
        .eq('id', projectFileId).eq('user_id', userId).eq('project_id', targetProjectId)
        .is('universe_id', null).maybeSingle();
      if (indexedError || !indexed || indexed.storage_path !== existingPath ||
          indexed.metadata?.generation_job_id !== body.jobId ||
          Number(indexed.metadata?.output_index) !== Number(outputIndex)) {
        return json({ error: 'The previously stored Project output could not be recovered safely.' }, 503);
      }
      return json({
        jobId: body.jobId, outputIndex, targetProjectId, projectFileId,
        status: 'stored', storagePath: existingPath, sha256: indexed.metadata?.sha256,
        mimeType: indexed.mime_type, sizeBytes: indexed.size_bytes,
        message: 'Recovered the canonical Project File after an interrupted transfer.',
      });
    }

    const providerUrl = validateProviderOutputUrl(claim.output_url, allowedHosts);
    if (!providerUrl) {
      await context.supabaseAdmin.rpc('record_runway_project_output_transfer', {
        p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
        p_status: 'failed', p_error_code: 'provider_output_host_not_allowed',
      });
      return json({ error: 'The provider output host is not in VYRA’s approved allowlist.' }, 502);
    }
    try {
      const upstream = await fetch(providerUrl, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { Accept: Object.keys(MIME_EXTENSIONS).join(',') },
        signal: AbortSignal.timeout(60_000),
      });
      if (!upstream.ok) throw new Error('provider_output_http_error');
      const mimeType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const extension = MIME_EXTENSIONS[mimeType];
      if (!extension) throw new Error('unsupported_provider_output_type');
      const bytes = await readBoundedBody(upstream);
      const digest = await sha256(bytes);
      const storagePath = userId + '/media-library/' + targetProjectId + '/' + projectFileId + '.' + extension;
      const { error: uploadError } = await context.supabaseAdmin.storage.from(BUCKET).upload(
        storagePath, bytes, { contentType: mimeType, upsert: true, cacheControl: '3600' },
      );
      if (uploadError) throw new Error('project_storage_upload_failed');
      const task = typeof claim.task === 'string' ? claim.task : 'media';
      const fileName = 'Generated ' + task + ' ' + (Number(outputIndex) + 1) + '.' + extension;
      const { error: indexError } = await context.supabaseAdmin.from('media_library_items').upsert({
        id: projectFileId, user_id: userId, universe_id: null, project_id: targetProjectId,
        folder_id: null, source_kind: 'generated', source_asset_id: null,
        bucket_id: BUCKET, storage_path: storagePath, file_name: fileName,
        mime_type: mimeType, size_bytes: bytes.byteLength,
        metadata: { origin: 'project_generation', generation_job_id: body.jobId,
          output_index: Number(outputIndex), sha256: digest },
      }, { onConflict: 'id' });
      if (indexError) throw new Error('project_media_index_write_failed');
      const { data: recorded, error: recordError } = await context.supabaseAdmin.rpc('record_runway_project_output_transfer', {
        p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
        p_status: 'stored', p_storage_path: storagePath, p_sha256: digest,
        p_mime_type: mimeType, p_size_bytes: bytes.byteLength,
      });
      if (recordError || !isRecord(recorded) || recorded.recorded !== true) {
        throw new Error('project_transfer_state_record_failed');
      }
      return json({
        jobId: body.jobId, outputIndex, targetProjectId, projectFileId,
        status: 'stored', storagePath, sha256: digest, mimeType, sizeBytes: bytes.byteLength,
        fileName,
        message: 'Generated media is stored as a canonical Project File. Offline installation and completion are next.',
      });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)
        ? error.message : 'project_output_transfer_failed';
      await context.supabaseAdmin.rpc('record_runway_project_output_transfer', {
        p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
        p_status: 'failed', p_error_code: code,
      });
      return json({ error: 'The generated output could not be saved as a Project File.' }, 502);
    }
  }

  const targetVyralId = typeof claim.target_vyral_id === 'string' ? claim.target_vyral_id : '';
  // A prior attempt may have uploaded successfully but lost its response. Reuse that
  // private object instead of depending on the temporary provider URL remaining valid.
  if (claim.status === 'ingesting' && typeof claim.storage_path === 'string') {
    const { data: prior, error: priorError } = await context.supabaseAdmin
      .from('media_generation_job_outputs')
      .select('storage_path,sha256,mime_type,size_bytes')
      .eq('job_id', body.jobId).eq('output_index', outputIndex).maybeSingle();
    if (priorError || !prior?.storage_path || !prior.sha256 || !prior.mime_type || !prior.size_bytes) {
      return json({ error: 'The previously stored Project output could not be recovered safely.' }, 503);
    }
    const { data: priorSigned, error: priorSignError } = await context.supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(prior.storage_path, SIGNED_URL_SECONDS);
    if (priorSignError || !priorSigned?.signedUrl) {
      return json({ error: 'The private Project output could not be opened for ingestion.' }, 503);
    }
    return json({
      jobId: body.jobId, outputIndex, targetVyralId, status: 'stored',
      storagePath: prior.storage_path, signedUrl: priorSigned.signedUrl,
      signedUrlExpiresInSeconds: SIGNED_URL_SECONDS, sha256: prior.sha256,
      mimeType: prior.mime_type, sizeBytes: prior.size_bytes,
      message: 'Recovered the previously stored private output. Canonical Project Asset DNA ingestion is next.',
    });
  }

  const providerUrl = validateProviderOutputUrl(claim.output_url, allowedHosts);
  if (!UUID.test(targetVyralId) || !providerUrl) {
    await context.supabaseAdmin.rpc('record_runway_output_transfer', {
      p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
      p_status: 'failed', p_error_code: 'provider_output_host_not_allowed',
    });
    return json({ error: 'The provider output host is not in VYRA’s approved allowlist.' }, 502);
  }

  try {
    const upstream = await fetch(providerUrl, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Accept: Object.keys(MIME_EXTENSIONS).join(',') },
      signal: AbortSignal.timeout(60_000),
    });
    if (!upstream.ok) throw new Error('provider_output_http_error');
    const mimeType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension) throw new Error('unsupported_provider_output_type');
    const bytes = await readBoundedBody(upstream);
    const digest = await sha256(bytes);
    const storagePath = userId + '/' + targetVyralId + '/.runway-staging/' +
      body.jobId + '/' + outputIndex + '.' + extension;

    const { error: uploadError } = await context.supabaseAdmin.storage.from(BUCKET).upload(
      storagePath, bytes, { contentType: mimeType, upsert: true, cacheControl: '3600' },
    );
    if (uploadError) throw new Error('private_storage_upload_failed');

    const { data: signed, error: signedError } = await context.supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    if (signedError || !signed?.signedUrl) throw new Error('private_storage_signing_failed');

    const { data: recorded, error: recordError } = await context.supabaseAdmin.rpc('record_runway_output_transfer', {
      p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
      p_status: 'stored', p_storage_path: storagePath, p_sha256: digest,
      p_mime_type: mimeType, p_size_bytes: bytes.byteLength,
    });
    if (recordError || !isRecord(recorded) || recorded.recorded !== true) {
      throw new Error('transfer_state_record_failed');
    }

    return json({
      jobId: body.jobId, outputIndex, targetVyralId, status: 'stored',
      storagePath, signedUrl: signed.signedUrl, signedUrlExpiresInSeconds: SIGNED_URL_SECONDS,
      sha256: digest, mimeType, sizeBytes: bytes.byteLength,
      message: 'Provider output is now stored privately. The canonical Project Asset DNA ingestion step is next.',
    });
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)
      ? error.message : 'output_transfer_failed';
    await context.supabaseAdmin.rpc('record_runway_output_transfer', {
      p_user_id: userId, p_job_id: body.jobId, p_output_index: outputIndex,
      p_status: 'failed', p_error_code: code,
    });
    return json({ error: 'The Runway output could not be transferred safely. No public Asset was created.' }, 502);
  }
});
