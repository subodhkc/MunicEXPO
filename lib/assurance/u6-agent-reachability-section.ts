/**
 * U6 "Agent Reachability" report section.
 *
 * Builds a bounded, HISTORICAL Agent Reachability read-model summary for the
 * exact source scan bound to a completed Assurance evaluation.
 *
 * LOCKS:
 *   CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE
 *   NO_HISTORICAL_BINDING -> NOT_AVAILABLE (never current-trace fallback)
 *   CROSS_SCAN_JOIN = INVALID
 *   AGENT_REACHABILITY_REPORT_SECTION != U5_DECISION_INPUT
 *   REACHABILITY_COUNT != RISK_SCORE
 */

import { loadEvaluatedOperationCoverage, type EvaluatedScanUnavailable } from './u6-scan-loader';
import {
  buildAgentReachabilityReadModel,
  type AgentReachabilityReadModel,
} from '@/lib/ai-inventory/agent-reachability-read-model';
import type { AssuranceEvaluation } from './types';
import type { AgentReachabilityReportSection } from './u6-types';

const MAX_AGENTS = 12;
const MAX_RELATIONSHIPS = 12;
const MAX_CHANNELS = 12;
const MAX_HUBS = 12;
const MAX_TOOL_CAPABILITIES = 24;
const MAX_CREDENTIALS = 12;
const MAX_DEFERRED = 12;
const MAX_PERSISTENCE = 12;
const MAX_FRONTIERS = 12;

function mapAvailability(
  readModelAvailability: AgentReachabilityReadModel['availability'],
): AgentReachabilityReportSection['availability'] {
  return readModelAvailability;
}

function mapAriUnavailableReason(
  reason: AgentReachabilityReadModel['unavailableReason'],
): NonNullable<AgentReachabilityReportSection['unavailableReason']> {
  switch (reason) {
    case 'ARI_NOT_PRESENT_IN_SNAPSHOT':
    case 'ARI_NOT_ANALYZED':
    case 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED':
      return reason;
    case 'OPERATION_COVERAGE_NOT_AVAILABLE':
    case 'SOURCE_GAP':
      return 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE';
    case 'UNSUPPORTED_SCHEMA':
      return 'EVALUATED_SNAPSHOT_INVALID';
    default:
      return 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE';
  }
}

function summarizeSection(
  readModel: AgentReachabilityReadModel,
): AgentReachabilityReportSection {
  const agents = readModel.agents.items.slice(0, MAX_AGENTS).map((a) => ({
    agentId: a.id,
    displayName: a.displayName,
    framework: a.framework,
    sourceLocation: a.sourceLocation,
    candidateState: a.candidateState,
    declaredToolReferences: a.declaredToolReferences,
    reachableResourceKeys: a.reachableResourceKeys,
    limitations: a.limitations,
  }));

  const relationships = readModel.relationships.items.slice(0, MAX_RELATIONSHIPS).map((r) => ({
    id: r.id,
    kind: r.kind,
    fromAgentId: r.fromAgentId,
    toAgentId: r.toAgentId,
    toToolId: r.toToolId,
    toExternalRef: r.toExternalRef,
    state: r.state,
    statement: r.statement,
    limitations: r.limitations,
  }));

  const potentialChannels = readModel.potentialChannels.items.slice(0, MAX_CHANNELS).map((c) => ({
    id: c.id,
    resourceKey: c.resourceKey,
    resourceClass: c.resourceClass,
    state: c.state,
    writers: c.writers,
    readers: c.readers,
    publishers: c.publishers,
    subscribers: c.subscribers,
    statement: c.statement,
    limitations: c.limitations,
  }));

  const sharedResourceHubs = readModel.sharedResourceHubs.items.slice(0, MAX_HUBS).map((h) => ({
    resourceKey: h.resourceKey,
    resourceClass: h.resourceClass,
    environment: h.environment,
    partition: h.partition,
    tenant: h.tenant,
    namespace: h.namespace,
    resourceKeyName: h.resourceKeyName,
    state: h.state,
    participantAgentIds: h.participantAgentIds,
    accessTypes: h.accessTypes,
    statement: h.statement,
    limitations: h.limitations,
  }));

  const toolCapabilities = readModel.agents.items
    .flatMap((a) =>
      a.toolCapabilities.map((tc) => ({
        agentId: a.id,
        toolId: tc.toolId,
        toolName: tc.toolName,
        sourceLocation: tc.sourceLocation,
        stages: tc.stages.map((s) => ({
          kind: s.stage,
          state: s.state,
          canonicalId: s.relationIds.length === 1 ? s.relationIds[0] : null,
          sourceRelationIds: s.relationIds,
          limitations: s.limitations,
        })),
        limitations: a.limitations,
      })),
    )
    .slice(0, MAX_TOOL_CAPABILITIES);

  const credentialChains = readModel.credentialChains.items.slice(0, MAX_CREDENTIALS).map((c) => ({
    id: c.id,
    credentialReference: c.credentialReference,
    usedBy: c.usedBy,
    statement: c.statement,
    limitations: c.limitations,
  }));

  const deferredPaths = readModel.deferredPaths.items.slice(0, MAX_DEFERRED).map((d) => ({
    id: d.id,
    sourceAgentName: d.sourceAgentName,
    publishResourceKey: d.publishResourceKey,
    closureState: d.closureState,
    consumerNames: d.consumerNames,
    handlerRefs: d.handlerRefs,
    statement: d.statement,
    limitations: d.limitations,
  }));

  const persistenceCreation = readModel.persistenceCreation.items.slice(0, MAX_PERSISTENCE).map((p) => ({
    id: p.id,
    agentName: p.agentName,
    mechanismKind: p.mechanismKind,
    state: p.state,
    statement: p.statement,
    futureExecutionStatement: p.futureExecutionStatement,
    limitations: p.limitations,
  }));

  const frontiers = readModel.frontiers.items.slice(0, MAX_FRONTIERS).map((f) => ({
    id: f.id,
    dimension: f.dimension,
    reason: f.reason,
  }));

  const coverage = readModel.coverage.items.map((c) => ({
    family: c.family,
    state: c.state,
    limitations: c.limitations,
  }));

  return {
    availability: mapAvailability(readModel.availability),
    scanId: readModel.scanId,
    commitSha: readModel.commitSha,
    summary: {
      ...readModel.summary,
      coverageFamilyCount: coverage.length,
    },
    agents,
    relationships,
    potentialChannels,
    sharedResourceHubs,
    toolCapabilities,
    credentialChains,
    deferredPaths,
    persistenceCreation,
    frontiers,
    coverage,
    coverageLimitations: readModel.coverage.items.flatMap((c) => c.limitations),
    agentsShown: agents.length,
    totalAgents: readModel.agents.total,
    relationshipsShown: relationships.length,
    totalRelationships: readModel.relationships.total,
    potentialChannelsShown: potentialChannels.length,
    totalPotentialChannels: readModel.potentialChannels.total,
    sharedResourceHubsShown: sharedResourceHubs.length,
    totalSharedResourceHubs: readModel.sharedResourceHubs.total,
    toolCapabilitiesShown: toolCapabilities.length,
    totalToolCapabilities: readModel.agents.items.reduce(
      (sum, a) => sum + a.toolCapabilities.length,
      0,
    ),
    credentialChainsShown: credentialChains.length,
    totalCredentialChains: readModel.credentialChains.total,
    deferredPathsShown: deferredPaths.length,
    totalDeferredPaths: readModel.deferredPaths.total,
    persistenceCreationShown: persistenceCreation.length,
    totalPersistenceCreation: readModel.persistenceCreation.total,
    frontiersShown: frontiers.length,
    totalFrontiers: readModel.frontiers.total,
  };
}

/**
 * Build the Agent Reachability report section for one evaluation.
 *
 * Always returns a section so the report does not silently omit availability.
 */
export async function buildAgentReachabilityReportSection(
  evaluation: AssuranceEvaluation,
): Promise<AgentReachabilityReportSection> {
  const unavailable = (reason: NonNullable<AgentReachabilityReportSection['unavailableReason']>): AgentReachabilityReportSection => ({
    availability: 'NOT_AVAILABLE',
    unavailableReason: reason,
  });

  try {
    const result = await loadEvaluatedOperationCoverage(evaluation);
    if ('availability' in result) {
      const r = result as EvaluatedScanUnavailable;
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: r.unavailableReason,
        scanId: r.scanId,
        commitSha: r.commitSha,
      };
    }

    const readModel = buildAgentReachabilityReadModel(result.data, {
      scanId: result.scanId,
      commitSha: result.commitSha,
    });

    if (readModel.availability === 'NOT_AVAILABLE') {
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: mapAriUnavailableReason(readModel.unavailableReason),
        scanId: readModel.scanId,
        commitSha: readModel.commitSha,
      };
    }

    return summarizeSection(readModel);
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}
