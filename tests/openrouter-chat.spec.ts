import { test, expect } from '@playwright/test';

test('AI Ideas Chat uses the configured OpenRouter Text model', async ({ page }) => {
  let capturedRequest: { model?: string; apiKey?: string } = {};

  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({
      text: 'openai/gpt-4.1-mini',
    }));
  });

  await page.route('**/api/providers/openrouter/chat', async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { model?: string };
    capturedRequest = {
      model: body.model,
      apiKey: request.headers()['x-openrouter-api-key'],
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'OpenRouter test response from the selected model.',
        modelName: 'openai/gpt-4.1-mini',
        provider: 'openrouter',
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await expect(composer).toBeVisible();
  await composer.fill('Explain how quantum computing works in simple terms.');
  await composer.press('Enter');

  await expect(page.getByText('OpenRouter test response from the selected model.')).toBeVisible();
  expect(capturedRequest.model).toBe('openai/gpt-4.1-mini');
  expect(capturedRequest.apiKey).toBe('or-test-key-not-a-real-secret');
});
