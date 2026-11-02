import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Scene } from '../src/types';
import {
  composeSceneConsistencyInstructions,
  resolveSceneConsistencyContext,
  resolveSceneVoiceProfile,
} from '../src/services/consistencyEngine.ts';

const scene: Scene = {
  id: 'scene-1',
  order: 1,
  narration: '',
  visualPrompt: 'A character enters a room',
  cameraMovement: '',
  duration: 5,
  mediaUrl: '',
  characterIds: ['character-1'],
  consistencyReferenceIds: ['brand-1', 'location-1'],
  status: 'scripted',
};

const project = {
  id: 'project-1',
  characters: [{
    id: 'character-1',
    name: 'Milo',
    visualDescription: 'Small blue robot with a round head',
    continuityNotes: 'Keep the yellow scarf and soft voice',
    referenceImageId: 'media-character-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  consistencyBible: {
    version: 1 as const,
    references: [
      {
        id: 'brand-1',
        kind: 'brand' as const,
        name: 'Acme Bottle',
        description: 'Keep the white label and red cap unchanged',
        mediaIds: ['media-brand-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'location-1',
        kind: 'environment' as const,
        name: 'Workshop',
        description: 'Blue workbench against the back wall',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'unused-1',
        kind: 'object' as const,
        name: 'Unused prop',
        description: 'Must not be included',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    rules: [
      { id: 'rule-low', scope: 'project' as const, instruction: 'Keep the palette warm', strength: 'preferred' as const, priority: 1, active: true },
      { id: 'rule-high', scope: 'project' as const, instruction: 'Never change the product logo', strength: 'locked' as const, priority: 10, active: true, appliesTo: ['brand' as const] },
      { id: 'rule-scene', scope: 'scene' as const, instruction: 'Keep the door on frame left', strength: 'locked' as const, priority: 5, active: true, sceneIds: ['scene-1'], appliesTo: ['environment' as const] },
      { id: 'rule-other-scene', scope: 'scene' as const, instruction: 'Do not include this rule', strength: 'locked' as const, priority: 99, active: true, sceneIds: ['scene-2'] },
      { id: 'rule-disabled', scope: 'project' as const, instruction: 'Do not include disabled rule', strength: 'locked' as const, priority: 100, active: false },
      { id: 'rule-unrelated-kind', scope: 'project' as const, instruction: 'Do not apply voice rules here', strength: 'locked' as const, priority: 50, active: true, appliesTo: ['voice' as const] },
    ],
  },
} as unknown as Project;

test('resolves selected universal references and adapts legacy character references', () => {
  const result = resolveSceneConsistencyContext(project, scene);
  assert.deepEqual(result.references.map((item) => item.id), ['brand-1', 'location-1', 'character-1']);
  assert.equal(result.references.find((item) => item.id === 'character-1')?.mediaIds?.[0], 'media-character-1');
  assert.equal(result.references.some((item) => item.id === 'unused-1'), false);
});

test('applies active project and matching scene rules, ordered by priority', () => {
  const result = resolveSceneConsistencyContext(project, scene);
  assert.deepEqual(result.rules.map((rule) => rule.id), ['rule-high', 'rule-scene', 'rule-low']);
});

test('composes clear prompt instructions and returns an empty string when no context applies', () => {
  const prompt = composeSceneConsistencyInstructions(project, scene);
  assert.match(prompt, /CONSISTENCY REQUIREMENTS/);
  assert.match(prompt, /Acme Bottle/);
  assert.match(prompt, /Never change the product logo/);
  assert.doesNotMatch(prompt, /Unused prop|Do not include this rule|Do not include disabled rule/);

  const emptyScene = { ...scene, characterIds: [], consistencyReferenceIds: [] };
  const emptyProject = { ...project, consistencyBible: { version: 1 as const, references: [], rules: [] } } as Project;
  assert.equal(composeSceneConsistencyInstructions(emptyProject, emptyScene), '');
});


test('resolves a reusable voice identity and clamps speech speed to supported bounds', () => {
  const voiceProject = {
    ...project,
    consistencyBible: {
      ...project.consistencyBible!,
      references: [
        ...project.consistencyBible!.references,
        {
          id: 'voice-1',
          kind: 'voice' as const,
          name: 'Milo Voice',
          description: 'Warm, calm, friendly delivery',
          voiceProfile: { voiceId: 'alloy', speed: 2.5 },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  } as Project;
  const voiceScene = { ...scene, consistencyReferenceIds: ['voice-1'] };
  assert.deepEqual(resolveSceneVoiceProfile(voiceProject, voiceScene), {
    referenceId: 'voice-1',
    referenceName: 'Milo Voice',
    voiceId: 'alloy',
    speed: 2,
  });
});

test('rejects conflicting configured voice identities instead of silently switching voices', () => {
  const voiceProject = {
    ...project,
    consistencyBible: {
      ...project.consistencyBible!,
      references: [
        ...project.consistencyBible!.references,
        {
          id: 'voice-1', kind: 'voice' as const, name: 'Voice A', description: '',
          voiceProfile: { voiceId: 'alloy' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'voice-2', kind: 'voice' as const, name: 'Voice B', description: '',
          voiceProfile: { voiceId: 'nova' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  } as Project;
  const voiceScene = { ...scene, consistencyReferenceIds: ['voice-1', 'voice-2'] };
  assert.throws(() => resolveSceneVoiceProfile(voiceProject, voiceScene), /multiple Voice references/);
});

test('returns no voice profile when the scene has no selected voice reference', () => {
  assert.equal(resolveSceneVoiceProfile(project, scene), null);
});
