import { test, expect } from '@playwright/test';

test('Video Job Recovery Center opens and explains device-local recovery safely', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Video Job Recovery' }).click();

  await expect(page.getByRole('heading', { name: 'Video Job Recovery' })).toBeVisible();
  await expect(page.getByText(/Job IDs and recovery details are stored in this browser's IndexedDB/)).toBeVisible();
  await expect(page.getByText('No saved video jobs yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh jobs/ })).toBeVisible();
  expect(pageErrors, 'Recovery Center should not emit browser runtime errors').toEqual([]);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});
