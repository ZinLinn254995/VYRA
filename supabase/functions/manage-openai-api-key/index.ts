import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'Sign in with your VYRA account.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return json({ error: 'Authenticated user identity is unavailable.' }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  if (body.action === 'status') {
    const { data, error } = await context.supabaseAdmin.rpc('get_vyra_openai_secret');
    if (error) return json({ error: 'Could not read OpenAI API key status.' }, 503);
    return json({ configured: typeof data === 'string' && data.length > 0, provider: 'openai' });
  }
  if (body.action !== 'save') return json({ error: 'Unsupported API key action.' }, 400);
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (apiKey.length < 20 || apiKey.length > 512 || /\\s/.test(apiKey)) return json({ error: 'Enter a valid-looking OpenAI API key.' }, 400);
  try {
    const verify = await fetch('https://api.openai.com/v1/models', {
      method: 'GET', headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
    });
    if (!verify.ok) return json({
      error: verify.status === 401 || verify.status === 403 ? 'OpenAI rejected this API key. Check the key and API access.' :
        verify.status === 429 ? 'OpenAI rate limit reached. Try again later.' : 'OpenAI could not verify this key right now.',
    }, verify.status === 401 || verify.status === 403 ? 400 : 502);
    const { error: saveError } = await context.supabaseAdmin.rpc('set_vyra_openai_secret', { secret_value: apiKey });
    if (saveError) return json({ error: 'The key passed verification but could not be stored securely.' }, 503);
    return json({ configured: true, provider: 'openai', message: 'OpenAI API key verified and saved securely.' });
  } catch { return json({ error: 'Could not reach OpenAI to verify the key. Try again.' }, 502); }
});
