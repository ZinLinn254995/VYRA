import { test, expect } from '@playwright/test';
import { stat } from 'node:fs/promises';

test('full video export records a mixed audio stream with voiceover, music, and scene SFX', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeMediaRecorder = window.MediaRecorder;
    class ObservedMediaRecorder extends NativeMediaRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        (window as any).__vyraExportTrackKinds = stream.getTracks().map((track) => track.kind);
        super(stream, options);
        (window as any).__vyraExportMimeType = this.mimeType;
      }
      static isTypeSupported(type: string) {
        return NativeMediaRecorder.isTypeSupported(type);
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: ObservedMediaRecorder });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('nav button').nth(4)).toBeVisible();

  await page.evaluate(async () => {
    const projectId = 'proj-01-quantum';
    const sceneId = 'sc-01';
    const videoId = 'e2e-export-video';
    const voiceId = 'e2e-export-voice';
    const musicId = 'e2e-export-music';
    const effectId = 'e2e-export-sfx';

    const projects = JSON.parse(localStorage.getItem('vyra_projects_v1') || '[]');
    const project = projects.find((item: any) => item.id === projectId);
    if (!project) throw new Error('Expected E2E seed project was not available.');

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create the synthetic video canvas.');
    const videoStream = canvas.captureStream(15);
    const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('Chromium does not support a WebM MediaRecorder for the audio export test.');
    const recorder = new MediaRecorder(videoStream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const videoBlobPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Could not record the synthetic scene clip.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    });
    recorder.start(100);
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - startedAt;
        context.fillStyle = elapsed % 300 < 150 ? '#172554' : '#312e81';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#ffffff';
        context.fillRect((elapsed / 5) % 130, 30, 24, 24);
        if (elapsed < 1400) requestAnimationFrame(draw);
        else resolve();
      };
      requestAnimationFrame(draw);
    });
    recorder.stop();
    videoStream.getTracks().forEach((track) => track.stop());
    const videoBlob = await videoBlobPromise;
    if (!videoBlob.size) throw new Error('The synthetic scene clip was empty.');

    const makeWav = (seconds: number, frequency: number) => {
      const sampleRate = 22050;
      const sampleCount = Math.floor(sampleRate * seconds);
      const buffer = new ArrayBuffer(44 + sampleCount * 2);
      const view = new DataView(buffer);
      const writeText = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
      };
      writeText(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, 'WAVE');
      writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeText(36, 'data');
      view.setUint32(40, sampleCount * 2, true);
      for (let index = 0; index < sampleCount; index += 1) {
        const envelope = Math.min(1, index / 300, (sampleCount - index) / 500);
        const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.16 * envelope;
        view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
      }
      return new Blob([buffer], { type: 'audio/wav' });
    };
    const voiceBlob = makeWav(0.9, 440);
    const musicBlob = makeWav(2.4, 220);
    const effectBlob = makeWav(0.35, 880);

    const request = indexedDB.open('vyra-media-library', 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('generated-images')) database.createObjectStore('generated-images', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-audio')) database.createObjectStore('generated-audio', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-videos')) database.createObjectStore('generated-videos', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('video-generation-jobs')) database.createObjectStore('video-generation-jobs', { keyPath: 'jobId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the E2E media database.'));
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['generated-videos', 'generated-audio'], 'readwrite');
      transaction.objectStore('generated-videos').put({
        id: videoId, title: 'Synthetic E2E scene', blob: videoBlob, model: 'E2E', costUsd: null,
        projectId, sceneId, createdAt: new Date().toISOString(),
      });
      const audioStore = transaction.objectStore('generated-audio');
      const createdAt = new Date().toISOString();
      audioStore.put({ id: voiceId, title: 'Synthetic voiceover', blob: voiceBlob, model: 'E2E', voice: 'Synthetic', sourceType: 'voiceover', costUsd: null, projectId, sceneId, createdAt });
      audioStore.put({ id: musicId, title: 'Synthetic music', blob: musicBlob, model: 'E2E', voice: 'Music Track', sourceType: 'uploaded', costUsd: null, projectId, sceneId: '__project_audio_track__', createdAt });
      audioStore.put({ id: effectId, title: 'Synthetic scene effect', blob: effectBlob, model: 'E2E', voice: 'Sound Effect', sourceType: 'uploaded', costUsd: null, projectId, sceneId: '__project_audio_track__', createdAt });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not seed E2E media.'));
      transaction.onabort = () => reject(transaction.error || new Error('E2E media seeding was aborted.'));
    });
    db.close();

    project.scenes = [{ ...project.scenes[0], generatedVideoId: videoId, generatedAudioId: voiceId, duration: 1.4 }];
    project.audioTracks = [
      { id: 'e2e-music-track', mediaId: musicId, name: 'Synthetic music', kind: 'music', enabled: true, startTimeSeconds: 0, volume: 0.3, fadeInSeconds: 0.05, fadeOutSeconds: 0.15, loop: true, duckingEnabled: true, duckingLevel: 0.25 },
      { id: 'e2e-scene-sfx-track', mediaId: effectId, name: 'Synthetic scene effect', kind: 'sound_effect', enabled: true, sceneId, startTimeSeconds: 0.1, volume: 0.7, fadeInSeconds: 0.02, fadeOutSeconds: 0.1 },
    ];
    localStorage.setItem('vyra_projects_v1', JSON.stringify(projects));
  });

  await page.reload();
  await page.locator('nav button').nth(4).click();
  const exportButton = page.getByRole('button', { name: 'Export Full Video' });
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    exportButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.(mp4|webm)$/i);
  const outputPath = await download.path();
  expect(outputPath).toBeTruthy();
  const outputStats = await stat(outputPath!);
  expect(outputStats.size).toBeGreaterThan(0);

  const recordedTrackKinds = await page.evaluate(() => (window as any).__vyraExportTrackKinds as string[]);
  expect(recordedTrackKinds).toContain('video');
  expect(recordedTrackKinds).toContain('audio');
  expect(recordedTrackKinds).toHaveLength(2);
  const mimeType = await page.evaluate(() => (window as any).__vyraExportMimeType as string);
  expect(mimeType).toMatch(/^video\/(mp4|webm)/);
  await expect(page.getByText(/Full video exported with 1 voiceovers and 2 music\/SFX tracks/)).toBeVisible({ timeout: 15000 });
});
