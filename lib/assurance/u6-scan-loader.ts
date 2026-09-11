/**
 * U6 evaluated-scan loader.
 *
 * Resolves the exact historical operation-coverage snapshot bound to an
 * Assurance evaluation through audit_orchestrator_runs.staticScanId.
 *
 * LOCKS:
 *   CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE
 *   NO_HISTORICAL_BINDING -> null (never current-trace fallback)
 *   CROSS_SCAN_JOIN = INVALID
 *   DATABASE_ROW_SCAN_ID_MATCH != PERSISTED_SNAPSHOT_SCAN_ID_MATCH
 *   CROSS_ORGANIZATION_COMPOSITION = INVALID
 *   LIKELY_PROMOTES_CANONICAL_AUTHORITY => NO_U6_ARI_EI_COMPOSITION
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  validatePersistedSnapshot,
  type PersistedOperationCoverageIntelligence,
} from '@/lib/ai-security/operation-coverage-read';
import type { AssuranceEvaluation } from './types';
import type { AnalyzerExecutionIdentity } from '@/lib/ai-security/analyzer-execution-identity';

export interface EvaluatedScanResult {
  scanId: string;
  commitSha: string | null;
  data: PersistedOperationCoverageIntelligence;
  /** Persisted rule execution truth for this exact scan, when available. */
  rulesEvaluated?: Prisma.JsonValue;
  /**
   * AEI-1: the canonical persisted analyzer execution identity bound to this
   * exact historical scan. Carried verbatim from the persisted snapshot —
   * absent on legacy snapshots and NEVER reconstructed from current
   * environment state.
   *   LOCK: CURRENT_ENVIRONMENT_IDENTITY != HISTORICAL_SCAN_IDENTITY
   */
  analyzerExecutionIdentity?: AnalyzerExecutionIdentity;
}

export type EvaluatedScanUnavailableReason =
  | 'EVALUATED_SCAN_BINDING_NOT_CAPTURED'
  | 'EVALUATED_RUN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE'
  | 'EVALUATED_SNAPSHOT_INVALID'
  | 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED';

export interface EvaluatedScanUnavailable {
  availability: 'NOT_AVAILABLE';
  unavailableReason: EvaluatedScanUnavailableReason;
  scanId?: string;
  commitSha?: string | null;
}

export async function loadEvaluatedOperationCoverage(
  evaluation: AssuranceEvaluation,
): Promise<EvaluatedScanResult | EvaluatedScanUnavailable> {
  const run = await prisma.audit_orchestrator_runs.findUnique({
    where: { id: evaluation.orchestratorRunId },
    select: { staticScanId: true, organizationId: true, aiSystemId: true },
  });
  if (!run?.staticScanId) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_BINDING_NOT_CAPTURED',
    };
  }

  if (
    run.organizationId !== evaluation.organizationId ||
    run.aiSystemId !== evaluation.aiSystemId
  ) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_RUN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
    };
  }

  // Fetch by scanId only. An explicit cross-organization or cross-system row
  // is an identity mismatch, not a missing-coverage state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scan = await (prisma as any).ai_security_scans.findFirst({
    where: { scanId: run.staticScanId },
    select: { scanId: true, commitSha: true, organizationId: true, aiSystemId: true, operationCoverageIntelligence: true, rulesEvaluated: true },
  });

  if (!scan) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE',
      scanId: run.staticScanId,
    };
  }

  if (scan.scanId !== run.staticScanId) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (
    scan.organizationId != null &&
    scan.organizationId !== run.organizationId
  ) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (
    scan.aiSystemId != null &&
    scan.aiSystemId !== run.aiSystemId
  ) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (scan.operationCoverageIntelligence == null) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  let data: PersistedOperationCoverageIntelligence;
  try {
    data = (typeof scan.operationCoverageIntelligence === 'string'
      ? JSON.parse(scan.operationCoverageIntelligence)
      : scan.operationCoverageIntelligence) as PersistedOperationCoverageIntelligence;
  } catch {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SNAPSHOT_INVALID',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (data.scanId !== run.staticScanId) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (
    data.authorityPlaneInvariants?.LIKELY_PROMOTES_CANONICAL_AUTHORITY === true
  ) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  const validationError = validatePersistedSnapshot(data);
  if (validationError) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SNAPSHOT_INVALID',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  return {
    scanId: scan.scanId,
    commitSha: scan.commitSha ?? null,
    data,
    rulesEvaluated: scan.rulesEvaluated,
    // AEI-1: the persisted analyzer identity is carried verbatim inside data;
    // surfaced explicitly for provenance consumers.
    analyzerExecutionIdentity: data.analyzerExecutionIdentity,
  };
}
