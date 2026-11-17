import { createProjectRenderManifest, type ProjectRenderManifestInput } from './projectRenderManifest';
import { buildProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
import {
  resolveProjectRenderCompositionInputs,
  type ProjectRenderResolvedInputs,
  type ProjectRenderSourceResolver,
} from './projectRenderInputResolver';
import type { ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
import type { ProjectRenderManifest } from './projectRenderManifest';

export type PreparedProjectRender = {
  manifest: ProjectRenderManifest;
  compositionPlan: ProjectRenderCompositionPlan;
  resolvedInputs: ProjectRenderResolvedInputs;
};

/**
 * Capture one detached timeline snapshot, derive its deterministic composition
 * plan, and resolve exactly the source bytes pinned by that plan.
 *
 * This is intentionally a preparation boundary: it does not mutate editor state,
 * create a durable job, encode media, or upload an output file.
 */
export async function prepareProjectRender(
  input: ProjectRenderManifestInput,
  options: {
    concurrency?: number;
    resolver?: ProjectRenderSourceResolver;
  } = {},
): Promise<PreparedProjectRender> {
  if (!input?.projectId?.trim()) throw new Error('A Project ID is required to prepare a render.');
  const manifest = createProjectRenderManifest(input);
  const compositionPlan = buildProjectRenderCompositionPlan(manifest);
  const resolvedInputs = await resolveProjectRenderCompositionInputs({
    projectId: manifest.projectId,
    compositionPlan,
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  }, options.resolver);
  return { manifest, compositionPlan, resolvedInputs };
}
