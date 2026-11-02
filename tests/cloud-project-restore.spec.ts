import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCloudProjects, restoreCloudProject } from '../src/services/cloudProjectRestore.js';

test('restores portable project metadata and storyboard fields with safe defaults', () => {
  const project = restoreCloudProject({
    id: 'cloud-row-1',
    local_id: 'proj-local-1',
    title: 'Space explainer',
    status: 'draft',
    created_at: '2026-10-31T10:00:00.000Z',
    updated_at: '2026-10-31T11:00:00.000Z',
    project_data: {
      topic: 'How black holes work',
      category: 'Science & Future',
      format: 'short_form',
      aspectRatio: '9:16',
      targetDuration: 25,
      targetPlatforms: ['TikTok'],
      productionStage: 'script_review',
      scenes: [{
        id: 'scene-1',
        order: 1,
        narration: 'A black hole bends spacetime.',
        visualPrompt: 'A cinematic black hole',
        cameraMovement: 'Slow push in',
        duration: 8,
        status: 'scripted',
        generatedVideoId: 'must-not-be-restored',
      }],
    },
  });

  assert.ok(project);
  assert.equal(project.id, 'proj-local-1');
  assert.equal(project.title, 'Space explainer');
  assert.equal(project.topic, 'How black holes work');
  assert.equal(project.productionStage, 'script_review');
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].narration, 'A black hole bends spacetime.');
  assert.equal(project.scenes[0].mediaUrl, '', 'missing media must stay empty, not use demo artwork');
  assert.equal(project.scenes[0].generatedVideoId, undefined);
  assert.equal(project.coverImage, '', 'missing cover media must stay empty, not use demo artwork');
});

test('rejects malformed cloud project rows and falls back from unknown enum values', () => {
  assert.equal(restoreCloudProject({
    id: 'bad', local_id: '', title: 'Missing id', status: 'draft',
    created_at: '', updated_at: '', project_data: {},
  }), null);

  const project = restoreCloudProject({
    id: 'cloud-row-2',
    local_id: 'proj-local-2',
    title: 'Untitled import',
    status: 'unknown',
    created_at: '',
    updated_at: '',
    project_data: { category: 'Unknown category', aspectRatio: '4:3', scenes: [] },
  });
  assert.ok(project);
  assert.equal(project.status, 'draft');
  assert.equal(project.category, 'Science & Future');
  assert.equal(project.aspectRatio, '9:16');
});


test('cloud restore merge preserves local projects and deduplicates restored IDs', () => {
  const local = { id: 'local-1', title: 'My local project' } as any;
  const cloudA = { id: 'cloud-1', title: 'Cloud project A' } as any;
  const cloudB = { id: 'cloud-2', title: 'Cloud project B' } as any;
  const duplicateCloudA = { id: 'cloud-1', title: 'Duplicate cloud project A' } as any;
  const duplicateLocal = { id: 'local-1', title: 'Must not replace local project' } as any;

  const merged = mergeCloudProjects([local], [cloudA, duplicateCloudA, duplicateLocal, cloudB]);

  assert.deepEqual(merged.map((project) => project.id), ['cloud-1', 'cloud-2', 'local-1']);
  assert.equal(merged[0], cloudA, 'the first cloud copy is retained');
  assert.equal(merged[2], local, 'the existing local project is never overwritten');
});


test('repeated restores also collapse duplicate IDs already present on this device', () => {
  const firstLocal = { id: 'local-1', title: 'Original local project' } as any;
  const duplicateLocal = { id: 'local-1', title: 'Duplicate local entry' } as any;
  const cloudCopy = { id: 'local-1', title: 'Cloud copy must not overwrite' } as any;
  const newCloud = { id: 'cloud-new', title: 'New cloud project' } as any;

  const merged = mergeCloudProjects([firstLocal, duplicateLocal], [cloudCopy, newCloud]);

  assert.deepEqual(merged.map((project) => project.id), ['cloud-new', 'local-1']);
  assert.equal(merged[1], firstLocal, 'the first local copy remains authoritative');
});
