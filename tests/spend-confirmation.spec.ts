import { test, expect } from '@playwright/test';

async function openAiIdeas(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({ text: 'openai/gpt-4.1-mini' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();
  await expect(page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...')).toBeVisible();
}

test('AI Ideas Chat requires explicit spend approval for script generation and does not send when declined', async ({ page }) => {
  await openAiIdeas(page);
  let generationRequests = 0;
  let estimateRequests = 0;

  await page.route('**/api/providers/openrouter/estimate', async (route) => {
    estimateRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        estimate: {
          status: 'unavailable',
          estimatedCostUsd: null,
          reason: 'parameters_incomplete',
          message: 'Exact prompt token count is required.',
        },
      }),
    });
  });
  await page.route('**/api/providers/openrouter/chat', async (route) => {
    generationRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'This must not be generated.' }) });
  });

  let dialogMessage = '';
  page.on('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await composer.fill('Write a 30-second script about how solar energy works.');
  await composer.press('Enter');

  await expect.poll(() => estimateRequests).toBe(1);
  expect(dialogMessage).toContain('Estimated cost: UNAVAILABLE');
  expect(dialogMessage).toContain('Creative approval is not payment approval');
  await expect(page.getByText(/Generation cancelled\. No AI generation request was sent/)).toBeVisible();
  expect(generationRequests).toBe(0);
});

test('AI Ideas Chat sends script generation only after explicit spend approval', async ({ page }) => {
  await openAiIdeas(page);
  let generationRequests = 0;

  await page.route('**/api/providers/openrouter/estimate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        estimate: {
          status: 'unavailable',
          estimatedCostUsd: null,
          reason: 'parameters_incomplete',
          message: 'Exact prompt token count is required.',
        },
      }),
    });
  });
  await page.route('**/api/providers/openrouter/chat', async (route) => {
    generationRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'Approved script generation response.', modelName: 'openai/gpt-4.1-mini' }),
    });
  });

  page.on('dialog', dialog => dialog.accept());
  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await composer.fill('Write a short script about ocean conservation.');
  await composer.press('Enter');

  await expect(page.getByText('Approved script generation response.')).toBeVisible();
  expect(generationRequests).toBe(1);
});
