export interface MediaCreditPricingPolicy {
  version: string;
  creditsPerUsd: string;
  roundingMode: 'ceil';
}

function decimalParts(value: string): { numerator: bigint; scale: number } {
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,12})?$/.test(normalized)) {
    throw new Error('Expected a non-negative decimal value.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return { numerator: BigInt(whole + fraction), scale: fraction.length };
}

/** Mirrors the database pricing rule using exact decimal arithmetic, never binary floating point. */
export function calculateRequiredMediaCredits(maxCostUsd: string, creditsPerUsd: string): bigint {
  const cost = decimalParts(maxCostUsd);
  const rate = decimalParts(creditsPerUsd);
  if (cost.numerator <= 0n || rate.numerator <= 0n) {
    throw new Error('Cost and credits-per-USD must both be positive.');
  }
  const numerator = cost.numerator * rate.numerator;
  const denominator = 10n ** BigInt(cost.scale + rate.scale);
  return (numerator + denominator - 1n) / denominator;
}

export function validateMediaCreditPolicyDraft(input: {
  version: string;
  creditsPerUsd: string;
}): MediaCreditPricingPolicy {
  const version = input.version.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(version)) {
    throw new Error('Policy version must contain 2–80 safe characters.');
  }
  const rate = input.creditsPerUsd.trim();
  const parsed = decimalParts(rate);
  if (parsed.numerator <= 0n || rate.split('.')[1]?.length > 8) {
    throw new Error('Credits-per-USD must be positive with at most 8 decimal places.');
  }
  return { version, creditsPerUsd: rate, roundingMode: 'ceil' };
}
