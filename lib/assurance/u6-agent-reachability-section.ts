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
const MAX_FRONTIERS = 12;

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
    availability: 'ESTABLISHED',
    scanId: readModel.scanId,
    commitSha: readModel.commitSha,
    summary: {
      ...readModel.summary,
      coverageFamilyCount: coverage.length,
    },
    agents,
    relationships,
    potentialChannels,
    frontiers,
    coverage,
    coverageLimitations: readModel.coverage.items.flatMap((c) => c.limitations),
    agentsShown: agents.length,
    relationshipsShown: relationships.length,
    potentialChannelsShown: potentialChannels.length,
    frontiersShown: frontiers.length,
    totalAgents: readModel.agents.total,
    totalRelationships: readModel.relationships.total,
    totalPotentialChannels: readModel.potentialChannels.total,
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
        unavailableReason: 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE',
        scanId: readModel.scanId,
        commitSha: readModel.commitSha,
      };
    }

    return summarizeSection(readModel);
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}
