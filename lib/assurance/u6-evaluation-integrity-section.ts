/**
 * U6 "Evaluation Integrity" report section.
 *
 * Builds a bounded, HISTORICAL Evaluation Integrity exposure summary for the
 * exact source scan bound to a completed Assurance evaluation.
 *
 * LOCKS:
 *   CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE
 *   NO_HISTORICAL_BINDING -> NOT_AVAILABLE (never current-trace fallback)
 *   CROSS_SCAN_JOIN = INVALID
 *   EVALUATION_INTEGRITY_REPORT_SECTION != U5_DECISION_INPUT
 *   EI_COUNT != RISK_SCORE
 */

import { loadEvaluatedOperationCoverage, type EvaluatedScanUnavailable } from './u6-scan-loader';
import {
  buildAgentReachabilityReadModel,
  type AgentReachabilityReadModel,
} from '@/lib/ai-inventory/agent-reachability-read-model';
import type { AssuranceEvaluation } from './types';
import type { EvaluationIntegrityReportSection } from './u6-types';

const MAX_EXPOSURES = 12;

function summarizeSection(
  readModel: AgentReachabilityReadModel,
  surfaceCount: number,
  accessRelationCount: number,
): EvaluationIntegrityReportSection {
  const exposures = readModel.evaluationIntegrity.items.slice(0, MAX_EXPOSURES).map((e) => ({
    id: e.id,
    agentName: e.agentName,
    surfaceKind: e.surfaceKind,
    accessType: e.accessType,
    state: e.state,
    statement: e.statement,
    limitations: e.limitations,
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
      exposureCount: readModel.evaluationIntegrity.total,
      surfaceCount,
      accessRelationCount,
      coverageFamilyCount: coverage.length,
    },
    exposures,
    coverage,
    coverageLimitations: readModel.coverage.items.flatMap((c) => c.limitations),
    exposuresShown: exposures.length,
    totalExposures: readModel.evaluationIntegrity.total,
  };
}

/**
 * Build the Evaluation Integrity report section for one evaluation.
 *
 * Always returns a section so the report does not silently omit availability.
 */
export async function buildEvaluationIntegrityReportSection(
  evaluation: AssuranceEvaluation,
): Promise<EvaluationIntegrityReportSection> {
  const unavailable = (reason: NonNullable<EvaluationIntegrityReportSection['unavailableReason']>): EvaluationIntegrityReportSection => ({
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

    const surfaceCount = result.data.evaluationSurfaces?.length ?? 0;
    const accessRelationCount = result.data.evaluationAccessRelations?.length ?? 0;

    return summarizeSection(readModel, surfaceCount, accessRelationCount);
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}
