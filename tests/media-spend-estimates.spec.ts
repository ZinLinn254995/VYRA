import { test, expect } from '@playwright/test';

async function openStoryboardWithMediaModels(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
    sessionStorage.setItem('vyra_openrouter_models_v1', JSON.stringify({
      image: 'test/image-model',
      video: 'test/video-model',
      audio: 'test/audio-model',
    }));
  });
  await page.goto('/');
  await page.locator('nav button').nth(4).click();
}

test('scene image requests a verified estimate before generation and cancels without provider request', async ({ page }) => {
  await openStoryboardWithMediaModels(page);
  let estimateBody: Record<string, unknown> | null = null;
  let generationRequests = 0;
  await page.route('**/api/providers/openrouter/estimate', async route => {
    estimateBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ estimate: { status: 'unavailable', reason: 'pricing_unavailable', message: 'No structured image price.' } }),
    });
  });
  await page.route('**/api/providers/openrouter/images/generate', async route => {
    generationRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,AA==' }) });
  });
  page.on('dialog', dialog => dialog.dismiss());

  await page.getByRole('button', { name: 'Generate Scene Image' }).click();
  await expect.poll(() => estimateBody).not.toBeNull();
  expect(estimateBody).toMatchObject({
    capability: 'image', model: 'test/image-model',
    parameters: { imageCount: 1, inputImageCount: 0 },
  });
  await expect(page.getByRole('alert')).toContainText('Generation cancelled');
  expect(generationRequests).toBe(0);
});

test('scene video requests a duration-based estimate before generation and cancels without provider request', async ({ page }) => {
  await openStoryboardWithMediaModels(page);
  let estimateBody: Record<string, unknown> | null = null;
  let generationRequests = 0;
  await page.route('**/api/providers/openrouter/estimate', async route => {
    estimateBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ estimate: { status: 'unavailable', reason: 'pricing_unavailable', message: 'No structured video price.' } }),
    });
  });
  await page.route('**/api/providers/openrouter/videos/generate', async route => {
    generationRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobId: 'should-not-start' }) });
  });
  page.on('dialog', dialog => dialog.dismiss());

  await page.getByRole('button', { name: 'Generate 4s Clip' }).click();
  await expect.poll(() => estimateBody).not.toBeNull();
  expect(estimateBody).toMatchObject({
    capability: 'video', model: 'test/video-model',
    parameters: { durationSeconds: 4 },
  });
  await expect(page.getByRole('status').filter({ hasText: 'Generation cancelled. No video request was sent.' })).toBeVisible();
  expect(generationRequests).toBe(0);
});

test('voiceover requests an exact character-count estimate before generation and cancels without provider request', async ({ page }) => {
  await openStoryboardWithMediaModels(page);
  let estimateBody: Record<string, unknown> | null = null;
  let generationRequests = 0;
  await page.route('**/api/providers/openrouter/estimate', async route => {
    estimateBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ estimate: { status: 'unavailable', reason: 'pricing_unavailable', message: 'No structured audio price.' } }),
    });
  });
  await page.route('**/api/providers/openrouter/audio/speech', async route => {
    generationRequests += 1;
    await route.fulfill({ status: 200, headers: { 'content-type': 'audio/mpeg' }, body: Buffer.from('fake-audio') });
  });
  page.on('dialog', dialog => dialog.dismiss());

  const narration = page.getByPlaceholder('Enter the voiceover script for this scene...');
  await expect(narration).toBeVisible();
  const narrationText = await narration.inputValue();
  await page.getByRole('button', { name: 'Generate Voiceover' }).click();
  await expect.poll(() => estimateBody).not.toBeNull();
  expect(estimateBody).toMatchObject({
    capability: 'audio', model: 'test/audio-model',
    parameters: { inputCharacters: narrationText.length },
  });
  await expect(page.getByRole('status').filter({ hasText: 'Generation cancelled. No audio request was sent.' })).toBeVisible();
  expect(generationRequests).toBe(0);
});
