import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in VYRA session is required.' }, authError?.status ?? 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  const { data: apiKey, error: secretError } = await context.supabaseAdmin.rpc('get_vyra_gemini_secret');
  if (secretError) return json({ error: 'Gemini provider configuration is unavailable.' }, 503);
  if (typeof apiKey !== 'string' || !apiKey) {
    if (body.action === 'status') return json({ configured: false, provider: 'google', model: 'gemini-2.5-flash' });
    return json({ error: 'Gemini is not configured. Add the key in Profile → Settings → AI Providers.' }, 503);
  }
  if (body.action === 'status') return json({ configured: true, provider: 'google', model: 'gemini-2.5-flash' });
  const model = typeof body.model === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(body.model) ? body.model : 'gemini-2.5-flash';
  if (body.contents === undefined || body.contents === null) return json({ error: 'Gemini contents are required.' }, 400);
  const serialized = JSON.stringify({ contents: body.contents, systemInstruction: body.systemInstruction });
  if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024) return json({ error: 'Gemini request exceeds the 4 MB limit.' }, 413);
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contents: body.contents, ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}), ...(body.config && typeof body.config === 'object' ? { generationConfig: body.config } : {}) }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await upstream.json().catch(() => ({})) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      responseId?: string;
    };
    if (!upstream.ok) return json({ error: upstream.status === 429 ? 'Gemini rate limit reached. Try again later.' : 'Gemini could not complete the request. Check provider quota and model access.' }, upstream.status === 429 ? 429 : 502);
    const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => typeof part.text === 'string' ? part.text : '').join('').trim();
    if (!text) return json({ error: 'Gemini returned an empty response.' }, 502);
    return json({
      text, modelName: model, provider: 'gemini', generationId: typeof payload.responseId === 'string' ? payload.responseId : null,
      usage: payload.usageMetadata ? { promptTokens: payload.usageMetadata.promptTokenCount ?? null, completionTokens: payload.usageMetadata.candidatesTokenCount ?? null, totalTokens: payload.usageMetadata.totalTokenCount ?? null } : null,
    });
  } catch { return json({ error: 'Could not reach Gemini. Check the connection and retry.' }, 502); }
});
