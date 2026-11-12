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


test('storyboard create intent requires a topic and parses optional titles', async () => {
  const { extractStoryboardCreateRequest, isStoryboardCreateIntent } = await import('../src/services/globalChatActions.ts');
  assert.equal(isStoryboardCreateIntent('Create a storyboard'), true);
  assert.equal(extractStoryboardCreateRequest('Create a storyboard'), null);
  assert.deepEqual(extractStoryboardCreateRequest('Create a storyboard about a space adventure'), {
    title: '', topic: 'a space adventure',
  });
  assert.deepEqual(extractStoryboardCreateRequest('Create a storyboard titled "Moon Journey" about a child exploring the moon'), {
    title: 'Moon Journey', topic: 'a child exploring the moon',
  });
  assert.deepEqual(extractStoryboardCreateRequest('အာကာသခရီး အကြောင်း storyboard ဖန်တီးပေး'), {
    title: '', topic: 'အာကာသခရီး',
  });
  assert.equal(isStoryboardCreateIntent('Show my storyboards'), false);
  assert.equal(isStoryboardCreateIntent('Delete my storyboard'), false);
});

test('storyboard creation requires an explicit confirmation phrase', async () => {
  const { isStoryboardCreateConfirmation, formatStoryboardCreateDraft } = await import('../src/services/globalChatActions.ts');
  assert.equal(isStoryboardCreateConfirmation('Confirm create'), true);
  assert.equal(isStoryboardCreateConfirmation('အတည်ပြု'), true);
  assert.equal(isStoryboardCreateConfirmation('yes'), false);
  const preview = formatStoryboardCreateDraft({ id: 'draft-1', title: 'Moon Journey', topic: 'A child explores the moon' });
  assert.match(preview, /Nothing has been saved yet/);
  assert.match(preview, /Confirm create/);
});


test('storyboard update intent parses only explicit title and topic changes', async () => {
  const { extractStoryboardUpdateRequest, isStoryboardUpdateIntent } = await import('../src/services/globalChatActions.ts');
  assert.equal(isStoryboardUpdateIntent('Update storyboard "Moon Journey" topic to A child explores Mars'), true);
  assert.deepEqual(extractStoryboardUpdateRequest('Update storyboard "Moon Journey" topic to A child explores Mars'), {
    storyboardTitle: 'Moon Journey', field: 'topic', value: 'A child explores Mars',
  });
  assert.deepEqual(extractStoryboardUpdateRequest('Change storyboard "Moon Journey" title to Mars Explorer'), {
    storyboardTitle: 'Moon Journey', field: 'title', value: 'Mars Explorer',
  });
  assert.deepEqual(extractStoryboardUpdateRequest('Storyboard Moon Journey ရဲ့ topic ကို အင်္ဂါဂြိုဟ်ခရီး ပြောင်းပေး'), {
    storyboardTitle: 'Moon Journey', field: 'topic', value: 'အင်္ဂါဂြိုဟ်ခရီး',
  });
  assert.equal(extractStoryboardUpdateRequest('Update storyboard Moon topic to ' + 'x'.repeat(1001)), null);
  assert.equal(isStoryboardUpdateIntent('Show my storyboards'), false);
  assert.equal(isStoryboardUpdateIntent('Create a storyboard about Mars'), false);
  assert.equal(isStoryboardUpdateIntent('Delete storyboard Moon Journey'), false);
});

test('storyboard update preview and confirmation are explicit', async () => {
  const { formatStoryboardUpdateDraft, isStoryboardUpdateConfirmation } = await import('../src/services/globalChatActions.ts');
  const preview = formatStoryboardUpdateDraft({
    id: 'draft-1', storyboardId: 'story-1', storyboardTitle: 'Moon Journey',
    field: 'topic', previousValue: 'A child explores the moon', expectedUpdatedAt: '2026-01-02T00:00:00.000Z', nextValue: 'A child explores Mars',
  });
  assert.match(preview, /Nothing has been changed yet/);
  assert.match(preview, /A child explores Mars/);
  assert.equal(isStoryboardUpdateConfirmation('Confirm update'), true);
  assert.equal(isStoryboardUpdateConfirmation('အတည်ပြု'), true);
  assert.equal(isStoryboardUpdateConfirmation('yes'), false);
});


test('storyboard delete intent requires a named storyboard and rejects unrelated destructive requests', async () => {
  const {
    extractStoryboardDeleteTitle,
    isStoryboardDeleteIntent,
  } = await import('../src/services/globalChatActions.ts');
  assert.equal(isStoryboardDeleteIntent('Delete storyboard "Moon Journey"'), true);
  assert.equal(extractStoryboardDeleteTitle('Delete storyboard "Moon Journey"'), 'Moon Journey');
  assert.equal(extractStoryboardDeleteTitle('Remove the storyboard Mars Explorer'), 'Mars Explorer');
  assert.equal(isStoryboardDeleteIntent('Storyboard Moon Journey ကို ဖျက်ပေး'), true);
  assert.equal(extractStoryboardDeleteTitle('Storyboard Moon Journey ကို ဖျက်ပေး'), 'Moon Journey');
  assert.equal(isStoryboardDeleteIntent('Delete my Vyrals'), false);
  assert.equal(isStoryboardDeleteIntent('Delete storyboard'), true);
  assert.equal(extractStoryboardDeleteTitle('Delete storyboard'), null);
  assert.equal(isStoryboardDeleteIntent('Show my storyboards'), false);
  assert.equal(isStoryboardDeleteIntent('Create a storyboard about Mars'), false);
});

test('storyboard delete requires a specific confirmation phrase', async () => {
  const {
    formatStoryboardDeleteDraft,
    isStoryboardDeleteConfirmation,
  } = await import('../src/services/globalChatActions.ts');
  const preview = formatStoryboardDeleteDraft({
    id: 'delete-draft-1',
    storyboardId: 'story-1',
    storyboardTitle: 'Moon Journey',
    expectedUpdatedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.match(preview, /Nothing has been deleted yet/);
  assert.match(preview, /cannot be undone/);
  assert.equal(isStoryboardDeleteConfirmation('Confirm delete'), true);
  assert.equal(isStoryboardDeleteConfirmation('ဖျက်ရန် အတည်ပြု'), true);
  assert.equal(isStoryboardDeleteConfirmation('yes'), false);
  assert.equal(isStoryboardDeleteConfirmation('Confirm update'), false);
});


test('Vyral creation is initiated through AI Chat with a named draft and explicit confirmation', async () => {
  const {
    extractVyralCreateRequest,
    formatVyralCreateDraft,
    isVyralCreateConfirmation,
    isVyralCreateIntent,
  } = await import('../src/services/globalChatActions.ts');
  assert.equal(isVyralCreateIntent('Create a Vyral'), true);
  assert.equal(isVyralCreateIntent('Create a Vyral named "ORIGIN Story" about a foundational sample'), true);
  assert.deepEqual(extractVyralCreateRequest('Create a Vyral named "ORIGIN Story" about a foundational sample'), {
    name: 'ORIGIN Story',
    description: 'a foundational sample',
  });
  assert.deepEqual(extractVyralCreateRequest('Create Vyral: Space Worlds — reusable science-fiction locations'), {
    name: 'Space Worlds',
    description: 'reusable science-fiction locations',
  });
  assert.deepEqual(extractVyralCreateRequest('Vyral အသစ် ဖန်တီးပေး: အာကာသကမ္ဘာ အကြောင်း သိပ္ပံစိတ်ကူးယဉ် asset စုစည်းမှု'), {
    name: 'အာကာသကမ္ဘာ',
    description: 'သိပ္ပံစိတ်ကူးယဉ် asset စုစည်းမှု',
  });
  assert.equal(extractVyralCreateRequest('Create a Vyral'), null);
  assert.equal(isVyralCreateIntent('Show my Vyrals'), false);
  assert.equal(isVyralCreateIntent('Delete my Vyrals'), false);
  assert.equal(isVyralCreateConfirmation('Confirm Vyral create'), true);
  assert.equal(isVyralCreateConfirmation('Vyral ဖန်တီးရန် အတည်ပြု'), true);
  assert.equal(isVyralCreateConfirmation('yes'), false);
  const preview = formatVyralCreateDraft({ id: 'draft-1', name: 'ORIGIN Story', description: 'A sample collection' });
  assert.match(preview, /Nothing has been created yet/);
  assert.match(preview, /initial identity DNA/);
});


test('AI Chat routes attached files into a specifically named Vyral only after confirmation', async () => {
  const {
    extractVyralAssetUploadTarget,
    formatVyralAssetUploadDraft,
    isVyralAssetUploadConfirmation,
  } = await import('../src/services/globalChatActions.ts');
  assert.equal(extractVyralAssetUploadTarget('Add this to Vyral "ORIGIN Story"'), 'ORIGIN Story');
  assert.equal(extractVyralAssetUploadTarget('Save the attached file into my Vyral Space Worlds'), 'Space Worlds');
  assert.equal(extractVyralAssetUploadTarget('ဒီဖိုင်ကို Vyral ORIGIN Story ထဲထည့်ပေး'), 'ORIGIN Story');
  assert.equal(extractVyralAssetUploadTarget('Show my Vyrals'), null);
  assert.equal(extractVyralAssetUploadTarget('Delete Vyral ORIGIN Story'), null);
  assert.equal(isVyralAssetUploadConfirmation('Confirm Asset upload'), true);
  assert.equal(isVyralAssetUploadConfirmation('Asset ထည့်ရန် အတည်ပြု'), true);
  assert.equal(isVyralAssetUploadConfirmation('yes'), false);
  const preview = formatVyralAssetUploadDraft({
    id: 'draft-1', vyralId: '00000000-0000-4000-8000-000000000001',
    vyralName: 'ORIGIN Story', fileName: 'circle.png', fileSize: 1024, mimeType: 'image/png',
  });
  assert.match(preview, /Nothing has been uploaded yet/);
  assert.match(preview, /SHA-256 Fingerprint/);
});


test('Vyral context follows natural conversational references without a fixed command', async () => {
  const { findMentionedVyrals, isVyralAssetAddIntent, isVyralAssetContextReference } =
    await import('../src/services/globalChatActions.ts');
  const vyrals = [
    { id: 'v1', name: 'ORIGIN Story', description: 'Foundational sample' },
    { id: 'v2', name: 'Space Worlds', description: 'Science-fiction locations' },
  ];
  assert.deepEqual(findMentionedVyrals("Let's continue working on ORIGIN Story; I have another idea.", vyrals).map((item) => item.id), ['v1']);
  assert.deepEqual(findMentionedVyrals('ဒီပုံကို Space Worlds ထဲ ထည့်ပေး', vyrals).map((item) => item.id), ['v2']);
  assert.deepEqual(findMentionedVyrals('Compare ORIGIN Story with Space Worlds', vyrals).map((item) => item.id).sort(), ['v1', 'v2']);
  assert.deepEqual(findMentionedVyrals("Don't switch to ORIGIN Story", vyrals), []);
  assert.equal(isVyralAssetAddIntent('Could you put this image into the one we were working on?'), true);
  assert.equal(isVyralAssetAddIntent('Please use this image as part of our current Vyral'), true);
  assert.equal(isVyralAssetAddIntent('I want this image to be part of ORIGIN Story'), true);
  assert.equal(isVyralAssetAddIntent('This belongs in Space Worlds'), true);
  assert.equal(isVyralAssetAddIntent('I want this picture in ORIGIN Story'), true);
  assert.equal(isVyralAssetAddIntent('This image should be part of Space Worlds'), true);
  assert.equal(isVyralAssetAddIntent('Please use this image as a reference for my answer'), false);
  assert.equal(isVyralAssetAddIntent('ဒီပုံကို အဲဒီထဲ ထည့်ပေးပါ'), true);
  assert.equal(isVyralAssetAddIntent("Please don't add this file yet"), false);
  assert.equal(isVyralAssetContextReference('Put this there'), true);
  assert.equal(findMentionedVyrals('Continue with ORIGIN Story', [...vyrals, { id: 'v3', name: 'ORIGIN Story' }]).length, 2);
});


test('natural short approvals are accepted only as a contextual response to a pending draft', async () => {
  const { isNaturalChatApproval, isVyralAssetUploadConfirmation } =
    await import('../src/services/globalChatActions.ts');
  for (const phrase of ['yes', 'go ahead', 'looks good', 'အေး လုပ်လိုက်', 'ဟုတ်ပြီ', 'ထည့်လိုက်ပါ']) {
    assert.equal(isNaturalChatApproval(phrase), true, phrase);
  }
  assert.equal(isNaturalChatApproval('yes, but change the name first'), false);
  assert.equal(isVyralAssetUploadConfirmation('Confirm Asset upload'), true);
});
