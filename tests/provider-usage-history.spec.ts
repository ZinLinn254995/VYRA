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


test('Provider Usage History shows provider-reported live key totals without exposing the key', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'sk-or-v1-test-session-secret');
  });
  let forwardedKey = '';
  await page.route('**/api/providers/openrouter/usage/key', async (route) => {
    forwardedKey = route.request().headers()['x-openrouter-api-key'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        usage: 12.34,
        usageDaily: 0.45,
        usageWeekly: 2.1,
        usageMonthly: 8.9,
        limit: 50,
        limitRemaining: 37.66,
        limitReset: 'monthly',
        isFreeTier: false,
        expiresAt: null,
        fetchedAt: '2026-11-01T09:30:00.000Z',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();

  await expect(page.getByRole('heading', { name: 'Live OpenRouter key usage' })).toBeVisible();
  await expect(page.getByText('$12.3400')).toBeVisible();
  await expect(page.getByText('$0.4500')).toBeVisible();
  await expect(page.getByText('$37.6600')).toBeVisible();
  expect(forwardedKey).toBe('sk-or-v1-test-session-secret');
  await expect(page.getByText('sk-or-v1-test-session-secret')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});
