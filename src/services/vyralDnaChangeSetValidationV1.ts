export type VyralDnaChangeOperationV1 = {
  op: 'add' | 'replace' | 'remove';
  path: string;
  before?: unknown;
  after?: unknown;
  evidenceRefs: string[];
};

export type VyralDnaChangeSetV1 = {
  schema: 'vyra.dna-change-set';
  schemaVersion: 1;
  proposalId: string;
  source: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string };
  operations: VyralDnaChangeOperationV1[];
  [key: string]: unknown;
};

export type VyralDnaChangeSetValidationV1 = {
  validatorVersion: 1;
  status: 'validated' | 'blocked' | 'invalid';
  changeSetSha256: string;
  checks: Record<string, 'pass' | 'fail' | 'blocked'>;
  errors: string[];
  validatedOperationCount: number;
};

/** Canonical JSON used for stable change-set hashing across runtimes. */
export const canonicalizeVyralJsonV1 = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite numbers are not valid DNA change-set values.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalizeVyralJsonV1).join(',') + ']';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalizeVyralJsonV1(record[key])
    ).join(',') + '}';
  }
  throw new Error('DNA change-set contains a non-JSON value.');
};

export const sha256VyralJsonV1 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalizeVyralJsonV1(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const PROTECTED_SEGMENTS = new Set([
  'id', 'asset_id', 'assetid', 'asset_version_id', 'assetversionid',
  'dna_record_id', 'dnarecordid', 'source', 'identity', 'provenance',
  'fingerprint', 'fingerprints', 'integrity', 'licensing', 'signature',
  'created_at', 'updated_at', 'revision_number', 'parent_dna_record_id',
]);

const ALLOWED_DNA_SECTIONS = new Set([
  'knowledge', 'reconstruction', 'description', 'attributes', 'visual',
  'audio', 'video', 'document', 'geometry', 'style', 'content',
]);

const parsePointer = (path: string): string[] | null => {
  if (!path.startsWith('/') || path.length < 2 || path.includes('~(?![01])')) return null;
  const parts = path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.some((part) => !part || part === '__proto__' || part === 'prototype' || part === 'constructor')) return null;
  return parts;
};

const getOwnPath = (root: unknown, parts: string[]): { exists: boolean; value?: unknown } => {
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current) ||
        !Object.prototype.hasOwnProperty.call(current, part)) return { exists: false };
    current = (current as Record<string, unknown>)[part];
  }
  return { exists: true, value: current };
};

const sameJson = (left: unknown, right: unknown): boolean => {
  try { return canonicalizeVyralJsonV1(left) === canonicalizeVyralJsonV1(right); }
  catch { return false; }
};

export const validateVyralDnaChangeSetV1 = async (input: {
  changeSet: unknown;
  expectedSha256: string;
  expectedSource: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string };
  currentDnaRecord: unknown;
}): Promise<VyralDnaChangeSetValidationV1> => {
  const errors: string[] = [];
  const checks: Record<string, 'pass' | 'fail' | 'blocked'> = {};
  let actualHash = '';
  try { actualHash = await sha256VyralJsonV1(input.changeSet); }
  catch (error) { errors.push(error instanceof Error ? error.message : 'Change set is not canonical JSON.'); }
  checks.hash = actualHash && actualHash === input.expectedSha256 ? 'pass' : 'fail';
  if (checks.hash === 'fail') errors.push('Change-set SHA-256 does not match the stored hash.');

  const set = input.changeSet as Partial<VyralDnaChangeSetV1> | null;
  const isObject = Boolean(set && typeof set === 'object' && !Array.isArray(set));
  checks.schema = isObject && set?.schema === 'vyra.dna-change-set' && set.schemaVersion === 1 ? 'pass' : 'fail';
  if (checks.schema === 'fail') errors.push('Unsupported or malformed DNA change-set schema.');

  const source = set?.source;
  const sourceMatches = Boolean(source &&
    source.assetId === input.expectedSource.assetId &&
    source.assetVersionId === input.expectedSource.assetVersionId &&
    source.dnaRecordId === input.expectedSource.dnaRecordId &&
    source.sourceSha256 === input.expectedSource.sourceSha256);
  checks.sourceBinding = sourceMatches ? 'pass' : 'fail';
  if (!sourceMatches) errors.push('Change set is not bound to the exact expected Asset, Version, DNA revision and source SHA-256.');

  const operations = Array.isArray(set?.operations) ? set.operations : null;
  checks.operations = operations ? 'pass' : 'fail';
  if (!operations) errors.push('Change-set operations must be an array.');
  if (checks.hash === 'fail' || checks.schema === 'fail' || checks.sourceBinding === 'fail' || !operations) {
    return { validatorVersion: 1, status: 'invalid', changeSetSha256: actualHash, checks, errors, validatedOperationCount: 0 };
  }
  if (operations.length === 0) {
    checks.operations = 'blocked';
    errors.push('No evidence-backed DNA operations exist; an empty change set cannot create a DNA revision.');
    return { validatorVersion: 1, status: 'blocked', changeSetSha256: actualHash, checks, errors, validatedOperationCount: 0 };
  }

  const dnaRoot = input.currentDnaRecord && typeof input.currentDnaRecord === 'object' &&
    !Array.isArray(input.currentDnaRecord) && 'dna_record' in input.currentDnaRecord
    ? (input.currentDnaRecord as Record<string, unknown>).dna_record
    : input.currentDnaRecord;
  if (!dnaRoot || typeof dnaRoot !== 'object' || Array.isArray(dnaRoot)) {
    checks.currentDna = 'fail';
    errors.push('Current DNA payload is unavailable or malformed.');
    return { validatorVersion: 1, status: 'invalid', changeSetSha256: actualHash, checks, errors, validatedOperationCount: 0 };
  }
  checks.currentDna = 'pass';

  let validCount = 0;
  operations.forEach((raw, index) => {
    const operation = raw as Partial<VyralDnaChangeOperationV1> | null;
    const fail = (reason: string) => errors.push('Operation ' + index + ': ' + reason);
    if (!operation || typeof operation !== 'object' || !['add', 'replace', 'remove'].includes(String(operation.op))) {
      fail('unsupported operation.');
      return;
    }
    const parts = typeof operation.path === 'string' ? parsePointer(operation.path) : null;
    if (!parts || parts.length < 3 || parts[0] !== 'dna_record' || !ALLOWED_DNA_SECTIONS.has(parts[1]) ||
        parts.some((part) => PROTECTED_SEGMENTS.has(part.toLowerCase()))) {
      fail('path is outside the editable DNA allowlist or targets a protected identity/integrity field.');
      return;
    }
    if (!Array.isArray(operation.evidenceRefs) || operation.evidenceRefs.length === 0 ||
        operation.evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
      fail('at least one non-empty evidence reference is required.');
      return;
    }
    const current = getOwnPath(dnaRoot, parts.slice(1));
    if (operation.op === 'add') {
      if (current.exists || !Object.prototype.hasOwnProperty.call(operation, 'after')) {
        fail('add requires a missing target and an explicit after value.');
        return;
      }
    } else {
      if (!current.exists || !Object.prototype.hasOwnProperty.call(operation, 'before') || !sameJson(current.value, operation.before)) {
        fail('before value does not exactly match the current DNA snapshot.');
        return;
      }
      if (operation.op === 'replace' && !Object.prototype.hasOwnProperty.call(operation, 'after')) {
        fail('replace requires an explicit after value.');
        return;
      }
    }
    try { canonicalizeVyralJsonV1(operation.after); }
    catch { if (operation.op !== 'remove') { fail('after value is not valid JSON.'); return; } }
    validCount += 1;
  });

  checks.operations = errors.some((error) => error.startsWith('Operation ')) ? 'fail' : 'pass';
  const status = checks.operations === 'pass' && validCount === operations.length ? 'validated' : 'invalid';
  return { validatorVersion: 1, status, changeSetSha256: actualHash, checks, errors, validatedOperationCount: status === 'validated' ? validCount : 0 };
};
