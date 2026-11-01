import express, { type Request, type Response } from 'express';
import { estimateOpenRouterCost, type GenerationCapability, type EstimateParameters, type PricingLine } from './pricingEstimator.js';

const router = express.Router();
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function readOpenRouterKey(req: Request): string {
  const key = req.header('x-openrouter-api-key')?.trim() || '';
  return key.length > 10 && key.length <= 512 ? key : '';
}

async function fetchCatalog(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-OpenRouter-Title': 'VYRA',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safePricingLines(value: unknown, provider: string): PricingLine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry) => {
    const line = asRecord(entry);
    return {
      provider,
      billable: typeof line.billable === 'string' ? line.billable.slice(0, 80) : undefined,
      unit: typeof line.unit === 'string' ? line.unit.slice(0, 40) : undefined,
      cost_usd: typeof line.cost_usd === 'number' ? line.cost_usd : Number.NaN,
      resolution: typeof line.resolution === 'string' ? line.resolution.slice(0, 40) : undefined,
      quality: typeof line.quality === 'string' ? line.quality.slice(0, 40) : undefined,
    };
  });
}

function normalizeParameters(value: unknown): EstimateParameters {
  const input = asRecord(value);
  const numericKeys = [
    'promptTokens', 'completionTokenBudget', 'inputTokens', 'outputTokens', 'imageCount',
    'inputImageCount', 'inputCharacters', 'durationSeconds', 'width', 'height',
  ] as const;
  const output: EstimateParameters = {};
  for (const key of numericKeys) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) output[key] = input[key] as never;
  }
  if (typeof input.resolution === 'string') output.resolution = input.resolution.slice(0, 40);
  if (typeof input.quality === 'string') output.quality = input.quality.slice(0, 40);
  return output;
}

router.post('/providers/openrouter/estimate', async (req: Request, res: Response) => {
  const apiKey = readOpenRouterKey(req);
  if (!apiKey) return res.status(400).json({ error: 'Reconnect your OpenRouter API key before requesting a live estimate.' });

  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let window = requestWindows.get(clientKey);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + 60_000 };
    requestWindows.set(clientKey, window);
  }
  window.count += 1;
  if (window.count > 12) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))));
    return res.status(429).json({ error: 'Pricing refresh limit reached. Wait before requesting another estimate.' });
  }
  if (requestWindows.size > 5000) {
    for (const [key, entry] of requestWindows) if (entry.resetAt <= now) requestWindows.delete(key);
  }

  const body = asRecord(req.body);
  const capability = body.capability;
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!['text', 'image', 'audio', 'video'].includes(String(capability))) {
    return res.status(400).json({ error: 'Choose a supported capability: text, image, audio or video.' });
  }
  if (!/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.:-]{1,120}$/.test(model)) {
    return res.status(400).json({ error: 'Select a valid model ID from the OpenRouter catalog.' });
  }
  const parameters = normalizeParameters(body.parameters);
  const capabilityValue = capability as GenerationCapability;

  try {
    let pricingLines: PricingLine[] = [];
    let pricing: { prompt?: string; completion?: string } | undefined;
    let pricingSkus: Record<string, string> | undefined;

    if (capabilityValue === 'image') {
      const segments = model.split('/').map(encodeURIComponent);
      const payload = asRecord(await fetchCatalog(
        'https://openrouter.ai/api/v1/images/models/' + segments.join('/') + '/endpoints',
        apiKey,
      ));
      const data = payload.data;
      const dataRecord = asRecord(data);
      const endpoints = Array.isArray(data) ? data
        : Array.isArray(dataRecord.endpoints) ? dataRecord.endpoints
          : Array.isArray(payload.endpoints) ? payload.endpoints : [];
      pricingLines = endpoints.slice(0, 50).flatMap((endpoint, index) => {
        const record = asRecord(endpoint);
        const provider = typeof record.provider_name === 'string' ? record.provider_name
          : typeof record.provider === 'string' ? record.provider
            : typeof record.name === 'string' ? record.name : 'unknown-provider-' + index;
        return safePricingLines(record.pricing, provider);
      });
      if (!endpoints.length) return res.status(404).json({ error: 'No provider pricing endpoints were returned for this image model.' });
    } else {
      const catalogUrl = capabilityValue === 'video'
        ? 'https://openrouter.ai/api/v1/videos/models'
        : 'https://openrouter.ai/api/v1/models?output_modalities=' + (capabilityValue === 'audio' ? 'speech' : 'text');
      const payload = asRecord(await fetchCatalog(catalogUrl, apiKey));
      const models = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
      const catalogModel = models.map(asRecord).find((entry) => entry.id === model || entry.model_id === model);
      if (!catalogModel) return res.status(404).json({ error: 'The selected model was not found in the live OpenRouter catalog.' });
      const rawPricing = asRecord(catalogModel.pricing);
      pricing = {
        prompt: typeof rawPricing.prompt === 'string' ? rawPricing.prompt : undefined,
        completion: typeof rawPricing.completion === 'string' ? rawPricing.completion : undefined,
      };
      pricingLines = safePricingLines(catalogModel.pricing, 'catalog');
      const rawSkus = asRecord(catalogModel.pricing_skus);
      if (Object.keys(rawSkus).length) {
        pricingSkus = Object.fromEntries(Object.entries(rawSkus).slice(0, 50).map(([key, value]) => [key, String(value)]));
      }
    }

    const fetchedAt = new Date().toISOString();
    const estimate = estimateOpenRouterCost({
      capability: capabilityValue, parameters, pricing, pricingLines, pricingSkus, pricingFetchedAt: fetchedAt,
    });
    return res.status(200).json({
      provider: 'openrouter', capability: capabilityValue, model, estimate, requestParameters: parameters,
    });
  } catch {
    return res.status(502).json({
      error: 'Could not retrieve current OpenRouter pricing metadata. No price was estimated; try again before generating.',
      code: 'PRICING_METADATA_UNAVAILABLE',
    });
  }
});

export function createPricingRouter() {
  return router;
}
