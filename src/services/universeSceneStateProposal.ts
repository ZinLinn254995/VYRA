/**
 * Strict adapter for an explicitly structured Scene-state block returned by an
 * AI generation workflow. It does not infer facts from prose: every state value
 * must cite an exact excerpt from the generated narrative. Results remain
 * model-declared proposals and must pass continuity evaluation and creator
 * approval before entering the canonical ledger.
 */

export type SceneStateFact = {
  path: string;
  value: unknown;
  scope: 'persistent' | 'scene_state';
  evidence: string;
};

export type SceneStateEvent = {
  path: string;
  value: unknown;
  reason: string;
  evidence: string;
};

export type ParsedSceneStateProposal = {
  schemaVersion: 1;
  sceneId: string;
  observedExitState: Record<string, unknown>;
  facts: SceneStateFact[];
  intendedChanges: Array<{ path: string; value: unknown; reason: string }>;
  evidence: Array<{ path: string; excerpt: string }>;
  authority: 'model_declared_unverified';
  status: 'proposal';
};

export type SceneStateProposalParseResult =
  | { ok: true; proposal: ParsedSceneStateProposal }
  | { ok: false; reason: string };

const OPEN = '<vyra-scene-state>';
const CLOSE = '</vyra-scene-state>';
const MAX_RESPONSE_CHARS = 40_000;
const MAX_BLOCK_CHARS = 24_000;
const MAX_FACTS = 160;
const MAX_DEPTH = 12;
const MAX_PATH_LENGTH = 240;
const MAX_EVIDENCE_LENGTH = 800;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isJsonValue = (value: unknown, depth = 0): boolean => {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 500 && value.every((item) => isJsonValue(item, depth + 1));
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 200 && entries.every(([key, item]) =>
    key.length > 0 && key !== '__proto__' && key !== 'prototype' && key !== 'constructor'
    && isJsonValue(item, depth + 1));
};

const validatePath = (path: unknown): path is string => {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  const parts = path.split('.');
  return parts.length <= MAX_DEPTH && parts.every((part) =>
    part.length > 0 && part !== '__proto__' && part !== 'prototype' && part !== 'constructor'
    && /^[A-Za-z0-9_$-]+$/.test(part));
};

const writePath = (root: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next === undefined) current[part] = {};
    if (!isRecord(current[part])) throw new Error('State paths overlap or cross a non-object value.');
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (Object.prototype.hasOwnProperty.call(current, leaf)) throw new Error('Duplicate or overlapping Scene-state paths.');
  current[leaf] = value;
};

const validateEvidence = (evidence: unknown, narrative: string): evidence is string =>
  typeof evidence === 'string' && evidence.trim().length > 0
  && evidence.length <= MAX_EVIDENCE_LENGTH && narrative.includes(evidence);

export function parseSceneStateProposal(
  response: string,
  expectedSceneId: string,
): SceneStateProposalParseResult {
  if (typeof response !== 'string' || response.length > MAX_RESPONSE_CHARS) {
    return { ok: false, reason: 'The Scene response is missing or exceeds the supported size.' };
  }
  if (!expectedSceneId || expectedSceneId.length > 128) {
    return { ok: false, reason: 'A valid active Scene ID is required.' };
  }

  const openIndex = response.indexOf(OPEN);
  const closeIndex = response.indexOf(CLOSE);
  if (openIndex < 0 || closeIndex < 0 || closeIndex <= openIndex
    || response.indexOf(OPEN, openIndex + OPEN.length) >= 0
    || response.indexOf(CLOSE, closeIndex + CLOSE.length) >= 0) {
    return { ok: false, reason: 'Exactly one complete structured Scene-state block is required.' };
  }

  const rawBlock = response.slice(openIndex + OPEN.length, closeIndex).trim();
  if (!rawBlock || rawBlock.length > MAX_BLOCK_CHARS) {
    return { ok: false, reason: 'The structured Scene-state block is empty or too large.' };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(rawBlock); } catch {
    return { ok: false, reason: 'The structured Scene-state block is not valid JSON.' };
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || parsed.sceneId !== expectedSceneId
    || !Array.isArray(parsed.facts) || !Array.isArray(parsed.intendedChanges)
    || parsed.facts.length > MAX_FACTS || parsed.intendedChanges.length > MAX_FACTS) {
    return { ok: false, reason: 'The structured Scene-state block has an unsupported schema or Scene ID.' };
  }

  const narrative = response.slice(0, openIndex) + response.slice(closeIndex + CLOSE.length);
  const observedExitState: Record<string, unknown> = {};
  const facts: SceneStateFact[] = [];
  const intendedChanges: ParsedSceneStateProposal['intendedChanges'] = [];
  const evidence: ParsedSceneStateProposal['evidence'] = [];
  const usedPaths = new Set<string>();

  for (const item of parsed.facts) {
    if (!isRecord(item) || !validatePath(item.path) || !isJsonValue(item.value)
      || (item.scope !== 'persistent' && item.scope !== 'scene_state')
      || !validateEvidence(item.evidence, narrative)) {
      return { ok: false, reason: 'A Scene-state fact is malformed or lacks an exact narrative evidence excerpt.' };
    }
    if (usedPaths.has(item.path)) return { ok: false, reason: 'Duplicate Scene-state fact paths are not allowed.' };
    usedPaths.add(item.path);
    try { writePath(observedExitState, item.path, item.value); } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'Invalid Scene-state paths.' };
    }
    facts.push({ path: item.path, value: item.value, scope: item.scope, evidence: item.evidence });
    evidence.push({ path: item.path, excerpt: item.evidence });
  }

  const changePaths = new Set<string>();
  for (const item of parsed.intendedChanges) {
    if (!isRecord(item) || !validatePath(item.path) || !isJsonValue(item.value)
      || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 600
      || !validateEvidence(item.evidence, narrative)) {
      return { ok: false, reason: 'An intended Scene change is malformed or lacks an exact narrative evidence excerpt.' };
    }
    if (changePaths.has(item.path)) return { ok: false, reason: 'Conflicting or duplicate intended Scene changes are not allowed.' };
    changePaths.add(item.path);
    intendedChanges.push({ path: item.path, value: item.value, reason: item.reason.trim() });
    evidence.push({ path: item.path, excerpt: item.evidence });
  }

  return {
    ok: true,
    proposal: {
      schemaVersion: 1,
      sceneId: expectedSceneId,
      observedExitState,
      facts,
      intendedChanges,
      evidence,
      authority: 'model_declared_unverified',
      status: 'proposal',
    },
  };
}
