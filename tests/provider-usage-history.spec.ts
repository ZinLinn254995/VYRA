import { test, expect } from '@playwright/test';

test('Provider Usage History opens on mobile and explains reported-cost limitations', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();

  await expect(page.getByRole('heading', { name: 'Provider Usage History' })).toBeVisible();
  await expect(page.getByText(/Costs are shown only when OpenRouter reports an amount/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh usage' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(pageErrors, 'Provider Usage History should not emit browser runtime errors').toEqual([]);
});


test('Provider Usage History shows provider-reported live key totals without exposing the key', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'sk-or-v1-test-session-secret');
  });
  let forwardedKey = '';
  await page.route('**/api/providers/openrouter/usage/key', async (route) => {
    forwardedKey = route.request().headers()['x-openrouter-api-key'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        usage: 12.34,
        usageDaily: 0.45,
        usageWeekly: 2.1,
        usageMonthly: 8.9,
        limit: 50,
        limitRemaining: 37.66,
        limitReset: 'monthly',
        isFreeTier: false,
        expiresAt: null,
        fetchedAt: '2026-11-01T09:30:00.000Z',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();

  await expect(page.getByRole('heading', { name: 'Live OpenRouter key usage' })).toBeVisible();
  await expect(page.getByText('$12.3400')).toBeVisible();
  await expect(page.getByText('$0.4500')).toBeVisible();
  await expect(page.getByText('$37.6600')).toBeVisible();
  expect(forwardedKey).toBe('sk-or-v1-test-session-secret');
  await expect(page.getByText('sk-or-v1-test-session-secret')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});


test('Provider Usage continues recovering other costs when one generation lookup has a network error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'sk-or-v1-test-session-secret');
  });
  await page.route('**/api/providers/openrouter/usage/key', async (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      usage: 0, usageDaily: 0, usageWeekly: 0, usageMonthly: 0, limit: null,
      limitRemaining: null, limitReset: null, isFreeTier: true, expiresAt: null,
      fetchedAt: '2026-11-01T09:30:00.000Z',
    }),
  }));
  const lookedUpIds: string[] = [];
  await page.route('**/api/providers/openrouter/generation/**', async (route) => {
    const generationId = route.request().url().split('/').pop() || '';
    lookedUpIds.push(generationId);
    expect(route.request().headers()['x-openrouter-api-key']).toBe('sk-or-v1-test-session-secret');
    if (generationId === 'gen-video-test-003') {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ costUsd: 0.0042 }),
    });
  });

  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('generated-images')) database.createObjectStore('generated-images', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-audio')) database.createObjectStore('generated-audio', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-videos')) database.createObjectStore('generated-videos', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('video-generation-jobs')) database.createObjectStore('video-generation-jobs', { keyPath: 'jobId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['generated-images', 'generated-audio', 'generated-videos', 'video-generation-jobs'], 'readwrite');
      transaction.objectStore('generated-images').put({
        id: 'image-cost-test', title: 'Cost test image', dataUrl: 'data:image/png;base64,AA==',
        model: 'test/image-model', costUsd: null, generationId: 'gen-image-test-001',
        createdAt: '2026-11-01T09:00:00.000Z',
      });
      transaction.objectStore('generated-audio').put({
        id: 'audio-cost-test', title: 'Cost test voiceover', blob: new Blob(['audio']),
        model: 'test/audio-model', voice: 'test-voice', generationId: 'gen-audio-test-002',
        projectId: 'project-test', sceneId: 'scene-test', createdAt: '2026-11-01T09:01:00.000Z',
      });
      transaction.objectStore('generated-videos').put({
        id: 'video-cost-test', title: 'Cost test video', blob: new Blob(['video']),
        model: 'test/video-model', costUsd: null, generationId: 'gen-video-test-003',
        projectId: 'project-test', sceneId: 'scene-test', createdAt: '2026-11-01T09:02:00.000Z',
      });
      transaction.objectStore('video-generation-jobs').put({
        jobId: 'job-cost-test', projectId: 'project-test', projectTitle: 'Cost test project',
        sceneId: 'scene-test', sceneOrder: 1, model: 'test/video-model', prompt: 'test',
        visualPrompt: 'test', cameraMovement: 'static', narration: 'test', duration: 5,
        aspectRatio: '9:16', savedVideoId: 'video-cost-test', status: 'completed',
        createdAt: '2026-11-01T09:02:00.000Z', updatedAt: '2026-11-01T09:03:00.000Z',
        costUsd: null, generationId: 'gen-video-test-003',
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();
  await expect(page.getByText('Cost test image')).toBeVisible();
  await expect(page.getByText('Cost test voiceover')).toBeVisible();
  await expect(page.getByText('Cost test video')).toBeVisible();
  await page.getByRole('button', { name: 'Look up missing costs' }).click();
  await expect(page.getByRole('status')).toContainText('2 provider-reported cost(s) saved. 1 record(s) remain unavailable.');
  await expect(page.getByText('$0.0042', { exact: true })).toHaveCount(2);
  expect(lookedUpIds.sort()).toEqual(['gen-audio-test-002', 'gen-image-test-001', 'gen-video-test-003']);

  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<Record<string, number | null>>((resolve, reject) => {
      const transaction = db.transaction(['generated-images', 'generated-audio', 'generated-videos', 'video-generation-jobs'], 'readonly');
      const output: Record<string, number | null> = {};
      const stores = [
        ['image', 'generated-images', 'image-cost-test'],
        ['audio', 'generated-audio', 'audio-cost-test'],
        ['video', 'generated-videos', 'video-cost-test'],
        ['job', 'video-generation-jobs', 'job-cost-test'],
      ] as const;
      let remaining = stores.length;
      for (const [key, store, id] of stores) {
        const request = transaction.objectStore(store).get(id);
        request.onsuccess = () => {
          output[key] = request.result?.costUsd ?? null;
          remaining -= 1;
          if (remaining === 0) resolve(output);
        };
        request.onerror = () => reject(request.error);
      }
    });
    db.close();
    return result;
  });
  expect(persisted).toEqual({ image: 0.0042, audio: 0.0042, video: null, job: null });
});


test('Provider Usage does not partially update a linked video job when its saved media disappears', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'sk-or-v1-test-session-secret');
  });
  await page.route('**/api/providers/openrouter/usage/key', async (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      usage: 0, usageDaily: 0, usageWeekly: 0, usageMonthly: 0, limit: null,
      limitRemaining: null, limitReset: null, isFreeTier: true, expiresAt: null,
      fetchedAt: '2026-11-01T09:30:00.000Z',
    }),
  }));
  await page.route('**/api/providers/openrouter/generation/**', async (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ costUsd: 0.0042 }),
  }));

  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['generated-videos', 'video-generation-jobs'], 'readwrite');
      transaction.objectStore('generated-videos').put({
        id: 'atomic-video-test', title: 'Atomic video test', blob: new Blob(['video']),
        model: 'test/video-model', costUsd: null, generationId: 'gen-atomic-video',
        projectId: 'project-atomic', sceneId: 'scene-atomic', createdAt: '2026-11-01T09:02:00.000Z',
      });
      transaction.objectStore('video-generation-jobs').put({
        jobId: 'job-atomic-video', projectId: 'project-atomic', projectTitle: 'Atomic project',
        sceneId: 'scene-atomic', sceneOrder: 1, model: 'test/video-model', prompt: 'test',
        visualPrompt: 'test', cameraMovement: 'static', narration: 'test', duration: 5,
        aspectRatio: '9:16', savedVideoId: 'atomic-video-test', status: 'completed',
        createdAt: '2026-11-01T09:02:00.000Z', updatedAt: '2026-11-01T09:03:00.000Z',
        costUsd: null, generationId: 'gen-atomic-video',
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.getByRole('button', { name: 'Open mobile menu' }).click();
  await page.getByRole('button', { name: 'Provider Usage' }).click();
  await expect(page.getByText('Atomic video test')).toBeVisible();

  // Simulate the saved clip being removed after the view loaded but before cost sync.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('generated-videos', 'readwrite');
      transaction.objectStore('generated-videos').delete('atomic-video-test');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.getByRole('button', { name: 'Look up missing costs' }).click();
  await expect(page.getByRole('status')).toContainText('0 provider-reported cost(s) saved. 1 record(s) remain unavailable.');

  const jobCost = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cost = await new Promise<number | null>((resolve, reject) => {
      const transaction = db.transaction('video-generation-jobs', 'readonly');
      const request = transaction.objectStore('video-generation-jobs').get('job-atomic-video');
      request.onsuccess = () => resolve(request.result?.costUsd ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return cost;
  });
  expect(jobCost).toBeNull();
});
