import { test, expect } from '@playwright/test';

const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide-desktop', width: 1440, height: 900 },
];

async function openIdeas(page: import('@playwright/test').Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  if (width < 768) {
    await page.getByRole('button', { name: 'Open mobile menu' }).click();
  }
  await page.getByRole('button', { name: 'AI Ideas Chat' }).click();
  await expect(page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...')).toBeVisible();
}

for (const size of sizes) {
  test(`AI Ideas Chat is usable without horizontal overflow at ${size.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openIdeas(page, size.width, size.height);

    await expect(page.getByText('Architectural Status Note:')).toHaveCount(1);
    await expect(page.getByPlaceholder('Ask for video ideas, hooks, full scripts, or storyboard visual prompts...')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 768]) {
  test(`AI Ideas conversation drawer opens and dismisses on ${width}px screens`, async ({ page }) => {
    await openIdeas(page, width, 844);
    const chat = page.locator('main').locator('section').first();
    const openButton = page.getByRole('button', { name: 'Open conversation list' });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const drawer = page.locator('main aside').first();
    await expect(page.getByRole('button', { name: 'Close conversations panel' })).toBeVisible();
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? -999).toBe(0);

    await page.getByRole('button', { name: 'Close conversations panel' }).click();
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? 0).toBeLessThan(-250);
    await expect(page.getByRole('button', { name: 'Open conversation list' })).toBeVisible();
    await expect(chat).toBeVisible();
  });
}

for (const width of [1024, 1440]) {
  test(`AI Ideas conversation panel toggles on desktop at ${width}px`, async ({ page }) => {
    await openIdeas(page, width, 900);
    const drawer = page.locator('main aside').first();
    const toggle = page.getByRole('button', { name: 'Close conversation list' });
    await expect(toggle).toBeVisible();
    await expect.poll(async () => (await drawer.boundingBox())?.width ?? 0).toBeGreaterThan(250);

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Open conversation list' })).toBeVisible();
    await expect.poll(async () => (await drawer.boundingBox())?.width ?? 999).toBe(0);

    await page.getByRole('button', { name: 'Open conversation list' }).click();
    await expect.poll(async () => (await drawer.boundingBox())?.width ?? 0).toBeGreaterThan(250);
  });
}
