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
