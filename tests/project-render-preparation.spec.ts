import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProjectRender } from '../src/services/projectRenderPreparation.ts';

const input = {
  projectId: 'project-1',
  scenes: [{ id: 'scene-1', title: 'Opening', duration: 4 }],
  timeline: {
    sceneRanges: { 'scene-1': { sourceIn: 0, sourceOut: 4 } },
    sceneInstances: [],
    videoTracks: [{
      id: 'video-track',
      name: 'Video',
      visible: true,
      clips: [{
        id: 'video-clip',
        name: 'Opening shot',
        start: 0,
        duration: 4,
        sourceIn: 0,
        sourceOut: 4,
        projectFileId: 'video-file',
        assetMimeType: 'video/mp4',
        mediaKind: 'video' as const,
      }],
    }],
    audioTracks: [{
      id: 'audio-track',
      name: 'Music',
      muted: false,
      volume: 0.5,
      clips: [{
        id: 'audio-clip',
        name: 'Music bed',
        start: 0,
        duration: 4,
        sourceIn: 0,
        sourceOut: 4,
        assetId: 'audio-asset',
        assetVersionId: 'audio-version',
        assetMimeType: 'audio/mpeg',
        mediaKind: 'audio' as const,
      }],
    }],
    textTracks: [{
      id: 'text-track',
      name: 'Titles',
      visible: true,
      clips: [{ id: 'title-clip', name: 'Title', start: 0, duration: 2, content: 'Hello VYRA' }],
    }],
    transitions: {},
  },
};

test('prepares one immutable render snapshot and resolves its exact visual/audio inventory', async () => {
  const calls: string[] = [];
  const result = await prepareProjectRender(input, {
    resolver: async ({ projectId, source, expectedKind }) => {
      const sourceKey = source.kind === 'project-file'
        ? 'project-file:' + source.projectFileId
        : 'legacy-asset:' + source.assetId + ':' + source.assetVersionId;
      calls.push(sourceKey + ':' + expectedKind);
      const mimeType = expectedKind === 'audio' ? 'audio/mpeg' : 'video/mp4';
      return {
        projectId,
        sourceKey,
        mimeType,
        fileName: sourceKey,
        sizeBytes: 4,
        blob: new Blob(['data'], { type: mimeType }),
        replica: 'offline',
      };
    },
  });

  assert.equal(result.manifest.projectId, 'project-1');
  assert.equal(result.compositionPlan.projectId, 'project-1');
  assert.equal(result.compositionPlan.durationSeconds, 4);
  assert.equal(result.compositionPlan.visuals.length, 1);
  assert.equal(result.compositionPlan.audio.length, 1);
  assert.equal(result.compositionPlan.text[0]?.content, 'Hello VYRA');
  assert.deepEqual(calls, [
    'project-file:video-file:video',
    'legacy-asset:audio-asset:audio-version:audio',
  ]);
  assert.equal(result.resolvedInputs.sources.length, 2);
  assert.equal(Object.isFrozen(result.manifest), true);
  assert.equal(Object.isFrozen(result.compositionPlan), true);
});

test('rejects an invalid timeline before resolving any media bytes', async () => {
  let calls = 0;
  await assert.rejects(() => prepareProjectRender({
    ...input,
    timeline: {
      ...input.timeline,
      videoTracks: [{
        ...input.timeline.videoTracks[0],
        clips: [{ ...input.timeline.videoTracks[0].clips[0], projectFileId: undefined, assetId: undefined, assetVersionId: undefined }],
      }],
    },
  }, {
    resolver: async () => {
      calls += 1;
      throw new Error('resolver should not run for an invalid manifest');
    },
  }), /cannot be snapshotted for rendering/);
  assert.equal(calls, 0);
});

test('keeps source resolution scoped to the manifest Project ID', async () => {
  await assert.rejects(() => prepareProjectRender(input, {
    resolver: async ({ source }) => ({
      projectId: 'another-project',
      sourceKey: source.kind === 'project-file' ? 'project-file:' + source.projectFileId : 'legacy-asset:' + source.assetId + ':' + source.assetVersionId,
      mimeType: source.mimeType ?? 'video/mp4',
      fileName: 'wrong-project',
      sizeBytes: 1,
      blob: new Blob(['x']),
      replica: 'offline',
    }),
  }), /does not match its pinned Project identity/);
});
