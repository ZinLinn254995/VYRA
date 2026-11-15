import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneStateProposalInstruction } from '../src/services/universeSceneStatePrompt.ts';

test('adds a scene-bound proposal contract only for an active Scene editor', () => {
  const instruction = buildSceneStateProposalInstruction('scene-editor', 'scene-123');
  assert.match(instruction, /active Scene ID is "scene-123"/);
  assert.match(instruction, /<vyra-scene-state>/);
  assert.match(instruction, /evidence value must be an exact, contiguous excerpt/i);
  assert.match(instruction, /remain unverified suggestions/i);
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
