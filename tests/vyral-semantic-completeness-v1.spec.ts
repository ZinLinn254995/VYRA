import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVyralSemanticCompletenessV1 } from '../src/services/vyralSemanticCompletenessV1.ts';

const sha = 'a'.repeat(64);
const base = () => ({
  assetType: 'image',
  sourceVersionId: 'version-1',
  sourceSha256: sha,
  observations: [] as Array<{
    sourceVersionId: string; sourceSha256: string;
    evidenceClass: 'ai_observed' | 'creator_confirmed' | 'system_measured' | 'independently_verified';
    fields: Record<string, unknown>; evidenceRef: string;
  }>,
});
const completeFields = {
  subject: { value: 'single red circle' },
  composition: { value: 'centered single object' },
  geometry: { value: 'circle' },
  spatial_layout: { value: 'centered' },
  color_palette: { value: ['red', 'near-white'] },
  background: { value: 'near-white' },
  style: { value: 'minimal flat graphic' },
  text_presence: { status: 'not_applicable' },
};

test('requires source-pinned trusted evidence for every required image field', () => {
  const input = base();
  input.observations.push({
    sourceVersionId: 'version-1', sourceSha256: sha,
    evidenceClass: 'creator_confirmed', fields: completeFields, evidenceRef: 'review-1',
  });
  const result = assessVyralSemanticCompletenessV1(input);
  assert.equal(result.status, 'complete');
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.verifiedFieldCount, 8);
  assert.equal(result.fields.find((field) => field.key === 'text_presence')?.status, 'not_applicable');
});

test('AI-only observations remain provisional and cannot complete required fields', () => {
  const input = base();
  input.observations.push({
    sourceVersionId: 'version-1', sourceSha256: sha,
    evidenceClass: 'ai_observed', fields: completeFields, evidenceRef: 'vision-1',
  });
  const result = assessVyralSemanticCompletenessV1(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.provisionalFieldCount, 8);
  assert.equal(result.verifiedFieldCount, 0);
  assert.equal(result.coveragePercent, 0);
});

test('ignores observations tied to a different source version or hash', () => {
  const input = base();
  input.observations.push({
    sourceVersionId: 'version-old', sourceSha256: sha,
    evidenceClass: 'creator_confirmed', fields: completeFields, evidenceRef: 'old-review',
  });
  const result = assessVyralSemanticCompletenessV1(input);
  assert.equal(result.status, 'blocked');
  assert.equal(result.ignoredObservationCount, 1);
  assert.equal(result.missingFieldCount, 8);
});

test('reports partial coverage when only some trusted facts exist', () => {
  const input = base();
  input.observations.push({
    sourceVersionId: 'version-1', sourceSha256: sha,
    evidenceClass: 'system_measured',
    fields: { dimensions: { value: 'not a semantic field' }, geometry: { value: 'circle' }, color: { value: 'red' } },
    evidenceRef: 'measurement-1',
  });
  const result = assessVyralSemanticCompletenessV1(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.verifiedFieldCount, 2);
  assert.equal(result.missingFieldCount, 6);
});

test('rejects malformed assessment identity', () => {
  const input = base();
  input.sourceSha256 = 'invalid';
  assert.throws(() => assessVyralSemanticCompletenessV1(input), /identity is invalid/);
});

test('uses a generic semantic profile for non-image asset types', () => {
  const input = base();
  input.assetType = 'audio';
  const result = assessVyralSemanticCompletenessV1(input);
  assert.equal(result.profile, 'generic_semantic_core_v1');
  assert.equal(result.requiredFieldCount, 4);
  assert.equal(result.status, 'blocked');
});
