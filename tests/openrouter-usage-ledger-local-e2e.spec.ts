import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createAiRouter } from '../src/server/ai.js';

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const configured = Boolean(supabaseUrl && anonKey && serviceRoleKey);

test('authenticated OpenRouter Text usage recorder works against a real local Supabase Auth and PostgREST stack', {
  skip: !configured ? 'Local Supabase URL, anon key and service-role key are required.' : false,
}, async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    VYRA_USAGE_LEDGER_ENABLED: process.env.VYRA_USAGE_LEDGER_ENABLED,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = 'vyra-ledger-e2e-' + randomUUID() + '@example.invalid';
  const password = 'Local-E2E-' + randomUUID() + '!Aa9';
  let userId = '';
  let providerCalls = 0;
  let imageProviderCalls = 0;
  let server: Server | null = null;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'openrouter.ai' && url.pathname === '/api/v1/chat/completions') {
      providerCalls += 1;
      return Response.json({
        id: 'gen-local-e2e-' + providerCalls,
        model: 'openai/gpt-4.1-mini',
        choices: [{ message: { content: 'Local Supabase ledger integration succeeded.' } }],
        usage: { prompt_tokens: 8, completion_tokens: 11, total_tokens: 19 },
      });
    }
    if (url.hostname === 'openrouter.ai' && url.pathname === '/api/v1/images') {
      imageProviderCalls += 1;
      return new Response(JSON.stringify({
        data: [{ b64_json: 'aGVsbG8=', media_type: 'image/png' }],
        usage: { cost: 0.0001 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-generation-id': 'gen-image-local-e2e-1' },
      });
    }
    return originalFetch(input, init);
  };

  process.env.VYRA_USAGE_LEDGER_ENABLED = 'true';
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'VYRA Local Ledger E2E' },
    });
    if (created.error || !created.data.user) {
      throw new Error('Could not create isolated local Supabase E2E user: ' + (created.error?.message || 'unknown error'));
    }
    userId = created.data.user.id;

    const signedIn = await userClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session?.access_token) {
      throw new Error('Could not obtain a local Supabase E2E session: ' + (signedIn.error?.message || 'missing session'));
    }

    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use(createAiRouter());
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local API test server did not start.');
    const baseUrl = 'http://127.0.0.1:' + address.port;
    const idempotencyKey = 'local-e2e-' + randomUUID();

    const response = await originalFetch(baseUrl + '/providers/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': 'or-local-e2e-test-key',
        Authorization: 'Bearer ' + signedIn.data.session.access_token,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        messages: [{ role: 'user', content: 'Explain local solar energy testing.' }],
      }),
    });
    assert.equal(response.status, 200);
    const responseBody = await response.json() as { text: string; generationId: string; usage: { costUsd: number | null } };
    assert.match(responseBody.text, /Local Supabase ledger integration succeeded/);
    assert.equal(responseBody.generationId, 'gen-local-e2e-1');
    assert.equal(responseBody.usage.costUsd, null);
    assert.equal(providerCalls, 1);

    const jobs = await admin.from('generation_jobs')
      .select('id,user_id,status,capability,model_id,request_parameters,provider_request_id')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey);
    assert.equal(jobs.error, null);
    assert.equal(jobs.data?.length, 1);
    assert.equal(jobs.data?.[0].status, 'succeeded');
    assert.equal(jobs.data?.[0].capability, 'text');
    assert.equal(jobs.data?.[0].provider_request_id, 'gen-local-e2e-1');
    assert.deepEqual(jobs.data?.[0].request_parameters, { messageCount: 1, inputCharacters: 35 });

    const attempts = await admin.from('provider_attempts')
      .select('id,status,provider,provider_request_id,usage')
      .eq('user_id', userId)
      .eq('generation_job_id', jobs.data![0].id);
    assert.equal(attempts.error, null);
    assert.equal(attempts.data?.length, 1);
    assert.equal(attempts.data?.[0].status, 'succeeded');
    assert.equal(attempts.data?.[0].provider, 'openrouter');
    assert.equal((attempts.data?.[0].usage as Record<string, unknown>).promptTokens, 8);

    const costs = await admin.from('provider_cost_records')
      .select('id')
      .eq('user_id', userId)
      .eq('generation_job_id', jobs.data![0].id);
    assert.equal(costs.error, null);
    assert.equal(costs.data?.length, 0, 'Unknown provider cost remains absent rather than guessed');

    const duplicate = await originalFetch(baseUrl + '/providers/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': 'or-local-e2e-test-key',
        Authorization: 'Bearer ' + signedIn.data.session.access_token,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        messages: [{ role: 'user', content: 'Explain local solar energy testing.' }],
      }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(providerCalls, 1);

    // Image usage is now recorded by the same verified local session.
    const imageIdempotencyKey = 'local-e2e-image-' + randomUUID();
    const imageResponse = await originalFetch(baseUrl + '/providers/openrouter/images/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': 'or-local-e2e-test-key',
        Authorization: 'Bearer ' + signedIn.data.session.access_token,
        'Idempotency-Key': imageIdempotencyKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-image-1',
        prompt: 'A simple test image of a sunrise over the sea',
        aspect_ratio: '1:1',
      }),
    });
    assert.equal(imageResponse.status, 200);
    const imageBody = await imageResponse.json() as { imageDataUrl: string; mediaType: string; costUsd: number; generationId: string };
    assert.equal(imageBody.imageDataUrl, 'data:image/png;base64,aGVsbG8=');
    assert.equal(imageBody.mediaType, 'image/png');
    assert.equal(imageBody.costUsd, 0.0001);
    assert.equal(imageBody.generationId, 'gen-image-local-e2e-1');
    assert.equal(imageProviderCalls, 1);

    const imageJobs = await admin.from('generation_jobs')
      .select('id,status,capability,request_parameters,provider_request_id')
      .eq('user_id', userId)
      .eq('idempotency_key', imageIdempotencyKey);
    assert.equal(imageJobs.error, null);
    assert.equal(imageJobs.data?.length, 1);
    assert.equal(imageJobs.data?.[0].status, 'succeeded');
    assert.equal(imageJobs.data?.[0].capability, 'image');
    assert.deepEqual(imageJobs.data?.[0].request_parameters, { promptCharacters: 45, aspectRatio: '1:1' });
    assert.equal(imageJobs.data?.[0].provider_request_id, 'gen-image-local-e2e-1');

    const imageAttempts = await admin.from('provider_attempts')
      .select('id,status,provider,provider_request_id,usage')
      .eq('user_id', userId)
      .eq('generation_job_id', imageJobs.data![0].id);
    assert.equal(imageAttempts.error, null);
    assert.equal(imageAttempts.data?.length, 1);
    assert.equal(imageAttempts.data?.[0].status, 'succeeded');
    assert.equal((imageAttempts.data?.[0].usage as Record<string, unknown>).costUsd, 0.0001);

    const imageCosts = await admin.from('provider_cost_records')
      .select('actual_cost_usd,source,provider_generation_id')
      .eq('user_id', userId)
      .eq('generation_job_id', imageJobs.data![0].id);
    assert.equal(imageCosts.error, null);
    assert.equal(imageCosts.data?.length, 1);
    assert.equal(Number(imageCosts.data?.[0].actual_cost_usd), 0.0001);
    assert.equal(imageCosts.data?.[0].source, 'provider_usage');
    assert.equal(imageCosts.data?.[0].provider_generation_id, 'gen-image-local-e2e-1');

    const duplicateImage = await originalFetch(baseUrl + '/providers/openrouter/images/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-api-key': 'or-local-e2e-test-key',
        Authorization: 'Bearer ' + signedIn.data.session.access_token,
        'Idempotency-Key': imageIdempotencyKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-image-1',
        prompt: 'A simple test image of a sunrise over the sea',
        aspect_ratio: '1:1',
      }),
    });
    assert.equal(duplicateImage.status, 409);
    assert.equal(imageProviderCalls, 1);

  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    // The local CI database is disposable. Keep the synthetic ledger rows intact
    // because provider cost records are immutable by design; the Supabase stack
    // is destroyed when this workflow job ends.
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
