import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneStateProposalInstruction, buildSceneVisualContinuityInstruction } from '../src/services/universeSceneStatePrompt.ts';

test('adds a scene-bound proposal contract only for an active Scene editor', () => {
  const instruction = buildSceneStateProposalInstruction('scene-editor', 'scene-123');
  assert.match(instruction, /active Scene ID is "scene-123"/);
  assert.match(instruction, /<vyra-scene-state>/);
  assert.match(instruction, /evidence value must be an exact, contiguous excerpt/i);
  assert.match(instruction, /remain unverified suggestions/i);
  assert.match(instruction, /carry every unchanged persistent fact into the observed exit snapshot/i);
});

test('does not request structured state for non-Scene pages or missing IDs', () => {
  assert.equal(buildSceneStateProposalInstruction('storyboard-editor', 'scene-123'), '');
  assert.equal(buildSceneStateProposalInstruction('scene-editor', null), '');
  assert.equal(buildSceneStateProposalInstruction('scene-editor', ''), '');
  assert.equal(buildSceneStateProposalInstruction('scene-editor', 'x'.repeat(129)), '');
});

test('escapes Scene IDs as JSON data rather than interpolating raw prompt text', () => {
  const instruction = buildSceneStateProposalInstruction('scene-editor', 'scene-"\n-injected');
  assert.match(instruction, /"scene-\\\"\\n-injected"/);
});

test('applies approved continuity constraints to image, video, and editing prompts', () => {
  const instruction = buildSceneVisualContinuityInstruction('scene-editor', 'scene-123', {
    contextComplete: true,
    previousSceneApproved: true,
    entrySnapshotStale: false,
    currentEntryState: { character: { mira: { hair: 'long black hair', outfit: 'blue coat' } } },
  });
  assert.match(instruction, /SCENE VISUAL CONTINUITY FOR IMAGE, VIDEO, AND EDITING REQUESTS/);
  assert.match(instruction, /creator-approved currentEntryState/);
  assert.match(instruction, /Preserve every relevant approved invariant/);
  assert.match(instruction, /smallest change that satisfies the request/);
  assert.match(instruction, /Actual generated media still requires visual evaluation and creator review/);
});

test('blocks final continuity claims when the active Scene snapshot is stale or incomplete', () => {
  const stale = buildSceneVisualContinuityInstruction('scene-editor', 'scene-123', {
    contextComplete: false, previousSceneApproved: false, entrySnapshotStale: true, currentEntryState: null,
  });
  assert.match(stale, /snapshot is stale/);
  assert.match(stale, /Do not present a continuity-sensitive image\/video prompt as final/);
  const incomplete = buildSceneVisualContinuityInstruction('scene-editor', 'scene-123', {
    contextComplete: false, previousSceneApproved: false, entrySnapshotStale: false, currentEntryState: null,
  });
  assert.match(incomplete, /approved entry context is incomplete/);
  assert.match(incomplete, /unverified/);
});

test('does not add visual continuity prompt rules outside a concrete Scene editor', () => {
  assert.equal(buildSceneVisualContinuityInstruction('storyboard-editor', 'scene-123', null), '');
  assert.equal(buildSceneVisualContinuityInstruction('scene-editor', null, null), '');
});
