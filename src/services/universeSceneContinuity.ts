export type SceneState = Record<string, unknown>;

export interface SceneStateChange {
  path: string;
  value: unknown;
  reason: string;
}

export interface SceneStateViolation {
  path: string;
  kind: 'unexpected_change' | 'missed_intended_change' | 'missing_state';
  expectedValue: unknown;
  actualValue?: unknown;
  reason: string;
}

export interface SceneStateEvaluation {
  status: 'consistent' | 'needs_review';
  expectedState: SceneState;
  violations: SceneStateViolation[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Scene state must contain finite numbers.');
    return String(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!isRecord(value)) throw new Error('Scene state must be JSON-compatible.');
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
};

const readPath = (root: SceneState, path: string): { exists: boolean; value: unknown } => {
  const parts = path.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (!part || !isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { exists: false, value: undefined };
    }
    current = current[part];
  }
  return { exists: true, value: current };
};

const writePath = (root: SceneState, path: string, value: unknown): void => {
  const parts = path.split('.');
  if (parts.some((part) => !part)) throw new Error('Scene state paths must be non-empty dot paths.');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing === undefined) current[part] = {};
    else if (!isRecord(existing)) throw new Error('Scene state path crosses a non-object value: ' + path);
    current = current[part] as SceneState;
  }
  current[parts[parts.length - 1]] = value;
};

/**
 * Evaluates a generated Scene exit state against the previous canonical state
 * plus explicitly approved changes. It never mutates inputs or auto-approves
 * unexpected changes; callers can use violations to trigger a repair/review.
 */
export function evaluateSceneStateTransition(input: {
  previousState: SceneState;
  intendedChanges?: SceneStateChange[];
  observedState: SceneState;
  trackedPaths: string[];
}): SceneStateEvaluation {
  const expectedState: SceneState = structuredClone(input.previousState);
  const changes = new Map<string, SceneStateChange>();
  for (const change of input.intendedChanges ?? []) {
    if (!change.path.trim() || !change.reason.trim()) {
      throw new Error('Every intended Scene state change needs a path and reason.');
    }
    const prior = changes.get(change.path);
    if (prior && canonical(prior.value) !== canonical(change.value)) {
      throw new Error('Conflicting intended changes for Scene state path: ' + change.path);
    }
    changes.set(change.path, change);
    writePath(expectedState, change.path, change.value);
  }

  const violations: SceneStateViolation[] = [];
  for (const path of [...new Set(input.trackedPaths)].sort()) {
    const expected = readPath(expectedState, path);
    const actual = readPath(input.observedState, path);
    if (!expected.exists) continue;
    if (!actual.exists) {
      violations.push({
        path,
        kind: 'missing_state',
        expectedValue: expected.value,
        reason: 'Generated Scene did not provide a value for a tracked continuity detail.',
      });
      continue;
    }
    if (canonical(expected.value) === canonical(actual.value)) continue;
    const intended = changes.get(path);
    violations.push({
      path,
      kind: intended ? 'missed_intended_change' : 'unexpected_change',
      expectedValue: expected.value,
      actualValue: actual.value,
      reason: intended
        ? intended.reason
        : 'The tracked detail changed without an explicit approved Scene event.',
    });
  }

  return {
    status: violations.length ? 'needs_review' : 'consistent',
    expectedState,
    violations,
  };
}
