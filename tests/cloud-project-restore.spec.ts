import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreCloudProject } from '../src/services/cloudProjectRestore.js';

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
  assert.equal(project.scenes[0].mediaUrl, '/src/assets/images/scene_quantum_chip_1792925206672.jpg');
  assert.equal(project.scenes[0].generatedVideoId, undefined);
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
