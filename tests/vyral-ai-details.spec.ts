import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markVyralAiDetailsStale,
  mergeVyralAiDetails,
  parseVyralAiSuggestions,
  setVyralAiDetailField,
} from '../src/services/vyralAiDetails.ts';

const generatedAt = '2026-11-08T10:00:00.000Z';

test('AI detail suggestions fill defaults without overwriting creator edits', () => {
  const first = mergeVyralAiDetails(null, {
    scope: 'asset',
    sourceVersionId: 'version-1',
    provider: 'gemini',
    model: 'vision-model',
    generatedAt,
    suggestions: {
      name: { value: 'Red Circle', confidence: 0.98 },
      category: { value: 'Shape', confidence: 0.9 },
      description: { value: 'A simple red circle on a light background.' },
    },
  });
  const edited = setVyralAiDetailField(first, 'name', 'My own title', 'creator_edited', generatedAt);
  const refreshed = mergeVyralAiDetails(edited, {
    scope: 'asset',
    sourceVersionId: 'version-2',
    provider: 'gemini',
    model: 'vision-model',
    generatedAt: '2026-11-08T11:00:00.000Z',
    suggestions: {
      name: { value: 'New AI title' },
      category: { value: 'Graphic' },
      style: { value: 'Minimal' },
    },
  });

  assert.equal(refreshed.fields.name.value, 'My own title');
  assert.equal(refreshed.fields.name.origin, 'creator_edited');
  assert.equal(refreshed.fields.category.value, 'Graphic');
  assert.equal(refreshed.fields.style.value, 'Minimal');
  assert.equal(refreshed.source_version_id, 'version-2');
});

test('AI details support Vyral and Storyboard scopes without mandatory fields', () => {
  for (const scope of ['vyral', 'storyboard'] as const) {
    const details = mergeVyralAiDetails(null, {
      scope, provider: 'gemini', model: 'text-model', generatedAt, suggestions: {},
    });
    assert.equal(details.scope, scope);
    assert.deepEqual(details.fields, {});
    assert.equal(details.stale, false);
  }
});

test('AI detail provenance preserves confirmation and marks version-bound suggestions stale', () => {
  const details = mergeVyralAiDetails(null, {
    scope: 'asset',
    sourceVersionId: 'version-1',
    provider: 'gemini',
    model: 'vision-model',
    generatedAt,
    suggestions: { style: { value: 'Watercolor', confidence: 0.8 } },
  });
  const confirmed = setVyralAiDetailField(details, 'style', 'Watercolor', 'creator_confirmed', generatedAt);
  assert.equal(confirmed.fields.style.origin, 'creator_confirmed');
  assert.equal(markVyralAiDetailsStale(confirmed).stale, true);
  assert.equal(confirmed.stale, false);
});


test('AI detail parser accepts safe custom type-specific fields and structured values', () => {
  const parsed = parseVyralAiSuggestions(JSON.stringify({
    name: { value: 'Blue Heron' },
    visual_characteristics: { value: { dominant_colors: ['blue', 'grey'], pose: 'standing' }, confidence: 0.88 },
    production_notes: { value: ['soft light', 'wide framing'] },
  }));
  assert.equal(parsed.name.value, 'Blue Heron');
  assert.deepEqual(parsed.visual_characteristics.value, { dominant_colors: ['blue', 'grey'], pose: 'standing' });
  assert.deepEqual(parsed.production_notes.value, ['soft light', 'wide framing']);
});

test('AI detail parser rejects unsafe or unsupported structured values', () => {
  const parsed = parseVyralAiSuggestions('{"constructor":{"value":"unsafe"},"__proto__":{"value":"unsafe"},"malformed":{"value":{"nested":{"too":{"deep":"not accepted"}}}},"usable":{"value":"still accepted"}}');
  assert.equal(parsed.usable.value, 'still accepted');
  assert.equal('constructor' in parsed, false);
  assert.equal('__proto__' in parsed, false);
  assert.equal('malformed' in parsed, false);
});


test('AI suggestions may replace system defaults but never creator-authored values', () => {
  const initial = mergeVyralAiDetails(null, {
    scope: 'storyboard', provider: 'openrouter', model: 'text-model', generatedAt,
    suggestions: { title: { value: 'AI title' } },
  });
  const systemDefault = setVyralAiDetailField(initial, 'title', 'Untitled Storyboard', 'creator_edited', generatedAt);
  const refreshed = mergeVyralAiDetails(systemDefault, {
    scope: 'storyboard', provider: 'openrouter', model: 'text-model', generatedAt,
    suggestions: { title: { value: 'Another AI title' } },
  });
  assert.equal(refreshed.fields.title.value, 'Untitled Storyboard');
  assert.equal(refreshed.fields.title.origin, 'creator_edited');

  const defaults = {
    ...initial,
    fields: {
      title: { value: 'Untitled Storyboard', origin: 'system_default' as const, updated_at: generatedAt },
    },
  };
  const replaced = mergeVyralAiDetails(defaults, {
    scope: 'storyboard', provider: 'openrouter', model: 'text-model', generatedAt,
    suggestions: { title: { value: 'Suggested title' } },
  });
  assert.equal(replaced.fields.title.value, 'Suggested title');
  assert.equal(replaced.fields.title.origin, 'ai_suggested');
});
