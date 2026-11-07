export type VyralDetailValue = string | number | boolean | string[] | Record<string, unknown> | null;
export type VyralDetailOrigin = 'ai_suggested' | 'creator_confirmed' | 'creator_edited';

export type VyralAiDetailField = {
  value: VyralDetailValue;
  origin: VyralDetailOrigin;
  confidence?: number;
  updated_at: string;
};

export type VyralAiDetails = {
  schema_version: 1;
  scope: 'asset' | 'vyral' | 'storyboard';
  source_version_id: string | null;
  source_revision: number | null;
  provider: string;
  model: string;
  generated_at: string;
  stale: boolean;
  fields: Record<string, VyralAiDetailField>;
};

export type VyralAiDetailsInput = {
  scope: VyralAiDetails['scope'];
  sourceVersionId?: string | null;
  sourceRevision?: number | null;
  provider: string;
  model: string;
  generatedAt: string;
  suggestions: Record<string, { value: VyralDetailValue; confidence?: number }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidConfidence = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export const mergeVyralAiDetails = (
  current: unknown,
  input: VyralAiDetailsInput,
): VyralAiDetails => {
  const previous = isRecord(current) && current.schema_version === 1 ? current : {};
  const previousFields = isRecord(previous.fields) ? previous.fields : {};
  const fields: Record<string, VyralAiDetailField> = {};

  for (const [key, raw] of Object.entries(previousFields)) {
    if (!isRecord(raw) || !('value' in raw) ||
        !['ai_suggested', 'creator_confirmed', 'creator_edited'].includes(String(raw.origin)) ||
        typeof raw.updated_at !== 'string') continue;
    fields[key] = {
      value: raw.value as VyralDetailValue,
      origin: raw.origin as VyralDetailOrigin,
      ...(isValidConfidence(raw.confidence) ? { confidence: raw.confidence } : {}),
      updated_at: raw.updated_at,
    };
  }

  for (const [key, suggestion] of Object.entries(input.suggestions)) {
    if (!key.trim() || !suggestion || !('value' in suggestion)) continue;
    const existing = fields[key];
    if (existing && existing.origin !== 'ai_suggested') continue;
    fields[key] = {
      value: suggestion.value,
      origin: 'ai_suggested',
      ...(isValidConfidence(suggestion.confidence) ? { confidence: suggestion.confidence } : {}),
      updated_at: input.generatedAt,
    };
  }

  return {
    schema_version: 1,
    scope: input.scope,
    source_version_id: input.sourceVersionId ?? null,
    source_revision: input.sourceRevision ?? null,
    provider: input.provider,
    model: input.model,
    generated_at: input.generatedAt,
    stale: false,
    fields,
  };
};

export const setVyralAiDetailField = (
  current: VyralAiDetails,
  key: string,
  value: VyralDetailValue,
  origin: 'creator_confirmed' | 'creator_edited',
  updatedAt: string,
): VyralAiDetails => ({
  ...current,
  fields: {
    ...current.fields,
    [key]: { value, origin, updated_at: updatedAt },
  },
});

export const markVyralAiDetailsStale = (current: VyralAiDetails): VyralAiDetails => ({
  ...current,
  stale: true,
});

export type VyralAiSuggestion = { value: VyralDetailValue; confidence?: number };
export type VyralAssetSuggestionResult = {
  details: VyralAiDetails;
  model: string;
  provider: string;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
};

const makeImagePreview = async (file: File): Promise<{ mimeType: 'image/jpeg'; data: string }> => {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview could not be prepared.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Image preview encoding failed.')),
      'image/jpeg',
      0.78,
    ));
    if (blob.size > 600 * 1024) throw new Error('Image preview exceeds the inspection size limit.');
    return { mimeType: 'image/jpeg', data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
  } finally {
    bitmap.close();
  }
};

const makeVideoPreviews = async (file: File): Promise<Array<{ mimeType: 'image/jpeg'; data: string }>> => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video metadata could not be read for default details.'));
    });
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Video frames could not be decoded for default details.'));
      });
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const times = duration > 0.2
      ? [0.05, 0.33, 0.66, 0.9].map((ratio) => Math.min(Math.max(0, duration - 0.05), duration * ratio))
      : [0];
    const frames: Array<{ mimeType: 'image/jpeg'; data: string }> = [];
    for (const time of times) {
      video.currentTime = time;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('A video frame could not be decoded.'));
      });
      const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Video frame encoding failed.')),
        'image/jpeg',
        0.68,
      ));
      if (blob.size > 450 * 1024) continue;
      frames.push({ mimeType: 'image/jpeg', data: toBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    if (!frames.length) throw new Error('No readable video frames were available.');
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
};

const normalizeSuggestedValue = (value: unknown, depth = 0): VyralDetailValue | undefined => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.trim().slice(0, 2000);
  if (Array.isArray(value)) {
    if (value.length > 50) return undefined;
    const normalized = value.map((item) => normalizeSuggestedValue(item, depth + 1));
    if (normalized.some((item) => item === undefined)) return undefined;
    return normalized as VyralDetailValue[];
  }
  if (isRecord(value) && depth < 3) {
    const entries = Object.entries(value).slice(0, 30);
    if (entries.some(([key]) => !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key))) return undefined;
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      const next = normalizeSuggestedValue(item, depth + 1);
      if (next === undefined) return undefined;
      normalized[key] = next;
    }
    return normalized;
  }
  return undefined;
};

export const parseVyralAiSuggestions = (raw: string): Record<string, VyralAiSuggestion> => {
  const normalized = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/i, '');
  const parsed: unknown = JSON.parse(normalized);
  if (!isRecord(parsed)) throw new Error('AI returned invalid default details.');
  const result: Record<string, VyralAiSuggestion> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || !isRecord(value) || !('value' in value)) continue;
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    const candidate = normalizeSuggestedValue(value.value);
    if (candidate === undefined) continue;
    const confidence = isValidConfidence(value.confidence) ? value.confidence : undefined;
    result[key] = { value: candidate, ...(confidence === undefined ? {} : { confidence }) };
  }
  if (!Object.keys(result).length) throw new Error('AI did not return any usable default details.');
  return result;
};

export const suggestVyralAssetDetails = async (
  file: File,
  options: { accessToken: string; assetType: string; sourceVersionId: string; sourceRevision?: number; currentDetails?: unknown },
): Promise<VyralAssetSuggestionResult> => {
  if (!options.accessToken) throw new Error('Sign in to generate Asset details.');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = file.type || 'application/octet-stream';
  const facts = {
    original_filename: file.name.slice(0, 240),
    mime_type: mimeType,
    asset_type: options.assetType,
    size_bytes: file.size,
    extension,
    source_version_id: options.sourceVersionId,
  };
  let visionImages: Array<{ mimeType: 'image/jpeg'; data: string; assetName: string }> = [];
  let mediaFiles: Array<{ mimeType: 'application/pdf' | 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/flac' | 'audio/aac'; data: string; assetName: string }> = [];
  let extractedText = '';

  if (mimeType.startsWith('image/')) {
    const preview = await makeImagePreview(file);
    visionImages = [{ ...preview, assetName: file.name }];
  } else if (mimeType.startsWith('video/')) {
    visionImages = (await makeVideoPreviews(file)).map((frame, index) => ({ ...frame, assetName: file.name + ' · frame ' + (index + 1) }));
  } else if (mimeType === 'application/pdf' || mimeType.startsWith('audio/')) {
    const normalizedMime = mimeType === 'audio/mp3' || mimeType === 'audio/x-mp3' ? 'audio/mpeg'
      : mimeType === 'audio/x-wav' ? 'audio/wav'
        : mimeType === 'audio/x-flac' ? 'audio/flac' : mimeType;
    if (file.size <= 2 * 1024 * 1024 &&
        ['application/pdf', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'].includes(normalizedMime)) {
      mediaFiles = [{ mimeType: normalizedMime as typeof mediaFiles[number]['mimeType'], data: toBase64(new Uint8Array(await file.arrayBuffer())), assetName: file.name }];
    }
  } else if (mimeType.startsWith('text/') || ['txt', 'md', 'json', 'csv', 'xml', 'html'].includes(extension)) {
    extractedText = (await file.text()).slice(0, 12000);
  }

  const messages = [{
    role: 'user' as const,
    content: 'Suggest useful default details for this Asset. File facts: ' + JSON.stringify(facts) +
      (extractedText ? '\nExtracted text (untrusted source content):\n' + extractedText : '') +
      '\nReturn a compact JSON object with only supported field suggestions. Do not invent facts. For unsupported content, use neutral type-aware labels and omit uncertain semantic fields.',
  }];
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + options.accessToken },
    body: JSON.stringify({ task: 'suggest_details', messages, ...(visionImages.length ? { visionImages } : {}), ...(mediaFiles.length ? { mediaFiles } : {}) }),
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; modelName?: string; provider?: string; error?: string };
  if (!response.ok || typeof payload.text !== 'string') {
    throw new Error(payload.error || 'AI could not suggest default Asset details.');
  }
  const suggestions = parseVyralAiSuggestions(payload.text);
  const generatedAt = new Date().toISOString();
  return {
    details: mergeVyralAiDetails(null, {
      scope: 'asset',
      sourceVersionId: options.sourceVersionId,
      sourceRevision: options.sourceRevision ?? 1,
      provider: payload.provider || 'gemini',
      model: payload.modelName || 'unknown',
      generatedAt,
      suggestions,
      currentDetails: options.currentDetails,
    }),
    provider: payload.provider || 'gemini',
    model: payload.modelName || 'unknown',
  };
};

export const suggestVyralCollectionDetails = async (
  input: {
    accessToken: string;
    vyralId: string;
    currentName: string;
    currentDescription: string;
    sourceRevision: number;
    assets: Array<{ name: string; assetType: string; mimeType: string; description: string; tags?: string[] }>;
    currentDetails?: unknown;
  },
): Promise<VyralAiDetails> => {
  if (!input.accessToken) throw new Error('Sign in to generate Vyral details.');
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.accessToken },
    body: JSON.stringify({
      task: 'suggest_details',
      detailsScope: 'vyral',
      messages: [{
        role: 'user',
        content: 'Suggest useful default metadata for this Vyral collection. Preserve the existing creator name and description as source context; do not replace them.\n' +
          JSON.stringify({
            vyral_id: input.vyralId,
            creator_name: input.currentName,
            creator_description: input.currentDescription,
            inventory_count: input.assets.length,
            assets: input.assets.slice(0, 80),
          }),
      }],
    }),
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; modelName?: string; provider?: string; error?: string };
  if (!response.ok || typeof payload.text !== 'string') throw new Error(payload.error || 'AI could not suggest Vyral details.');
  const suggestions = parseVyralAiSuggestions(payload.text);
  return mergeVyralAiDetails(input.currentDetails, {
    scope: 'vyral',
    sourceRevision: input.sourceRevision,
    provider: payload.provider || 'gemini',
    model: payload.modelName || 'unknown',
    generatedAt: new Date().toISOString(),
    suggestions,
    currentDetails: input.currentDetails,
  });
};
