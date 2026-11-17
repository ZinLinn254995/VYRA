import { test, expect } from '@playwright/test';

test('AI Ideas Chat opens the active project workspace without starting generation', async ({ page }) => {
  const generationRequests: string[] = [];
  page.on('request', request => {
    // The chat completion endpoint is expected here; only media-generation endpoints
    // would violate the no-generation handoff guarantee.
    if (/\/api\/providers\/openrouter\/(?:video|images|audio)/i.test(request.url())) {
      generationRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await expect(composer).toBeVisible();
  await composer.fill('Open the production workspace');
  await composer.press('Enter');

  // The chat view is intentionally replaced by the workspace after the tool runs.
  await expect(page.locator('main').getByText('Project:', { exact: true })).toBeVisible();
  await expect(page.locator('main select').first()).toHaveValue('proj-01-quantum');
  expect(generationRequests).toEqual([]);
});
