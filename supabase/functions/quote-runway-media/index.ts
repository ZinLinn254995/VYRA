import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const RUNWAY_API = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';
const USD_PER_CREDIT = 0.01;
const QUOTE_TTL_MS = 5 * 60 * 1000;

type Task = 'image' | 'video' | 'audio';
type Quality = 'draft' | 'standard' | 'premium';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanInput(task: Task, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowed: Record<Task, string[]> = {
    image: ['promptText', 'referenceImages', 'aspectRatio', 'resolution', 'outputCount', 'seed', 'contentModeration'],
    video: ['promptText', 'negativePrompt', 'referenceImages', 'aspectRatio', 'duration', 'resolution', 'audio', 'seed', 'contentModeration'],
    audio: ['type', 'promptText', 'voice', 'referenceAudios', 'duration', 'loop'],
  };
  const result: Record<string, unknown> = {};
  for (const key of allowed[task]) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  if (typeof result.promptText !== 'string' || !result.promptText.trim()) return null;
  if (task === 'image' && result.promptText.length > 45000) return null;
  if (task === 'video' && result.promptText.length > 26000) return null;
  if (task === 'audio' && result.promptText.length > 26000) return null;
  if (task === 'audio' && !['speech', 'audio', 'music'].includes(String(result.type))) return null;
  if (result.negativePrompt !== undefined &&
      (typeof result.negativePrompt !== 'string' || result.negativePrompt.length > 1000)) return null;
  if (result.referenceImages !== undefined) {
    const refs = result.referenceImages;
    const max = task === 'image' ? 16 : 4;
    if (!Array.isArray(refs) || refs.length > max || refs.some((ref) =>
      !isRecord(ref) || typeof ref.uri !== 'string' || !ref.uri.startsWith('https://'))) return null;
  }
  if (result.referenceAudios !== undefined) {
    if (!Array.isArray(result.referenceAudios) || result.referenceAudios.length > 4 ||
        result.referenceAudios.some((ref) => !isRecord(ref) || typeof ref.uri !== 'string' || !ref.uri.startsWith('https://'))) return null;
  }
  if (result.aspectRatio !== undefined &&
      !['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'auto'].includes(String(result.aspectRatio))) return null;
  if (result.duration !== undefined &&
      (typeof result.duration !== 'number' || !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > 30)) return null;
  if (result.outputCount !== undefined &&
      (typeof result.outputCount !== 'number' || !Number.isInteger(result.outputCount) || result.outputCount < 1 || result.outputCount > 4)) return null;
  if (result.seed !== undefined &&
      (typeof result.seed !== 'number' || !Number.isInteger(result.seed) || result.seed < 0 || result.seed > 4294967295)) return null;
  return result;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function routerConfig(task: Task, quality: Quality): string {
  const key = 'VYRA_RUNWAY_' + task.toUpperCase() + '_' + quality.toUpperCase() + '_ROUTER';
  return (Deno.env.get(key) ?? '').trim();
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (body.action !== 'quote') return json({ error: 'Unsupported media generation action.' }, 400);

  const task = body.task as Task;
  const quality = body.quality as Quality;
  if (!['image', 'video', 'audio'].includes(task) ||
      !['draft', 'standard', 'premium'].includes(quality)) {
    return json({ error: 'Choose a supported media task and quality tier.' }, 400);
  }
  const mode = body.mode === undefined ? 'auto' : body.mode;
  if (mode !== 'auto') {
    return json({ error: 'Manual model override is not enabled until an administrator configures a verified model allowlist.' }, 409);
  }
  const input = cleanInput(task, body.input);
  if (!input) return json({ error: 'The media request contains missing or unsupported input fields.' }, 400);

  const configId = routerConfig(task, quality);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(configId)) {
    return json({ error: 'This media quality route is not configured by the VYRA platform yet.' }, 503);
  }

  const { data: apiKey, error: secretError } = await context.supabaseAdmin.rpc('get_vyra_runway_secret');
  if (secretError) return json({ error: 'VYRA media provider credentials are temporarily unavailable.' }, 503);
  if (typeof apiKey !== 'string' || !apiKey) {
    return json({ error: 'VYRA media generation is not configured yet.' }, 503);
  }

  const endpoint = RUNWAY_API + '/generate/' + task;
  const preflightStartedAt = performance.now();
  const preflightStartedAtIso = new Date().toISOString();
  const recordPreflight = async (
    outcome: 'succeeded' | 'provider_error' | 'invalid_response' | 'network_error',
    httpStatus: number | null,
    modelId: string | null = null,
    failureCode: string | null = null,
    providerRequestId: string | null = null,
  ) => {
    // Telemetry is best-effort and never blocks customer quote requests.
    try {
      await context.supabaseAdmin.from('media_provider_preflight_events').insert({
        provider: 'runway', task, quality, outcome, http_status: httpStatus,
        duration_ms: Math.max(0, Math.round(performance.now() - preflightStartedAt)),
        model_id: modelId, failure_code: failureCode,
        provider_request_id: providerRequestId?.slice(0, 160) ?? null,
        started_at: preflightStartedAtIso,
      });
    } catch { /* telemetry failure must not change request outcome */ }
  };
  let providerResponse: Response;
  try {
    providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'X-Runway-Version': RUNWAY_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ configId, dryRun: true, input }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    await recordPreflight('network_error', null, null, 'network_error');
    return json({ error: 'Runway preflight is temporarily unavailable. No generation was submitted.' }, 502);
  }

  const providerRequestId = providerResponse.headers.get('x-request-id');
  const providerData = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerData) || !isRecord(providerData.routing)) {
    await recordPreflight(
      providerResponse.ok ? 'invalid_response' : 'provider_error',
      providerResponse.status,
      null,
      providerResponse.ok ? 'invalid_provider_response' : 'provider_http_error',
      providerRequestId,
    );
    const status = providerResponse.status === 401 || providerResponse.status === 403 ? 503 :
      providerResponse.status === 429 ? 429 : 502;
    return json({
      error: status === 503 ? 'Runway credential verification is required.' :
        status === 429 ? 'Runway rate limit reached. Try again shortly.' :
          'Runway could not produce a valid preflight quote. No generation was submitted.',
    }, status);
  }

  const routing = providerData.routing;
  const estimatedCredits = isRecord(routing.estimatedCost) ? routing.estimatedCost.credits : null;
  const modelId = typeof routing.model === 'string' ? routing.model : '';
  const provider = typeof routing.provider === 'string' ? routing.provider : 'runway';
  if (typeof estimatedCredits !== 'number' || !Number.isFinite(estimatedCredits) || estimatedCredits < 0 ||
      !modelId || modelId.length > 240) {
    await recordPreflight('invalid_response', providerResponse.status, null, 'invalid_routing_estimate', providerRequestId);
    return json({ error: 'Runway returned an incomplete estimate. No generation was submitted.' }, 502);
  }
  await recordPreflight('succeeded', providerResponse.status, modelId, null, providerRequestId);

  const estimatedCostUsd = Number((estimatedCredits * USD_PER_CREDIT).toFixed(6));
  const maxCostUsd = body.maxCostUsd;
  if (typeof maxCostUsd !== 'number' || !Number.isFinite(maxCostUsd) || maxCostUsd < 0) {
    return json({ error: 'A valid maximum USD budget is required for a quote.' }, 400);
  }
  if (estimatedCostUsd > maxCostUsd) {
    return json({
      error: 'The selected route exceeds the supplied budget. No generation was submitted.',
      estimatedCostUsd,
      maxCostUsd,
    }, 422);
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + QUOTE_TTL_MS);
  const quoteId = crypto.randomUUID();
  const requestFingerprint = await sha256(stableJson({ task, quality, mode, configId, input }));
  const { data: savedQuote, error: saveError } = await context.supabaseAdmin
    .from('media_generation_quotes')
    .insert({
      id: quoteId,
      user_id: userId,
      task,
      quality,
      selection_mode: mode,
      request_fingerprint: requestFingerprint,
      provider,
      provider_config_id: configId,
      provider_model_id: modelId,
      estimated_credits: estimatedCredits,
      estimated_cost_usd: estimatedCostUsd,
      request_payload: { input },
      routing_metadata: routing,
      status: 'quoted',
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();
  if (saveError || !savedQuote) {
    return json({ error: 'The quote could not be saved securely. No generation was submitted.' }, 503);
  }

  return json({
    quote: {
      id: quoteId,
      task,
      quality,
      mode,
      provider,
      model: modelId,
      estimatedCredits,
      estimatedCostUsd,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requestFingerprint,
    },
    message: 'Quote ready. No generation task was created and no provider generation charge was incurred.',
  });
});
