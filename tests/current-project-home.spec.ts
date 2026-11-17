import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'compact-mobile', width: 320, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide-desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`Project home fits ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'My Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(errors).toEqual([]);
  });
}

test('New Project requires a permanent account for a guest session', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to access your account, credits and Workspace.')).toBeVisible();
});

test('Project home contains no demo projects or retired Marketplace/Universe entry points', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByText('No Projects yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /My Universes|My Vyrals/ })).toHaveCount(0);
  await expect(page.getByText('Story Character Pack')).toHaveCount(0);
  await expect(page.getByText('Milo — The Explorer')).toHaveCount(0);
});
