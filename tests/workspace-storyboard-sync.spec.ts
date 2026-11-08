import assert from 'node:assert/strict';
import test from 'node:test';
import { isPersistableStoryboardId, mergeWorkspaceStoryboards, type WorkspaceStoryboard } from '../src/services/workspaceStoryboards.ts';

const uuid = '4f6d1f2a-8b3c-4d5e-9a7b-1c2d3e4f5a6b';
const item = (overrides: Partial<WorkspaceStoryboard> = {}): WorkspaceStoryboard => ({
  id: uuid, title: 'Storyboard', topic: 'Idea', createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z', details: { category: 'Short film' }, ...overrides,
});

test('only UUID-backed creator storyboards are synchronized', () => {
  assert.equal(isPersistableStoryboardId(uuid), true);
  assert.equal(isPersistableStoryboardId('demo-storyboard'), false);
});

test('newer local edits win and are queued for cloud upload', () => {
  const local = item({ title: 'Latest', updatedAt: '2026-11-04T00:00:00.000Z' });
  const remote = item({ title: 'Old', updatedAt: '2026-11-03T00:00:00.000Z' });
  const result = mergeWorkspaceStoryboards([local], [remote]);
  assert.equal(result.storyboards[0].title, 'Latest');
  assert.deepEqual(result.pending, [local]);
});

test('newer cloud revisions win without being queued for overwrite', () => {
  const local = item({ title: 'Old', updatedAt: '2026-11-03T00:00:00.000Z' });
  const remote = item({ title: 'Cloud latest', updatedAt: '2026-11-04T00:00:00.000Z' });
  const result = mergeWorkspaceStoryboards([local], [remote]);
  assert.equal(result.storyboards[0].title, 'Cloud latest');
  assert.deepEqual(result.pending, []);
});

test('cloud-only records and local demo records are both retained', () => {
  const remote = item({ id: '6f6d1f2a-8b3c-4d5e-9a7b-1c2d3e4f5a6b', title: 'Cloud only' });
  const demo = item({ id: 'demo-storyboard', title: 'Local demo' });
  const result = mergeWorkspaceStoryboards([demo], [remote]);
  assert.deepEqual(new Set(result.storyboards.map((entry) => entry.id)), new Set([remote.id, demo.id]));
  assert.deepEqual(result.pending, []);
});


test('Storyboard suggestion cache ignores AI-filled title/topic but changes after creator edits', () => {
  const seed = workspaceStoryboardSuggestionKey('A city at night', '', {});
  const aiFilled = workspaceStoryboardSuggestionKey('Neon City', 'A city at night becomes a place of discovery.', {
    title: 'ai_suggested',
    topic: 'ai_suggested',
  });
  assert.equal(aiFilled, seed);

  const creatorEdited = workspaceStoryboardSuggestionKey('My Neon City', 'A city at night becomes a place of discovery.', {
    title: 'creator_edited',
    topic: 'ai_suggested',
  });
  assert.notEqual(creatorEdited, seed);
});
