/**
 * WF-1: Assurance Re-evaluation Plan Service
 *
 * Canonical read/service object that determines whether an AI System's
 * Assurance evaluation can be re-evaluated using existing evidence
 * (without running Static again), and if so, what evidence basis to reuse.
 *
 * ARCHITECTURE:
 *   buildReevaluationPlan(aiSystemId, organizationId, triggerReason)
 *     → loads latest completed evaluation + its orchestrator run
 *     → loads current accepted source (latest run with static scan)
 *     → determines evidence membership from the prior run
 *     → validates static scan reuse eligibility
 *     → returns plan
 *
 * LOCK: POLICY_CHANGE != SOURCE_CHANGE
 * LOCK: REQUESTED_CHANGE != SOURCE_CHANGE
 * LOCK: REPOSITORY_INTERPRETATION_REVIEW != ASSURANCE_REEVALUATION_TRIGGER
 * LOCK: STATIC_REUSE != EVIDENCE_MEMBERSHIP_CHANGE
 * LOCK: NO_NEWER_SOURCE_EVIDENCE != REPOSITORY_UNCHANGED
 * LOCK: OLD_EVALUATED_SOURCE != CURRENT_SOURCE_WHEN_NEWER_ACCEPTED_SOURCE_EXISTS
 * LOCK: NEWER_ACCEPTED_STATIC_EXISTS != STATIC_MUST_RUN_AGAIN
 * LOCK: REUSE_FAILED != SILENT_RESCAN
 * LOCK: CLIENT_CANNOT_SELECT_ARBITRARY_BASIS_RUN
 */

import { prisma } from '@/lib/prisma';
import { validateStaticScanReuse } from '@/lib/audit-orchestrator/static-scan-reuse-validator';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReevaluationTriggerReason =
  | 'POLICY_DIVERGENCE'
  | 'SOURCE_NEWER_THAN_EVALUATION';

export type ReevaluationPlanState =
  | 'READY_TO_REEVALUATE'
  | 'REFRESH_SOURCE_REQUIRED'
  | 'NO_COMPLETED_EVALUATION'
  | 'NO_CURRENT_ACCEPTED_SOURCE'
  | 'INVALID_EVIDENCE_BASIS'
  | 'UNSUPPORTED_REUSE';

export type ReevaluationNextAction =
  | 'REEVALUATE'
  | 'REFRESH_STATIC'
  | 'NONE';

export interface ReevaluationEvidenceMembership {
  staticScanId: string | null;
  runtimeTestId: string | null;
  wizardAssessmentId: string | null;
  regulatoryReportId: string | null;
  selectedEngines: string[];
  externalAttachments: Array<{ producerId: string; producerRunId: string }>;
}

export interface ReevaluationStaticReuse {
  eligible: boolean;
  scanId: string | null;
  scanCompletedAt: string | null;
  commitSha: string | null;
  validationErrors: string[];
}

export interface AssuranceReevaluationPlan {
  state: ReevaluationPlanState;
  organizationId: string;
  aiSystemId: string;
  triggerReason: ReevaluationTriggerReason;
  basisRunId: string | null;
  priorEvaluationId: string | null;
  evidenceMembership: ReevaluationEvidenceMembership;
  staticReuse: ReevaluationStaticReuse;
  limitations: string[];
  nextAction: ReevaluationNextAction;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Build a re-evaluation plan for an AI System.
 *
 * The server derives the basis run — the client cannot select an arbitrary
 * basis run or scan.
 *
 * LOCK: CLIENT_CANNOT_SELECT_ARBITRARY_BASIS_RUN
 */
export async function buildReevaluationPlan(
  aiSystemId: string,
  organizationId: string,
  triggerReason: ReevaluationTriggerReason,
): Promise<AssuranceReevaluationPlan> {
  // 1. Find the latest completed Assurance evaluation for this AI system.
  const latestEvaluation = await prisma.assurance_evaluations.findFirst({
    where: {
      aiSystemId,
      organizationId,
      evaluationStatus: 'COMPLETED',
    },
    select: {
      id: true,
      orchestratorRunId: true,
      evaluationSnapshotAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestEvaluation || !latestEvaluation.orchestratorRunId) {
    return planWithState(aiSystemId, organizationId, triggerReason, 'NO_COMPLETED_EVALUATION');
  }

  // 2. Load the basis orchestrator run (the run that produced the last evaluation).
  const basisRun = await prisma.audit_orchestrator_runs.findUnique({
    where: { id: latestEvaluation.orchestratorRunId },
    select: {
      id: true,
      organizationId: true,
      aiSystemId: true,
      staticScanId: true,
      runtimeTestId: true,
      wizardAssessmentId: true,
      regulatoryReportId: true,
      selectedEngines: true,
      completedAt: true,
    },
  });

  if (!basisRun || basisRun.organizationId !== organizationId || basisRun.aiSystemId !== aiSystemId) {
    return planWithState(aiSystemId, organizationId, triggerReason, 'INVALID_EVIDENCE_BASIS');
  }

  // 3. Load external evidence attachments bound to the basis run.
  const externalAttachments = await prisma.audit_run_evidence_attachments.findMany({
    where: { auditRunId: basisRun.id },
    select: { producerId: true, producerRunId: true },
  });

  // 4. Find the current accepted source (latest orchestrator run with a static scan).
  // This may be newer than the basis run's scan.
  const currentSourceRun = await prisma.audit_orchestrator_runs.findFirst({
    where: {
      aiSystemId,
      organizationId,
      staticScanId: { not: null },
      status: { in: ['completed', 'completed_unsigned'] },
    },
    select: {
      id: true,
      staticScanId: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // 5. Determine which static scan to use for reuse.
  // If a newer accepted static scan exists, prefer it over the basis run's scan.
  // LOCK: OLD_EVALUATED_SOURCE != CURRENT_SOURCE_WHEN_NEWER_ACCEPTED_SOURCE_EXISTS
  // LOCK: NEWER_ACCEPTED_STATIC_EXISTS != STATIC_MUST_RUN_AGAIN
  let reuseScanId = basisRun.staticScanId;

  if (currentSourceRun?.staticScanId && currentSourceRun.staticScanId !== basisRun.staticScanId) {
    // A newer accepted static scan exists — use it instead of the basis run's scan.
    reuseScanId = currentSourceRun.staticScanId;
  }

  if (!reuseScanId) {
    return planWithState(aiSystemId, organizationId, triggerReason, 'NO_CURRENT_ACCEPTED_SOURCE');
  }

  // 6. Load the scan to get commitSha and completedAt for the plan.
  const scan = await prisma.ai_security_scans.findFirst({
    where: { scanId: reuseScanId, organizationId },
    select: {
      scanId: true,
      status: true,
      completedAt: true,
      commitSha: true,
    },
  });

  if (!scan || scan.status !== 'COMPLETED') {
    return planWithState(aiSystemId, organizationId, triggerReason, 'NO_CURRENT_ACCEPTED_SOURCE');
  }

  // 7. Validate static scan reuse eligibility.
  // Uses the generic validateStaticScanReuse wrapper — not ci-attached labeling.
  // LOCK: REUSED_UI_SCAN != CI_SCAN
  const reuseValidation = await validateStaticScanReuse(
    prisma,
    reuseScanId,
    'system', // system-initiated re-evaluation
    organizationId,
    {
      expectedAiSystemId: aiSystemId,
    },
  );

  // 8. Build evidence membership from the basis run.
  // This preserves the FULL evidence basis — not just static.
  // LOCK: STATIC_REUSE != EVIDENCE_MEMBERSHIP_CHANGE
  const selectedEngines = parseSelectedEngines(basisRun.selectedEngines);

  const evidenceMembership: ReevaluationEvidenceMembership = {
    staticScanId: reuseScanId, // may be newer than basis run's scan
    runtimeTestId: basisRun.runtimeTestId,
    wizardAssessmentId: basisRun.wizardAssessmentId,
    regulatoryReportId: basisRun.regulatoryReportId,
    selectedEngines,
    externalAttachments: externalAttachments.map(a => ({
      producerId: a.producerId,
      producerRunId: a.producerRunId,
    })),
  };

  // 9. Determine plan state.
  const limitations: string[] = [
    'NO_NEWER_SOURCE_EVIDENCE != REPOSITORY_UNCHANGED — HAIEC cannot prove the repository has not changed merely because no newer scan exists.',
  ];

  if (triggerReason === 'SOURCE_NEWER_THAN_EVALUATION' && reuseScanId === basisRun.staticScanId) {
    // If the trigger is "source newer than evaluation" but we're using the same
    // scan as the basis run, something is inconsistent.
    limitations.push('Trigger indicates newer source but no newer accepted scan was found — using basis run scan.');
  }

  if (!reuseValidation.valid) {
    return {
      state: 'REFRESH_SOURCE_REQUIRED',
      organizationId,
      aiSystemId,
      triggerReason,
      basisRunId: basisRun.id,
      priorEvaluationId: latestEvaluation.id,
      evidenceMembership,
      staticReuse: {
        eligible: false,
        scanId: reuseScanId,
        scanCompletedAt: scan.completedAt?.toISOString() ?? null,
        commitSha: scan.commitSha,
        validationErrors: reuseValidation.errors,
      },
      limitations,
      nextAction: 'REFRESH_STATIC',
    };
  }

  return {
    state: 'READY_TO_REEVALUATE',
    organizationId,
    aiSystemId,
    triggerReason,
    basisRunId: basisRun.id,
    priorEvaluationId: latestEvaluation.id,
    evidenceMembership,
    staticReuse: {
      eligible: true,
      scanId: reuseScanId,
      scanCompletedAt: scan.completedAt?.toISOString() ?? null,
      commitSha: scan.commitSha,
      validationErrors: [],
    },
    limitations,
    nextAction: 'REEVALUATE',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function planWithState(
  aiSystemId: string,
  organizationId: string,
  triggerReason: ReevaluationTriggerReason,
  state: ReevaluationPlanState,
): AssuranceReevaluationPlan {
  const nextAction: ReevaluationNextAction =
    state === 'REFRESH_SOURCE_REQUIRED' ? 'REFRESH_STATIC' : 'NONE';
  return {
    state,
    organizationId,
    aiSystemId,
    triggerReason,
    basisRunId: null,
    priorEvaluationId: null,
    evidenceMembership: {
      staticScanId: null,
      runtimeTestId: null,
      wizardAssessmentId: null,
      regulatoryReportId: null,
      selectedEngines: [],
      externalAttachments: [],
    },
    staticReuse: {
      eligible: false,
      scanId: null,
      scanCompletedAt: null,
      commitSha: null,
      validationErrors: [],
    },
    limitations: [],
    nextAction,
  };
}

function parseSelectedEngines(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, boolean>;
  return Object.entries(obj).filter(([, v]) => v).map(([k]) => k);
}
