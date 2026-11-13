import { VYRA_AI_CAPABILITIES, type AiCapabilityAccess } from './vyraAiCapabilityRegistry.ts';
import { listRegisteredAiCapabilityAdapterIds } from './aiCapabilityExecutor.ts';

export type AiCapabilityCoverageStatus =
  | 'executor-connected'
  | 'executor-missing'
  | 'human-controlled'
  | 'owner-admin-gated';

export interface AiCapabilityCoverageEntry {
  id: string;
  domain: string;
  access: AiCapabilityAccess;
  status: AiCapabilityCoverageStatus;
  description: string;
}

export interface AiCapabilityCoverageReport {
  total: number;
  connected: number;
  missingExecutors: number;
  humanControlled: number;
  ownerAdminGated: number;
  completionPercent: number;
  domains: Array<{
    domain: string;
    total: number;
    connected: number;
    missingExecutors: number;
    humanControlled: number;
    ownerAdminGated: number;
  }>;
  capabilities: AiCapabilityCoverageEntry[];
  unknownExecutorIds: string[];
}

/**
 * Produces an honest, deterministic implementation-coverage report.
 * The caller must supply capability IDs whose server adapters are actually
 * registered in the current runtime. Catalogue entries are never treated as
 * implemented merely because they are listed in the registry.
 */
export function buildAiCapabilityCoverage(
  connectedExecutorIds: Iterable<string>,
): AiCapabilityCoverageReport {
  const connected = new Set(connectedExecutorIds);
  const known = new Set(VYRA_AI_CAPABILITIES.map((item) => item.id));
  const capabilities = VYRA_AI_CAPABILITIES.map((policy): AiCapabilityCoverageEntry => {
    const status: AiCapabilityCoverageStatus = policy.access === 'human-only'
      ? 'human-controlled'
      : policy.access === 'owner-admin-only'
        ? 'owner-admin-gated'
        : connected.has(policy.id)
          ? 'executor-connected'
          : 'executor-missing';
    return { id: policy.id, domain: policy.domain, access: policy.access, status, description: policy.description };
  });
  const count = (status: AiCapabilityCoverageStatus) => capabilities.filter((item) => item.status === status).length;
  const domains = [...new Set(capabilities.map((item) => item.domain))].map((domain) => {
    const entries = capabilities.filter((item) => item.domain === domain);
    const domainCount = (status: AiCapabilityCoverageStatus) => entries.filter((item) => item.status === status).length;
    return {
      domain,
      total: entries.length,
      connected: domainCount('executor-connected'),
      missingExecutors: domainCount('executor-missing'),
      humanControlled: domainCount('human-controlled'),
      ownerAdminGated: domainCount('owner-admin-gated'),
    };
  });
  const total = capabilities.length;
  const connectedCount = count('executor-connected');
  return {
    total,
    connected: connectedCount,
    missingExecutors: count('executor-missing'),
    humanControlled: count('human-controlled'),
    ownerAdminGated: count('owner-admin-gated'),
    completionPercent: total === 0 ? 100 : Math.round((connectedCount / total) * 10000) / 100,
    domains,
    capabilities,
    unknownExecutorIds: [...connected].filter((id) => !known.has(id)).sort(),
  };
}

/** Builds coverage directly from the live server adapter registry. */
export function buildRuntimeAiCapabilityCoverage(): AiCapabilityCoverageReport {
  return buildAiCapabilityCoverage(listRegisteredAiCapabilityAdapterIds());
}
