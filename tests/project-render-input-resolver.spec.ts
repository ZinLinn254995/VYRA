import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectRenderCompositionInputs } from '../src/services/projectRenderInputResolver.ts';
import type { ProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner.ts';
import type { ProjectRenderResolvedSource } from '../src/services/projectRenderSourceResolver.ts';

const video = { kind: 'project-file' as const, projectFileId: 'video-1', mimeType: 'video/mp4' };
const audio = { kind: 'legacy-asset' as const, assetId: 'audio-1', assetVersionId: 'v2', mimeType: 'audio/mpeg' };

function plan(overrides: Record<string, unknown> = {}): ProjectRenderCompositionPlan {
  return {
    schema: 'vyra.project-render-composition-plan',
    version: 1,
    projectId: 'project-1',
    durationSeconds: 8,
    scenes: [],
    visuals: [{ kind: 'video', trackId: 'v', clipId: 'v1', layer: 0, startSeconds: 0, endSeconds: 8, sourceInSeconds: 0, sourceOutSeconds: 8, source: video }],
    audio: [{ trackId: 'a', clipId: 'a1', layer: 0, startSeconds: 0, endSeconds: 8, sourceInSeconds: 0, sourceOutSeconds: 8, gain: 1, source: audio }],
    text: [],
    transitions: [],
    requiredSources: [video, audio],
    ...overrides,
  } as ProjectRenderCompositionPlan;
}

function resolved(sourceKey: string, projectId = 'project-1', mimeType = 'video/mp4'): ProjectRenderResolvedSource {
  return {
    sourceKey, projectId, mimeType, fileName: 'source', sizeBytes: 1,
    blob: new Blob(['x']), replica: 'offline',
  };
}

test('resolves each pinned source once with its actual media kind', async () => {
  const calls: Array<{ key: string; kind: string }> = [];
  const result = await resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: plan() }, async (input) => {
    const key = input.source.kind === 'project-file'
      ? 'project-file:' + input.source.projectFileId
      : 'legacy-asset:' + input.source.assetId + ':' + input.source.assetVersionId;
    calls.push({ key, kind: input.expectedKind });
    return resolved(key, 'project-1', input.expectedKind === 'audio' ? 'audio/mpeg' : 'video/mp4');
  });
  assert.deepEqual(calls, [
    { key: 'project-file:video-1', kind: 'video' },
    { key: 'legacy-asset:audio-1:v2', kind: 'audio' },
  ]);
  assert.equal(result.sources.length, 2);
});

test('rejects a plan from another Project before resolving any source', async () => {
  let calls = 0;
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-2', compositionPlan: plan() }, async () => {
      calls += 1;
      return resolved('project-file:video-1');
    }),
    /active Project/,
  );
  assert.equal(calls, 0);
});

test('rejects duplicate, unused, or missing required source entries', async () => {
  const base = plan();
  await assert.rejects(() => resolveProjectRenderCompositionInputs({
    projectId: 'project-1',
    compositionPlan: plan({ requiredSources: [video, audio, video] }),
  }), /duplicate required/);
  await assert.rejects(() => resolveProjectRenderCompositionInputs({
    projectId: 'project-1',
    compositionPlan: plan({ requiredSources: [video] }),
  }), /missing a required/);
  await assert.rejects(() => resolveProjectRenderCompositionInputs({
    projectId: 'project-1',
    compositionPlan: plan({ requiredSources: [video, audio, { kind: 'project-file', projectFileId: 'unused' }] }),
  }), /unused required/);
  assert.equal(base.requiredSources.length, 2);
});

test('rejects a source reused across incompatible audio and visual media kinds', async () => {
  const mixed = plan({
    audio: [{ trackId: 'a', clipId: 'a1', layer: 0, startSeconds: 0, endSeconds: 8, sourceInSeconds: 0, sourceOutSeconds: 8, gain: 1, source: video }],
    requiredSources: [video],
  });
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: mixed }),
    /both video and audio media/,
  );
});

test('bounds source resolution concurrency and rejects invalid limits', async () => {
  const sources = Array.from({ length: 5 }, (_, index) => ({
    kind: 'project-file' as const, projectFileId: 'video-' + index, mimeType: 'video/mp4',
  }));
  const visuals = sources.map((source, index) => ({
    kind: 'video' as const, trackId: 'v', clipId: 'clip-' + index, layer: index,
    startSeconds: index, endSeconds: index + 1, sourceInSeconds: 0, sourceOutSeconds: 1, source,
  }));
  const compositionPlan = plan({ visuals, audio: [], requiredSources: sources });
  let active = 0;
  let maximum = 0;
  await resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan, concurrency: 2 }, async (input) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return resolved('project-file:' + (input.source as typeof sources[number]).projectFileId);
  });
  assert.equal(maximum, 2);
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan, concurrency: 7 }),
    /between 1 and 6/,
  );
});


test('rejects inconsistent MIME declarations for the same source identity', async () => {
  const conflicting = plan({
    visuals: [
      { kind: 'video', trackId: 'v', clipId: 'v1', layer: 0, startSeconds: 0, endSeconds: 4, sourceInSeconds: 0, sourceOutSeconds: 4, source: video },
      { kind: 'video', trackId: 'v', clipId: 'v2', layer: 0, startSeconds: 4, endSeconds: 8, sourceInSeconds: 0, sourceOutSeconds: 4, source: { ...video, mimeType: 'video/webm' } },
    ],
    audio: [],
    requiredSources: [video],
  });
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: conflicting }),
    /conflicting immutable identity or MIME metadata/,
  );
});

test('rejects a resolver result whose MIME type conflicts with the pinned source', async () => {
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: plan() }, async (input) => {
      const key = input.source.kind === 'project-file'
        ? 'project-file:' + input.source.projectFileId
        : 'legacy-asset:' + input.source.assetId + ':' + input.source.assetVersionId;
      return resolved(key, 'project-1', 'application/octet-stream');
    }),
    /does not match its pinned Project identity, MIME type, or byte requirements/,
  );
});

test('rejects a resolver result whose source identity or bytes do not match', async () => {
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: plan() }, async () => resolved('project-file:other')),
    /does not match its pinned Project identity/,
  );
  await assert.rejects(
    () => resolveProjectRenderCompositionInputs({ projectId: 'project-1', compositionPlan: plan() }, async (input) => ({
      ...resolved(input.source.kind === 'project-file' ? 'project-file:' + input.source.projectFileId : 'legacy-asset:' + input.source.assetId + ':' + input.source.assetVersionId),
      mimeType: input.expectedKind === 'audio' ? 'audio/mpeg' : 'video/mp4',
      blob: new Blob([]),
    })),
    /contains no bytes/,
  );
});
