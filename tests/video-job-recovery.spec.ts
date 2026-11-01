import { test, expect } from '@playwright/test';

const savedJob = {
  jobId: 'test-openrouter-job-123',
  projectId: 'proj-01-quantum',
  projectTitle: 'The Quantum Frontier: Light-Speed Photonic Processing',
  sceneId: 'sc-01',
  sceneOrder: 1,
  model: 'test/video-model',
  prompt: 'A mocked video generation request for recovery testing.',
  visualPrompt: 'Photorealistic macro view of a next-generation optical quantum computing processor with glowing micro-photonic circuits, deep midnight blue and violet studio laboratory lighting',
  cameraMovement: 'Slow inward macro push with shallow depth of field',
  narration: 'Traditional silicon chips have hit a thermal wall. But photons move at the absolute speed of light with zero heat.',
  duration: 4,
  aspectRatio: '9:16',
  status: 'pending',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

async function openWorkspace(page: import('@playwright/test').Page) {
  await page.locator('nav button').nth(4).click();
  await expect(page.getByText(/Storyboard Timeline/)).toBeVisible();
}

async function savePendingJobsInIndexedDb(page: import('@playwright/test').Page, jobs: typeof savedJob[] = [savedJob]) {
  await page.evaluate(async (jobs) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('video-generation-jobs', 'readwrite');
        for (const job of job) transaction.objectStore('video-generation-jobs').put(job);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, jobs);
}

test('a saved OpenRouter video job survives refresh and resumes by its original Job ID', async ({ page }) => {
  let statusRequests = 0;
  let contentRequests = 0;
  let generationRequests = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
  });
  await page.route('**/api/providers/openrouter/videos/generate', async (route) => {
    generationRequests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'A duplicate generation request was made.' }) });
  });
  await page.route('**/api/providers/openrouter/videos/test-openrouter-job-123', async (route) => {
    statusRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: savedJob.jobId, generationId: 'gen-video-test-456', status: 'completed', costUsd: 0.001 }),
    });
  });
  await page.route('**/api/providers/openrouter/videos/test-openrouter-job-123/content', async (route) => {
    contentRequests += 1;
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 0, 102, 116, 121, 112]) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openWorkspace(page);
  // Let the initial empty-job lookup finish before inserting the simulated pre-refresh job.
  await page.waitForTimeout(250);
  expect(statusRequests).toBe(0);
  await savePendingJobInIndexedDb(page);

  // A full reload simulates closing and reopening the workspace. The next visit
  // must recover the saved provider job rather than submit a second generation.
  await page.reload();
  await openWorkspace(page);

  await expect.poll(async () => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ id: string; scenes: Array<{ id: string; generatedVideoId?: string }> }>;
    return projects.find(project => project.id === 'proj-01-quantum')?.scenes.find(scene => scene.id === 'sc-01')?.generatedVideoId || '';
  })).not.toBe('');

  const recoveredJob = await page.evaluate(async (jobId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vyra-media-library', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ generationId?: string; costUsd?: number } | undefined>((resolve, reject) => {
        const request = db.transaction('video-generation-jobs', 'readonly').objectStore('video-generation-jobs').get(jobId);
        request.onsuccess = () => resolve(request.result as { generationId?: string; costUsd?: number } | undefined);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, savedJob.jobId);
  expect(recoveredJob?.generationId).toBe('gen-video-test-456');
  expect(recoveredJob?.costUsd).toBe(0.001);
  expect(statusRequests).toBe(1);
  expect(contentRequests).toBe(1);
  expect(generationRequests).toBe(0);
});


test('multiple saved OpenRouter video jobs recover sequentially without duplicate generation', async ({ page }) => {
  const jobIds = [savedJob.jobId, 'test-openrouter-job-456'];
  const statusRequests: string[] = [];
  const contentRequests: string[] = [];
  let generationRequests = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('vyra_openrouter_key_session', 'or-test-key-not-a-real-secret');
  });
  await page.route('**/api/providers/openrouter/videos/generate', async (route) => {
    generationRequests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'A duplicate generation request was made.' }) });
  });
  await page.route(/\/api\/providers\/openrouter\/videos\/([^/]+)$/, async (route) => {
    const jobId = new URL(route.request().url()).pathname.split('/').pop() || '';
    statusRequests.push(jobId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId, generationId: 'gen-' + jobId, status: 'completed', costUsd: 0.002 }),
    });
  });
  await page.route(/\/api\/providers\/openrouter\/videos\/([^/]+)\/content$/, async (route) => {
    const jobId = new URL(route.request().url()).pathname.split('/').slice(-2, -1)[0];
    contentRequests.push(jobId);
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 0, 102, 116, 121, 112]) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openWorkspace(page);
  await page.waitForTimeout(250);

  const secondJob = await page.evaluate((baseJob) => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{
      id: string;
      title: string;
      scenes: Array<{ id: string; order?: number; visualPrompt: string; cameraMovement: string; narration: string }>;
    }>;
    const project = projects.find((item) => item.id === baseJob.projectId);
    const scene = project?.scenes.find((item) => item.id !== baseJob.sceneId);
    if (!project || !scene) throw new Error('A second scene is required for the sequential recovery test.');
    return {
      ...baseJob,
      jobId: 'test-openrouter-job-456',
      sceneId: scene.id,
      sceneOrder: 2,
      visualPrompt: scene.visualPrompt,
      cameraMovement: scene.cameraMovement,
      narration: scene.narration,
      prompt: 'A second mocked video generation request for recovery testing.',
      status: 'pending' as const,
      savedVideoId: undefined,
      generationId: undefined,
      costUsd: undefined,
    };
  }, savedJob);
  await savePendingJobsInIndexedDb(page, [savedJob, secondJob]);

  await page.reload();
  await openWorkspace(page);

  await expect.poll(async () => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]') as Array<{ id: string; scenes: Array<{ id: string; generatedVideoId?: string }> }>;
    return projects.find(project => project.id === 'proj-01-quantum')?.scenes.filter(scene => Boolean(scene.generatedVideoId)).length || 0;
  })).toBeGreaterThanOrEqual(2);

  expect(statusRequests.sort()).toEqual([...jobIds].sort());
  expect(contentRequests.sort()).toEqual([...jobIds].sort());
  expect(generationRequests).toBe(0);
});
