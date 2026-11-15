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
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Scene state must be JSON-compatible.');
    return serialized;
  }
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
  if (parts.some((part) => !part || part === '__proto__' || part === 'prototype' || part === 'constructor')) {
    throw new Error('Scene state paths must be safe, non-empty dot paths.');
  }
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
 * Derives a bounded set of continuity paths from every persisted state leaf.
 * Arrays are compared as whole values so order and membership remain stable.
 * Limits fail closed rather than silently omitting continuity details.
 */
export function deriveTrackedSceneStatePaths(
  state: SceneState,
  intendedChanges: SceneStateChange[] = [],
  limits: { maxPaths?: number; maxDepth?: number } = {},
): string[] {
  const maxPaths = limits.maxPaths ?? 500;
  const maxDepth = limits.maxDepth ?? 16;
  if (!isRecord(state) || !Number.isInteger(maxPaths) || maxPaths < 1 || !Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new Error('Scene continuity path limits and root state must be valid.');
  }
  const paths = new Set<string>();
  const visit = (value: unknown, prefix: string, depth: number): void => {
    if (depth > maxDepth) throw new Error('Scene state exceeds the maximum continuity depth.');
    if (isRecord(value) && Object.keys(value).length > 0) {
      for (const key of Object.keys(value)) {
        if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor') {
          throw new Error('Scene state contains an unsafe continuity key.');
        }
        visit(value[key], prefix ? prefix + '.' + key : key, depth + 1);
      }
      return;
    }
    if (!prefix) return;
    paths.add(prefix);
    if (paths.size > maxPaths) throw new Error('Scene state exceeds the maximum tracked continuity paths.');
  };
  visit(state, '', 0);
  for (const change of intendedChanges) {
    if (!change.path.trim()) throw new Error('Intended Scene changes need a valid path.');
    paths.add(change.path);
    if (paths.size > maxPaths) throw new Error('Scene state exceeds the maximum tracked continuity paths.');
  }
  return [...paths].sort();
}

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
    const intended = [...changes.values()]
      .filter((change) => path === change.path || path.startsWith(change.path + '.') || change.path.startsWith(path + '.'))
      .sort((a, b) => b.path.length - a.path.length)[0];
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

export interface SceneContinuityRepairInstruction {
  path: string;
  instruction: string;
}

/**
 * Produces bounded repair guidance from evaluator findings. This is guidance
 * for regenerating/editing the Scene only; it never changes canonical state.
 */
export function buildSceneContinuityRepairInstructions(
  evaluation: SceneStateEvaluation,
): SceneContinuityRepairInstruction[] {
  return evaluation.violations.map((violation) => {
    const expected = canonical(violation.expectedValue);
    const instruction = violation.kind === 'missing_state'
      ? 'Restore the missing tracked detail to ' + expected + '.'
      : 'Correct this detail to ' + expected + ' (generated value: ' + canonical(violation.actualValue) + ').';
    return {
      path: violation.path,
      instruction: 'Repair only "' + violation.path + '". ' + instruction +
        ' Do not alter unrelated Scene details or rewrite canon. ' + violation.reason,
    };
  });
}
