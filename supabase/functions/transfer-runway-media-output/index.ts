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
      jobId: body.jobId, status: claim.status ?? 'pending',
      assetId: claim.asset_id ?? null, assetVersionId: claim.asset_version_id ?? null,
      message: claim.status === 'ingested' ? 'This output is already a ready Project Asset.'
        : claim.status === 'downloading' ? 'This output is already being transferred.'
        : claim.status === 'failed' ? 'This output needs recovery before it can be used.'
        : 'This output is not currently eligible for transfer.',
    }, claim.status === 'downloading' ? 409 : 200);
  }

  const targetVyralId = typeof claim.target_vyral_id === 'string' ? claim.target_vyral_id : '';
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
