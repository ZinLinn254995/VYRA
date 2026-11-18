import test from 'node:test';
import assert from 'node:assert/strict';
import { mixProjectRenderAudio, type ProjectRenderDecodedAudio } from '../src/services/projectRenderAudioMixer';
import type { ProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner';

function buffer(channels: number[][], sampleRate = 4): ProjectRenderDecodedAudio {
  const data = channels.map((channel) => Float32Array.from(channel));
  return { sampleRate, numberOfChannels: data.length, length: data[0].length, getChannelData: (index) => data[index] };
}
function plan(audio: ProjectRenderCompositionPlan['audio'], durationSeconds = 1): ProjectRenderCompositionPlan {
  return { schema: 'vyra.project-render-composition-plan', version: 1, projectId: 'p1', durationSeconds,
    scenes: [], visuals: [], audio, text: [], transitions: [], requiredSources: [] };
}
const source = { kind: 'project-file' as const, projectFileId: 'audio-1', mimeType: 'audio/wav' };
const layer = (overrides: Partial<ProjectRenderCompositionPlan['audio'][number]> = {}): ProjectRenderCompositionPlan['audio'][number] => ({
  trackId: 'track', clipId: 'clip', layer: 0, startSeconds: 0, endSeconds: 1,
  sourceInSeconds: 0, sourceOutSeconds: 1, gain: 1, source, ...overrides,
});
const key = 'project-file:audio-1';

test('mixes overlapping tracks with their independent gains and deterministic sum', () => {
  const result = mixProjectRenderAudio({ plan: plan([layer(), layer({ trackId: 'music', clipId: 'music-clip', gain: 0.5 })]),
    sources: new Map([[key, buffer([[0.25, 0.5, 0.75, 1]])]]), sampleRate: 4, numberOfChannels: 1 });
  assert.deepEqual([...result.channels[0]], [0.375, 0.75, 1.125, 1.5]);
  assert.equal(result.peak, 1.5);
});

test('resamples linearly and maps mono to stereo', () => {
  const result = mixProjectRenderAudio({ plan: plan([layer()]), sources: new Map([[key, buffer([[0, 1, 0, -1]], 4)]]),
    sampleRate: 8, numberOfChannels: 2 });
  assert.equal(result.length, 8);
  assert.deepEqual([...result.channels[0]], [...result.channels[1]]);
  assert.equal(result.channels[0][1], 0.5);
});

test('honors clip start, source trim, and source end without leaking samples', () => {
  const result = mixProjectRenderAudio({ plan: plan([layer({ startSeconds: 0.5, endSeconds: 1, sourceInSeconds: 0.25, sourceOutSeconds: 0.75 })]),
    sources: new Map([[key, buffer([[0, 0.2, 0.4, 0.6]])]]), sampleRate: 4, numberOfChannels: 1 });
  assert.deepEqual([...result.channels[0]], [0, 0, 0.3, 0.5]);
});

test('rejects missing sources and invalid output formats', () => {
  assert.throws(() => mixProjectRenderAudio({ plan: plan([layer()]), sources: new Map(), sampleRate: 48000 }), /missing/);
  assert.throws(() => mixProjectRenderAudio({ plan: plan([]), sources: new Map(), sampleRate: 1000 }), /sample rate/);
});

test('honors cancellation before mixing', () => {
  const controller = new AbortController();
  controller.abort(new Error('stop'));
  assert.throws(() => mixProjectRenderAudio({ plan: plan([layer()]), sources: new Map([[key, buffer([[1, 1, 1, 1]])]]),
    sampleRate: 4, signal: controller.signal }), /stop/);
});
