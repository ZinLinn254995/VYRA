import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'small-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`Project-first home renders without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'My Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    await expect(page.getByText('No Projects yet', { exact: true })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(pageErrors).toEqual([]);
  });
}

test('Project creation requires sign-in and does not create a placeholder Project', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'My Projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to access your account, credits and Workspace.')).toBeVisible();
  await expect(page.getByText('No Projects yet', { exact: true })).toBeVisible();
});
