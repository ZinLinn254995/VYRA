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


test('storyboard detail intent extracts a specific title in English and Burmese', async () => {
  const { extractStoryboardDetailTitle } = await import('../src/services/globalChatActions.ts');
  assert.equal(extractStoryboardDetailTitle('Show details of ORIGIN Story'), 'ORIGIN Story');
  assert.equal(extractStoryboardDetailTitle('Tell me about “Space Journey”'), 'Space Journey');
  assert.equal(extractStoryboardDetailTitle('Open storyboard My First Film'), 'My First Film');
  assert.equal(extractStoryboardDetailTitle('ORIGIN Story storyboard အသေးစိတ်ပြပေး'), 'ORIGIN Story');
  assert.equal(extractStoryboardDetailTitle('Show my storyboards'), null);
  assert.equal(extractStoryboardDetailTitle('Create a storyboard about space'), null);
});

test('storyboard detail lookup prefers exact title and formats scene data', async () => {
  const { findStoryboardMatches, formatStoryboardDetail } = await import('../src/services/globalChatActions.ts');
  const items = [
    { id: '1', title: 'Space', topic: 'Exact match', createdAt: '2026-01-01', updatedAt: '2026-01-02', details: { scenes: [{ title: 'Opening', description: 'A quiet sky', duration: 5, transition: 'fade' }] } },
    { id: '2', title: 'Space Journey', topic: 'Related', createdAt: '2026-01-01', updatedAt: '2026-01-02', details: { scenes: [] } },
  ];
  assert.deepEqual(findStoryboardMatches(items, 'Space').map((item) => item.id), ['1']);
  assert.equal(findStoryboardMatches(items, 'space j').length, 1);
  const output = formatStoryboardDetail(items[0]);
  assert.match(output, /Exact match/);
  assert.match(output, /Opening/);
  assert.match(output, /A quiet sky/);
  assert.match(output, /5 sec/);
});


test('global AI Chat recognizes only explicit allowlisted navigation requests', async () => {
  const { extractGlobalChatNavigationTarget } = await import('../src/services/globalChatActions.ts');
  assert.equal(extractGlobalChatNavigationTarget('Go to Workspace'), 'workspace');
  assert.equal(extractGlobalChatNavigationTarget('Open Marketplace'), 'marketplace');
  assert.equal(extractGlobalChatNavigationTarget('Take me to My Vyrals'), 'my-vyrals');
  assert.equal(extractGlobalChatNavigationTarget('Open my Media Library'), 'my-media-library');
  assert.equal(extractGlobalChatNavigationTarget('Workspace ဖွင့်ပေး'), 'workspace');
  assert.equal(extractGlobalChatNavigationTarget('Delete my Vyrals'), null);
  assert.equal(extractGlobalChatNavigationTarget('Create a storyboard'), null);
});
