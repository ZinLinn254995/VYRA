import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMediaModel, type MediaModelCandidate } from '../src/services/mediaModelSelection.ts';

const models: MediaModelCandidate[] = [
  { id: 'budget-video', provider: 'runway', displayName: 'Budget Video', tasks: ['video'], enabled: true, qualityScore: 55, estimatedCostUsd: 0.12, estimatedLatencyMs: 9000, supportsDnaReferences: false },
  { id: 'balanced-video', provider: 'runway', displayName: 'Balanced Video', tasks: ['video'], enabled: true, qualityScore: 78, estimatedCostUsd: 0.4, estimatedLatencyMs: 12000, supportsDnaReferences: true },
  { id: 'premium-video', provider: 'runway', displayName: 'Premium Video', tasks: ['video', 'video-edit'], enabled: true, qualityScore: 94, estimatedCostUsd: 1.2, estimatedLatencyMs: 18000, supportsDnaReferences: true },
  { id: 'unknown-price', provider: 'runway', displayName: 'Unquoted Video', tasks: ['video'], enabled: true, qualityScore: 99, estimatedCostUsd: null, estimatedLatencyMs: 5000, supportsDnaReferences: true },
  { id: 'disabled-video', provider: 'runway', displayName: 'Disabled Video', tasks: ['video'], enabled: false, qualityScore: 99, estimatedCostUsd: 0.01, estimatedLatencyMs: 1000, supportsDnaReferences: true },
  { id: 'image-only', provider: 'runway', displayName: 'Image Only', tasks: ['image'], enabled: true, qualityScore: 99, estimatedCostUsd: 0.01, estimatedLatencyMs: 1000, supportsDnaReferences: true },
];

test('defaults to automatic mode and chooses the lowest-cost eligible draft model', () => {
  const result = selectMediaModel({ task: 'video', quality: 'draft', maxCostUsd: 0.5 }, models);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, 'auto');
    assert.equal(result.selectedBy, 'automatic');
    assert.equal(result.model.id, 'budget-video');
  }
});

test('standard mode balances quality against fresh quoted cost', () => {
  const result = selectMediaModel({ task: 'video', quality: 'standard', maxCostUsd: 1 }, models);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.model.id, 'balanced-video');
});

test('premium mode prioritizes the highest quality that fits the budget', () => {
  const result = selectMediaModel({ task: 'video', quality: 'premium', maxCostUsd: 2 }, models);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.model.id, 'premium-video');
});

test('manual override selects only an eligible allowlisted model', () => {
  const result = selectMediaModel({
    task: 'video', quality: 'draft', maxCostUsd: 0.5,
    mode: 'manual', requestedModelId: 'balanced-video',
  }, models);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.selectedBy, 'user');
    assert.equal(result.model.id, 'balanced-video');
  }
});

test('manual mode requires a model and rejects models outside budget or task allowlist', () => {
  assert.deepEqual(
    selectMediaModel({ task: 'video', quality: 'draft', maxCostUsd: 0.5, mode: 'manual' }, models),
    { ok: false, reason: 'manual-model-required' },
  );
  assert.deepEqual(
    selectMediaModel({ task: 'video', quality: 'draft', maxCostUsd: 0.5, mode: 'manual', requestedModelId: 'premium-video' }, models),
    { ok: false, reason: 'manual-model-unavailable' },
  );
  assert.deepEqual(
    selectMediaModel({ task: 'video', quality: 'draft', maxCostUsd: 0.5, mode: 'manual', requestedModelId: 'image-only' }, models),
    { ok: false, reason: 'manual-model-unavailable' },
  );
});

test('excludes unquoted, disabled, wrong-task and DNA-incompatible models', () => {
  const result = selectMediaModel({
    task: 'video', quality: 'premium', maxCostUsd: 10, requiresDnaReferences: true,
  }, models);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.model.id, 'premium-video');
});

test('never exceeds the user budget and rejects invalid budgets', () => {
  assert.deepEqual(
    selectMediaModel({ task: 'video', quality: 'premium', maxCostUsd: 0.5 }, models),
    { ok: false, reason: 'no-eligible-model' },
  );
  assert.deepEqual(
    selectMediaModel({ task: 'video', quality: 'draft', maxCostUsd: Number.NaN }, models),
    { ok: false, reason: 'invalid-budget' },
  );
});

test('uses no UI assumptions and has no provider/network side effects', () => {
  const result = selectMediaModel({ task: 'image', quality: 'draft', maxCostUsd: 1 }, models);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.model.id, 'image-only');
});
