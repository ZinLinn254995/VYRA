import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRunwayProjectShotPrompt, validateFinalSceneRepairCoverage } from '../src/services/runwayProjectGeneration';
import type { CreativeScenePlan } from '../src/services/creativeProductionPlanning';
import type { SceneVisualVerificationResult } from '../src/services/universeSceneVisualVerification';


const visualResult = (
  status: SceneVisualVerificationResult['status'] = 'consistent',
  baselineRevision = 'scene-rev-1',
): SceneVisualVerificationResult => ({
  schemaVersion: 1,
  mediaId: 'asset-test',
  mediaKind: 'video',
  baselineRevision,
  status,
  approvalRequired: true,
  canonicalStateChanged: false,
  coverage: { required: 1, matched: status === 'consistent' ? 1 : 0, mismatched: status === 'consistent' ? 0 : 1, unknown: 0 },
  findings: [],
  limitations: [],
});

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
  assert.ok(workflow.includes('const shotIndices = request.repair ? [request.repair.shotIndex] : request.scene.shots.map((_shot, index) => index)'));
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
  assert.ok(workflow.includes("transitionVerification && transitionVerification.status !== 'consistent' ? 'shot_transition_needs_review' : 'visual_verification_needs_review'"));
  assert.ok(workflow.includes('Do not generate later shots against an unverified handoff'));
  assert.ok(workflow.includes("visualVerificationStatus: request.visualVerification ? 'verified' : 'not_configured'"));
  assert.ok(workflow.includes('buildSceneVisualRepairPrompt'));
});

test('visual inspection failures remain unknown and never trigger paid automatic retries', () => {
  assert.ok(workflow.includes('A failed vision pass is an unknown result, never a silent pass'));
  assert.ok(workflow.includes('inspectionComplete = false'));
  assert.ok(workflow.includes("visualVerificationStatus: !request.visualVerification ? 'not_configured' : verifiedShotCount > 0 ? 'partial' : 'not_run'"));
  assert.ok(workflow.includes('auto-regenerate a paid output'));
  assert.ok(visualVerifier.includes('Do not regenerate, submit a provider task, or spend credits without explicit creator approval'));
});


test('shot boundary asset selection uses valid case-insensitive video MIME matching', () => {
  assert.ok(workflow.includes('/^video\\//i.test(asset.mimeType)'));
});


test('approved repair targets exactly one original shot and re-checks its incoming boundary', () => {
  assert.ok(workflow.includes('repair?: { shotIndex: number; previousShotAsset?: RunwayProjectOutputAsset; nextShotAsset?: RunwayProjectOutputAsset; downstreamShotAssets?: Array<{ shotIndex: number; asset: RunwayProjectOutputAsset }> }'));
  assert.ok(workflow.includes('A paid shot repair requires the same creator-approved visual verification adapter.'));
  assert.ok(workflow.includes('const shotIndices = request.repair ? [request.repair.shotIndex]'));
  assert.ok(workflow.includes('request.repair.shotIndex >= request.scene.shots.length'));
  assert.ok(workflow.includes('The first shot cannot have a previous-shot repair reference.'));
  assert.ok(workflow.includes('request.repair?.shotIndex === shotIndex ? request.repair.previousShotAsset : undefined'));
  assert.ok(workflow.includes('completedShots.find((completed) => completed.shotIndex === shotIndex - 1)'));
  assert.ok(workflow.includes('buildRunwayProjectShotPrompt(request, request.scene, shot, shotIndex)'));
  assert.ok(workflow.includes('Do not generate later shots against an unverified handoff'));
});





test('shot repair re-verifies every downstream boundary in order before replacing the Editor clip', () => {
  assert.ok(workflow.includes('request.repair.downstreamShotAssets'));
  assert.ok(workflow.includes('expectedDownstreamIndices'));
  assert.ok(workflow.includes('for (const currentShotIndex of expectedDownstreamIndices)'));
  assert.ok(workflow.includes('previousAsset, currentAsset: nextAsset'));
  assert.ok(workflow.includes('downstreamTransitionVerifications'));
  assert.ok(workflow.includes('downstream_shot_chain_needs_review'));
  assert.ok(workflow.includes('The chain cannot skip a missing timeline shot'));
});

test('the final repaired shot has no downstream boundary requirement', () => {
  assert.ok(workflow.includes('filter((index) => index > shotIndex)'));
  assert.ok(workflow.includes('for (const currentShotIndex of expectedDownstreamIndices)'));
});

test('the final repaired shot has no outgoing boundary requirement', () => {
  assert.ok(workflow.includes('shotIndex + 1 < request.scene.shots.length'));
  assert.ok(workflow.includes('request.repair?.shotIndex === shotIndex'));
});


test('repair reports the exact first failing downstream boundary and its correct target Shot', () => {
  assert.ok(workflow.includes('failedTransitionBoundary?: { previousShotIndex: number; currentShotIndex: number; status: SceneVisualVerificationResult[\'status\']; verification: SceneVisualVerificationResult }'));
  assert.ok(workflow.includes('const failedDownstreamBoundary = downstreamTransitionVerifications.find((item) => item.verification.status !== \'consistent\')'));
  assert.ok(workflow.includes('currentShotIndex: failedDownstreamBoundary.currentShotIndex'));
  assert.ok(workflow.includes('buildSceneVisualRepairPrompt(verification, nextShot)'));
});


test('targeted repair re-inspects downstream shot visuals as well as every downstream boundary', () => {
  assert.ok(workflow.includes('downstreamShotVerifications'));
  assert.ok(workflow.includes('request.visualVerification.inspect({'));
  assert.ok(workflow.includes('nextShotAnchors'));
  assert.ok(workflow.includes('downstream_shot_visual_needs_review'));
});

test('final repair validation requires complete ordered shot and boundary coverage on one current baseline', () => {
  assert.ok(workflow.includes('finalSceneValidation'));
  assert.ok(workflow.includes('expectedShotIndices'));
  assert.ok(workflow.includes('checkedShotIndices'));
  assert.ok(workflow.includes('expectedBoundaryIndices'));
  assert.ok(workflow.includes('checkedBoundaryIndices'));
  assert.ok(workflow.includes('verification results do not share the same approved Scene baseline revision'));
  assert.ok(workflow.includes('approved Scene baseline changed before final validation completed'));
  assert.ok(workflow.includes("finalSceneValidation?.status !== 'verified'"));
  assert.ok(workflow.includes("status: reasons.length === 0 ? 'verified' : 'needs_review'"));
});


test('final Scene repair validation passes only with every ordered downstream Shot and boundary', () => {
  const result = validateFinalSceneRepairCoverage({
    targetShotIndex: 1,
    shotCount: 4,
    baselineRevision: 'scene-rev-1',
    latestBaselineRevision: 'scene-rev-1',
    shotVerifications: [1, 2, 3].map((shotIndex) => ({ shotIndex, verification: visualResult() })),
    boundaryVerifications: [0, 1, 2].map((previousShotIndex) => ({
      previousShotIndex, currentShotIndex: previousShotIndex + 1, verification: visualResult(),
    })),
  });
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.checkedShotIndices, [1, 2, 3]);
  assert.deepEqual(result.expectedShotIndices, [1, 2, 3]);
  assert.deepEqual(result.checkedBoundaryIndices, [0, 1, 2]);
  assert.deepEqual(result.expectedBoundaryIndices, [0, 1, 2]);
});

test('final Scene repair validation fails closed when any downstream Shot is missing', () => {
  const result = validateFinalSceneRepairCoverage({
    targetShotIndex: 1,
    shotCount: 4,
    baselineRevision: 'scene-rev-1',
    latestBaselineRevision: 'scene-rev-1',
    shotVerifications: [1, 3].map((shotIndex) => ({ shotIndex, verification: visualResult() })),
    boundaryVerifications: [0, 1, 2].map((previousShotIndex) => ({
      previousShotIndex, currentShotIndex: previousShotIndex + 1, verification: visualResult(),
    })),
  });
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.checkedShotIndices, [1, 3]);
  assert.match(result.reasons.join(' '), /shots are missing/);
});

test('final Scene repair validation fails closed when any adjacent boundary is missing or non-adjacent', () => {
  const result = validateFinalSceneRepairCoverage({
    targetShotIndex: 1,
    shotCount: 4,
    baselineRevision: 'scene-rev-1',
    latestBaselineRevision: 'scene-rev-1',
    shotVerifications: [1, 2, 3].map((shotIndex) => ({ shotIndex, verification: visualResult() })),
    boundaryVerifications: [
      { previousShotIndex: 0, currentShotIndex: 1, verification: visualResult() },
      { previousShotIndex: 1, currentShotIndex: 3, verification: visualResult() },
    ],
  });
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.checkedBoundaryIndices, [0]);
  assert.match(result.reasons.join(' '), /boundaries are missing/);
});

test('final Scene repair validation rejects stale or unavailable approved baselines', () => {
  const base = {
    targetShotIndex: 0,
    shotCount: 1,
    baselineRevision: 'scene-rev-1',
    shotVerifications: [{ shotIndex: 0, verification: visualResult() }],
    boundaryVerifications: [],
  };
  const stale = validateFinalSceneRepairCoverage({ ...base, latestBaselineRevision: 'scene-rev-2' });
  assert.equal(stale.status, 'needs_review');
  assert.match(stale.reasons.join(' '), /baseline changed/);
  const unavailable = validateFinalSceneRepairCoverage({ ...base, latestBaselineRevision: null });
  assert.equal(unavailable.status, 'needs_review');
  assert.match(unavailable.reasons.join(' '), /could not be confirmed/);
});


test('final Scene repair validation rejects any non-consistent inspection even when another inspection of that Shot passed', () => {
  const result = validateFinalSceneRepairCoverage({
    targetShotIndex: 0,
    shotCount: 1,
    baselineRevision: 'scene-rev-1',
    latestBaselineRevision: 'scene-rev-1',
    shotVerifications: [
      { shotIndex: 0, verification: visualResult() },
      { shotIndex: 0, verification: visualResult('needs_review') },
    ],
    boundaryVerifications: [],
  });
  assert.equal(result.status, 'needs_review');
  assert.match(result.reasons.join(' '), /did not pass visual continuity verification/);
});
