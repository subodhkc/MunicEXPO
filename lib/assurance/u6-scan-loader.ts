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
 *   EVALUATED_SCAN_IDENTITY_MISMATCH = null
 */

import { prisma } from '@/lib/prisma';
import {
  validatePersistedSnapshot,
  type PersistedOperationCoverageIntelligence,
} from '@/lib/ai-security/operation-coverage-read';
import type { AssuranceEvaluation } from './types';

export interface EvaluatedScanResult {
  scanId: string;
  commitSha: string | null;
  data: PersistedOperationCoverageIntelligence;
}

export type EvaluatedScanUnavailableReason =
  | 'EVALUATED_SCAN_BINDING_NOT_CAPTURED'
  | 'EVALUATED_RUN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE'
  | 'EVALUATED_SNAPSHOT_INVALID';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scan = await (prisma as any).ai_security_scans.findFirst({
    where: { scanId: run.staticScanId, organizationId: run.organizationId },
    select: { scanId: true, commitSha: true, aiSystemId: true, operationCoverageIntelligence: true },
  });

  if (scan && scan.aiSystemId != null && scan.aiSystemId !== run.aiSystemId) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
      scanId: run.staticScanId,
      commitSha: scan.commitSha ?? null,
    };
  }

  if (!scan || scan.operationCoverageIntelligence == null) {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE',
      scanId: run.staticScanId,
      commitSha: scan?.commitSha ?? null,
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
  };
}
