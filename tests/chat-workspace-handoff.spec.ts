import { test, expect } from '@playwright/test';

test('AI Ideas Chat can open the active production workspace without generating media', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await expect(composer).toBeVisible();
  await composer.fill('Open the production workspace');
  await composer.press('Enter');

  await expect(page.getByText(/Opened .* in the Production Workspace/i)).toBeVisible();
  await expect(page.getByText(/No image, voice, or video generation was started/i)).toBeVisible();
});
