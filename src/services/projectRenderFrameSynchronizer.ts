import { getProjectRenderSourceKey } from './projectRenderManifest';
import { getProjectRenderFrameState, type ProjectRenderFrameState } from './projectRenderFrameScheduler';
import { decodeProjectRenderVideoFrame, type ProjectRenderDecodedVideo, type ProjectRenderVideoDecoderPorts } from './projectRenderVideoDecoder';
import type { ProjectRenderCompositionPlan, ProjectRenderVisualLayer } from './projectRenderCompositionPlanner';
import type { ProjectRenderResolvedSource } from './projectRenderSourceResolver';

export function getProjectRenderLayerKey(layer: Pick<ProjectRenderVisualLayer, 'trackId' | 'clipId'>): string {
  return layer.trackId + ':' + layer.clipId;
}

export type ProjectRenderSynchronizedFrame = {
  frame: ProjectRenderFrameState;
  sources: ReadonlyMap<string, CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number }>;
  dispose: () => void;
};

export type ProjectRenderFrameSynchronizerPorts = {
  createImageBitmap: (blob: Blob) => Promise<ImageBitmap>;
  decodeVideo: (input: { blob: Blob; mimeType: string; timeSeconds: number; signal?: AbortSignal }) => Promise<ProjectRenderDecodedVideo>;
};

const defaultPorts: ProjectRenderFrameSynchronizerPorts = {
  createImageBitmap: (blob) => createImageBitmap(blob),
  decodeVideo: (input) => decodeProjectRenderVideoFrame(input),
};

/**
 * Resolve every visual clip active at one output timestamp. Images may share
 * one decoded bitmap; videos are decoded per clip because the same source may
 * be used by overlapping clips at different source timestamps.
 */
export async function synchronizeProjectRenderFrame(input: {
  plan: ProjectRenderCompositionPlan;
  timeSeconds: number;
  resolvedSources: ReadonlyMap<string, ProjectRenderResolvedSource>;
  signal?: AbortSignal;
  maxConcurrency?: number;
}, ports: ProjectRenderFrameSynchronizerPorts = defaultPorts): Promise<ProjectRenderSynchronizedFrame> {
  const maxConcurrency = input.maxConcurrency ?? 3;
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 6) {
    throw new Error('Project render frame synchronization concurrency must be between 1 and 6.');
  }
  if (input.signal?.aborted) throw new DOMException('Frame synchronization was aborted.', 'AbortError');

  const frame = getProjectRenderFrameState(input.plan, input.timeSeconds);
  const uniqueImages = new Map<string, ProjectRenderResolvedSource>();
  const visualTasks = frame.visuals.map((layer) => {
    const sourceKey = getProjectRenderSourceKey(layer.source);
    const resolved = input.resolvedSources.get(sourceKey);
    if (!resolved || resolved.projectId !== input.plan.projectId || resolved.sourceKey !== sourceKey) {
      throw new Error('A resolved Project render source is missing or belongs to another Project: ' + layer.clipId + '.');
    }
    const expectedPrefix = layer.kind === 'video' ? 'video/' : 'image/';
    if (!resolved.mimeType.toLowerCase().startsWith(expectedPrefix)) {
      throw new Error('The resolved media kind does not match render layer ' + layer.clipId + '.');
    }
    if (layer.kind === 'image') uniqueImages.set(sourceKey, resolved);
    return { layer, sourceKey, resolved };
  });

  const decoded = new Map<string, CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number }>();
  const disposers: Array<() => void> = [];
  const imagePromises = new Map<string, Promise<ImageBitmap>>();
  let cursor = 0;
  let failed: unknown;

  const decodeOne = async (task: typeof visualTasks[number]): Promise<void> => {
    if (input.signal?.aborted) throw new DOMException('Frame synchronization was aborted.', 'AbortError');
    const layerKey = getProjectRenderLayerKey(task.layer);
    if (task.layer.kind === 'image') {
      let promise = imagePromises.get(task.sourceKey);
      if (!promise) {
        promise = ports.createImageBitmap(task.resolved.blob);
        imagePromises.set(task.sourceKey, promise);
      }
      const bitmap = await promise;
      if (input.signal?.aborted) {
        bitmap.close();
        throw new DOMException('Frame synchronization was aborted.', 'AbortError');
      }
      decoded.set(layerKey, bitmap);
      return;
    }
    const result = await ports.decodeVideo({
      blob: task.resolved.blob,
      mimeType: task.resolved.mimeType,
      timeSeconds: task.layer.sourceTimeSeconds,
      signal: input.signal,
    });
    disposers.push(result.dispose);
    if (input.signal?.aborted) {
      result.dispose();
      throw new DOMException('Frame synchronization was aborted.', 'AbortError');
    }
    decoded.set(layerKey, result.video);
  };

  const worker = async () => {
    while (true) {
      if (failed !== undefined || input.signal?.aborted) return;
      const index = cursor++;
      if (index >= visualTasks.length) return;
      try {
        await decodeOne(visualTasks[index]);
      } catch (error) {
        failed = error;
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, visualTasks.length) }, worker));
    if (failed !== undefined) throw failed;
    if (input.signal?.aborted) throw new DOMException('Frame synchronization was aborted.', 'AbortError');
    let disposed = false;
    return {
      frame,
      sources: decoded,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposers.forEach((dispose) => dispose());
        for (const source of decoded.values()) {
          if (source instanceof ImageBitmap) source.close();
        }
        decoded.clear();
      },
    };
  } catch (error) {
    disposers.forEach((dispose) => dispose());
    for (const source of decoded.values()) {
      if (source instanceof ImageBitmap) source.close();
    }
    for (const promise of imagePromises.values()) {
      void promise.then((bitmap) => { if (![...decoded.values()].includes(bitmap)) bitmap.close(); }).catch(() => {});
    }
    throw error;
  }
}
