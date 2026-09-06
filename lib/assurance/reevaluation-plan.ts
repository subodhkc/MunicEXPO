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
 *     → derives reuse membership FROM prior U4 projection (NOT nullable run IDs)
 *     → validates static scan reuse eligibility
 *     → returns plan
 *
 * LOCK: POLICY_CHANGE != SOURCE_CHANGE
 * LOCK: STATIC_REUSE != EVIDENCE_MEMBERSHIP_CHANGE
 * LOCK: NO_NEWER_SOURCE_EVIDENCE != REPOSITORY_UNCHANGED
 * LOCK: CLIENT_REEVALUATION_REASON != CANONICAL_DIVERGENCE
 * LOCK: NO_DIVERGENCE != REEVALUATION_REQUIRED
 * LOCK: RUN_BOUND_EVIDENCE_REUSED != ALL_EVALUATION_INPUTS_FROZEN
 * LOCK: POLICY_REEVALUATION = QUALIFIED_RUN_BOUND_EVIDENCE_REUSE + CURRENT_SYSTEM_FACT_RESOLUTION
 * LOCK: NEW_SOURCE != OLD_RUNTIME_STILL_APPLICABLE
 * LOCK: RUN_RELATIONSHIP_EXISTS != EVIDENCE_PARTICIPATED_IN_PRIOR_EVALUATION
 * LOCK: PRODUCER_RUN_ID_PRESENT_ON_BASIS_RUN != REUSE_MEMBER
 * LOCK: PRIOR_PROJECTED_EVIDENCE = CANONICAL_REUSE_MEMBERSHIP_OWNER
 * LOCK: STATIC_SCAN_RELATIONSHIP != STATIC_EVIDENCE_PARTICIPATED
 * LOCK: RUN_BOUND_REUSE_REFS != CURRENT_SYSTEM_FACTS
 * LOCK: RESULT_AVAILABLE_FOR_RUN != ENGINE_EXECUTED_IN_RUN
 */

import { createHash } from 'crypto';
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

/**
 * A run-bound evidence reference derived from the prior U4 projection.
 * Only includes RUN-BOUND producer evidence — NOT current system facts.
 * LOCK: RUN_BOUND_REUSE_REFS != CURRENT_SYSTEM_FACTS
 */
export interface RunBoundEvidenceRef {
  memberType: EvidenceMemberType;
  producerId: string;
  producerRunId: string | null;
  evidenceId: string;
  semanticDigest: string | null;
  contentHash: string | null;
}

export interface ReevaluationEvidenceMembership {
  staticScanId: string | null;
  runtimeTestId: string | null;
  wizardAssessmentId: string | null;
  regulatoryReportId: string | null;
  regulatoryProducerRunRef: string | null;
  selectedEngines: string[];
  externalAttachments: Array<{ producerId: string; producerRunId: string }>;
  runBoundEvidenceRefs: RunBoundEvidenceRef[];
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
 *
 * Reuse membership is derived FROM the prior U4 projection, NOT from nullable
 * basis run IDs. This ensures only evidence that ACTUALLY participated in the
 * prior evaluation is reused.
 *
 * LOCK: PRIOR_PROJECTED_EVIDENCE = CANONICAL_REUSE_MEMBERSHIP_OWNER
 * LOCK: PRODUCER_RUN_ID_PRESENT_ON_BASIS_RUN != REUSE_MEMBER
 */
export async function buildReevaluationPlan(
  aiSystemId: string,
  organizationId: string,
): Promise<AssuranceReevaluationPlan> {
  // 1. Derive CANONICAL triggers from the read model.
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
  // LOCK: PRIOR_PROJECTED_EVIDENCE = CANONICAL_REUSE_MEMBERSHIP_OWNER
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
    return planWithState(aiSystemId, organizationId, 'REUSED_EVIDENCE_SOURCE_GAP');
  }

  // 5. Build run-bound evidence refs FROM the prior U4 projection.
  // This is the canonical reuse membership owner.
  // LOCK: PRODUCER_RUN_ID_PRESENT_ON_BASIS_RUN != REUSE_MEMBER
  const runBoundRefs = buildRunBoundRefsFromProjection(priorProjectedEvidence);
  const evidenceMemberTypes = Array.from(new Set(runBoundRefs.map(r => r.memberType))).sort() as EvidenceMemberType[];

  // 6. Derive reuse fields FROM the projected refs, NOT from nullable run IDs.
  // LOCK: RUN_RELATIONSHIP_EXISTS != EVIDENCE_PARTICIPATED_IN_PRIOR_EVALUATION
  const staticRef = runBoundRefs.find(r => r.memberType === 'STATIC');
  const runtimeRef = runBoundRefs.find(r => r.memberType === 'RUNTIME');
  const wizardRef = runBoundRefs.find(r => r.memberType === 'WIZARD');
  const regulatoryRef = runBoundRefs.find(r => r.memberType === 'REGULATORY');
  const externalRefs = runBoundRefs.filter(
    r => r.memberType === 'EXTERNAL_CI' || r.memberType === 'EXTERNAL_SARIF'
  );

  // 7. STATIC is required for this WF-1 path.
  // LOCK: STATIC_SCAN_RELATIONSHIP != STATIC_EVIDENCE_PARTICIPATED
  if (!staticRef) {
    // basisRun.staticScanId exists but prior U4 projection has no STATIC member.
    // Do NOT promote the run field itself to evidence participation.
    return planWithState(aiSystemId, organizationId, 'REUSED_EVIDENCE_SOURCE_GAP');
  }

  // 8. Load external evidence attachments bound to the basis run.
  // Cross-check: only reuse attachments that ACTUALLY participated in prior U4.
  const storedAttachments = await prisma.audit_run_evidence_attachments.findMany({
    where: { auditRunId: basisRun.id },
    select: { producerId: true, producerRunId: true },
  });
  const projectedExternalKeys = new Set(
    externalRefs.map(r => `${r.producerId}:${r.producerRunId}`)
  );
  const reusedExternalAttachments = storedAttachments.filter(
    a => projectedExternalKeys.has(`${a.producerId}:${a.producerRunId}`)
  );

  // 9. Find the current accepted source (latest orchestrator run with a static scan).
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

  // 10. Determine which static scan to use for reuse.
  // For POLICY-ONLY: reuse the prior projected static scan.
  // For SOURCE-NEWER: use the newer accepted scan (if static-only prior).
  let reuseScanId = staticRef.producerRunId;
  const hasNewerSource = triggerReasons.includes('SOURCE_NEWER_THAN_EVALUATION')
    && currentSourceRun?.staticScanId
    && currentSourceRun.staticScanId !== staticRef.producerRunId;

  if (hasNewerSource && currentSourceRun?.staticScanId) {
    reuseScanId = currentSourceRun.staticScanId;
  }

  if (!reuseScanId) {
    return planWithState(aiSystemId, organizationId, 'NO_CURRENT_ACCEPTED_SOURCE');
  }

  // 11. Load the scan.
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

  // 12. SOURCE-NEWER SAFETY: If source is newer and prior evaluation had
  // non-static run-bound evidence, reject automatic cross-source carry-forward.
  // LOCK: NEW_SOURCE != OLD_RUNTIME_STILL_APPLICABLE
  // LOCK: SOURCE_CONTINUITY_NOT_PROVEN != EVIDENCE_CONTINUITY_PROVEN
  // IMPORTANT: "non-static evidence participated" comes from prior U4 projection,
  // NOT merely from nullable basisRun fields.
  if (hasNewerSource) {
    const nonStaticMembers = evidenceMemberTypes.filter(t => t !== 'STATIC');
    if (nonStaticMembers.length > 0) {
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

  // 13. Validate static scan reuse eligibility.
  const reuseValidation = await validateStaticScanReuse(
    prisma,
    reuseScanId,
    'system',
    organizationId,
    { expectedAiSystemId: aiSystemId },
  );

  // 14. Build evidence membership from projected refs.
  // LOCK: NULL_REGULATORY_REPORT_ID != NO_REGULATORY_EVIDENCE
  // LOCK: NEW_REEVALUATION_RUN_ID != OLD_REGULATORY_PRODUCER_RUN_ID
  const regulatoryProducerRunRef = regulatoryRef?.producerRunId ?? null;

  const evidenceMembership: ReevaluationEvidenceMembership = {
    staticScanId: reuseScanId,
    // Derive from projected refs, NOT from basisRun fields
    runtimeTestId: runtimeRef?.producerRunId ?? null,
    wizardAssessmentId: wizardRef?.producerRunId ?? null,
    regulatoryReportId: regulatoryRef?.producerRunId ?? null,
    regulatoryProducerRunRef,
    selectedEngines: basisSelectedEngines,
    externalAttachments: reusedExternalAttachments.map(a => ({
      producerId: a.producerId,
      producerRunId: a.producerRunId,
    })),
    runBoundEvidenceRefs: runBoundRefs,
    evidenceMemberTypes,
    evidenceMembershipDigest: computeMembershipDigest(runBoundRefs, reusedExternalAttachments),
  };

  // 15. Determine plan state.
  const limitations: string[] = [
    'NO_NEWER_SOURCE_EVIDENCE != REPOSITORY_UNCHANGED — HAIEC cannot prove the repository has not changed merely because no newer scan exists.',
    'RUN_BOUND_EVIDENCE_REUSED != ALL_EVALUATION_INPUTS_FROZEN — current system facts (Requested, Effective Grant, Inventory, Operating Envelope, Evaluated Scope) are resolved at the new evaluation snapshot.',
    'RUN_BOUND_PRODUCER_MEMBERSHIP_IMMUTABLE_BY_PRODUCER_RUN = YES — run-bound evidence is selected by exact producerRunId; no new rows can appear for the same scan/test/assessment ID.',
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

/**
 * Build run-bound evidence refs from the prior U4 projection.
 * Only includes RUN-BOUND producer evidence — NOT current system facts
 * (Requested, Effective Grant, Inventory, Operating Envelope, Evaluated Scope).
 *
 * LOCK: PRIOR_PROJECTED_EVIDENCE = CANONICAL_REUSE_MEMBERSHIP_OWNER
 * LOCK: RUN_BOUND_REUSE_REFS != CURRENT_SYSTEM_FACTS
 */
function buildRunBoundRefsFromProjection(
  projected: Awaited<ReturnType<typeof projectEvidenceForRun>>,
): RunBoundEvidenceRef[] {
  const refs: RunBoundEvidenceRef[] = [];
  for (const e of projected) {
    const canonicalId = resolveCanonicalProducerId(e.producerId);
    let memberType: EvidenceMemberType | null = null;
    if (canonicalId === 'saas-static') memberType = 'STATIC';
    else if (canonicalId === 'saas-runtime') memberType = 'RUNTIME';
    else if (canonicalId === 'saas-wizard') memberType = 'WIZARD';
    else if (canonicalId === 'saas-regulatory') memberType = 'REGULATORY';
    else if (canonicalId === 'ci-cd-scanner') memberType = 'EXTERNAL_CI';
    else if (canonicalId === 'sarif-import') memberType = 'EXTERNAL_SARIF';
    // Skip current-system-fact producers (saas-inventory, requested, grant)
    if (!memberType) continue;

    refs.push({
      memberType,
      producerId: e.producerId,
      producerRunId: e.producerRunId,
      evidenceId: e.evidenceId,
      semanticDigest: e.semanticDigest ?? null,
      contentHash: e.contentHash ?? null,
    });
  }
  return refs;
}

/**
 * Compute SHA-256 digest over deterministic canonical membership refs.
 * Sorts deterministically first, then hashes.
 *
 * LOCK: EVIDENCE_MEMBERSHIP_DIGEST_CRYPTOGRAPHIC = YES
 */
function computeMembershipDigest(
  refs: RunBoundEvidenceRef[],
  attachments: Array<{ producerId: string; producerRunId: string }>,
): string {
  const parts: string[] = [
    ...refs.map(r => `${r.memberType}:${r.producerId}:${r.producerRunId ?? 'null'}:${r.evidenceId}`),
    ...attachments.map(a => `EXT:${a.producerId}:${a.producerRunId}`),
  ].sort();

  return createHash('sha256').update(parts.join('|')).digest('hex');
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
    runBoundEvidenceRefs: [],
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
