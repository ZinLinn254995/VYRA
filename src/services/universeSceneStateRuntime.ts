import { parseSceneStateProposal, type ParsedSceneStateProposal } from './universeSceneStateProposal';
import { evaluateAndRecordSceneContinuity, type SceneContinuityRuntimeResult } from './universeSceneLedger';
import type { SceneStateChange, SceneState } from './universeSceneContinuity';

export type SceneStateProposalRuntimeResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      proposal: ParsedSceneStateProposal;
      runtime: SceneContinuityRuntimeResult;
      suggestedEvents: ParsedSceneStateProposal['intendedChanges'];
      authority: 'model_declared_unverified';
      requiresCreatorApproval: true;
    };

/**
 * Parses an AI-declared Scene snapshot and evaluates it against the approved
 * continuity handoff. Model-suggested events are deliberately NOT passed to
 * the evaluator as approved changes; only creator-supplied approved events may
 * explain a state transition. This prevents the model from canonizing its own
 * inventions. The resulting ledger remains a proposal until creator approval.
 */
export function evaluateSceneStateProposal(input: {
  response: string;
  expectedSceneId: string;
  ledger: unknown;
  scenes: ReadonlyArray<{ id: string }>;
  initialEntryState?: SceneState;
  approvedIntendedChanges?: SceneStateChange[];
  attempt?: number;
  updatedAt?: string;
}): SceneStateProposalRuntimeResult {
  const parsed = parseSceneStateProposal(input.response, input.expectedSceneId);
  if (!parsed.ok) return parsed;

  try {
    const runtime = evaluateAndRecordSceneContinuity({
      ledger: input.ledger,
      scenes: input.scenes,
      sceneId: input.expectedSceneId,
      observedExitState: parsed.proposal.observedExitState,
      trackedPaths: [],
      ...(input.initialEntryState ? { initialEntryState: input.initialEntryState } : {}),
      // Only creator-authorized events can explain changes to canonical state.
      intendedChanges: input.approvedIntendedChanges ?? [],
      ...(Number.isInteger(input.attempt) ? { attempt: input.attempt } : {}),
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    });
    return {
      ok: true,
      proposal: parsed.proposal,
      runtime,
      // Model-declared events are suggestions for creator review, never canon.
      suggestedEvents: parsed.proposal.intendedChanges,
      authority: 'model_declared_unverified',
      requiresCreatorApproval: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Scene continuity evaluation failed.',
    };
  }
}
