import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`Credit Wallet navigation and signed-out state render at ${viewport.name}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Open mobile menu' }).click();
    }

    await page.getByRole('button', { name: 'Credit Wallet' }).click();
    await expect(page.getByRole('heading', { name: 'Credit Wallet' })).toBeVisible();
    await expect(page.getByText(/Sign in with your VYRA account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open account' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(pageErrors).toEqual([]);
  });
}
