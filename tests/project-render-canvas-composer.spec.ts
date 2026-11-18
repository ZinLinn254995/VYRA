import test from 'node:test';
import assert from 'node:assert/strict';
import { drawProjectRenderCanvasFrame } from '../src/services/projectRenderCanvasComposer.ts';
import type { ProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner';

function makeContext() {
  const calls: Array<[string, ...unknown[]]> = [];
  const context = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    clearRect: (...args: number[]) => calls.push(['clearRect', ...args]),
    fillRect: (...args: number[]) => calls.push(['fillRect', ...args]),
    drawImage: (...args: unknown[]) => calls.push(['drawImage', ...args]),
    measureText: (value: string) => ({ width: value.length * 10 }),
    fillText: (...args: unknown[]) => calls.push(['fillText', ...args]),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

const plan = {
  schema: 'vyra.project-render-composition-plan',
  version: 1,
  projectId: 'project-1',
  durationSeconds: 4,
  scenes: [],
  visuals: [{
    kind: 'image', trackId: 'visuals', clipId: 'poster', layer: 0,
    startSeconds: 0, endSeconds: 4, sourceInSeconds: 0, sourceOutSeconds: 4,
    source: { kind: 'project-file', projectFileId: 'poster-file' },
  }],
  audio: [],
  text: [{
    trackId: 'titles', clipId: 'title', layer: 0,
    startSeconds: 1, endSeconds: 3, content: 'A simple title',
  }],
  transitions: [],
  requiredSources: [{ kind: 'project-file', projectFileId: 'poster-file' }],
} as ProjectRenderCompositionPlan;

test('composes active decoded visuals and text without changing the immutable plan', () => {
  const { context, calls } = makeContext();
  const source = { naturalWidth: 1600, naturalHeight: 900 } as CanvasImageSource & { naturalWidth: number; naturalHeight: number };
  const originalVisuals = plan.visuals;
  const frame = drawProjectRenderCanvasFrame({
    context, plan, timeSeconds: 2, width: 1280, height: 720,
    sources: new Map([['project-file:poster-file', source]]),
  });
  assert.equal(frame.visuals.length, 1);
  assert.equal(frame.text[0].content, 'A simple title');
  assert.deepEqual(calls.find((call) => call[0] === 'drawImage')?.slice(1), [source, 0, 0, 1280, 720]);
  assert.ok(calls.some((call) => call[0] === 'fillText' && call[1] === 'A simple title'));
  assert.equal(plan.visuals, originalVisuals);
});

test('uses contain geometry for non-matching source and output aspect ratios', () => {
  const { context, calls } = makeContext();
  const source = { naturalWidth: 100, naturalHeight: 200 } as CanvasImageSource & { naturalWidth: number; naturalHeight: number };
  drawProjectRenderCanvasFrame({
    context, plan, timeSeconds: 0, width: 400, height: 200,
    sources: new Map([['project-file:poster-file', source]]),
  });
  assert.deepEqual(calls.find((call) => call[0] === 'drawImage')?.slice(1), [source, 150, 0, 100, 200]);
});

test('rejects missing or undecoded visual sources before silently producing a partial frame', () => {
  const { context } = makeContext();
  assert.throws(() => drawProjectRenderCanvasFrame({
    context, plan, timeSeconds: 0, width: 1280, height: 720, sources: new Map(),
  }), /decoded canvas source is missing/);
  assert.throws(() => drawProjectRenderCanvasFrame({
    context, plan, timeSeconds: 0, width: 1280, height: 720,
    sources: new Map([['project-file:poster-file', {} as CanvasImageSource]]),
  }), /decoded, non-zero dimensions/);
});
