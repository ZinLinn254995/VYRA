import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectRenderManifest, type ProjectRenderManifestInput } from '../src/services/projectRenderManifest.ts';
import { buildProjectRenderCompositionPlan } from '../src/services/projectRenderCompositionPlanner.ts';
import { createProjectRenderInputDigest, createProjectRenderJob, createProjectRenderJobFromInputs, transitionProjectRenderJob } from '../src/services/projectRenderJob.ts';

const at = '2026-11-17T12:00:00.000Z';
const manifestInput = (): ProjectRenderManifestInput => ({
  projectId: 'job-project',
  scenes: [{ id: 'scene-1', title: 'Scene 1', duration: 5 }],
  timeline: {
    videoTracks: [{ id: 'video', clips: [{ id: 'clip', start: 0, duration: 5,
      projectFileId: 'source-video', assetMimeType: 'video/mp4', mediaKind: 'video' }] }],
  },
});
const makeJob = () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  return createProjectRenderJob({
    id: 'render-job-1', ownerId: 'owner-1', idempotencyKey: 'project:job-project:render:1',
    inputDigest: 'a'.repeat(64), manifest, compositionPlan: plan, at,
  });
};

test('creates an immutable Project-owned job with a pinned manifest and composition plan', () => {
  const job = makeJob();
  assert.equal(job.schema, 'vyra.project-render-job');
  assert.equal(job.status, 'queued');
  assert.equal(job.projectId, 'job-project');
  assert.equal(job.ownerId, 'owner-1');
  assert.equal(job.attempt, 1);
  assert.equal(job.progress, 0);
  assert.equal(job.outputProjectFileId, null);
  assert.equal(Object.isFrozen(job), true);
  assert.equal(Object.isFrozen(job.manifest), true);
  assert.equal(Object.isFrozen(job.compositionPlan), true);
  assert.throws(() => createProjectRenderJob({
    id: 'bad', ownerId: 'owner-1', idempotencyKey: 'x', inputDigest: 'bad',
    manifest: job.manifest, compositionPlan: job.compositionPlan, at,
  }), /SHA-256/);
});

test('rejects unsupported or unscoped manifest and composition plan envelopes', () => {
  const job = makeJob();
  assert.throws(() => createProjectRenderJob({
    id: 'bad-manifest', ownerId: 'owner-1', idempotencyKey: 'bad:1', inputDigest: 'a'.repeat(64),
    manifest: { ...job.manifest, version: 99 } as never,
    compositionPlan: job.compositionPlan, at,
  }), /supported Project render manifest/);
  assert.throws(() => createProjectRenderJob({
    id: 'bad-plan', ownerId: 'owner-1', idempotencyKey: 'bad:2', inputDigest: 'a'.repeat(64),
    manifest: job.manifest,
    compositionPlan: { ...job.compositionPlan, projectId: ' ' } as never, at,
  }), /supported immutable Project composition plan/);
});

test('rejects a composition plan that does not match the pinned manifest at job creation', () => {
  const job = makeJob();
  const alteredPlan = JSON.parse(JSON.stringify(job.compositionPlan)) as typeof job.compositionPlan;
  alteredPlan.visuals[0].source = {
    kind: 'project-file', projectFileId: 'unrelated-source', mimeType: 'video/mp4',
  };
  assert.throws(() => createProjectRenderJob({
    id: 'tampered-plan', ownerId: 'owner-1', idempotencyKey: 'tampered:plan',
    inputDigest: 'a'.repeat(64), manifest: job.manifest, compositionPlan: alteredPlan, at,
  }), /does not match the pinned Project render manifest/);
});

test('advances through preparation, rendering and upload before committing a Project File output', () => {
  let job = makeJob();
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 5, at: '2026-11-17T12:00:01.000Z' });
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'rendering', progress: 60, at: '2026-11-17T12:00:02.000Z' });
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'uploading', progress: 95, at: '2026-11-17T12:00:03.000Z' });
  assert.equal(job.outputProjectFileId, null);
  job = transitionProjectRenderJob(job, { type: 'complete', outputProjectFileId: 'rendered-project-file', at: '2026-11-17T12:00:04.000Z' });
  assert.equal(job.status, 'completed');
  assert.equal(job.progress, 100);
  assert.equal(job.outputProjectFileId, 'rendered-project-file');
  assert.equal(job.completedAt, '2026-11-17T12:00:04.000Z');
  assert.throws(() => transitionProjectRenderJob(job, { type: 'fail', error: { code: 'x', message: 'x' }, at }), /terminal/);
});

test('rejects phase regression, non-monotonic progress and completion before upload', () => {
  let job = makeJob();
  assert.throws(() => transitionProjectRenderJob(job, { type: 'advance', status: 'rendering', progress: 20, at }), /preparation first/);
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 20, at });
  assert.throws(() => transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 10, at }), /monotonic/);
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'rendering', progress: 50, at });
  assert.throws(() => transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 60, at }), /backwards/);
  assert.throws(() => transitionProjectRenderJob(job, { type: 'complete', outputProjectFileId: 'not-yet', at }), /uploaded/);
});

test('cancellation is explicit and cannot be followed by rendering progress', () => {
  let job = makeJob();
  job = transitionProjectRenderJob(job, { type: 'request_cancel', at });
  assert.equal(job.status, 'cancel_requested');
  assert.throws(() => transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 1, at }), /active/);
  job = transitionProjectRenderJob(job, { type: 'cancelled', at });
  assert.equal(job.status, 'cancelled');
  assert.throws(() => transitionProjectRenderJob(job, { type: 'retry', at }), /terminal/);
});

test('rejects stale lifecycle events whose timestamps precede the last accepted revision', () => {
  let job = makeJob();
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 10, at: '2026-11-17T12:00:05.000Z' });
  assert.throws(() => transitionProjectRenderJob(job, {
    type: 'advance', status: 'rendering', progress: 20, at: '2026-11-17T12:00:04.000Z',
  }), /update timestamp backwards/);
});

test('failed jobs retry with the same input identity and an incremented attempt', () => {
  let job = makeJob();
  job = transitionProjectRenderJob(job, { type: 'advance', status: 'preparing', progress: 10, at });
  job = transitionProjectRenderJob(job, { type: 'fail', error: { code: 'RENDER_FAILED', message: 'Encoder stopped.' }, at });
  assert.equal(job.status, 'failed');
  assert.equal(job.error?.code, 'RENDER_FAILED');
  const retry = transitionProjectRenderJob(job, { type: 'retry', at: '2026-11-17T12:00:10.000Z' });
  assert.equal(retry.status, 'queued');
  assert.equal(retry.attempt, 2);
  assert.equal(retry.progress, 0);
  assert.equal(retry.inputDigest, job.inputDigest);
  assert.equal(retry.idempotencyKey, job.idempotencyKey);
  assert.equal(retry.error, null);
});

test('computes a stable SHA-256 digest independent of object key order', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const first = await createProjectRenderInputDigest(manifest, plan);
  const reordered = await createProjectRenderInputDigest(
    JSON.parse(JSON.stringify(manifest)) as typeof manifest,
    JSON.parse(JSON.stringify(plan)) as typeof plan,
  );
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, reordered);
});

test('render input digest changes when a render-affecting source changes', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const changedManifest = createProjectRenderManifest({
    ...manifestInput(),
    timeline: { videoTracks: [{ id: 'video', clips: [{ id: 'clip', start: 0, duration: 5,
      projectFileId: 'different-source', assetMimeType: 'video/mp4', mediaKind: 'video' }] }] },
  });
  const changedPlan = buildProjectRenderCompositionPlan(changedManifest);
  assert.notEqual(await createProjectRenderInputDigest(manifest, plan), await createProjectRenderInputDigest(changedManifest, changedPlan));
});

test('rejects non-JSON render digest inputs', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.rejects(
    createProjectRenderInputDigest(manifest, { ...plan, text: circular as never }),
    /circular references/,
  );
});

test('rejects sparse arrays, symbol keys and accessor properties in digest inputs', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const sparse = new Array(2);
  sparse[1] = 'present';
  await assert.rejects(
    createProjectRenderInputDigest(manifest, { ...plan, text: sparse as never }),
    /sparse elements/,
  );
  const symbolKey = { value: 1, [Symbol('hidden')]: 2 };
  await assert.rejects(
    createProjectRenderInputDigest(manifest, { ...plan, text: symbolKey as never }),
    /symbol keys/,
  );
  const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 });
  await assert.rejects(
    createProjectRenderInputDigest(manifest, { ...plan, text: accessor as never }),
    /data properties/,
  );
});

test('rejects a composition plan that diverges from the pinned manifest', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const alteredPlan = JSON.parse(JSON.stringify(plan)) as typeof plan;
  alteredPlan.visuals[0].source = {
    kind: 'project-file', projectFileId: 'unrelated-project-file', mimeType: 'video/mp4',
  };
  alteredPlan.requiredSources = [{
    kind: 'project-file', projectFileId: 'unrelated-project-file', mimeType: 'video/mp4',
  }];
  await assert.rejects(
    createProjectRenderInputDigest(manifest, alteredPlan),
    /does not match the pinned Project render manifest/,
  );
  await assert.rejects(
    createProjectRenderJobFromInputs({
      id: 'render-job-tampered', ownerId: 'owner-1', idempotencyKey: 'tampered:1',
      manifest, compositionPlan: alteredPlan, at,
    }),
    /does not match the pinned Project render manifest/,
  );
});

test('creates a render job with a digest derived from its exact manifest and plan', async () => {
  const manifest = createProjectRenderManifest(manifestInput());
  const plan = buildProjectRenderCompositionPlan(manifest);
  const job = await createProjectRenderJobFromInputs({
    id: 'render-job-derived', ownerId: 'owner-1', idempotencyKey: 'derived:1', manifest, compositionPlan: plan, at,
  });
  assert.equal(job.inputDigest, await createProjectRenderInputDigest(manifest, plan));
  assert.match(job.inputDigest, /^[a-f0-9]{64}$/);
});
