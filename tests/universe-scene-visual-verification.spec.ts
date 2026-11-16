import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSceneVisualVerification } from '../src/services/universeSceneVisualVerification.ts';

const base = {
  mediaId: 'media-1',
  mediaKind: 'image' as const,
  baselineRevision: 'scene-rev-4',
  currentBaselineRevision: 'scene-rev-4',
  anchors: [
    { path: 'character.mira.hair', expectedValue: 'long black hair', scope: 'persistent' as const, visibility: 'required' as const },
    { path: 'character.mira.coat', expectedValue: 'blue coat', scope: 'persistent' as const, visibility: 'required' as const },
  ],
  inspectionComplete: true,
};

test('marks all required high-confidence matching visual anchors consistent but still requires creator approval', () => {
  const result = evaluateSceneVisualVerification({ ...base, observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 0.98, evidence: 'Long black hair is visible.' },
    { path: 'character.mira.coat', status: 'match', confidence: 0.96, evidence: 'Blue coat is visible.' },
  ] });
  assert.equal(result.status, 'consistent');
  assert.deepEqual(result.coverage, { required: 2, matched: 2, mismatched: 0, unknown: 0 });
  assert.equal(result.approvalRequired, true);
  assert.equal(result.canonicalStateChanged, false);
});

test('detects a high-confidence mismatch without changing canonical state', () => {
  const result = evaluateSceneVisualVerification({ ...base, observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 0.98, evidence: 'Hair matches.' },
    { path: 'character.mira.coat', status: 'mismatch', confidence: 0.94, evidence: 'A red jacket is visible.', observedValue: 'red jacket' },
  ] });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.findings[1].status, 'mismatch');
  assert.equal(result.canonicalStateChanged, false);
});

test('keeps hidden or low-confidence attributes unknown rather than calling them mismatches', () => {
  const result = evaluateSceneVisualVerification({ ...base, observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 0.98, evidence: 'Hair visible.' },
    { path: 'character.mira.coat', status: 'unknown', confidence: 0.2, evidence: 'Coat is obscured.' },
  ] });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.findings[1].status, 'unknown');
});

test('rejects results inspected against a stale approved baseline', () => {
  const result = evaluateSceneVisualVerification({ ...base, currentBaselineRevision: 'scene-rev-5', observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 1, evidence: 'Hair visible.' },
    { path: 'character.mira.coat', status: 'match', confidence: 1, evidence: 'Coat visible.' },
  ] });
  assert.equal(result.status, 'needs_review');
  assert.ok(result.limitations.some((item) => item.includes('baseline changed')));
});

test('video verification preserves frame timestamps and detects drift across sampled frames', () => {
  const result = evaluateSceneVisualVerification({
    ...base,
    mediaKind: 'video',
    observations: [
      { path: 'character.mira.hair', status: 'match', confidence: 0.95, evidence: 'Frame 1 hair matches.', frameTimeMs: 0 },
      { path: 'character.mira.hair', status: 'mismatch', confidence: 0.91, evidence: 'Hair changes in frame 2.', frameTimeMs: 2400, observedValue: 'short blonde hair' },
      { path: 'character.mira.coat', status: 'match', confidence: 0.95, evidence: 'Coat matches.', frameTimeMs: 0 },
      { path: 'character.mira.coat', status: 'match', confidence: 0.95, evidence: 'Coat remains blue.', frameTimeMs: 2400 },
    ],
  });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.findings[0].status, 'mismatch');
  assert.deepEqual(result.findings[0].frameTimesMs, [0, 2400]);
  assert.ok(result.limitations.some((item) => item.includes('frame-sampled')));
});

test('does not claim consistency for incomplete inspections or empty required coverage', () => {
  const incomplete = evaluateSceneVisualVerification({ ...base, inspectionComplete: false, observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 1, evidence: 'Hair visible.' },
    { path: 'character.mira.coat', status: 'match', confidence: 1, evidence: 'Coat visible.' },
  ] });
  assert.equal(incomplete.status, 'needs_review');
  const empty = evaluateSceneVisualVerification({ ...base, anchors: [], observations: [] });
  assert.equal(empty.status, 'needs_review');
});

test('rejects unsafe paths and observations for unapproved anchors', () => {
  assert.throws(() => evaluateSceneVisualVerification({ ...base, anchors: [
    { path: 'character.__proto__.hair', expectedValue: 'x', scope: 'persistent', visibility: 'required' },
  ], observations: [] }), /safe dot-separated/);
  assert.throws(() => evaluateSceneVisualVerification({ ...base, observations: [
    { path: 'unknown.asset', status: 'match', confidence: 1, evidence: 'Not anchored.' },
  ] }), /does not map/);
});

test('optional invisible anchors do not block required-coverage consistency but remain visible as unknown', () => {
  const result = evaluateSceneVisualVerification({
    ...base,
    anchors: [...base.anchors, { path: 'environment.signage', expectedValue: 'North Gate', scope: 'persistent', visibility: 'optional' }],
    observations: [
      { path: 'character.mira.hair', status: 'match', confidence: 0.98, evidence: 'Hair visible.' },
      { path: 'character.mira.coat', status: 'match', confidence: 0.98, evidence: 'Coat visible.' },
      { path: 'environment.signage', status: 'unknown', confidence: 0.1, evidence: 'Sign is out of frame.' },
    ],
  });
  assert.equal(result.status, 'consistent');
  assert.equal(result.findings[2].status, 'unknown');
});


test('builds a narrow repair prompt without granting canon approval or spending authority', async () => {
  const { buildSceneVisualRepairPrompt } = await import('../src/services/universeSceneVisualVerification.ts');
  const result = evaluateSceneVisualVerification({ ...base, observations: [
    { path: 'character.mira.hair', status: 'match', confidence: 0.98, evidence: 'Hair matches.' },
    { path: 'character.mira.coat', status: 'mismatch', confidence: 0.94, evidence: 'A red jacket is visible.', observedValue: 'red jacket' },
  ] });
  const prompt = buildSceneVisualRepairPrompt(result, {
    purpose: 'Show the character clearly',
    action: 'The character turns toward camera',
  });
  assert.match(prompt, /Correct only the listed mismatches/);
  assert.match(prompt, /character.mira.coat/);
  assert.match(prompt, /expected "blue coat"/);
  assert.match(prompt, /Do not change the canonical Scene state/);
  assert.match(prompt, /without explicit creator approval/);
  assert.match(prompt, /\\n/);
});
