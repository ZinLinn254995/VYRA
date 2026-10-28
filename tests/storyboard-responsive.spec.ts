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
    const selectedSource = new URL(await selector.inputValue(), page.url()).href;
    await expect.poll(async () => page.locator('img[alt="Scene 1"]').evaluateAll((images, source) =>
      images.some(image => {
        const element = image as HTMLImageElement;
        return element.complete && element.naturalWidth > 0 && element.currentSrc === source;
      }), selectedSource
    )).toBe(true);
  }
});

test('Editing narration or visual direction invalidates the scene media references', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  // Seed persisted scene references to simulate media generated in a previous session.
  const seeded = await page.evaluate(() => {
    const raw = localStorage.getItem('vyra_projects_v1');
    if (!raw) return false;
    const projects = JSON.parse(raw) as Array<{ scenes?: Array<Record<string, unknown>> }>;
    const scene = projects.find(project => project.scenes?.length)?.scenes?.[0];
    if (!scene) return false;
    scene.generatedAudioId = 'test-saved-audio';
    scene.generatedVideoId = 'test-saved-video';
    localStorage.setItem('vyra_projects_v1', JSON.stringify(projects));
    return true;
  });
  expect(seeded, 'A persisted storyboard scene should be available for the regression test').toBe(true);

  await page.reload();
  await page.locator('nav button').nth(4).click();
  await expect(page.getByPlaceholder('Enter the voiceover script for this scene...')).toBeVisible();

  await page.getByPlaceholder('Enter the voiceover script for this scene...').fill('Updated narration must not reuse old voiceover');
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ scenes?: Array<Record<string, unknown>> }>;
    return projects.find(project => project.scenes?.length)?.scenes?.[0]?.generatedAudioId ?? null;
  })).toBeNull();

  // Re-seed the video reference independently, then verify a visual prompt edit clears it.
  await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ scenes?: Array<Record<string, unknown>> }>;
    const scene = projects.find(project => project.scenes?.length)?.scenes?.[0];
    if (scene) {
      scene.generatedVideoId = 'test-saved-video';
      localStorage.setItem('vyra_projects_v1', JSON.stringify(projects));
    }
  });
  await page.reload();
  await page.locator('nav button').nth(4).click();
  await expect(page.getByPlaceholder('Detailed visual prompt describing scene environment, materials, lighting...')).toBeVisible();
  await page.getByPlaceholder('Detailed visual prompt describing scene environment, materials, lighting...').fill('Updated visual direction must not reuse old clip');
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ scenes?: Array<Record<string, unknown>> }>;
    return projects.find(project => project.scenes?.length)?.scenes?.[0]?.generatedVideoId ?? null;
  })).toBeNull();
});



test('An in-flight video result is discarded if the scene changes before the clip arrives', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'playwright-test-key');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({ video: 'test/video-model' }));
  });

  let releaseContent!: () => void;
  let markContentRequested!: () => void;
  const contentGate = new Promise<void>(resolve => { releaseContent = resolve; });
  const contentRequested = new Promise<void>(resolve => { markContentRequested = resolve; });

  await page.route('**/api/providers/openrouter/videos/generate', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jobId: 'playwright-stale-video-job' }),
  }));
  await page.route('**/api/providers/openrouter/videos/playwright-stale-video-job', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'completed', costUsd: 0 }),
  }));
  await page.route('**/api/providers/openrouter/videos/playwright-stale-video-job/content', async route => {
    markContentRequested();
    await contentGate;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'video/mp4' },
      body: Buffer.from('fake-mp4-content'),
    });
  });

  await page.goto('/');
  await page.locator('nav button').nth(4).click();
  const visualPrompt = page.getByPlaceholder('Detailed visual prompt describing scene environment, materials, lighting...');
  await expect(visualPrompt).toBeVisible();
  await page.getByRole('button', { name: 'Generate 4s Clip' }).click();

  // Hold the provider content response until after the user edits the scene.
  await contentRequested;
  await visualPrompt.fill('A changed scene prompt must invalidate the in-flight result');
  releaseContent();

  await expect(page.getByRole('status').filter({ hasText: 'Discarded this result because the scene script or visual direction changed' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ scenes?: Array<Record<string, unknown>> }>;
    return projects.find(project => project.scenes?.length)?.scenes?.[0]?.generatedVideoId ?? null;
  })).toBeNull();
});


test('An in-flight voiceover is discarded if narration changes before audio arrives', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'playwright-test-key');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({ audio: 'test/audio-model' }));
  });

  let releaseAudio!: () => void;
  let markAudioRequested!: () => void;
  const audioGate = new Promise<void>(resolve => { releaseAudio = resolve; });
  const audioRequested = new Promise<void>(resolve => { markAudioRequested = resolve; });

  await page.route('**/api/providers/openrouter/audio/speech', async route => {
    markAudioRequested();
    await audioGate;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      body: Buffer.from('fake-audio-content'),
    });
  });

  await page.goto('/');
  await page.locator('nav button').nth(4).click();
  const narration = page.getByPlaceholder('Enter the voiceover script for this scene...');
  await expect(narration).toBeVisible();
  await page.getByRole('button', { name: 'Generate Voiceover' }).click();

  await audioRequested;
  await narration.fill('This is the updated narration and must not use old audio');
  releaseAudio();

  await expect(page.getByRole('status').filter({ hasText: 'Discarded this result because the narration changed during generation' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ scenes?: Array<Record<string, unknown>> }>;
    return projects.find(project => project.scenes?.length)?.scenes?.[0]?.generatedAudioId ?? null;
  })).toBeNull();
});


test('Full-video export reports missing local clips without leaving export stuck', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  // A project can retain scene IDs after browser storage is cleared or unavailable.
  // Seed an ID without creating an IndexedDB record to exercise that recovery path.
  const seeded = await page.evaluate(() => {
    const raw = localStorage.getItem('vyra_projects_v1');
    if (!raw) return false;
    const projects = JSON.parse(raw) as Array<{ scenes?: Array<Record<string, unknown>> }>;
    const project = projects.find(project => project.scenes?.length);
    if (!project?.scenes?.length) return false;
    project.scenes.forEach((scene, index) => {
      scene.generatedVideoId = 'missing-local-video-record-' + index;
    });
    localStorage.setItem('vyra_projects_v1', JSON.stringify(projects));
    return true;
  });
  expect(seeded, 'A persisted storyboard scene should be available for the export recovery test').toBe(true);

  await page.reload();
  await page.locator('nav button').nth(4).click();
  const exportButton = page.getByRole('button', { name: 'Export Full Video' });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  await expect(page.getByRole('alert').filter({ hasText: 'Scene 1 clip is missing from this device' })).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await expect(page.getByText(/Loading saved scene clips/)).not.toBeVisible();
});
