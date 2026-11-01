export type SpendCapability = 'text' | 'image' | 'audio' | 'video';

export interface SpendConfirmationOptions {
  operation: string;
  capability: SpendCapability;
  model: string;
  apiKey?: string;
  parameters?: Record<string, number | string | undefined>;
}

/**
 * A user-facing preflight gate. If pricing or request quantities cannot be
 * be verified, it asks for explicit approval with UNAVAILABLE rather than
 * fabricating a cost. It never sends the generation request itself.
 */
export async function confirmSpendBeforeGeneration(options: SpendConfirmationOptions): Promise<boolean> {
  let estimateText = 'Estimated cost: UNAVAILABLE — verified pricing or required request parameters are not available.';
  let estimateReason = 'No verified estimate was returned. The provider may still charge your account.';

  if (options.apiKey && options.model) {
    try {
      const response = await fetch('/api/providers/openrouter/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openrouter-api-key': options.apiKey,
        },
        body: JSON.stringify({
          capability: options.capability,
          model: options.model,
          parameters: options.parameters || {},
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        estimate?: {
          status?: 'exact' | 'approximate' | 'unavailable';
          estimatedCostUsd?: number | null;
          minimumCostUsd?: number;
          maximumCostUsd?: number;
          message?: string;
          reason?: string;
        };
        error?: string;
      };
      const estimate = data.estimate;
      if (response.ok && estimate) {
        estimateReason = estimate.message || estimate.reason || estimateReason;
        if (estimate.status === 'exact' && typeof estimate.estimatedCostUsd === 'number') {
          estimateText = 'Estimated cost: $' + estimate.estimatedCostUsd.toFixed(6) + ' USD';
        } else if (
          estimate.status === 'approximate' &&
          typeof estimate.minimumCostUsd === 'number' &&
          typeof estimate.maximumCostUsd === 'number'
        ) {
          estimateText = 'Estimated cost range: $' + estimate.minimumCostUsd.toFixed(6) +
            '–$' + estimate.maximumCostUsd.toFixed(6) + ' USD (provider-dependent)';
        } else {
          estimateText = 'Estimated cost: UNAVAILABLE — ' + estimateReason;
        }
      } else {
        estimateReason = data.error || estimateReason;
      }
    } catch {
      estimateReason = 'Pricing service could not be reached. The provider may still charge your account.';
    }
  } else {
    estimateReason = 'A live OpenRouter pricing lookup is not available for the configured provider. The provider may still charge your account.';
  }

  return window.confirm(
    'VYRA generation cost confirmation\n\n' +
    'Operation: ' + options.operation + '\n' +
    'Capability: ' + options.capability.toUpperCase() + '\n' +
    'Model: ' + options.model + '\n\n' +
    estimateText + '\n' +
    'Pricing note: ' + estimateReason + '\n\n' +
    'Creative approval is not payment approval. Continue only if you accept possible provider charges.'
  );
}
