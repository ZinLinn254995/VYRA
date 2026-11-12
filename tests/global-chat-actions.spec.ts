import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStoryboardList, isStoryboardListRequest } from '../src/services/globalChatActions.ts';

test('global AI Chat recognizes English and Burmese storyboard list requests', () => {
  assert.equal(isStoryboardListRequest('Show my storyboards'), true);
  assert.equal(isStoryboardListRequest('list storyboards'), true);
  assert.equal(isStoryboardListRequest('ငါ့ Storyboard တွေ ပြပေး'), true);
  assert.equal(isStoryboardListRequest('Create a storyboard about space'), false);
  assert.equal(isStoryboardListRequest('Delete my storyboard'), false);
});

test('storyboard list response uses actual records and reports an honest empty state', () => {
  assert.match(formatStoryboardList([]), /does not have any Storyboards yet/);
  const output = formatStoryboardList([{
    id: 'story-1',
    title: 'ORIGIN Story',
    topic: 'A sample story',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    details: { scenes: [{ id: 'scene-1' }, { id: 'scene-2' }] },
  }]);
  assert.match(output, /ORIGIN Story/);
  assert.match(output, /A sample story/);
  assert.ok(output.includes('2 scene(s)'));
});
