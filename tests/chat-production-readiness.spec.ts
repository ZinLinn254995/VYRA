import { test, expect } from '@playwright/test';

test('AI Ideas Chat reports production readiness without starting paid generation', async ({ page }) => {
  const generationRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/providers\/openrouter\/(?:video|images|audio)/i.test(request.url())) {
      generationRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await expect(composer).toBeVisible();
  await composer.fill('Check production readiness');
  await composer.press('Enter');

  await expect(page.getByText(/Production Readiness/)).toBeVisible();
  await expect(page.getByText(/This is a read-only check/)).toBeVisible();
  await expect(page.getByText(/Scene video clips/)).toBeVisible();
  expect(generationRequests).toEqual([]);
});
