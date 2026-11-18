import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectRenderFrameState } from '../src/services/projectRenderFrameScheduler.ts';
import type { ProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner';

const plan = {
  schema: 'vyra.project-render-composition-plan',
  version: 1,
  projectId: 'project-1',
  durationSeconds: 12,
  scenes: [],
  visuals: [
    { kind: 'video', trackId: 'video-2', clipId: 'upper', layer: 2, startSeconds: 0, endSeconds: 8, sourceInSeconds: 3, sourceOutSeconds: 11, source: { kind: 'project-file', projectFileId: 'video-2' } },
    { kind: 'image', trackId: 'video-1', clipId: 'lower', layer: 1, startSeconds: 2, endSeconds: 6, sourceInSeconds: 0, sourceOutSeconds: 4, source: { kind: 'project-file', projectFileId: 'image-1' } },
  ],
  audio: [
    { trackId: 'audio-1', clipId: 'music', layer: 0, startSeconds: 1, endSeconds: 10, sourceInSeconds: 4, sourceOutSeconds: 13, gain: 0.5, source: { kind: 'project-file', projectFileId: 'audio-1' } },
  ],
  text: [
    { trackId: 'text-1', clipId: 'caption', layer: 0, startSeconds: 3, endSeconds: 5, content: 'Hello' },
  ],
  transitions: [],
  requiredSources: [],
} as ProjectRenderCompositionPlan;

test('returns active layers in deterministic stacking order with source timestamps', () => {
  const frame = getProjectRenderFrameState(plan, 4);
  assert.deepEqual(frame.visuals.map((item) => item.clipId), ['lower', 'upper']);
  assert.deepEqual(frame.visuals.map((item) => item.sourceTimeSeconds), [2, 7]);
  assert.equal(frame.audio[0].sourceTimeSeconds, 7);
  assert.equal(frame.text[0].content, 'Hello');
});

test('uses half-open clip windows so adjacent clips do not overlap at a boundary', () => {
  const frame = getProjectRenderFrameState(plan, 6);
  assert.deepEqual(frame.visuals.map((item) => item.clipId), ['upper']);
  assert.equal(frame.text.length, 0);
});

test('rejects timestamps outside the immutable composition duration', () => {
  assert.throws(() => getProjectRenderFrameState(plan, -0.01), /outside the composition duration/);
  assert.throws(() => getProjectRenderFrameState(plan, 12.01), /outside the composition duration/);
});
