import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRunwayProjectShotPrompt } from '../src/services/runwayProjectGeneration';
import type { CreativeScenePlan } from '../src/services/creativeProductionPlanning';

const workflow = readFileSync(new URL('../src/services/runwayProjectGeneration.ts', import.meta.url), 'utf8');
const visualVerifier = readFileSync(new URL('../src/services/universeSceneVisualVerification.ts', import.meta.url), 'utf8');
const ingestion = readFileSync(new URL('../src/services/runwayProjectOutputIngestion.ts', import.meta.url), 'utf8');

test('generation verifies the signed-in owner and Project Assets destination before requesting a quote', () => {
  assert.ok(workflow.includes('db.auth.getUser()'));
  assert.ok(workflow.includes("from('vyrals')"));
  assert.ok(workflow.includes("metadata?.universe_scope !== 'storyboard'"));
  assert.ok(workflow.includes("'quote-runway-media'"));
});

test('generation requires explicit approval and enforces the quoted maximum before reservation', () => {
  assert.ok(workflow.includes("stage: 'approval-required'"));
  assert.ok(workflow.includes('request.requestApproval(quote)'));
  assert.ok(workflow.includes("status: 'approval_declined'"));
  assert.ok(workflow.includes('approval.maxCostUsd < quote.estimatedCostUsd'));
  assert.ok(workflow.includes("'approve-runway-media-quote'"));
  assert.ok(workflow.includes("'create-runway-media-job'"));
});

test('provider submission is never retried and unknown outcomes require reconciliation', () => {
  assert.ok(workflow.includes('Never automatically retry this request'));
  assert.ok(workflow.includes("'submit-runway-media-job'"));
  assert.ok(workflow.includes("status: 'reconciliation_required'"));
  assert.ok(!workflow.includes('for (let attempt'));
});

test('polling observes the five-second floor and ingests every confirmed output', () => {
  assert.ok(workflow.includes('Math.max(5200'));
  assert.ok(workflow.includes("'poll-runway-media-job'"));
  assert.ok(workflow.includes('[429, 502, 503]'));
  assert.ok(workflow.includes("status === 'succeeded'"));
  assert.ok(workflow.includes('outputIndex < outputCount'));
  assert.ok(workflow.includes('ingestRunwayProjectOutput(db'));
  assert.ok(ingestion.includes("'complete-runway-media-output'"));
});

test('browser cancellation after submission preserves the resumable server job', () => {
  assert.ok(workflow.includes("status: 'submitted_pending'"));
  assert.ok(workflow.includes('resumeRunwayProjectMediaIngestion'));
  assert.ok(workflow.includes("job.status !== 'succeeded'"));
  assert.ok(workflow.includes('Once submitted, cancellation only stops this browser'));
});


const shotScene: CreativeScenePlan = {
  id: 'warehouse-fight',
  title: 'Warehouse Fight',
  purpose: 'Establish the fight and its reversal.',
  durationSeconds: 10,
  location: 'Abandoned warehouse',
  characters: ['A', 'B'],
  entryState: 'A stands beside the loading door; B faces A.',
  action: 'A attacks; B counters and moves toward the exit.',
  exitState: 'B reaches the loading door.',
  shots: [
    {
      id: 'shot-wide', purpose: 'Establish geography', durationSeconds: 4,
      framing: 'Wide shot', cameraAngle: 'Eye level', cameraMovement: 'Slow push',
      composition: 'Both fighters and the exit remain visible', lighting: 'Cool overhead light',
      focus: 'Deep focus', sound: 'Warehouse ambience', action: 'A and B face each other',
      continuityNotes: ['The exit remains behind A'],
    },
    {
      id: 'shot-counter', purpose: 'Show the reversal', durationSeconds: 6,
      framing: 'Medium shot', cameraAngle: 'Low angle', cameraMovement: 'Lateral track',
      composition: 'Keep both fighters readable', lighting: 'Hard side light',
      focus: 'Shift focus to B', sound: 'Footwork and impact', action: 'B counters and drives A back',
      continuityNotes: ['Preserve screen direction', 'B moves toward the loading door'],
    },
  ],
};

test('shot prompt isolates one ordered shot and carries its continuity handoff', () => {
  const prompt = buildRunwayProjectShotPrompt({
    productionTitle: 'Night Shift', logline: 'A confrontation turns into an escape.',
    genre: 'Action', tone: 'Tense', sceneIndex: 1, promptText: 'Make this Scene cinematic.',
  }, shotScene, shotScene.shots[1], 1);
  assert.match(prompt, /SHOT 2 OF 2/);
  assert.match(prompt, /Show the reversal/);
  assert.match(prompt, /PREVIOUS SHOT HANDOFF: A and B face each other/);
  assert.match(prompt, /NEXT SHOT SETUP|FINAL SHOT/);
  assert.match(prompt, /Generate only this planned shot/);
  assert.match(prompt, /SCENE 2: Warehouse Fight/);
});

test('shot sequence reuses the approved generation lifecycle sequentially and enforces a total budget', () => {
  assert.ok(workflow.includes('generateRunwayProjectShotSequence'));
  assert.ok(workflow.includes('for (let shotIndex = 0; shotIndex < request.scene.shots.length; shotIndex++)'));
  assert.ok(workflow.includes("task: 'video'"));
  assert.ok(workflow.includes('approvedCostUsd + quote.estimatedCostUsd > request.maxTotalCostUsd'));
  assert.ok(workflow.includes('approvedCostUsd + approval.maxCostUsd > request.maxTotalCostUsd'));
  assert.ok(workflow.includes("result.status !== 'ready'"));
  assert.ok(workflow.includes('stoppedAtShotIndex: shotIndex'));
  assert.ok(workflow.includes('request.onShotProgress'));
  assert.ok(workflow.includes('validateCreativeProductionPlan'));
  assert.ok(workflow.includes('request.signal'));
  assert.ok(workflow.includes('Never automatically retry this request'));
  assert.ok(workflow.includes("status: 'reconciliation_required'"));
});


test('shot sequence verifies each ingested video output before continuing and stops on drift', () => {
  assert.ok(workflow.includes('request.visualVerification.inspect'));
  assert.ok(workflow.includes('request.visualVerification.inspectTransition'));
  assert.ok(workflow.includes('shot-boundary continuity inspector'));
  assert.ok(workflow.includes('transitionVerification.status !== \'consistent\''));
  assert.ok(workflow.includes('buildSceneVisualTransitionAnchors'));
  assert.ok(workflow.includes('previousCompleted?.assets.find'));
  assert.ok(workflow.includes('transitionInspectionComplete = transition.inspectionComplete === true'));
  assert.ok(workflow.includes("stoppedStatus: transitionVerification && transitionVerification.status !== 'consistent' ? 'shot_transition_needs_review'"));
  assert.ok(workflow.includes('getAnchorsForShot?.(shot, shotIndex, request.scene)'));
  assert.ok(workflow.includes('anchors: shotAnchors'));
  assert.ok(workflow.includes('Visual verification requires a creator-approved baseline revision'));
  assert.ok(workflow.includes('inspection.inspectionComplete === true'));
  assert.ok(workflow.includes('latestRevision.trim()'));
  assert.ok(workflow.includes('evaluateSceneVisualVerification'));
  assert.ok(workflow.includes('getCurrentBaselineRevision'));
  assert.ok(workflow.includes("status: 'needs_review'"));
  assert.ok(workflow.includes("stoppedStatus: 'visual_verification_needs_review'"));
  assert.ok(workflow.includes('Do not generate later shots against an unverified handoff'));
  assert.ok(workflow.includes("visualVerificationStatus: request.visualVerification ? 'verified' : 'not_configured'"));
  assert.ok(workflow.includes('buildSceneVisualRepairPrompt'));
});

test('visual inspection failures remain unknown and never trigger paid automatic retries', () => {
  assert.ok(workflow.includes('A failed vision pass is an unknown result, never a silent pass'));
  assert.ok(workflow.includes('inspectionComplete = false'));
  assert.ok(workflow.includes('visualVerificationStatus: \'not_configured\''));
  assert.ok(workflow.includes('Do not auto-regenerate a paid output'));
  assert.ok(visualVerifier.includes('Do not regenerate, submit a provider task, or spend credits without explicit creator approval'));
});


test('shot boundary asset selection uses valid case-insensitive video MIME matching', () => {
  assert.ok(workflow.includes('/^video\\//i.test(asset.mimeType)'));
});


test('approved repair targets exactly one original shot and re-checks its incoming boundary', () => {
  assert.ok(workflow.includes('repair?: { shotIndex: number; previousShotAsset?: RunwayProjectOutputAsset }'));
  assert.ok(workflow.includes('A paid shot repair requires the same creator-approved visual verification adapter.'));
  assert.ok(workflow.includes('const shotIndices = request.repair ? [request.repair.shotIndex]'));
  assert.ok(workflow.includes('request.repair.shotIndex >= request.scene.shots.length'));
  assert.ok(workflow.includes('The first shot cannot have a previous-shot repair reference.'));
  assert.ok(workflow.includes('request.repair?.shotIndex === shotIndex ? request.repair.previousShotAsset : undefined'));
  assert.ok(workflow.includes('completedShots.find((completed) => completed.shotIndex === shotIndex - 1)'));
  assert.ok(workflow.includes('buildRunwayProjectShotPrompt(request, request.scene, shot, shotIndex)'));
  assert.ok(workflow.includes('Do not generate later shots against an unverified handoff'));
});
