import { getProjectRenderSourceKey } from './projectRenderManifest';
import { getProjectRenderLayerKey } from './projectRenderFrameSynchronizer';
import { getProjectRenderFrameState, type ProjectRenderFrameState } from './projectRenderFrameScheduler';
import type { ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';

export type ProjectRenderCanvasSource = CanvasImageSource & {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
};

export type ProjectRenderCanvasFrameOptions = {
  context: CanvasRenderingContext2D;
  plan: ProjectRenderCompositionPlan;
  timeSeconds: number;
  width: number;
  height: number;
  sources: ReadonlyMap<string, ProjectRenderCanvasSource>;
  backgroundColor?: string;
  textColor?: string;
  font?: string;
  padding?: number;
};

function sourceDimensions(source: ProjectRenderCanvasSource): { width: number; height: number } {
  const width = source.videoWidth || source.naturalWidth || source.width || 0;
  const height = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('A render source must have decoded, non-zero dimensions before canvas composition.');
  }
  return { width, height };
}

function drawContained(context: CanvasRenderingContext2D, source: ProjectRenderCanvasSource, width: number, height: number): void {
  const dimensions = sourceDimensions(source);
  const scale = Math.min(width / dimensions.width, height / dimensions.height);
  const drawWidth = dimensions.width * scale;
  const drawHeight = dimensions.height * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawText(context: CanvasRenderingContext2D, frame: ProjectRenderFrameState, width: number, height: number,
  color: string, font: string, padding: number): void {
  const lines = frame.text.map((layer) => layer.content.trim()).filter(Boolean);
  if (!lines.length) return;
  context.save();
  try {
    context.fillStyle = color;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    const lineHeight = Math.max(18, Number.parseFloat(font) * 1.25 || 30);
    const maxWidth = Math.max(1, width - padding * 2);
    const wrapped: string[] = [];
    for (const line of lines) {
      const words = line.split(/\s+/);
      let current = '';
      for (const word of words) {
        const candidate = current ? current + ' ' + word : word;
        if (current && context.measureText(candidate).width > maxWidth) {
          wrapped.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) wrapped.push(current);
    }
    let y = height - padding;
    for (let index = wrapped.length - 1; index >= 0; index -= 1) {
      context.fillText(wrapped[index], width / 2, y, maxWidth);
      y -= lineHeight;
    }
  } finally {
    context.restore();
  }
}

/**
 * Compose one already-decoded timestamp into a caller-owned canvas context.
 * Media decoding/seeking, audio mixing, transition effects and encoding remain
 * separate pipeline stages; this function never mutates the pinned plan.
 */
export function drawProjectRenderCanvasFrame(options: ProjectRenderCanvasFrameOptions): ProjectRenderFrameState {
  const { context, plan, timeSeconds, width, height, sources } = options;
  if (!context || !plan || !sources || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0) {
    throw new Error('A canvas context, composition plan, source map, and positive integer output dimensions are required.');
  }
  const frame = getProjectRenderFrameState(plan, timeSeconds);
  context.save();
  try {
    context.clearRect(0, 0, width, height);
    context.fillStyle = options.backgroundColor ?? '#000000';
    context.fillRect(0, 0, width, height);
    for (const layer of frame.visuals) {
      const source = sources.get(getProjectRenderLayerKey(layer)) ?? sources.get(getProjectRenderSourceKey(layer.source));
      if (!source) throw new Error('A decoded canvas source is missing for render layer ' + layer.clipId + '.');
      drawContained(context, source, width, height);
    }
    drawText(context, frame, width, height, options.textColor ?? '#ffffff',
      options.font ?? '32px sans-serif', options.padding ?? 48);
    return frame;
  } finally {
    context.restore();
  }
}
