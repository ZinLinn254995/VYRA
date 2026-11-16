import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCreativeProductionPlan, type CreativeProductionPlan } from '../src/services/creativeProductionPlanning.ts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const validPlan: CreativeProductionPlan = {
  title: 'Warehouse Duel',
  logline: 'Two rivals settle a personal conflict in an abandoned warehouse.',
  requestedDurationSeconds: 60,
  genre: 'Action',
  tone: 'Tense and cinematic',
  scenes: [{
    id: 'scene-1',
    title: 'The Standoff',
    purpose: 'Establish the rivalry and geography.',
    durationSeconds: 20,
    location: 'Abandoned warehouse',
    characters: ['A', 'B'],
    entryState: 'A stands by the loading door; B waits near the center.',
    action: 'A and B circle each other before the first strike.',
    exitState: 'They close distance near the center aisle.',
    shots: [{
      id: 'shot-1',
      purpose: 'Establish geography.',
      durationSeconds: 20,
      framing: 'Wide shot',
      cameraAngle: 'Eye level',
      cameraMovement: 'Slow push in',
      action: 'A and B circle each other.',
      continuityNotes: ['Keep the loading door behind A.'],
    }],
  }, {
    id: 'scene-2',
    title: 'The Fight',
    purpose: 'Escalate the conflict.',
    durationSeconds: 25,
    location: 'Warehouse center aisle',
    characters: ['A', 'B'],
    entryState: 'Both fighters face each other near the center aisle.',
    action: 'A attacks; B counters and gains the advantage.',
    exitState: 'B is pushed back; A has a cut above the eyebrow.',
    shots: [{
      id: 'shot-2',
      purpose: 'Show the counter.',
      durationSeconds: 25,
      framing: 'Medium close-up',
      cameraAngle: 'Three-quarter low angle',
      cameraMovement: 'Lateral tracking',
      action: 'B redirects A and counters.',
      continuityNotes: ['The cut appears only after the impact.'],
    }],
  }, {
    id: 'scene-3',
    title: 'The Resolution',
    purpose: 'Resolve the conflict.',
    durationSeconds: 15,
    location: 'Warehouse center aisle',
    characters: ['A', 'B'],
    entryState: 'B stands with the advantage; A has a cut above the eyebrow.',
    action: 'A chooses to stop; B lowers their guard.',
    exitState: 'Both stand apart; the fight is over.',
    shots: [{
      id: 'shot-3',
      purpose: 'Land the emotional resolution.',
      durationSeconds: 15,
      framing: 'Wide two-shot',
      cameraAngle: 'Eye level',
      cameraMovement: 'Static hold',
      action: 'Both fighters lower their guard.',
      continuityNotes: ['Preserve the cut on A.'],
    }],
  }],
};

test('production planning instructions are connected to authenticated Project chat', () => {
  const planning = read('src/services/creativeProductionPlanning.ts');
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(planning, /SCENE PLAN/);
  assert.match(planning, /SHOT PLAN/);
  assert.match(planning, /CONTINUITY PLAN/);
  assert.match(planning, /GENERATION PLAN/);
  assert.match(planning, /propose_scene_mutation/);
  assert.match(planning, /propose_scene_batch_create/);
  assert.match(edge, /name: 'propose_scene_batch_create'/);
  assert.ok(edge.includes("operation: 'scene.batch_create'"));
  assert.match(edge, /isSceneBatchCreate/);
  assert.match(edge, /createdScenes/);
  const workspace = read('src/components/workspace/WorkspacePage.tsx');
  assert.match(workspace, /creativeDirection/);
  assert.match(workspace, /Director’s Shot Plan/);
  assert.ok(workspace.includes('shot.cameraMovement'));
  assert.match(edge, /CREATIVE_PRODUCTION_PLANNING_INSTRUCTION/);
  assert.match(edge, /CREATIVE_DIRECTOR_SYSTEM_INSTRUCTION \+ CREATIVE_PRODUCTION_PLANNING_INSTRUCTION/);
});

test('a coherent production plan validates against its requested runtime', () => {
  const result = validateCreativeProductionPlan(validPlan);
  assert.equal(result.valid, true, result.errors.join(' '));
  assert.equal(result.totalSceneDurationSeconds, 60);
});

test('production plan rejects runtime mismatch and missing continuity', () => {
  const broken: CreativeProductionPlan = structuredClone(validPlan);
  broken.scenes[1].durationSeconds = 10;
  broken.scenes[2].entryState = '';
  const result = validateCreativeProductionPlan(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duration budget')));
  assert.ok(result.errors.some((error) => error.includes('entry and exit continuity')));
});

test('production plan rejects duplicate scene/shot identities and incomplete direction', () => {
  const broken: CreativeProductionPlan = structuredClone(validPlan);
  broken.scenes[1].id = broken.scenes[0].id;
  broken.scenes[0].shots[0].id = broken.scenes[1].shots[0].id;
  broken.scenes[0].shots[0].cameraAngle = '';
  const result = validateCreativeProductionPlan(broken);
  assert.ok(result.errors.some((error) => error.includes('unique ID')));
  assert.ok(result.errors.some((error) => error.includes('missing direction details')));
});
