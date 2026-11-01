import { test, expect } from '@playwright/test';

test('OpenRouter generation lookup rejects missing keys and malformed IDs without contacting the provider', async ({ request, baseURL }) => {
  const missingKey = await request.get(new URL('/api/providers/openrouter/generation/gen-test-123', baseURL).toString());
  expect(missingKey.status()).toBe(400);
  await expect(missingKey.json()).resolves.toMatchObject({
    error: 'Reconnect your OpenRouter API key in Settings to inspect generation details.',
  });

  const malformedId = await request.get(new URL('/api/providers/openrouter/generation/not%20a%20valid%20id', baseURL).toString(), {
    headers: { 'x-openrouter-api-key': 'or-test-key-not-a-real-secret' },
  });
  expect(malformedId.status()).toBe(400);
  await expect(malformedId.json()).resolves.toMatchObject({
    error: 'Invalid OpenRouter generation ID.',
  });
});

test('OpenRouter chat response includes provider generation metadata when supplied', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({ text: 'openai/gpt-4.1-mini' }));
  });

  let forwardedKey = '';
  await page.route('**/api/providers/openrouter/chat', async (route) => {
    forwardedKey = route.request().headers()['x-openrouter-api-key'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'Generation metadata test response.',
        modelName: 'openai/gpt-4.1-mini',
        provider: 'openrouter',
        generationId: 'gen-test-123',
        usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46, costUsd: 0.0012 },
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();
  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await composer.fill('Explain how quantum computing works.');
  await composer.press('Enter');
  await expect(page.getByText('Generation metadata test response.')).toBeVisible();
  expect(forwardedKey).toBe('or-test-key-not-a-real-secret');
  await expect(page.getByText('or-test-key-not-a-real-secret')).toHaveCount(0);
});
