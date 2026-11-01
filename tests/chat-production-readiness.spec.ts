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

  // The readiness checker needs a real target project; create one first rather than
  // relying on demo data or whichever project happens to be active in the test browser.
  await composer.fill('Create a new project called Readiness Test with 2 scenes');
  await composer.press('Enter');
  await expect(page.getByText(/created your new project/i)).toBeVisible();

  await composer.fill('Check production readiness');
  await composer.press('Enter');

  await expect(page.getByText(/Production Readiness \(\d+\/5\)/)).toBeVisible();
  await expect(page.getByText(/This is a read-only check/i)).toBeVisible();
  await expect(page.getByText(/Scene video clips/)).toBeVisible();
  expect(generationRequests).toEqual([]);
});
