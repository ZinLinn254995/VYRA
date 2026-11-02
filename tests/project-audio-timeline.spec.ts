import { test, expect } from '@playwright/test';

test('Project audio tracks can be uploaded, edited, and restored after refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('nav button').nth(4)).toBeVisible();
  await page.locator('nav button').nth(4).click();
  await expect(page.getByText(/Storyboard Timeline/)).toBeVisible();

  const timeline = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Music & Sound Effects Timeline' }),
  }).first();
  await expect(timeline).toBeVisible();

  await timeline.locator('input[type="file"]').setInputFiles({
    name: 'test-background-music.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('VYRA-test-audio-track'),
  });
  const track = timeline.locator('article').filter({ hasText: 'test-background-music.wav' });
  await expect(track).toBeVisible();
  await expect(track.getByText('Music bed')).toBeVisible();

  const startTime = track.getByLabel('Start time (seconds)');
  await startTime.fill('4.5');
  await expect(startTime).toHaveValue('4.5');

  const volume = track.locator('input[type="range"]').first();
  await volume.fill('0.4');
  await expect(volume).toHaveValue('0.4');

  const loop = track.getByRole('checkbox', { name: 'Loop music until the final video ends' });
  await expect(loop).toBeChecked();
  await loop.uncheck();
  await expect(loop).not.toBeChecked();

  const ducking = track.getByRole('checkbox', { name: 'Lower music during narration' });
  await expect(ducking).toBeChecked();
  const duckingLevel = track.locator('input[type="range"]').nth(1);
  await duckingLevel.fill('0.35');
  await expect(duckingLevel).toHaveValue('0.35');

  await timeline.locator('select[aria-label="New audio track type"]').selectOption('sound_effect');
  await timeline.locator('input[type="file"]').setInputFiles({
    name: 'scene-impact.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('VYRA-test-sfx-track'),
  });
  const effectTrack = timeline.locator('article').filter({ hasText: 'scene-impact.wav' });
  await expect(effectTrack).toBeVisible();
  const sceneScope = effectTrack.locator('select[aria-label^="Scene for"]');
  await expect(sceneScope).toBeVisible();
  expect(await sceneScope.locator('option').count()).toBeGreaterThan(1);
  await sceneScope.selectOption({ index: 1 });
  await expect(sceneScope).not.toHaveValue('');

  await page.reload();
  await page.locator('nav button').nth(4).click();
  const restoredTimeline = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Music & Sound Effects Timeline' }),
  }).first();
  const restoredTrack = restoredTimeline.locator('article').filter({ hasText: 'test-background-music.wav' });
  await expect(restoredTrack).toBeVisible();
  await expect(restoredTrack.getByLabel('Start time (seconds)')).toHaveValue('4.5');
  await expect(restoredTrack.locator('input[type="range"]')).toHaveValue('0.4');
  await expect(restoredTrack.getByRole('checkbox', { name: 'Loop music until the final video ends' })).not.toBeChecked();
  await expect(restoredTrack.getByRole('checkbox', { name: 'Lower music during narration' })).toBeChecked();
  await expect(restoredTrack.locator('input[type="range"]').nth(1)).toHaveValue('0.35');

  const restoredEffect = restoredTimeline.locator('article').filter({ hasText: 'scene-impact.wav' });
  await expect(restoredEffect).toBeVisible();
  await expect(restoredEffect.locator('select[aria-label^="Scene for"]')).not.toHaveValue('');

  await restoredEffect.getByRole('button', { name: 'Remove' }).click();
  await restoredTrack.getByRole('button', { name: 'Remove' }).click();
  await expect(restoredTimeline.getByText('No music or sound effects added yet.')).toBeVisible();
});
