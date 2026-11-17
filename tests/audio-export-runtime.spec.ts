import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioExportTrackWindow, createNarrationDuckingSchedule, createSceneSoundEffectSchedule } from '../src/services/audioExportRuntime';
test('music track window supports a looping bed and narration ducks only its overlap', () => {
 const window=createAudioExportTrackWindow(10,30,true); assert.equal(window.startsAt,10); assert.equal(window.endsAt,Number.POSITIVE_INFINITY);
 assert.deepEqual(createNarrationDuckingSchedule(15,4,window,0.3),{startsAt:15,attackEndsAt:15.12,holdStartsAt:18.92,releaseEndsAt:19.18,level:0.3});
});
test('ducking is skipped when narration does not overlap the music track',()=>{const window=createAudioExportTrackWindow(20,8,false);assert.equal(createNarrationDuckingSchedule(5,4,window,0.25),null);assert.equal(createNarrationDuckingSchedule(29,4,window,0.25),null);});
test('ducking is bounded to the music window and clamps its level',()=>{const window=createAudioExportTrackWindow(12,5,false);assert.deepEqual(createNarrationDuckingSchedule(10,10,window,4),{startsAt:12,attackEndsAt:12.12,holdStartsAt:16.92,releaseEndsAt:17.18,level:0.8});});
test('scene-scoped SFX starts at its scene-relative offset and fades at scene end',()=>{assert.deepEqual(createSceneSoundEffectSchedule(100,6,2,0.7,0.5,1.5),{startsAt:102,endsAt:106,volume:0.7,fadeInSeconds:0.5,fadeOutSeconds:1.5,fadeOutStartsAt:104.5});});
test('scene-scoped SFX outside the selected scene is not scheduled',()=>{assert.equal(createSceneSoundEffectSchedule(100,6,6,1,0,0),null);});
test('scene-scoped SFX clamps unsafe values before scheduling',()=>{assert.deepEqual(createSceneSoundEffectSchedule(10,4,-5,5,99,-1),{startsAt:10,endsAt:14,volume:1,fadeInSeconds:30,fadeOutSeconds:0,fadeOutStartsAt:14});});

import { createVideoExportRecorder, VIDEO_EXPORT_MIME_CANDIDATES, type VideoExportRecorderConstructor } from '../src/services/videoExportRecorder';

test('video recorder prefers MP4 and falls back when a supported constructor rejects it', () => {
  const attempted: string[] = [];
  class FakeRecorder {
    mimeType: string;
    static isTypeSupported(type: string) { return VIDEO_EXPORT_MIME_CANDIDATES.includes(type as typeof VIDEO_EXPORT_MIME_CANDIDATES[number]); }
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      const mimeType = options?.mimeType || '';
      attempted.push(mimeType);
      if (mimeType.startsWith('video/mp4')) throw new Error('MP4 encoder unavailable');
      this.mimeType = mimeType;
    }
  }
  const { recorder, mimeType } = createVideoExportRecorder(
    {} as MediaStream,
    FakeRecorder as unknown as VideoExportRecorderConstructor,
  );
  assert.equal(mimeType, 'video/webm;codecs=vp9');
  assert.equal((recorder as unknown as FakeRecorder).mimeType, mimeType);
  assert.deepEqual(attempted, ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9']);
});

test('video recorder skips unsupported formats and reports when no format is available', () => {
  class UnsupportedRecorder {
    static isTypeSupported(_type: string) { return false; }
    constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}
  }
  assert.throws(
    () => createVideoExportRecorder({} as MediaStream, UnsupportedRecorder as unknown as VideoExportRecorderConstructor),
    /cannot encode an export format supported by VYRA/,
  );
});

test('video recorder reports the last constructor failure when all supported formats fail', () => {
  class RejectingRecorder {
    static isTypeSupported(_type: string) { return true; }
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      throw new Error('rejected ' + options?.mimeType);
    }
  }
  assert.throws(
    () => createVideoExportRecorder({} as MediaStream, RejectingRecorder as unknown as VideoExportRecorderConstructor),
    /rejected video\/webm$/,
  );
});
