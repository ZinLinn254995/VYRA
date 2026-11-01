import { test, expect } from '@playwright/test';

test('AI Ideas Chat safely rejects workspace handoff when no project exists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();

  const composer = page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...');
  await expect(composer).toBeVisible();
  await composer.fill('Open the production workspace');
  await composer.press('Enter');

  await expect(page.getByText('Project not found. Create or select a project first.')).toBeVisible();
  await expect(page.getByText(/No image, voice, or video generation was started/i)).toHaveCount(0);
});
