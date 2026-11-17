import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectDetailSuggestions } from '../src/services/projectDetailSuggestions.ts';

test('Project detail suggestions normalize field names and preserve structured values', () => {
  const result = parseProjectDetailSuggestions(JSON.stringify({
    projectTitle: { value: 'Quiet Planet' },
    visual_characteristics: { value: { palette: ['blue', 'grey'], lighting: 'soft' }, confidence: 0.9 },
    production_notes: { value: ['wide framing', 'slow movement'] },
  }));
  assert.equal(result.project_title.value, 'Quiet Planet');
  assert.deepEqual(result.visual_characteristics.value, { palette: ['blue', 'grey'], lighting: 'soft' });
  assert.deepEqual(result.production_notes.value, ['wide framing', 'slow movement']);
  assert.equal(result.visual_characteristics.confidence, 0.9);
});

test('Project detail suggestions reject unsafe keys and malformed nested values', () => {
  const result = parseProjectDetailSuggestions('{"__proto__":{"value":"bad"},"constructor":{"value":"bad"},"too_deep":{"value":{"a":{"b":{"c":{"d":"bad"}}}}},"usable":{"value":"safe"}}');
  assert.equal(result.usable.value, 'safe');
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(Object.hasOwn(result, 'constructor'), false);
});
