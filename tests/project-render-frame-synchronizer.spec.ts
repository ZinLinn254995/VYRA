import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeProjectRenderFrame } from '../src/services/projectRenderFrameSynchronizer.ts';
import type { ProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner.ts';
import type { ProjectRenderResolvedSource } from '../src/services/projectRenderSourceResolver.ts';

function source(id: string, mimeType: string): ProjectRenderResolvedSource {
  return { sourceKey: 'project-file:' + id, projectId: 'project-1', mimeType,
    fileName: id, sizeBytes: 4, blob: new Blob(['data'], { type: mimeType }), replica: 'offline' };
}

function plan(visuals: ProjectRenderCompositionPlan['visuals']): ProjectRenderCompositionPlan {
  return { schema: 'vyra.project-render-composition-plan', version: 1, projectId: 'project-1',
    durationSeconds: 10, scenes: [], visuals, audio: [], text: [], transitions: [],
    requiredSources: [...new Map(visuals.map((item) => [item.source.kind === 'project-file'
      ? 'project-file:' + item.source.projectFileId : 'legacy-asset:' + item.source.assetId + ':' + item.source.assetVersionId, item.source])).values()] };
}

function videoLayer(clipId: string, sourceTimeSeconds: number) {
  return { kind: 'video' as const, trackId: 'track-a', clipId, layer: 0, startSeconds: 0,
    endSeconds: 5, sourceInSeconds: sourceTimeSeconds, sourceOutSeconds: sourceTimeSeconds + 5,
    sourceTimeSeconds, source: { kind: 'project-file' as const, projectFileId: 'video-1', mimeType: 'video/mp4' } };
}

test('decodes repeated video clips independently at their own source timestamps', async () => {
  const calls: number[] = [];
  const disposed: number[] = [];
  const resolved = source('video-1', 'video/mp4');
  const result = await synchronizeProjectRenderFrame({
    plan: plan([videoLayer('clip-a', 1), videoLayer('clip-b', 4)]),
    timeSeconds: 0,
    resolvedSources: new Map([[resolved.sourceKey, resolved]]),
  }, {
    createImageBitmap: async () => { throw new Error('unexpected image decode'); },
    decodeVideo: async ({ timeSeconds }) => {
      calls.push(timeSeconds);
      const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
      return { video, durationSeconds: 12, width: 1920, height: 1080, dispose: () => disposed.push(timeSeconds) };
    },
  });
  assert.deepEqual(calls.sort(), [1, 4]);
  assert.equal(result.sources.size, 2);
  result.dispose();
  result.dispose();
  assert.deepEqual(disposed.sort(), [1, 4]);
});

test('decodes a shared image once and closes it once when the frame is disposed', async () => {
  let decodes = 0;
  let closes = 0;
  const resolved = source('image-1', 'image/png');
  const image = { width: 800, height: 600, close: () => { closes += 1; } } as unknown as ImageBitmap;
  const layer = (clipId: string) => ({ ...videoLayer(clipId, 0), kind: 'image' as const,
    source: { kind: 'project-file' as const, projectFileId: 'image-1', mimeType: 'image/png' } });
  const result = await synchronizeProjectRenderFrame({
    plan: plan([layer('image-a'), layer('image-b')]),
    timeSeconds: 0,
    resolvedSources: new Map([[resolved.sourceKey, resolved]]),
  }, {
    createImageBitmap: async () => { decodes += 1; return image; },
    decodeVideo: async () => { throw new Error('unexpected video decode'); },
  });
  assert.equal(decodes, 1);
  assert.equal(result.sources.size, 2);
  result.dispose();
  assert.equal(closes, 1);
});

test('disposes already decoded video sources when another active source fails', async () => {
  const first = source('video-1', 'video/mp4');
  const second = source('video-2', 'video/mp4');
  let disposed = 0;
  await assert.rejects(() => synchronizeProjectRenderFrame({
    plan: plan([videoLayer('clip-a', 1), { ...videoLayer('clip-b', 1),
      source: { kind: 'project-file', projectFileId: 'video-2', mimeType: 'video/mp4' } }]),
    timeSeconds: 0,
    resolvedSources: new Map([[first.sourceKey, first], [second.sourceKey, second]]),
    maxConcurrency: 1,
  }, {
    createImageBitmap: async () => { throw new Error('unexpected image decode'); },
    decodeVideo: async ({ blob }) => {
      if (blob === second.blob) throw new Error('decoder failed');
      return { video: {} as HTMLVideoElement, durationSeconds: 10, width: 1, height: 1, dispose: () => { disposed += 1; } };
    },
  }), /decoder failed/);
  assert.equal(disposed, 1);
});

test('rejects sources resolved for another Project before decoding', async () => {
  const resolved = { ...source('video-1', 'video/mp4'), projectId: 'project-elsewhere' };
  await assert.rejects(() => synchronizeProjectRenderFrame({
    plan: plan([videoLayer('clip-a', 1)]),
    timeSeconds: 0,
    resolvedSources: new Map([[resolved.sourceKey, resolved]]),
  }, {
    createImageBitmap: async () => { throw new Error('unexpected image decode'); },
    decodeVideo: async () => { throw new Error('unexpected video decode'); },
  }), /another Project/);
});
