export type MediaTask = 'image' | 'video' | 'audio' | 'video-edit';
export type MediaQuality = 'draft' | 'standard' | 'premium';
export type MediaSelectionMode = 'auto' | 'manual';

export interface MediaModelCandidate {
  id: string;
  provider: 'runway';
  displayName: string;
  tasks: readonly MediaTask[];
  enabled: boolean;
  qualityScore: number;
  estimatedCostUsd: number | null;
  estimatedLatencyMs: number | null;
  supportsDnaReferences: boolean;
}

export interface MediaModelSelectionRequest {
  task: MediaTask;
  quality: MediaQuality;
  maxCostUsd: number;
  mode?: MediaSelectionMode;
  requestedModelId?: string | null;
  requiresDnaReferences?: boolean;
}

export type MediaModelSelectionFailure =
  | 'invalid-budget'
  | 'manual-model-required'
  | 'manual-model-unavailable'
  | 'no-eligible-model';

export type MediaModelSelection =
  | {
      ok: true;
      mode: MediaSelectionMode;
      selectedBy: 'automatic' | 'user';
      model: MediaModelCandidate;
      estimatedCostUsd: number;
      estimatedLatencyMs: number | null;
    }
  | { ok: false; reason: MediaModelSelectionFailure };

/**
 * Selects only from a server-supplied, allowlisted candidate list.
 * Prices and latency must come from a fresh provider preflight quote; this
 * module intentionally contains no hard-coded model prices or provider calls.
 */
export function selectMediaModel(
  request: MediaModelSelectionRequest,
  candidates: readonly MediaModelCandidate[],
): MediaModelSelection {
  if (!Number.isFinite(request.maxCostUsd) || request.maxCostUsd < 0) {
    return { ok: false, reason: 'invalid-budget' };
  }

  const mode = request.mode ?? 'auto';
  const eligible = candidates.filter((candidate) =>
    candidate.enabled &&
    candidate.tasks.includes(request.task) &&
    Number.isFinite(candidate.qualityScore) &&
    candidate.qualityScore >= qualityFloor(request.quality) &&
    typeof candidate.estimatedCostUsd === 'number' &&
    Number.isFinite(candidate.estimatedCostUsd) &&
    candidate.estimatedCostUsd >= 0 &&
    candidate.estimatedCostUsd <= request.maxCostUsd &&
    (!request.requiresDnaReferences || candidate.supportsDnaReferences)
  );

  if (mode === 'manual') {
    if (!request.requestedModelId) return { ok: false, reason: 'manual-model-required' };
    const model = eligible.find((candidate) => candidate.id === request.requestedModelId);
    if (!model) return { ok: false, reason: 'manual-model-unavailable' };
    return selection(model, 'manual', 'user');
  }

  if (mode !== 'auto') return { ok: false, reason: 'no-eligible-model' };
  if (eligible.length === 0) return { ok: false, reason: 'no-eligible-model' };

  // Draft: minimize cost. Standard: balance quality and cost. Premium:
  // maximize quality first, then cost and latency. Unknown quotes are excluded.
  const sorted = [...eligible].sort((a, b) => {
    if (request.quality === 'premium') {
      return b.qualityScore - a.qualityScore ||
        a.estimatedCostUsd! - b.estimatedCostUsd! ||
        latency(a) - latency(b);
    }
    if (request.quality === 'standard') {
      const aValue = a.qualityScore / Math.max(a.estimatedCostUsd!, 0.0001);
      const bValue = b.qualityScore / Math.max(b.estimatedCostUsd!, 0.0001);
      return bValue - aValue || b.qualityScore - a.qualityScore || latency(a) - latency(b);
    }
    return a.estimatedCostUsd! - b.estimatedCostUsd! ||
      b.qualityScore - a.qualityScore ||
      latency(a) - latency(b);
  });

  return selection(sorted[0], 'auto', 'automatic');
}

function qualityFloor(quality: MediaQuality): number {
  return quality === 'premium' ? 85 : quality === 'standard' ? 65 : 40;
}

function latency(model: MediaModelCandidate): number {
  return model.estimatedLatencyMs ?? Number.MAX_SAFE_INTEGER;
}

function selection(
  model: MediaModelCandidate,
  mode: MediaSelectionMode,
  selectedBy: 'automatic' | 'user',
): MediaModelSelection {
  return {
    ok: true,
    mode,
    selectedBy,
    model,
    estimatedCostUsd: model.estimatedCostUsd!,
    estimatedLatencyMs: model.estimatedLatencyMs,
  };
}
