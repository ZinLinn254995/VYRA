import { test, expect } from '@playwright/test';
import { stat } from 'node:fs/promises';

function createWavFixture(durationSeconds = 1.4, sampleRate = 22050): Uint8Array {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 500, (sampleCount - index) / 500);
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.18 * envelope;
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  return bytes;
}

test('full video export records a real scene clip with voiceover, music, and scene SFX', async ({ page }) => {
  const projectId = 'proj-01-quantum';
  const sceneId = 'e2e-export-scene';
  const videoId = 'e2e-export-video';
  const voiceId = 'e2e-export-voice';
  const musicId = 'e2e-export-music';
  const sfxId = 'e2e-export-sfx';

  const project = {
    id: projectId,
    title: 'VYRA Export Integration Fixture',
    topic: 'Browser media export integration test',
    category: 'Tech & AI',
    format: 'short_form',
    aspectRatio: '16:9',
    visualStyle: 'cyber_minimal',
    narrationStyle: 'energetic_tech',
    subtitleStyle: 'minimal_lower',
    targetDuration: 2,
    targetPlatforms: ['YouTube Shorts'],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coverImage: '',
    scenes: [{
      id: sceneId,
      order: 1,
      narration: 'A short test voiceover for the VYRA export pipeline.',
      visualPrompt: 'Synthetic browser test footage',
      cameraMovement: 'Static',
      duration: 2,
      mediaUrl: '',
      generatedVideoId: videoId,
      generatedAudioId: voiceId,
      status: 'ready',
    }],
    audioTracks: [
      {
        id: 'e2e-music-track',
        mediaId: musicId,
        name: 'integration-test-music.wav',
        kind: 'music',
        startTimeSeconds: 0,
        volume: 0.35,
        fadeInSeconds: 0.1,
        fadeOutSeconds: 0.1,
        loop: true,
        enabled: true,
        duckingEnabled: true,
        duckingLevel: 0.3,
      },
      {
        id: 'e2e-sfx-track',
        mediaId: sfxId,
        name: 'integration-test-scene-sfx.wav',
        kind: 'sound_effect',
        startTimeSeconds: 0.1,
        volume: 0.4,
        fadeInSeconds: 0.05,
        fadeOutSeconds: 0.1,
        loop: false,
        enabled: true,
        sceneId,
      },
    ],
  };

  await page.addInitScript((initialProject) => {
    localStorage.setItem('vyra_projects_v1', JSON.stringify([initialProject]));
  }, project);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('nav button').nth(4).click();
  await expect(page.getByRole('button', { name: 'Export Full Video' })).toBeEnabled();

  const wavBytes = Array.from(createWavFixture());
  await page.evaluate(async ({ projectId, sceneId, videoId, voiceId, musicId, sfxId, wavBytes }) => {
    const openRequest = indexedDB.open('vyra-media-library', 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains('generated-images')) database.createObjectStore('generated-images', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-audio')) database.createObjectStore('generated-audio', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('generated-videos')) database.createObjectStore('generated-videos', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('video-generation-jobs')) database.createObjectStore('video-generation-jobs', { keyPath: 'jobId' });
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context || typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      db.close();
      throw new Error('Chromium does not expose the media APIs required for the export integration test.');
    }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      db.close();
      throw new Error('Chromium has no supported WebM MediaRecorder format for the test fixture.');
    }

    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const videoBlobPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Could not create the synthetic scene video fixture.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    recorder.start(100);
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - startedAt;
        context.fillStyle = '#10152f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#55f4ff';
        context.fillRect((elapsed / 4) % 260, 55, 60, 60);
        context.fillStyle = '#ffffff';
        context.font = '20px sans-serif';
        context.fillText('VYRA EXPORT TEST', 12, 30);
        if (elapsed < 1400) requestAnimationFrame(draw);
        else resolve();
      };
      requestAnimationFrame(draw);
    });
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    const videoBlob = await videoBlobPromise;
    if (!videoBlob.size) {
      db.close();
      throw new Error('The synthetic scene video fixture was empty.');
    }

    const wavBlob = new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' });
    const now = new Date().toISOString();
    const records = [
      {
        store: 'generated-videos',
        value: { id: videoId, title: 'Synthetic scene clip.webm', blob: videoBlob, model: 'Playwright MediaRecorder', costUsd: null, projectId, sceneId, createdAt: now },
      },
      ...[
        { id: voiceId, title: 'Synthetic voiceover.wav', voice: 'Test voice' },
        { id: musicId, title: 'Synthetic music.wav', voice: 'Music Track' },
        { id: sfxId, title: 'Synthetic scene SFX.wav', voice: 'Sound Effect' },
      ].map((audio) => ({
        store: 'generated-audio',
        value: { ...audio, blob: wavBlob, model: 'Playwright WAV fixture', sourceType: audio.id === voiceId ? 'voiceover' : 'uploaded', costUsd: null, projectId, sceneId, createdAt: now },
      })),
    ];

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['generated-videos', 'generated-audio'], 'readwrite');
      for (const record of records) transaction.objectStore(record.store).put(record.value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, { projectId, sceneId, videoId, voiceId, musicId, sfxId, wavBytes });

  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('button', { name: 'Export Full Video' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.(mp4|webm)$/i);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const downloadedFile = await stat(downloadedPath!);
  expect(downloadedFile.size).toBeGreaterThan(1_000);

  await expect(page.getByText(/Export complete\. Downloaded 1 scenes as one (MP4|WEBM) video/i)).toBeVisible();
  await expect(page.getByText(/Full video exported with 1 voiceovers and 2 music\/SFX tracks/)).toBeVisible();

  const outputBytes = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of outputBytes) chunks.push(Buffer.from(chunk));
  const output = Buffer.concat(chunks);
  const mediaTracks = await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The exported video could not be decoded by Chromium.'));
    });
    const stream = video.captureStream();
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const result = {
      duration: video.duration,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    };
    video.pause();
    stream.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(url);
    return result;
  }, Array.from(output));

  expect(mediaTracks.duration).toBeGreaterThan(0);
  expect(mediaTracks.videoTracks).toBeGreaterThan(0);
  expect(mediaTracks.audioTracks).toBeGreaterThan(0);
});
