import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (request: Request) => {
  let stage = 'request';
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    stage = 'authentication';
    const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
    if (authError || !context) return json({ error: 'A valid signed-in VYRA session is required.' }, authError?.status ?? 401);

    stage = 'request_body';
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

    stage = 'vault_secret_read';
    const { data: apiKey, error: secretError } = await context.supabaseAdmin.rpc('get_vyra_gemini_secret');
    if (secretError) {
      console.error('[vyra-gemini-proxy] vault RPC failed:', secretError.code ?? 'unknown');
      return json({ error: 'Gemini provider configuration is unavailable.', code: 'GEMINI_VAULT_READ_FAILED' }, 503);
    }
    if (typeof apiKey !== 'string' || !apiKey) {
      if (body.action === 'status') return json({ configured: false, provider: 'google', model: 'gemini-3.8-flash' });
      return json({ error: 'Gemini is not configured. Add the key in Profile → Settings → AI Providers.' }, 503);
    }
    if (body.action === 'status') return json({ configured: true, provider: 'google', model: 'gemini-3.8-flash' });

    const model = typeof body.model === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(body.model) ? body.model : 'gemini-3.8-flash';
    if (body.contents === undefined || body.contents === null) return json({ error: 'Gemini contents are required.' }, 400);
    const serialized = JSON.stringify({ contents: body.contents, systemInstruction: body.systemInstruction });
    if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024) return json({ error: 'Gemini request exceeds the 4 MB limit.' }, 413);

    stage = 'gemini_request';
    const upstreamUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    let upstream: Response | null = null;
    try {
      const requestBody = JSON.stringify({
        contents: body.contents,
        ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
        ...(body.config && typeof body.config === 'object' ? { generationConfig: body.config } : {}),
      });
      // Bound each attempt so a slow Google response cannot exhaust the proxy request.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        upstream = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: requestBody,
          signal: AbortSignal.timeout(10000),
        });
        if ((upstream.status !== 503 && upstream.status !== 429) || attempt === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    } catch (error) {
      const errorName = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : 'Error';
      console.error('[vyra-gemini-proxy] upstream request failed:', errorName);
      if (errorName === 'TimeoutError' || errorName === 'AbortError') {
        return json({ error: 'Gemini took too long to respond. Please retry in a moment.', code: 'GEMINI_UPSTREAM_TIMEOUT' }, 504);
      }
      return json({ error: 'Could not connect to Gemini. Please retry.', code: 'GEMINI_UPSTREAM_NETWORK' }, 502);
    }
    if (!upstream) return json({ error: 'Could not connect to Gemini. Please retry.', code: 'GEMINI_UPSTREAM_NETWORK' }, 502);

    const payload = await upstream.json().catch(() => ({})) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      responseId?: string;
      error?: { message?: string; status?: string; code?: number };
    };
    if (!upstream.ok) {
      const upstreamMessage = typeof payload.error?.message === 'string'
        ? payload.error.message.slice(0, 500)
        : 'No additional details were provided by Google.';
      console.error('[vyra-gemini-proxy] Gemini HTTP response:', upstream.status, payload.error?.status ?? 'UNKNOWN');
      const message = upstream.status === 429
        ? 'Gemini rate limit reached. Try again later.'
        : upstream.status === 400
          ? 'Gemini rejected the request format: ' + upstreamMessage
          : upstream.status === 401 || upstream.status === 403
            ? 'Google rejected the stored API key or its API permissions: ' + upstreamMessage
            : upstream.status === 404
              ? 'Gemini model "' + model + '" was not found or is unavailable to this API key: ' + upstreamMessage
              : 'Gemini request failed (HTTP ' + upstream.status + '): ' + upstreamMessage;
      return json({
        error: message,
        code: 'GEMINI_HTTP_' + upstream.status,
        providerStatus: payload.error?.status ?? null,
        model,
      }, upstream.status === 429 ? 429 : upstream.status === 503 ? 503 : 502);
    }
    const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => typeof part.text === 'string' ? part.text : '').join('').trim();
    if (!text) return json({ error: 'Gemini returned an empty response.', code: 'GEMINI_EMPTY_RESPONSE' }, 502);
    return json({
      text, modelName: model, provider: 'gemini', generationId: typeof payload.responseId === 'string' ? payload.responseId : null,
      usage: payload.usageMetadata ? {
        promptTokens: payload.usageMetadata.promptTokenCount ?? null,
        completionTokens: payload.usageMetadata.candidatesTokenCount ?? null,
        totalTokens: payload.usageMetadata.totalTokenCount ?? null,
      } : null,
    });
  } catch (error) {
    const errorName = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : 'Error';
    console.error('[vyra-gemini-proxy] request failure at stage:', stage, errorName);
    return json({ error: 'Gemini proxy failed during ' + stage + '.', code: 'GEMINI_PROXY_' + stage.toUpperCase() }, 500);
  }
});
