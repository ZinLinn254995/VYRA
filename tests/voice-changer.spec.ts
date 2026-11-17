import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVoiceChangerDistortionCurve,
  createVoiceChangerPreset,
  normalizeVoiceChangerSettings,
  VOICE_CHANGER_PRESETS,
} from '../src/services/voiceChanger.ts';

test('provides a useful collection of selectable voice styles', () => {
  assert.deepEqual(VOICE_CHANGER_PRESETS.map((preset) => preset.id), [
    'clean', 'studio', 'radio', 'telephone', 'robot', 'alien', 'deep', 'bright', 'vintage',
  ]);
  assert.equal(createVoiceChangerPreset('robot').enabled, true);
  assert.equal(createVoiceChangerPreset('clean').enabled, false);
});

test('normalizes manual settings and clamps every control to its supported range', () => {
  assert.deepEqual(normalizeVoiceChangerSettings({
    presetId: 'custom', enabled: true, tone: 4, robot: -2,
    distortion: 0.4, echo: Number.NaN, warmth: -4,
  }), {
    presetId: 'custom', enabled: true, tone: 1, robot: 0,
    distortion: 0.4, echo: 0, warmth: -1,
  });
});

test('creates a bounded distortion curve with finite samples', () => {
  const curve = createVoiceChangerDistortionCurve(0.6, 128);
  assert.equal(curve.length, 128);
  assert.ok([...curve].every((sample) => Number.isFinite(sample) && sample >= -1 && sample <= 1));
  assert.throws(() => createVoiceChangerDistortionCurve(0, 31), { name: 'AssertionError' });
});
