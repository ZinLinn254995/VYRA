import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeProjectRenderVideoFrame } from '../src/services/projectRenderVideoDecoder.ts';

class FakeVideo extends EventTarget {
  private _currentTime = 0;
  get currentTime() { return this._currentTime; }
  set currentTime(value: number) {
    this._currentTime = value;
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
  duration = 12;
  videoWidth = 1920;
  videoHeight = 1080;
  readyState = 2;
  preload = '';
  muted = false;
  playsInline = false;
  src = '';
  paused = true;
  removed = false;
  load() {}
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') this.removed = true; }
}

function ports(video: FakeVideo, revoked: string[]) {
  return {
    createVideo: () => video as unknown as HTMLVideoElement,
    createObjectUrl: () => 'blob:render-video',
    revokeObjectUrl: (url: string) => revoked.push(url),
  };
}

test('decodes a video Blob and seeks to the requested source timestamp', async () => {
  const video = new FakeVideo();
  const revoked: string[] = [];
  const result = await decodeProjectRenderVideoFrame({
    blob: new Blob(['video'], { type: 'video/mp4' }),
    mimeType: 'video/mp4',
    timeSeconds: 4.25,
  }, ports(video, revoked));
  assert.equal(result.video, video);
  assert.equal(result.video.currentTime, 4.25);
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  result.dispose();
  result.dispose();
  assert.deepEqual(revoked, ['blob:render-video']);
  assert.equal(video.removed, true);
});

test('rejects timestamps outside the decoded video duration and releases the object URL', async () => {
  const video = new FakeVideo();
  const revoked: string[] = [];
  await assert.rejects(() => decodeProjectRenderVideoFrame({
    blob: new Blob(['video'], { type: 'video/mp4' }),
    mimeType: 'video/mp4',
    timeSeconds: 12,
  }, ports(video, revoked)), /outside the video duration/);
  assert.deepEqual(revoked, ['blob:render-video']);
});

test('rejects mismatched Blob MIME identity before allocating a video element', async () => {
  let created = false;
  await assert.rejects(() => decodeProjectRenderVideoFrame({
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    mimeType: 'video/mp4',
    timeSeconds: 0,
  }, {
    createVideo: () => { created = true; return new FakeVideo() as unknown as HTMLVideoElement; },
    createObjectUrl: () => 'blob:unused',
    revokeObjectUrl: () => {},
  }), /MIME type differs/);
  assert.equal(created, false);
});
