import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide-desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`Storyboard layout has no horizontal overflow at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.locator('nav button').nth(4)).toBeVisible();
    await page.locator('nav button').nth(4).click();
    await expect(page.getByText(/Storyboard Timeline/)).toBeVisible();

    await page.screenshot({
      path: `artifacts/storyboard-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(
      dimensions.documentWidth,
      `Document overflows horizontally: ${JSON.stringify(dimensions)}`,
    ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(
      dimensions.bodyWidth,
      `Body overflows horizontally: ${JSON.stringify(dimensions)}`,
    ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(pageErrors, 'Browser runtime errors were reported').toEqual([]);
  });
}
