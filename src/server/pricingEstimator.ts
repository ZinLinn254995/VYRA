export type GenerationCapability = 'text' | 'image' | 'audio' | 'video';
export type EstimateStatus = 'exact' | 'approximate' | 'unavailable';

export interface PricingLine {
  billable?: string;
  unit?: string;
  cost_usd?: number;
  resolution?: string;
  quality?: string;
}

export interface EstimateParameters {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  inputCharacters?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  resolution?: string;
}

export interface EstimateResult {
  status: EstimateStatus;
  currency: 'USD';
  estimatedCostUsd: number | null;
  minimumCostUsd?: number;
  maximumCostUsd?: number;
  pricingSource: 'openrouter-model-catalog' | 'openrouter-endpoint-pricing' | 'none';
  pricingFetchedAt: string | null;
  reason:
    | 'priced'
    | 'pricing_unavailable'
    | 'parameters_incomplete'
    | 'pricing_structure_unsupported'
    | 'ambiguous_provider_pricing';
  message: string;
}

const validNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const unavailable = (
  reason: EstimateResult['reason'],
  message: string,
  pricingFetchedAt: string | null = null,
): EstimateResult => ({
  status: 'unavailable',
  currency: 'USD',
  estimatedCostUsd: null,
  pricingSource: 'none',
  pricingFetchedAt,
  reason,
  message,
});

const roundUsd = (value: number): number => Number(value.toFixed(10));

/**
 * Estimate only from explicit provider billing units. Unknown SKU names and
 * guessed unit conversions are deliberately rejected rather than interpreted.
 */
export function estimateOpenRouterCost(input: {
  capability: GenerationCapability;
  parameters: EstimateParameters;
  pricing?: { prompt?: string; completion?: string };
  pricingLines?: PricingLine[];
  pricingSkus?: Record<string, string>;
  pricingFetchedAt?: string;
}): EstimateResult {
  const { capability, parameters } = input;
  const fetchedAt = input.pricingFetchedAt || null;

  if (capability === 'text') {
    const promptRate = input.pricing?.prompt;
    const completionRate = input.pricing?.completion;
    if (promptRate === undefined || completionRate === undefined) {
      return unavailable('pricing_unavailable', 'The selected model does not publish complete prompt and completion pricing.', fetchedAt);
    }
    const promptPrice = Number(promptRate);
    const completionPrice = Number(completionRate);
    if (!validNumber(promptPrice) || !validNumber(completionPrice)) {
      return unavailable('pricing_structure_unsupported', 'The model pricing values are not valid numeric USD-per-token rates.', fetchedAt);
    }
    if (!positiveInteger(parameters.promptTokens) || !positiveInteger(parameters.completionTokens)) {
      return unavailable('parameters_incomplete', 'Exact prompt and completion token counts are required. Character counts are not silently converted to tokens.', fetchedAt);
    }
    const cost = parameters.promptTokens * promptPrice + parameters.completionTokens * completionPrice;
    return {
      status: 'exact', currency: 'USD', estimatedCostUsd: roundUsd(cost),
      pricingSource: 'openrouter-model-catalog', pricingFetchedAt: fetchedAt,
      reason: 'priced', message: 'Calculated from published per-token rates and exact token counts.',
    };
  }

  const lines = (input.pricingLines || []).filter((line) =>
    validNumber(line.cost_usd) && typeof line.unit === 'string' && line.unit.length > 0
  );
  if (!lines.length) {
    return unavailable(
      input.pricingSkus && Object.keys(input.pricingSkus).length
        ? 'pricing_structure_unsupported'
        : 'pricing_unavailable',
      input.pricingSkus && Object.keys(input.pricingSkus).length
        ? 'The provider supplied pricing SKU metadata, but its billing unit cannot be safely interpreted yet.'
        : 'The selected model has no structured, unit-based pricing metadata.',
      fetchedAt,
    );
  }

  const matching = lines.filter((line) =>
    line.resolution === undefined || line.resolution === parameters.resolution
  );
  if (!matching.length) {
    return unavailable('parameters_incomplete', 'The selected resolution does not match a published pricing tier.', fetchedAt);
  }

  const costs: number[] = [];
  for (const line of matching) {
    let quantity: number;
    switch (line.unit.toLowerCase()) {
      case 'image':
      case 'images':
        if (capability !== 'image' || !positiveInteger(parameters.imageCount)) {
          return unavailable('parameters_incomplete', 'A positive image count is required by this pricing unit.', fetchedAt);
        }
        quantity = parameters.imageCount;
        break;
      case 'megapixel':
      case 'megapixels':
        if (capability !== 'image' || !positiveInteger(parameters.width) || !positiveInteger(parameters.height)) {
          return unavailable('parameters_incomplete', 'Exact output width and height are required for megapixel pricing.', fetchedAt);
        }
        quantity = (parameters.width * parameters.height) / 1_000_000;
        break;
      case 'second':
      case 'seconds':
      case 'video_second':
      case 'video_seconds':
      case 'audio_second':
      case 'audio_seconds':
        if ((capability !== 'video' && capability !== 'audio') || !positiveInteger(parameters.durationSeconds)) {
          return unavailable('parameters_incomplete', 'A positive media duration is required by this pricing unit.', fetchedAt);
        }
        quantity = parameters.durationSeconds;
        break;
      case 'character':
      case 'characters':
        if (capability !== 'audio' || !positiveInteger(parameters.inputCharacters)) {
          return unavailable('parameters_incomplete', 'The exact narration character count is required by this pricing unit.', fetchedAt);
        }
        quantity = parameters.inputCharacters;
        break;
      case 'token':
      case 'tokens':
        if (capability !== 'audio' || !positiveInteger(parameters.inputTokens) || !positiveInteger(parameters.outputTokens)) {
          return unavailable('parameters_incomplete', 'Exact input and output token counts are required by this audio pricing unit.', fetchedAt);
        }
        quantity = parameters.inputTokens + parameters.outputTokens;
        break;
      case 'request':
      case 'requests':
        quantity = 1;
        break;
      default:
        return unavailable('pricing_structure_unsupported', 'The provider uses an unsupported billing unit: ' + line.unit + '.', fetchedAt);
    }
    costs.push(quantity * line.cost_usd);
  }

  if (costs.some((cost) => !Number.isFinite(cost) || cost < 0)) {
    return unavailable('pricing_structure_unsupported', 'The pricing calculation produced an invalid value.', fetchedAt);
  }
  const minimum = Math.min(...costs);
  const maximum = Math.max(...costs);
  if (minimum !== maximum) {
    return {
      status: 'approximate', currency: 'USD', estimatedCostUsd: null,
      minimumCostUsd: roundUsd(minimum), maximumCostUsd: roundUsd(maximum),
      pricingSource: 'openrouter-endpoint-pricing', pricingFetchedAt: fetchedAt,
      reason: 'ambiguous_provider_pricing',
      message: 'Available providers publish different prices. The range is shown instead of choosing a provider price that may not be used.',
    };
  }
  return {
    status: 'exact', currency: 'USD', estimatedCostUsd: roundUsd(minimum),
    pricingSource: 'openrouter-endpoint-pricing', pricingFetchedAt: fetchedAt,
    reason: 'priced', message: 'Calculated from an explicit provider billing unit and the supplied request parameters.',
  };
}
