export type VisualObservationStatus = 'match' | 'mismatch' | 'unknown';
export type VisualMediaKind = 'image' | 'video';

export interface SceneVisualAnchor {
  path: string;
  expectedValue: unknown;
  /** Persistent canon or a temporary condition that is expected in this shot. */
  scope: 'persistent' | 'scene_state';
  /** Whether this detail is actually assessable in the supplied media. */
  visibility: 'required' | 'optional';
}

export interface SceneVisualObservation {
  path: string;
  status: VisualObservationStatus;
  confidence: number;
  evidence: string;
  frameTimeMs?: number;
  observedValue?: unknown;
}

export interface SceneVisualVerificationInput {
  mediaId: string;
  mediaKind: VisualMediaKind;
  baselineRevision: string;
  currentBaselineRevision: string;
  anchors: SceneVisualAnchor[];
  observations: SceneVisualObservation[];
  /** True only when the vision system has completed its inspection. */
  inspectionComplete: boolean;
}

export interface SceneVisualFinding {
  path: string;
  status: VisualObservationStatus;
  expectedValue: unknown;
  observedValues: unknown[];
  confidence: number;
  evidence: string[];
  frameTimesMs: number[];
  reason: string;
}

export interface SceneVisualVerificationResult {
  schemaVersion: 1;
  mediaId: string;
  mediaKind: VisualMediaKind;
  baselineRevision: string;
  status: 'consistent' | 'needs_review';
  approvalRequired: true;
  canonicalStateChanged: false;
  coverage: { required: number; matched: number; mismatched: number; unknown: number };
  findings: SceneVisualFinding[];
  limitations: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stableValue = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return '[' + value.map(stableValue).join(',') + ']';
  if (!isRecord(value)) throw new Error('Visual verification values must be JSON-compatible.');
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableValue(value[key])).join(',') + '}';
};

const validatePath = (path: string): void => {
  if (!/^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/.test(path)
    || path.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new Error('Visual verification paths must be safe dot-separated paths.');
  }
};

/**
 * Deterministically aggregates vision observations against an immutable,
 * creator-approved Scene baseline. This function does not inspect pixels:
 * a trusted vision adapter must supply observations and evidence. Unknown or
 * low-confidence findings never count as matches. No result changes canon.
 */
export function evaluateSceneVisualVerification(
  input: SceneVisualVerificationInput,
): SceneVisualVerificationResult {
  if (!input.mediaId.trim() || !input.baselineRevision.trim() || !input.currentBaselineRevision.trim()) {
    throw new Error('Media ID and baseline revisions are required.');
  }
  if (input.mediaKind !== 'image' && input.mediaKind !== 'video') {
    throw new Error('Unsupported visual media kind.');
  }
  const stale = input.baselineRevision !== input.currentBaselineRevision;
  const paths = new Set<string>();
  for (const anchor of input.anchors) {
    validatePath(anchor.path);
    stableValue(anchor.expectedValue);
    if (paths.has(anchor.path)) throw new Error('Duplicate visual anchor path: ' + anchor.path);
    paths.add(anchor.path);
  }
  for (const observation of input.observations) {
    validatePath(observation.path);
    if (!paths.has(observation.path)) throw new Error('Observation does not map to an approved visual anchor: ' + observation.path);
    if (!['match', 'mismatch', 'unknown'].includes(observation.status)
      || !Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1
      || typeof observation.evidence !== 'string' || observation.evidence.length > 1000) {
      throw new Error('Visual observations must have a valid status, confidence, and bounded evidence.');
    }
    if (input.mediaKind === 'image' && observation.frameTimeMs !== undefined) {
      throw new Error('Still-image observations must not include video frame timestamps.');
    }
    if (input.mediaKind === 'video' && observation.frameTimeMs !== undefined
      && (!Number.isFinite(observation.frameTimeMs) || observation.frameTimeMs < 0)) {
      throw new Error('Video frame timestamps must be non-negative milliseconds.');
    }
    if (observation.observedValue !== undefined) stableValue(observation.observedValue);
  }

  const findings: SceneVisualFinding[] = input.anchors.map((anchor) => {
    const observations = input.observations.filter((item) => item.path === anchor.path);
    const reliable = observations.filter((item) => item.confidence >= 0.75);
    const mismatch = reliable.filter((item) => item.status === 'mismatch');
    const matches = reliable.filter((item) => item.status === 'match');
    const unknown = observations.filter((item) => item.status === 'unknown' || item.confidence < 0.75);
    let status: VisualObservationStatus = 'unknown';
    if (mismatch.length) status = 'mismatch';
    else if (input.inspectionComplete && observations.length > 0 && unknown.length === 0 && matches.length === observations.length) status = 'match';

    const frameTimesMs = observations
      .map((item) => item.frameTimeMs)
      .filter((time): time is number => typeof time === 'number')
      .sort((a, b) => a - b);
    const evidence = observations
      .filter((item) => item.evidence.trim())
      .map((item) => item.evidence.trim());
    const observedValues = observations
      .filter((item) => item.observedValue !== undefined)
      .map((item) => item.observedValue);
    const confidence = observations.length
      ? Math.min(...observations.map((item) => item.confidence))
      : 0;

    return {
      path: anchor.path,
      status,
      expectedValue: anchor.expectedValue,
      observedValues,
      confidence,
      evidence,
      frameTimesMs,
      reason: status === 'mismatch'
        ? 'At least one sufficiently confident observation conflicts with the approved baseline.'
        : status === 'match'
          ? 'All supplied observations for this anchor match the approved baseline.'
          : 'This detail was not sufficiently observable, the inspection is incomplete, or confidence is below the acceptance threshold.',
    };
  });

  const required = findings.filter((finding, index) => input.anchors[index].visibility === 'required');
  const matched = required.filter((finding) => finding.status === 'match').length;
  const mismatched = required.filter((finding) => finding.status === 'mismatch').length;
  const unknown = required.filter((finding) => finding.status === 'unknown').length;
  const status = !stale && input.inspectionComplete && required.length > 0
    && matched === required.length && mismatched === 0 && unknown === 0
    ? 'consistent'
    : 'needs_review';

  const limitations = [
    'This is an assessment of supplied vision observations, not a direct pixel comparison performed by this evaluator.',
    'A single frame cannot establish off-screen, hidden, or unobserved facts.',
    'A consistent assessment is not creator approval; review the actual media before approving it.',
    'Visual observations cannot authorize changes to the canonical Scene state.',
    ...(stale ? ['The approved Scene baseline changed after inspection; discard this result and inspect again.'] : []),
    ...(!input.inspectionComplete ? ['The media inspection is incomplete; no consistency conclusion is available.'] : []),
    ...(input.mediaKind === 'video' ? ['Video findings are frame-sampled; unsampled moments may contain continuity drift.'] : []),
  ];

  return {
    schemaVersion: 1,
    mediaId: input.mediaId,
    mediaKind: input.mediaKind,
    baselineRevision: input.baselineRevision,
    status,
    approvalRequired: true,
    canonicalStateChanged: false,
    coverage: { required: required.length, matched, mismatched, unknown },
    findings,
    limitations,
  };
}
