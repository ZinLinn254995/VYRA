import { test, expect } from '@playwright/test';

test.use({ storageState: './tests/e2e-auth-state.json' });

const storageKey = 'vyra_storyboards_v1:00000000-0000-4000-8000-000000000001';
const storyboardId = 'timeline-regression-storyboard';

const seedStoryboard = (page: import('@playwright/test').Page) => page.addInitScript(({ key, id }) => {
  const now = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify([{
    id,
    title: 'Timeline Regression',
    topic: 'A saved description',
    createdAt: now,
    updatedAt: now,
    details: {
      category: 'Test category',
      scenes: [
        { id: 'scene-one', title: 'First Scene', description: '', duration: 10, transition: 'None' },
        { id: 'scene-two', title: 'Second Scene', description: '', duration: 8, transition: 'None' },
      ],
      masterTimeline: {
        sceneRanges: { 'scene-one': { sourceIn: 0, sourceOut: 10 } },
        transitions: {},
        audioTracks: [],
        textTracks: [],
      },
    },
  }]));
}, { key: storageKey, id: storyboardId });

const openStoryboard = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: 'Open storyboard: Timeline Regression' }).click();
  await expect(page.getByRole('region', { name: 'Master timeline editor' })).toBeVisible();
};

test('Master Timeline edits remain aligned, preserve source scenes, and autosave on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedStoryboard(page);
  await openStoryboard(page);

  const title = page.getByRole('textbox').filter({ hasValue: 'Timeline Regression' });
  await expect(title).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue('A saved description');
  await expect(page.getByLabel('category', { exact: true })).toHaveValue('Test category');

  const editor = page.getByRole('region', { name: 'Master timeline editor' });
  await editor.locator('[title^="First Scene"]').click();
  await page.getByLabel('Scene source in').fill('3');
  await page.getByLabel('Scene source out').fill('6');
  await expect(page.locator('[title^="First Scene"]')).toContainText('3.0s');

  await editor.getByRole('button', { name: 'Add Audio' }).click();
  await editor.getByRole('button', { name: 'Add Text' }).click();
  await expect(editor.getByText('Audio 1')).toBeVisible();
  await expect(editor.getByText('Text 1')).toBeVisible();
  await page.getByLabel('Clip start time').fill('1.5');
  await editor.locator('.cursor-crosshair').click({ position: { x: 140, y: 16 } });
  await editor.getByRole('button', { name: 'Split selected clip' }).click();
  await expect(editor.getByRole('button', { name: 'Audio clip: New audio clip (2)' })).toBeVisible();
  await editor.getByRole('button', { name: 'Duplicate selected clip' }).click();

  const editorViewport = editor.locator('.overflow-auto').first();
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(await editorViewport.evaluate((element) => element.scrollWidth)).toBeGreaterThan(await editorViewport.evaluate((element) => element.clientWidth));

  await expect.poll(() => page.evaluate(({ key, id }) => {
    const records = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ id: string; details?: { masterTimeline?: { sceneInstances?: Array<{ sceneId: string; sourceIn: number; sourceOut: number }> } } }>;
    const timeline = records.find((item) => item.id === id)?.details?.masterTimeline;
    return timeline?.sceneInstances?.find((item) => item.sceneId === 'scene-one')?.sourceOut ?? null;
  }, { key: storageKey, id: storyboardId })).toBe(6);

  const originalDuration = await page.evaluate(({ key, id }) => {
    const records = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ id: string; details?: { scenes?: Array<{ id: string; duration: number }> } }>;
    return records.find((item) => item.id === id)?.details?.scenes?.find((item) => item.id === 'scene-one')?.duration;
  }, { key: storageKey, id: storyboardId });
  expect(originalDuration).toBe(10);

  await page.reload();
  await openStoryboard(page);
  await expect(page.getByLabel('Scene source in')).toHaveValue('3');
  await expect(page.getByLabel('Scene source out')).toHaveValue('6');
  await expect(page.getByText('Audio 1')).toBeVisible();
  await expect(page.getByText('Text 1')).toBeVisible();
});
