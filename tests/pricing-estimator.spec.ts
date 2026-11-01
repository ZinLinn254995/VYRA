import { test, expect } from '@playwright/test';
import { estimateOpenRouterCost } from '../src/server/pricingEstimator';

test('text estimate requires exact token counts and uses per-token rates', () => {
  const missing = estimateOpenRouterCost({
    capability: 'text', pricing: { prompt: '0.000001', completion: '0.000002' },
    parameters: { promptTokens: 100 },
  });
  expect(missing.status).toBe('unavailable');
  expect(missing.reason).toBe('parameters_incomplete');

  const estimate = estimateOpenRouterCost({
    capability: 'text', pricing: { prompt: '0.000001', completion: '0.000002' },
    parameters: { promptTokens: 100, completionTokens: 50 },
  });
  expect(estimate.status).toBe('exact');
  expect(estimate.estimatedCostUsd).toBe(0.0002);
});

test('image estimate supports per-image and megapixel billing only with required dimensions', () => {
  const byImage = estimateOpenRouterCost({
    capability: 'image', pricingLines: [{ billable: 'output_image', unit: 'image', cost_usd: 0.04 }],
    parameters: { imageCount: 2 },
  });
  expect(byImage.status).toBe('exact');
  expect(byImage.estimatedCostUsd).toBe(0.08);

  const missingDimensions = estimateOpenRouterCost({
    capability: 'image', pricingLines: [{ billable: 'output_image', unit: 'megapixel', cost_usd: 0.03 }],
    parameters: { imageCount: 1 },
  });
  expect(missingDimensions.reason).toBe('parameters_incomplete');
});

test('audio and video estimates follow explicit published units', () => {
  const audio = estimateOpenRouterCost({
    capability: 'audio', pricingLines: [{ billable: 'input_audio', unit: 'character', cost_usd: 0.00001 }],
    parameters: { inputCharacters: 1000 },
  });
  expect(audio.estimatedCostUsd).toBe(0.01);

  const video = estimateOpenRouterCost({
    capability: 'video', pricingLines: [{ billable: 'output_video', unit: 'video_second', cost_usd: 0.005 }],
    parameters: { durationSeconds: 8 },
  });
  expect(video.estimatedCostUsd).toBe(0.04);
});

test('unknown video pricing SKUs are not guessed into a cost', () => {
  const result = estimateOpenRouterCost({
    capability: 'video', pricingSkus: { '720p-4s': '0.08' },
    parameters: { durationSeconds: 4, resolution: '720p' },
  });
  expect(result.status).toBe('unavailable');
  expect(result.reason).toBe('pricing_structure_unsupported');
  expect(result.estimatedCostUsd).toBeNull();
});

test('provider price differences are reported as a range, not an invented single estimate', () => {
  const result = estimateOpenRouterCost({
    capability: 'image',
    pricingLines: [
      { billable: 'output_image', unit: 'image', cost_usd: 0.03 },
      { billable: 'output_image', unit: 'image', cost_usd: 0.05 },
    ],
    parameters: { imageCount: 1 },
  });
  expect(result.status).toBe('approximate');
  expect(result.minimumCostUsd).toBe(0.03);
  expect(result.maximumCostUsd).toBe(0.05);
  expect(result.estimatedCostUsd).toBeNull();
});

test('missing pricing metadata remains unavailable', () => {
  const result = estimateOpenRouterCost({ capability: 'audio', parameters: { inputCharacters: 120 } });
  expect(result.status).toBe('unavailable');
  expect(result.reason).toBe('pricing_unavailable');
});
