import { getProjectRenderSourceKey, type ProjectRenderSource } from './projectRenderManifest';
import type { ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
import {
  resolveProjectRenderSourceBlob,
  type ProjectRenderMediaKind,
  type ProjectRenderResolvedSource,
} from './projectRenderSourceResolver';

export type ProjectRenderSourceResolver = typeof resolveProjectRenderSourceBlob;

export type ProjectRenderResolvedInputs = {
  projectId: string;
  sources: ProjectRenderResolvedSource[];
};

/**
 * Resolve every unique source pinned by a deterministic composition plan.
 *
 * Resolution is deliberately bounded: large Projects may reference many media
 * files, and downloading all of them simultaneously can exhaust browser memory
 * or trigger storage/provider throttling.
 */
export async function resolveProjectRenderCompositionInputs(
  input: {
    projectId: string;
    compositionPlan: ProjectRenderCompositionPlan;
    concurrency?: number;
  },
  resolver: ProjectRenderSourceResolver = resolveProjectRenderSourceBlob,
): Promise<ProjectRenderResolvedInputs> {
  const { projectId, compositionPlan } = input;
  if (!projectId.trim() || !compositionPlan || compositionPlan.projectId !== projectId ||
      compositionPlan.schema !== 'vyra.project-render-composition-plan' || compositionPlan.version !== 1) {
    throw new Error('A supported composition plan for the active Project is required.');
  }

  const expectedKinds = new Map<string, ProjectRenderMediaKind>();
  const sourceDescriptors = new Map<string, string>();
  const describeSource = (source: ProjectRenderSource) => source.kind === 'project-file'
    ? JSON.stringify({ kind: source.kind, projectFileId: source.projectFileId, mimeType: source.mimeType ?? '' })
    : JSON.stringify({ kind: source.kind, assetId: source.assetId, assetVersionId: source.assetVersionId, mimeType: source.mimeType ?? '' });
  const registerUsage = (source: ProjectRenderSource, kind: ProjectRenderMediaKind) => {
    const key = getProjectRenderSourceKey(source);
    const descriptor = describeSource(source);
    const priorDescriptor = sourceDescriptors.get(key);
    if (priorDescriptor && priorDescriptor !== descriptor) {
      throw new Error('A render source has conflicting immutable identity or MIME metadata in the composition plan.');
    }
    sourceDescriptors.set(key, descriptor);
    const existing = expectedKinds.get(key);
    if (existing && existing !== kind) {
      throw new Error('A render source cannot be used as both ' + existing + ' and ' + kind + ' media.');
    }
    expectedKinds.set(key, kind);
  };

  compositionPlan.visuals.forEach((layer) => registerUsage(layer.source, layer.kind));
  compositionPlan.audio.forEach((layer) => registerUsage(layer.source, 'audio'));

  const uniqueSources = new Map<string, ProjectRenderSource>();
  for (const source of compositionPlan.requiredSources) {
    const key = getProjectRenderSourceKey(source);
    if (uniqueSources.has(key)) throw new Error('The composition plan contains a duplicate required render source.');
    if (!expectedKinds.has(key)) throw new Error('The composition plan contains an unused required render source.');
    if (sourceDescriptors.get(key) !== describeSource(source)) {
      throw new Error('A required render source does not match its pinned layer identity or MIME metadata.');
    }
    uniqueSources.set(key, source);
  }
  for (const key of expectedKinds.keys()) {
    if (!uniqueSources.has(key)) throw new Error('The composition plan is missing a required render source.');
  }

  const entries = [...uniqueSources.entries()];
  const concurrency = input.concurrency ?? 3;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 6) {
    throw new Error('Render source resolution concurrency must be between 1 and 6.');
  }

  const resolved: ProjectRenderResolvedSource[] = new Array(entries.length);
  let nextIndex = 0;
  let firstError: unknown = null;
  const worker = async () => {
    while (!firstError) {
      const index = nextIndex++;
      if (index >= entries.length) return;
      const [sourceKey, source] = entries[index];
      try {
        const result = await resolver({
          projectId,
          source,
          expectedKind: expectedKinds.get(sourceKey)!,
        });
        const expectedKind = expectedKinds.get(sourceKey)!;
        const actualMime = result.mimeType.split(';', 1)[0].trim().toLowerCase();
        const declaredMime = source.mimeType?.split(';', 1)[0].trim().toLowerCase();
        if (result.projectId !== projectId || result.sourceKey !== sourceKey || !result.blob.size ||
            !actualMime.startsWith(expectedKind + '/') ||
            (declaredMime && actualMime !== declaredMime)) {
          throw new Error('A resolved render source does not match its pinned Project identity, MIME type, or byte requirements.');
        }
        resolved[index] = result;
      } catch (error) {
        firstError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  if (firstError) throw firstError;
  return { projectId, sources: resolved };
}
