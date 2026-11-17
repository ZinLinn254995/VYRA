import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/workspace/WorkspacePage.tsx', import.meta.url), 'utf8');
const generation = readFileSync(new URL('../src/services/runwayProjectGeneration.ts', import.meta.url), 'utf8');
const masterEditor = readFileSync(new URL('../src/components/workspace/MasterTimelineEditor.tsx', import.meta.url), 'utf8');
const videoPlanner = readFileSync(new URL('../src/server/masterTimelineVideoPlayback.ts', import.meta.url), 'utf8');
const shotTimeline = readFileSync(new URL('../src/services/directorShotTimeline.ts', import.meta.url), 'utf8');

test('Project AI Chat exposes media creation without changing global chat composer behavior', () => {
  assert.ok(chat.includes('generateRunwayProjectMedia'));
  assert.ok(chat.includes('generateRunwayProjectShotSequence'));
  assert.ok(chat.includes('onShotSequenceReady'));
  assert.ok(chat.includes('listRunwayProjectMediaRecovery'));
  assert.ok(chat.includes('recoverRunwayProjectMediaJob'));
  assert.ok(chat.includes('{storyboardId && ('));
  assert.ok(chat.includes('Create media'));
  assert.ok(chat.includes('Generate in this Project'));
  assert.ok(chat.includes("targetVyralId: storyboardUniverseId"));
  assert.ok(chat.includes('input: { promptText: prompt }'));
  assert.ok(chat.includes('const sceneContext = workspaceContext ?'));
  assert.ok(chat.includes('sceneContinuity: workspaceContext.sceneContinuity'));
  assert.ok(chat.includes('selectedTimelineItem: workspaceContext.selectedTimelineItem'));
  assert.ok(chat.includes('editorView: workspaceContext.editorView'));
});

test('media generation requires a creator-set budget and explicit quote approval', () => {
  assert.ok(chat.includes('Maximum budget (USD)'));
  assert.ok(chat.includes('const budget = Number(mediaBudgetUsd)'));
  assert.ok(chat.includes('const approveQuote = async (quote'));
  assert.ok(chat.includes('requestApproval: (quote) => approveQuote(quote)'));
  assert.ok(chat.includes('window.confirm(details)'));
  assert.ok(chat.includes('Credits are reserved only after approval.'));
});

test('AI Chat invokes shot-by-shot generation only for the selected Scene in the active Project', () => {
  assert.ok(chat.includes("workspaceContext?.continuityRuntime?.storyboardId === storyboardId"));
  assert.ok(chat.includes("workspaceContext.selectedTimelineItem?.kind === 'scene'"));
  assert.ok(chat.includes("workspaceContext?.page === 'scene-editor'"));
  assert.ok(chat.includes('const plannedShots = Array.isArray(direction?.shots) ? direction.shots : []'));
  assert.ok(chat.includes("effectiveMediaTask === 'video' && activeDirectorScenePlan"));
  assert.ok(chat.includes('maxTotalCostUsd: budget'));
  assert.ok(chat.includes('maxCostUsdPerShot: budget'));
  assert.ok(chat.includes('requestApproval: (quote, shot, shotIndex)'));
  assert.ok(chat.includes('onShotProgress: (event)'));
  assert.ok(chat.includes("result.status === 'partial'"));
  assert.ok(chat.includes("result.status === 'budget_exceeded'"));
  assert.ok(chat.includes('stoppedJobId'));
});

test('Project media progress distinguishes ready, pending and reconciliation states', () => {
  assert.ok(chat.includes("result.status === 'ready'"));
  assert.ok(chat.includes("result.status === 'submitted_pending'"));
  assert.ok(chat.includes("result.status === 'reconciliation_required'"));
  assert.ok(chat.includes('passed DNA / Fingerprint verification'));
});

test('media polling is aborted when the chat component unmounts', () => {
  assert.ok(chat.includes('mediaRequestControllerRef.current?.abort()'));
});

test('generated Project media is previewed in chat while only stable Asset references are persisted', () => {
  assert.ok(chat.includes('type ProjectMediaPreview'));
  assert.ok(chat.includes('message.mediaAssets.map'));
  assert.ok(chat.includes('<img src={asset.url}'));
  assert.ok(chat.includes('<video src={asset.url}'));
  assert.ok(chat.includes('<audio src={asset.url}'));
  assert.ok(chat.includes("createSignedUrl(asset.storage_path, 3600)"));
  assert.ok(chat.includes("createSignedUrl(asset.storagePath, 3600)"));
  assert.ok(chat.includes('mediaAssets: message.mediaAssets.map(({ assetId, name, mimeType }) => ({ assetId, name, mimeType }))'));
  assert.ok(!chat.includes('mediaAssets: message.mediaAssets.map((asset) => ({ ...asset, url: asset.url }))'));
});

test('completed Director shots are linked to the selected Scene Project timeline without deleting manual clips', () => {
  assert.ok(workspace.includes('handleShotSequenceReady'));
  assert.ok(workspace.includes('onShotSequenceReady={handleShotSequenceReady}'));
  assert.ok(workspace.includes("'ai-director-shots-' + scene.id"));
  assert.ok(shotTimeline.includes("source: 'ai_director_shot' as const"));
  assert.ok(workspace.includes('assetVersionId: clip.assetVersionId!'));
  assert.ok(workspace.includes('assetMimeType: clip.assetMimeType'));
  assert.ok(workspace.includes('preservedManualClips'));
  assert.ok(workspace.includes('Generated Director shots are saved as linked Project Assets in this Scene Timeline'));
  assert.ok(workspace.includes('Linked private Project Asset'));
  assert.ok(workspace.includes('Playback and final Scene rendering are the next stage'));
});

test('Master Editor preview schedules each generated Scene shot Asset in order', () => {
  assert.ok(workspace.includes('videoClips,'));
  assert.ok(workspace.includes('assetId: videoClips[0]?.assetId'));
  assert.ok(workspace.includes('videoSourceOut: videoClips[0]?.sourceOut'));
  assert.ok(workspace.includes('assetId: videoClips[0]?.assetId'));
  assert.ok(workspace.includes('const videoClips = [...otherTracks, directorTrack]'));
  assert.ok(masterEditor.includes('videoClips?: TimelineClip[]'));
  assert.ok(masterEditor.includes('instance.videoClips?.some((clip)'));
  assert.ok(videoPlanner.includes('Array.isArray(instance.videoClips)'));
  assert.ok(videoPlanner.includes("instance.id + ':' + clip.id"));
  assert.ok(videoPlanner.includes('clipStart = sceneStart + clip.start'));
  assert.ok(videoPlanner.includes('assetVersionId: clip.assetVersionId'));
  assert.ok(videoPlanner.includes('if (Array.isArray(instance.videoClips))'));
  assert.ok(workspace.includes('if (patch.project?.timeline)'));
  assert.ok(workspace.includes('details.masterTimeline = { ...master, sceneInstances: nextInstances }'));
});

test('Project Editor navigation stays above its video preview and Scene management remains in Editor', () => {
  assert.ok(!workspace.includes("storyboardEditorView === 'scenes'"));
  assert.ok(!workspace.includes(">Scenes</button>"));
  assert.ok(workspace.includes("<MasterTimelineEditor"));
  assert.ok(workspace.includes("onSceneOrderChange="));
  assert.ok(workspace.includes("onSceneDuplicate="));
  assert.ok(workspace.includes("onSceneDelete="));
  assert.ok(workspace.includes("useState<'master' | 'chat' | 'universe' | 'details'>('chat')"));
  assert.ok(workspace.includes(">Editor</button>"));
  assert.ok(!workspace.includes(">Master Editor</button>"));
  assert.ok(workspace.includes('aria-label="Project navigation"'));
  assert.ok(workspace.includes("{storyboardEditorView === 'master' && ("));
  assert.ok(workspace.indexOf('aria-label="Project navigation"') < workspace.indexOf('className="profile-storyboard-preview"'));
  assert.ok(workspace.includes("storyboardEditorView === 'universe' ? 'flex min-h-0"));
});


test('needs_review shot candidates stay in Project Assets and are never handed off to the Editor', () => {
  const start = chat.indexOf("} else if ('completedShots' in result && result.status === 'needs_review')");
  const end = chat.indexOf("} else if (result.status === 'ready')", start);
  assert.ok(start >= 0 && end > start);
  const reviewBranch = chat.slice(start, end);
  assert.ok(!reviewBranch.includes('onShotSequenceReady('));
  assert.ok(reviewBranch.includes('not added to the Editor'));
  assert.ok(reviewBranch.includes('previous Editor clip remains unchanged'));
});

test('Project AI Chat samples generated video frames and invokes the grounded visual inspection adapter', () => {
  const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
  assert.ok(chat.includes('createSignedUrl(asset.storagePath, 300)'));
  assert.ok(chat.includes('extractSelectedVideoFrames(blob, asset.assetId'));
  assert.ok(chat.includes('buildSceneVisualInspectionPrompt'));
  assert.ok(chat.includes('parseSceneVisualInspection'));
  assert.ok(chat.includes('getSceneVisualBaselineRevision(workspaceContextRef.current'));
  assert.ok(chat.includes('...(visualVerification ? { visualVerification } : {})'));
  assert.ok(chat.includes('result.status === \'needs_review\''));
  assert.ok(chat.includes('No later shots were generated and no automatic paid regeneration was attempted.'));
});


test('video frame sampling includes both the opening and closing edge of the generated shot', () => {
  const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
  assert.ok(chat.includes('lastSafeFrameTime * index / (frameCount - 1)'));
  assert.ok(chat.includes('Math.min(0.05, duration / 10)'));
});


test('Project AI Chat compares the previous shot final frame with the current shot opening frame', () => {
  const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
  assert.ok(chat.includes('inspectTransition: async'));
  assert.ok(chat.includes("boundary === 'closing' ? frames[frames.length - 1] : frames[0]"));
  assert.ok(chat.includes('buildSceneVisualTransitionPrompt'));
  assert.ok(chat.includes('parseSceneVisualInspection(vision.content, transitionAnchors, [0, 1])'));
  assert.ok(chat.includes('shot.transitionVerification'));
});


test('generation success message renders its summary on separate lines', () => {
  const chat = readFileSync(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8');
  assert.ok(chat.includes("'\\n\\n' + summary"));
});


test('shot repair handoff replaces only the matching Editor clip and preserves the remaining Director sequence', () => {
  assert.ok(generation.includes('replaceShot?: boolean'));
  assert.ok(workspace.includes('const existingDirectorClips = (existingTrack?.clips || []).filter((clip) => clip.source === \'ai_director_shot\')'));
  assert.ok(workspace.includes('sequence.replaceShot'));
  assert.ok(shotTimeline.includes('const replaced = orderedExisting.map((clip) =>'));
  assert.ok(shotTimeline.includes('const shiftedStart = clip.start + shiftAfter;'));
  assert.ok(shotTimeline.includes('shiftAfter += replacementClip.duration - clip.duration;'));
  assert.ok(shotTimeline.includes('const appendAt = orderedExisting.reduce'));
  assert.ok(shotTimeline.includes('clips = [...replaced, ...missing].sort((a, b) => a.start - b.start);'));
  assert.ok(workspace.includes('const videoClips = [...otherTracks, directorTrack]'));
});


test('AI Chat requires a fresh quote and explicit approval for a targeted shot repair', () => {
  assert.ok(chat.includes('pendingShotRepair'));
  assert.ok(chat.includes('Review quote & repair Shot'));
  assert.ok(chat.includes('startProjectMediaGeneration(pendingShotRepair)'));
  assert.ok(chat.includes('requestApproval: (quote, shot, shotIndex) => approveQuote'));
  assert.ok(chat.includes('repair: { shotIndex: repairRequest.shotIndex'));
  assert.ok(generation.includes('A paid shot repair requires the same creator-approved visual verification adapter.'));
  assert.ok(chat.includes('replaceShot: true'));
  assert.ok(chat.includes("if ('completedShots' in result && activeDirectorScenePlan && storyboardId && (!repairRequest || result.finalSceneValidation?.status === 'verified'))"));
  assert.ok(chat.includes('?? repairRequest?.previousShotAsset'));
  assert.ok(chat.includes('previous Editor clip remains unchanged until verification passes'));
  assert.ok(chat.includes('The existing Editor clip was kept'));
  assert.ok(chat.includes('all available downstream shot boundaries were re-inspected'));
  assert.ok(chat.includes('A fresh quote and your approval are required.'));
  assert.ok(chat.includes('setPendingShotRepair(null)'));
});


test('uncertain repair jobs clear the retry action until recovery is checked', () => {
  assert.ok(chat.includes("if (repairRequest) setPendingShotRepair(null);"));
  assert.ok(chat.includes("result.status === 'submitted_pending'"));
  assert.ok(chat.includes("result.status === 'reconciliation_required'"));
  assert.ok(chat.includes('Do not submit this job again.'));
  assert.ok(chat.includes('VYRA will not submit it again automatically.'));
});


test('continuity review exposes the saved candidate preview without replacing the Editor clip', () => {
  assert.ok(chat.includes('const reviewPreviews: ProjectMediaPreview[] = []'));
  assert.ok(chat.includes('Continuity review candidate'));
  assert.ok(chat.includes('mediaAssets: reviewPreviews'));
  assert.ok(chat.includes("if ('completedShots' in result && activeDirectorScenePlan && storyboardId && (!repairRequest || result.finalSceneValidation?.status === 'verified'))"));
  assert.ok(chat.includes('previous Editor clip remains unchanged until verification passes.'));
});


test('shot-by-shot approvals reserve each quoted estimate against one shared total budget', () => {
  assert.ok(chat.includes('maxApprovedCostUsd = budget'));
  assert.ok(chat.includes('maxCostUsd: maxApprovedCostUsd'));
  assert.ok(chat.includes('quote.estimatedCostUsd),'));
  assert.ok(chat.includes('maxTotalCostUsd: budget'));
  assert.ok(generation.includes('approvedCostUsd += approval.maxCostUsd'));
});


test('shot repair resolves all existing downstream Director Assets for ordered continuity re-inspection', () => {
  assert.ok(chat.includes('activeSceneDirectorShots'));
  assert.ok(chat.includes("from('vyral_assets')"));
  assert.ok(chat.includes("from('vyral_asset_versions')"));
  assert.ok(chat.includes('downstreamShotAssets'));
  assert.ok(chat.includes('downstreamTransitionVerifications'));
  assert.ok(chat.includes('downstreamIndices'));
  assert.ok(chat.includes('all available downstream shot boundaries were re-inspected'));
  assert.ok(workspace.includes('activeSceneDirectorShots:'));
  assert.ok(workspace.includes('shotIndex:'));
  assert.ok(workspace.includes('.slice(0, 30)'));
});


test('successful repair status reports the actual incoming and outgoing verification scope', () => {
  assert.ok(chat.includes('repairVerificationScope'));
  assert.ok(chat.includes("'outgoing + downstream boundaries'"));
  assert.ok(chat.includes("'incoming-boundary'"));
});


test('continuity findings identify both sides of a failed handoff and never repair the original wrong Shot', () => {
  assert.ok(chat.includes("label: 'Shot ' + (item.previousShotIndex + 1) + ' → Shot ' + (item.currentShotIndex + 1)"));
  assert.ok(chat.includes('const failedDownstreamShot = failedShot?.downstreamShotVerifications?.find((item) => item.verification.status !== \'consistent\')'));
  assert.ok(chat.includes('const repairTargetShotIndex = failedBoundary?.currentShotIndex ?? failedDownstreamShot?.shotIndex ?? failedShot?.shotIndex'));
  assert.ok(chat.includes('shotIndex: repairTargetShotIndex'));
  assert.ok(chat.includes('buildSceneVisualRepairPrompt(failedBoundary.verification, repairTargetShotPlan)'));
  assert.ok(chat.includes('the earlier repair target will not be regenerated.'));
  assert.ok(chat.includes("finding.status === 'mismatch'"));
  assert.ok(chat.includes('const actionableShotVerification = failedShot?.visualVerifications?.find((verification) =>'));
  assert.ok(chat.includes('buildSceneVisualRepairPrompt(actionableShotVerification, repairTargetShotPlan)'));
  assert.ok(chat.includes('No paid repair was offered'));
  assert.ok(chat.includes('Review quote & repair Shot'));
});

test('targeted downstream repair uses the receiving Shot boundary references and keeps later shots ordered', () => {
  assert.ok(chat.includes('downstreamShotAssets.find((item) => item.shotIndex === repairTargetShotIndex - 1)'));
  assert.ok(chat.includes('downstreamShotAssets.find((item) => item.shotIndex === repairTargetShotIndex + 1)'));
  assert.ok(chat.includes('downstreamShotAssets.filter((item) => item.shotIndex > repairTargetShotIndex)'));
  assert.ok(chat.includes('previousShotAsset: repairPreviousShotAsset'));
  assert.ok(chat.includes('nextShotAsset: repairNextShotAsset'));
});



test('AI Chat never replaces a repaired Editor clip without final Scene continuity validation', () => {
  assert.ok(chat.includes("(!repairRequest || result.finalSceneValidation?.status === 'verified')"));
  assert.ok(chat.includes('final continuity validation for the repaired Shot and every following Shot/boundary'));
  assert.ok(chat.includes('final continuity validation was not confirmed; the previous Editor clip was kept'));
  assert.ok(chat.includes('const finalValidationReasons = result.finalSceneValidation?.reasons ?? []'));
});


test('shot repair history records verified and review outcomes without mutating prior events', () => {
  assert.ok(chat.includes('onShotRepairHistory?:'));
  assert.ok(chat.includes('onShotSequenceReady, onShotRepairHistory, workspaceContext'));
  assert.ok(chat.includes("outcome: 'needs_review'"));
  assert.ok(chat.includes("outcome: result.finalSceneValidation?.status === 'verified' ? 'verified' : 'needs_review'"));
  assert.ok(chat.includes('previousAssetVersionId: original?.assetVersionId ?? null'));
  assert.ok(chat.includes('candidateAssetVersionId: candidate?.versionId ?? null'));
  assert.ok(chat.includes('findings: [...findings, ...finalValidationReasons].filter(Boolean).slice(0, 20)'));
  assert.ok(chat.includes('findings: result.finalSceneValidation?.reasons ?? []'));
  assert.ok(chat.includes('activeSceneRepairHistory: workspaceContext.activeSceneRepairHistory'));
  assert.ok(chat.includes('const historyShotIndex = repairTargetShotIndex ?? repairRequest.shotIndex'));
  assert.ok(chat.includes('!failedDownstreamShot && failedShot.shotIndex === historyShotIndex'));
  assert.ok(chat.includes('downstreamShotVerifications ?? []'));
  assert.ok(chat.includes('visual inspection'));
  assert.ok(workspace.includes('type SceneShotRepairHistoryEntry'));
  assert.ok(workspace.includes('repairHistory: [...history, entry]'));
  assert.ok(workspace.includes('activeSceneRepairHistory: (scenes.find((scene) => scene.id === (selectedTimelineItem?.kind === \'scene\' ? selectedTimelineItem.id : activeSceneId))?.project?.repairHistory ?? [])'));
  assert.ok(workspace.includes('.slice(-12)'));
  assert.ok(workspace.includes('Append-only: never replace or edit an earlier repair event.'));
  assert.ok(workspace.includes('onShotRepairHistory={handleShotRepairHistory}'));
});

test('AI Director Project deletion writes a cloud tombstone instead of removing the row', () => {
  assert.ok(chat.includes(".select('id,updated_at,details')"));
  assert.ok(chat.includes('__vyraDeletedAt: deletedAt'));
  assert.ok(chat.includes(".update({ details: { ...details, __vyraDeletedAt: deletedAt }, updated_at: deletedAt })"));
  assert.ok(!chat.includes(".delete()\\n              .eq('id', draft.storyboardId)"));
});
