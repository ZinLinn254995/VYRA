import { test, expect } from '@playwright/test';

test('pricing estimate rejects missing OpenRouter credentials without contacting provider', async ({ request, baseURL }) => {
  const response = await request.post(new URL('/api/providers/openrouter/estimate', baseURL).toString(), {
    data: { capability: 'text', model: 'openai/gpt-4.1-mini', parameters: { promptTokens: 20, completionTokens: 10 } },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: 'Reconnect your OpenRouter API key before requesting a live estimate.',
  });
});

test('pricing estimate validates capability and model before provider lookup', async ({ request, baseURL }) => {
  const invalidCapability = await request.post(new URL('/api/providers/openrouter/estimate', baseURL).toString(), {
    headers: { 'x-openrouter-api-key': 'or-test-key-not-a-real-secret' },
    data: { capability: 'unknown', model: 'openai/gpt-4.1-mini', parameters: {} },
  });
  expect(invalidCapability.status()).toBe(400);

  const invalidModel = await request.post(new URL('/api/providers/openrouter/estimate', baseURL).toString(), {
    headers: { 'x-openrouter-api-key': 'or-test-key-not-a-real-secret' },
    data: { capability: 'video', model: 'not-a-model-id', parameters: { durationSeconds: 4 } },
  });
  expect(invalidModel.status()).toBe(400);
});
