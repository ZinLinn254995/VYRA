import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'compact-mobile', width: 320, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide-desktop', width: 1440, height: 900 },
];

async function openSection(page: import('@playwright/test').Page, label: 'Marketplace' | 'Workspace' | 'AI Chat') {
  const navigation = page.locator('nav[aria-label="Main navigation"]:visible');
  await navigation.getByRole('button', { name: label, exact: true }).click();
}

for (const viewport of viewports) {
  test(`Current VYRA shell and navigation fit ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
    await expect(page.locator('nav[aria-label="Main navigation"]:visible')).toBeVisible();

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

test('Marketplace does not display fictional demo listings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No Vyrals listed yet' })).toBeVisible();
  await expect(page.getByText('Story Character Pack')).toHaveCount(0);
  await expect(page.getByText('Milo — The Explorer')).toHaveCount(0);
  await expect(page.getByText('Neon City at Night')).toHaveCount(0);
});

test('Workspace opens the Vyral and media libraries and storyboard creation entry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'Workspace');

  await expect(page.getByRole('heading', { name: 'My Storyboards' })).toBeVisible();
  await expect(page.getByRole('button', { name: /My Vyrals/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /My Media Library/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Storyboards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Storyboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Create Storyboard' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to access your account, credits and Workspace.')).toBeVisible();
});

test('Workspace opens My Media Library with standard file-manager controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'Workspace');

  await page.getByRole('button', { name: /My Media Library/ }).click();
  await expect(page.getByRole('button', { name: 'My Media', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload files' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible();
  await expect(page.getByLabel('Folder path')).toBeVisible();
});

test('AI Chat opens with its composer without starting a paid request', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'AI Chat');

  await expect(page.getByRole('heading', { name: 'Hello! What would you like to create today?' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message VYRA AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
});
