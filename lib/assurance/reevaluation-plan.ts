/**
 * WF-1: Assurance Re-evaluation Plan Service
 *
 * Canonical read/service object that determines whether an AI System's
 * Assurance evaluation can be re-evaluated using existing run-bound evidence
 * (without running Static again), and if so, what evidence to reuse.
 *
 * ARCHITECTURE:
 *   buildReevaluationPlan(aiSystemId, organizationId)
 *     → calls buildSystemActionAuthorityReadModel for CANONICAL triggers
 *     → loads latest completed evaluation + its orchestrator run
 *     → validates prior evidence through canonical U4 projection
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
 * LOCK: CLIENT_REEVALUATION_REASON != CANONICAL_DIVERGENCE
 * LOCK: NO_DIVERGENCE != REEVALUATION_REQUIRED
 * LOCK: RUN_BOUND_EVIDENCE_REUSED != ALL_EVALUATION_INPUTS_FROZEN
 * LOCK: POLICY_REEVALUATION = QUALIFIED_RUN_BOUND_EVIDENCE_REUSE + CURRENT_SYSTEM_FACT_RESOLUTION
 * LOCK: NEW_SOURCE != OLD_RUNTIME_STILL_APPLICABLE
 * LOCK: NEW_SOURCE != OLD_EXTERNAL_SCAN_STILL_APPLICABLE
 * LOCK: NEW_SOURCE != OLD_REGULATORY_RESULT_STILL_APPLICABLE
 * LOCK: SOURCE_CONTINUITY_NOT_PROVEN != EVIDENCE_CONTINUITY_PROVEN
 * LOCK: EXPECTED_REUSED_EVIDENCE_MISSING != EVIDENCE_NOT_SELECTED
 * LOCK: MISSING_PRIOR_RUNTIME != RUNTIME_ZERO_FINDINGS
 * LOCK: MISSING_PRIOR_REGULATORY != REGULATORY_NOT_APPLICABLE
 * LOCK: NEW_REEVALUATION_RUN_ID != OLD_REGULATORY_PRODUCER_RUN_ID
 * LOCK: NULL_REGULATORY_REPORT_ID != NO_REGULATORY_EVIDENCE
 */

import { prisma } from '@/lib/prisma';
import { validateStaticScanReuse } from '@/lib/audit-orchestrator/static-scan-reuse-validator';
import { buildSystemActionAuthorityReadModel } from '@/lib/ai-inventory/system-action-authority';
import { projectEvidenceForRun } from '@/lib/decision-pipeline/evidence-projection';
import { normalizeSelectedEnginesResult } from '@/lib/audit-orchestrator/selected-engines-normalizer';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReevaluationTriggerReason =
  | 'POLICY_DIVERGENCE'
  | 'SOURCE_NEWER_THAN_EVALUATION';

export type ReevaluationPlanState =
  | 'READY_TO_REEVALUATE'
  | 'REFRESH_SOURCE_REQUIRED'
  | 'SOURCE_CHANGE_REQUIRES_EVIDENCE_REFRESH'
  | 'NO_COMPLETED_EVALUATION'
  | 'NO_CURRENT_ACCEPTED_SOURCE'
  | 'NO_REEVALUATION_NEEDED'
  | 'INVALID_EVIDENCE_BASIS'
  | 'REUSED_EVIDENCE_SOURCE_GAP'
  | 'UNSUPPORTED_REUSE';

export type ReevaluationNextAction =
  | 'REEVALUATE'
  | 'REFRESH_STATIC'
  | 'REVIEW_EVIDENCE_REFRESH'
  | 'NONE';

export type EvidenceMemberType =
  | 'STATIC'
  | 'RUNTIME'
  | 'WIZARD'
  | 'REGULATORY'
  | 'EXTERNAL_CI'
  | 'EXTERNAL_SARIF';

export interface ReevaluationEvidenceMembership {
  staticScanId: string | null;
  runtimeTestId: string | null;
  wizardAssessmentId: string | null;
  regulatoryReportId: string | null;
  regulatoryProducerRunRef: string | null;
  selectedEngines: string[];
  externalAttachments: Array<{ producerId: string; producerRunId: string }>;
  evidenceMemberTypes: EvidenceMemberType[];
  evidenceMembershipDigest: string;
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
  triggerReasons: ReevaluationTriggerReason[];
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
 * The server derives the canonical triggers from buildSystemActionAuthorityReadModel.
 * The client cannot override canonical divergence.
 */
export async function buildReevaluationPlan(
  aiSystemId: string,
  organizationId: string,
): Promise<AssuranceReevaluationPlan> {
  // 1. Derive CANONICAL triggers from the read model.
  // LOCK: CLIENT_REEVALUATION_REASON != CANONICAL_DIVERGENCE
  const readModel = await buildSystemActionAuthorityReadModel(aiSystemId, organizationId);
  if (!readModel) {
    return planWithState(aiSystemId, organizationId, 'INVALID_EVIDENCE_BASIS');
  }

  const triggerReasons: ReevaluationTriggerReason[] = [];
  if (readModel.divergences.includes('CURRENT_POLICY_DIFFERS_FROM_EVALUATED_POLICY')) {
    triggerReasons.push('POLICY_DIVERGENCE');
  }
  if (readModel.divergences.includes('CURRENT_SOURCE_NEWER_THAN_EVALUATION')) {
    triggerReasons.push('SOURCE_NEWER_THAN_EVALUATION');
  }

  // LOCK: NO_DIVERGENCE != REEVALUATION_REQUIRED
  if (triggerReasons.length === 0) {
    return planWithState(aiSystemId, organizationId, 'NO_REEVALUATION_NEEDED');
  }

  // 2. Find the latest completed Assurance evaluation for this AI system.
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
    return planWithState(aiSystemId, organizationId, 'NO_COMPLETED_EVALUATION');
  }

  // 3. Load the basis orchestrator run.
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
    return planWithState(aiSystemId, organizationId, 'INVALID_EVIDENCE_BASIS');
  }

  // 4. Validate prior evidence through canonical U4 projection.
  // LOCK: EXPECTED_REUSED_EVIDENCE_MISSING != EVIDENCE_NOT_SELECTED
  const parseResult = normalizeSelectedEnginesResult(basisRun.selectedEngines);
  if (parseResult.state === 'INVALID') {
    return planWithState(aiSystemId, organizationId, 'INVALID_EVIDENCE_BASIS');
  }
  const basisSelectedEngines = parseResult.engines;

  let priorProjectedEvidence: Awaited<ReturnType<typeof projectEvidenceForRun>> = [];
  try {
    priorProjectedEvidence = await projectEvidenceForRun({
      organizationId: basisRun.organizationId,
      aiSystemId: basisRun.aiSystemId,
      orchestratorRunId: basisRun.id,
      staticScanId: basisRun.staticScanId,
      runtimeTestId: basisRun.runtimeTestId,
      wizardAssessmentId: basisRun.wizardAssessmentId,
      regulatoryReportId: basisRun.regulatoryReportId,
      selectedEngines: basisSelectedEngines,
      completedAt: latestEvaluation.evaluationSnapshotAt ?? basisRun.completedAt ?? new Date(),
    });
  } catch {
    // If canonical U4 projection fails, fail closed.
    return planWithState(aiSystemId, organizationId, 'REUSED_EVIDENCE_SOURCE_GAP');
  }

  // 5. Classify evidence member types from the prior projection.
  const evidenceMemberTypes = classifyEvidenceMembers(priorProjectedEvidence);

  // 6. Load external evidence attachments bound to the basis run.
  const externalAttachments = await prisma.audit_run_evidence_attachments.findMany({
    where: { auditRunId: basisRun.id },
    select: { producerId: true, producerRunId: true },
  });

  // 7. Find the current accepted source (latest orchestrator run with a static scan).
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

  // 8. Determine which static scan to use for reuse.
  let reuseScanId = basisRun.staticScanId;
  const hasNewerSource = triggerReasons.includes('SOURCE_NEWER_THAN_EVALUATION')
    && currentSourceRun?.staticScanId
    && currentSourceRun.staticScanId !== basisRun.staticScanId;

  if (hasNewerSource && currentSourceRun?.staticScanId) {
    reuseScanId = currentSourceRun.staticScanId;
  }

  if (!reuseScanId) {
    return planWithState(aiSystemId, organizationId, 'NO_CURRENT_ACCEPTED_SOURCE');
  }

  // 9. Load the scan.
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
    return planWithState(aiSystemId, organizationId, 'NO_CURRENT_ACCEPTED_SOURCE');
  }

  // 10. SOURCE-NEWER SAFETY: If source is newer and prior evaluation had
  // non-static run-bound evidence, reject automatic cross-source carry-forward.
  // LOCK: NEW_SOURCE != OLD_RUNTIME_STILL_APPLICABLE
  // LOCK: NEW_SOURCE != OLD_EXTERNAL_SCAN_STILL_APPLICABLE
  // LOCK: NEW_SOURCE != OLD_REGULATORY_RESULT_STILL_APPLICABLE
  // LOCK: SOURCE_CONTINUITY_NOT_PROVEN != EVIDENCE_CONTINUITY_PROVEN
  if (hasNewerSource) {
    const nonStaticMembers = evidenceMemberTypes.filter(
      t => t !== 'STATIC'
    );
    if (nonStaticMembers.length > 0) {
      // Prior evaluation had non-static evidence whose applicability to the
      // newer source is not established. Do NOT silently carry it forward.
      return {
        state: 'SOURCE_CHANGE_REQUIRES_EVIDENCE_REFRESH',
        organizationId,
        aiSystemId,
        triggerReasons,
        basisRunId: basisRun.id,
        priorEvaluationId: latestEvaluation.id,
        evidenceMembership: emptyMembership(),
        staticReuse: {
          eligible: false,
          scanId: reuseScanId,
          scanCompletedAt: scan.completedAt?.toISOString() ?? null,
          commitSha: scan.commitSha,
          validationErrors: [],
        },
        limitations: [
          'Newer source evidence exists but prior non-static evidence applicability is not proven.',
          'Evidence refresh/reselection is required before a new Assurance evaluation.',
        ],
        nextAction: 'REVIEW_EVIDENCE_REFRESH',
      };
    }
    // Static-only prior evaluation with newer source: safe to reuse newer Static.
  }

  // 11. Validate static scan reuse eligibility.
  const reuseValidation = await validateStaticScanReuse(
    prisma,
    reuseScanId,
    'system',
    organizationId,
    { expectedAiSystemId: aiSystemId },
  );

  // 12. Determine regulatory producer run ref.
  // LOCK: NEW_REEVALUATION_RUN_ID != OLD_REGULATORY_PRODUCER_RUN_ID
  // LOCK: NULL_REGULATORY_REPORT_ID != NO_REGULATORY_EVIDENCE
  const regulatoryProducerRunRef = basisRun.regulatoryReportId
    ?? (evidenceMemberTypes.includes('REGULATORY') ? basisRun.id : null);

  // 13. Build evidence membership.
  const evidenceMembership: ReevaluationEvidenceMembership = {
    staticScanId: reuseScanId,
    runtimeTestId: basisRun.runtimeTestId,
    wizardAssessmentId: basisRun.wizardAssessmentId,
    regulatoryReportId: basisRun.regulatoryReportId,
    regulatoryProducerRunRef,
    selectedEngines: basisSelectedEngines,
    externalAttachments: externalAttachments.map(a => ({
      producerId: a.producerId,
      producerRunId: a.producerRunId,
    })),
    evidenceMemberTypes,
    evidenceMembershipDigest: computeMembershipDigest(evidenceMemberTypes, externalAttachments),
  };

  // 14. Determine plan state.
  const limitations: string[] = [
    'NO_NEWER_SOURCE_EVIDENCE != REPOSITORY_UNCHANGED — HAIEC cannot prove the repository has not changed merely because no newer scan exists.',
    'RUN_BOUND_EVIDENCE_REUSED != ALL_EVALUATION_INPUTS_FROZEN — current system facts (Requested, Effective Grant, Inventory, Operating Envelope, Evaluated Scope) are resolved at the new evaluation snapshot.',
  ];

  if (!reuseValidation.valid) {
    return {
      state: 'REFRESH_SOURCE_REQUIRED',
      organizationId,
      aiSystemId,
      triggerReasons,
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
    triggerReasons,
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

function classifyEvidenceMembers(
  projected: Awaited<ReturnType<typeof projectEvidenceForRun>>,
): EvidenceMemberType[] {
  const types = new Set<EvidenceMemberType>();
  for (const e of projected) {
    const canonicalId = resolveCanonicalProducerId(e.producerId);
    if (canonicalId === 'saas-static') types.add('STATIC');
    else if (canonicalId === 'saas-runtime') types.add('RUNTIME');
    else if (canonicalId === 'saas-wizard') types.add('WIZARD');
    else if (canonicalId === 'saas-regulatory') types.add('REGULATORY');
    else if (canonicalId === 'ci-cd-scanner') types.add('EXTERNAL_CI');
    else if (canonicalId === 'sarif-import') types.add('EXTERNAL_SARIF');
  }
  return Array.from(types).sort();
}

function computeMembershipDigest(
  types: EvidenceMemberType[],
  attachments: Array<{ producerId: string; producerRunId: string }>,
): string {
  const parts = [
    ...types,
    ...attachments.map(a => `${a.producerId}:${a.producerRunId}`),
  ].sort();
  // Simple deterministic digest — not cryptographic, just for provenance.
  return parts.join('|');
}

function emptyMembership(): ReevaluationEvidenceMembership {
  return {
    staticScanId: null,
    runtimeTestId: null,
    wizardAssessmentId: null,
    regulatoryReportId: null,
    regulatoryProducerRunRef: null,
    selectedEngines: [],
    externalAttachments: [],
    evidenceMemberTypes: [],
    evidenceMembershipDigest: '',
  };
}

function planWithState(
  aiSystemId: string,
  organizationId: string,
  state: ReevaluationPlanState,
): AssuranceReevaluationPlan {
  const nextAction: ReevaluationNextAction =
    state === 'REFRESH_SOURCE_REQUIRED' ? 'REFRESH_STATIC'
    : state === 'SOURCE_CHANGE_REQUIRES_EVIDENCE_REFRESH' ? 'REVIEW_EVIDENCE_REFRESH'
    : 'NONE';
  return {
    state,
    organizationId,
    aiSystemId,
    triggerReasons: [],
    basisRunId: null,
    priorEvaluationId: null,
    evidenceMembership: emptyMembership(),
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
