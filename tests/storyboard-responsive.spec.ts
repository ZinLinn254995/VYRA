import { test, expect } from '@playwright/test';

function elementDescription(image: Element): string {
  const element = image as HTMLImageElement;
  return element.currentSrc || element.src || element.alt || '<image without source>';
}

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
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Open mobile menu' }).click();
    }
    await expect(page.locator('nav button').nth(4)).toBeVisible();
    await page.locator('nav button').nth(4).click();
    await expect(page.getByText(/Storyboard Timeline/)).toBeVisible();

    // Imported Vite assets must resolve in production builds; legacy /src/assets paths break after bundling.
    await expect.poll(async () => page.locator('img').evaluateAll(images =>
      images.some(image => {
        const element = image as HTMLImageElement;
        return element.getClientRects().length > 0 && element.complete && element.naturalWidth > 0 && element.currentSrc.includes('/assets/');
      })
    )).toBe(true);
    const brokenBundledImages = await page.locator('img').evaluateAll(images =>
      images.filter(image => {
        const element = image as HTMLImageElement;
        return element.getClientRects().length > 0 && element.currentSrc.includes('/assets/') && element.complete && element.naturalWidth === 0;
      }).map(image => elementDescription(image))
    );
    expect(brokenBundledImages, 'Bundled Storyboard image assets should not be broken').toEqual([]);

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

for (const width of [768, 1024, 1440]) {
  test(`Sidebar drawer expands and collapses without logo-toggle overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const sidebar = page.locator('aside');
    const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseButton).toBeVisible();

    const brand = sidebar.locator(':scope > div').first().locator(':scope > div').first();
    const brandBox = await brand.boundingBox();
    const toggleBox = await collapseButton.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();
    expect(
      brandBox!.x + brandBox!.width,
      'Brand logo area should end before the sidebar toggle begins',
    ).toBeLessThanOrEqual(toggleBox!.x + 1);

    await collapseButton.click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().width)).toBe(72);

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
    await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().width)).toBe(260);
  });
}


test('Visual Media Source options resolve to bundled production assets', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.locator('nav button').nth(4).click();
  await expect(page.getByLabel('Visual Media Source')).toBeVisible();

  const selector = page.getByLabel('Visual Media Source');
  const expectedOptions = [
    'Quantum Optical Chip Macro',
    'Tokyo 2088 Sky-Rail Cityscape',
    'Holographic Anchor Avatar',
    'Alpine Biosphere Eco-Habitat',
  ];

  for (const option of expectedOptions) {
    await selector.selectOption({ label: option });
    const selectedSource = await selector.inputValue();
    await expect.poll(async () => page.locator('img[alt="Scene 1"]').evaluateAll((images, source) =>
      images.some(image => {
        const element = image as HTMLImageElement;
        return element.complete && element.naturalWidth > 0 && element.currentSrc === source;
      }), selectedSource
    )).toBe(true);
  }
});
