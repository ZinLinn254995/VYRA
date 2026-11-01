import { test, expect } from '@playwright/test';

test('Provider Usage History opens on mobile and explains reported-cost limitations', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();

  await expect(page.getByRole('heading', { name: 'Provider Usage History' })).toBeVisible();
  await expect(page.getByText(/Costs are shown only when OpenRouter reports an amount/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh usage' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(pageErrors, 'Provider Usage History should not emit browser runtime errors').toEqual([]);
});
