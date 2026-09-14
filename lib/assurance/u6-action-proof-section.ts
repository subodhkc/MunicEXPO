/**
 * PX-FINAL — U6 "Action Proof & Evidence Frontier" report section.
 *
 * Builds a bounded, HISTORICAL ActionProofTrace summary for the exact source
 * scan bound to a completed Assurance evaluation:
 *
 *   assurance_evaluations.orchestratorRunId
 *     → audit_orchestrator_runs.staticScanId        (exact run→scan binding;
 *         the same value evidence projection uses as producerRunId and that
 *         inputHash/evidenceBundleDigest commit to)
 *     → ai_security_scans.operationCoverageIntelligence
 *     → buildActionProofTraceProjection(scanId = that scan)
 *
 * LOCKS:
 *   CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE
 *   NO_HISTORICAL_BINDING → NOT_AVAILABLE (never current-trace fallback)
 *   CROSS_SCAN_JOIN = INVALID — the projection is bounded to the bound scanId
 *   ACTION_PROOF_REPORT_SECTION != U5_DECISION_INPUT
 *   ACTION_PROOF_TRACE != EVIDENCE / AUTHORITY_PLANE / U5_VERDICT / U6_RECEIPT
 *   TRACE_COUNT != RISK_SCORE
 *
 * Report-usability bound: at most MAX_TRACES_IN_SECTION trace summaries are
 * embedded; totalTraces preserves truncation truth.
 */

import { prisma } from '@/lib/prisma';
import {
  validatePersistedSnapshot,
  type PersistedOperationCoverageIntelligence,
} from '@/lib/ai-security/operation-coverage-read';
import {
  buildActionProofTraceProjection,
  ACTION_PROOF_TRACE_STAGE_ORDER,
  type ActionProofTrace,
} from '@/lib/ai-inventory/action-proof-trace';
import type { AssuranceEvaluation } from './types';
import type { ActionProofReportSection } from './u6-types';

/** Presentation cap — detailed traces remain referenced by ID, not dumped. */
const MAX_TRACES_IN_SECTION = 12;

/**
 * AA-FLAGSHIP-HARDENING-1: deterministic evidence-value ordering for the
 * customer trace sample. Replaces positional first-N selection, which
 * surfaced whichever traces happened to be first in projection order
 * (arbitrary source-file order), regardless of evidentiary strength.
 *
 * Ranking answers: "what is the strongest real proof HAIEC established?"
 * Stage states only — no risk scoring, no invented conclusions.
 *
 *   STRONGER_EVIDENCE_FIRST != STRONGER_ASSURANCE_CLAIM
 *   SAMPLE_SELECTION != U5_DECISION_INPUT
 *   INPUT_ORDER != EVIDENCE_VALUE
 */
const TRACE_STATE_WEIGHT: Record<string, number> = {
  ESTABLISHED: 4,
  CONDITIONAL: 3,
  PARTIAL: 3,
  DECLARED_ONLY: 2,
  NOT_REQUIRED_DECLARED: 2,
  CANDIDATE: 1,
  UNKNOWN: 0,
  NOT_ANALYZED: 0,
  UNSUPPORTED: 0,
  NOT_APPLICABLE: 0,
};

const TRACE_STAGE_ORDER_INDEX = new Map<string, number>(
  ACTION_PROOF_TRACE_STAGE_ORDER.map((s, i) => [s, i]),
);

function traceEvidenceScore(t: ActionProofTrace): number {
  const w = (s: string) => TRACE_STATE_WEIGHT[s] ?? 0;
  const stageScore =
    w(t.consequence.state) * 8 +
    w(t.implementation.state) * 4 +
    w(t.modelExposure.state) * 3 +
    w(t.modelRequest.state) * 2 +
    w(t.dispatch.state) * 2 +
    w(t.registration.state) +
    w(t.contextBinding.state) +
    w(t.argumentProvenance.state) +
    w(t.confirmation.state) +
    (t.consequenceTarget?.resourceTarget ? 1 : 0);
  // Deeper proof frontier = the trace proved further along the chain.
  // Frontier depth is folded into the evidence-strength tier so a deeper
  // proven chain can never be outranked by a shallower one for diversity.
  const frontierDepth =
    TRACE_STAGE_ORDER_INDEX.get(t.proofFrontier.stage) ?? TRACE_STAGE_ORDER_INDEX.size;
  return stageScore * 32 + frontierDepth;
}

/**
 * Diversity key for the customer sample — capability name + concrete
 * consequence resource. Prefer covering distinct (capability, target) pairs
 * before repeating near-identical consequences.
 */
function traceDiversityKey(t: ActionProofTrace): string {
  return `${t.tool.name ?? t.tool.toolCandidateId}|${t.consequenceTarget?.resourceTarget ?? t.consequenceTarget?.api ?? '-'}`;
}

/**
 * AA-REPORTING-INTERPRETATION-2 refinement of the #1707 selection:
 * evidence strength is a strict ordering tier. Diversity only orders traces
 * WITHIN the same evidence-strength tier — a lower-scored trace can never
 * consume a display slot before a higher-scored one merely because it adds
 * a new (capability, target) pair.
 *
 *   1. rank all traces by composite evidence strength (stage states +
 *      proof-frontier depth), deterministic and input-order independent;
 *   2. within each equal-strength tier: one representative per distinct
 *      diversity key (lowest canonical trace id), keys ascending, then the
 *      tier's remaining duplicates in canonical trace-id order;
 *   3. concatenate tiers in strength order and take the bounded sample.
 *
 *   EVIDENCE_STRENGTH > DIVERSITY
 *   LOWER_EVIDENCE_SCORE NEVER_OUTRANKS HIGHER_EVIDENCE_SCORE
 */
export function selectActionProofTraces(
  traces: ActionProofTrace[],
  limit: number = MAX_TRACES_IN_SECTION,
): ActionProofTrace[] {
  const ranked = [...traces].sort(
    (a, b) => traceEvidenceScore(b) - traceEvidenceScore(a) || a.id.localeCompare(b.id),
  );
  const selected: ActionProofTrace[] = [];
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && traceEvidenceScore(ranked[j]) === traceEvidenceScore(ranked[i])) j++;
    const tier = ranked.slice(i, j);
    const byKey = new Map<string, ActionProofTrace[]>();
    for (const t of tier) {
      const key = traceDiversityKey(t);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(t);
      else byKey.set(key, [t]);
    }
    const keys = [...byKey.keys()].sort();
    const representatives = keys.map(
      (k) => byKey.get(k)!.sort((a, b) => a.id.localeCompare(b.id))[0],
    );
    const representativeSet = new Set(representatives);
    const rest = tier
      .filter((t) => !representativeSet.has(t))
      .sort((a, b) => a.id.localeCompare(b.id));
    selected.push(...representatives, ...rest);
    i = j;
  }
  return selected.slice(0, limit);
}

function summarizeTrace(t: ActionProofTrace): NonNullable<ActionProofReportSection['traces']>[number] {
  const stageStates: Record<string, string> = {
    TOOL_REGISTRATION: t.registration.state,
    MODEL_VISIBILITY: t.modelExposure.state,
    MODEL_REQUEST_BINDING: t.modelRequest.state,
    DISPATCH: t.dispatch.state,
    HANDLER_BINDING: t.implementation.state,
    CONSEQUENCE: t.consequence.state,
    EFFECTIVE_ARGUMENTS: t.argumentProvenance.state,
    CONTEXT_BINDING: t.contextBinding.state,
    CONFIRMATION_MEDIATION: t.confirmation.state,
  };
  return {
    traceId: t.id,
    toolName: t.tool.name,
    framework: t.tool.framework,
    sourceLocation: `${t.tool.sourceLocation.file}:${t.tool.sourceLocation.line}`,
    consequence: t.consequenceTarget ? (t.consequenceTarget.api ?? t.consequenceTarget.kind) : undefined,
    resourceTarget: t.consequenceTarget?.resourceTarget,
    stageStates,
    proofFrontierStage: t.proofFrontier.stage,
    proofFrontierReason: t.proofFrontier.reason,
    confirmationState: t.confirmation.state,
    contextState: t.contextBinding.state,
    scopeLimitations: t.scopeLimitations ?? [],
  };
}

/**
 * Build the Action Proof & Evidence Frontier section for one evaluation.
 *
 * Always returns a section (never undefined) so the report does not silently
 * omit availability state.
 */
export async function buildActionProofReportSection(
  evaluation: AssuranceEvaluation,
): Promise<ActionProofReportSection> {
  const unavailable = (reason: NonNullable<ActionProofReportSection['unavailableReason']>): ActionProofReportSection => ({
    availability: 'NOT_AVAILABLE',
    unavailableReason: reason,
  });

  try {
    // Exact historical binding: evaluation → orchestrator run → staticScanId.
    // This is the same run record evidence projection consumed; it is the only
    // legitimate evaluated-scan reference. Never the latest/current scan.
    const run = await prisma.audit_orchestrator_runs.findUnique({
      where: { id: evaluation.orchestratorRunId },
      select: { staticScanId: true, organizationId: true, aiSystemId: true },
    });
    if (!run?.staticScanId) {
      return unavailable('EVALUATED_SCAN_BINDING_NOT_CAPTURED');
    }

    // PX-IDENTITY: ORCHESTRATOR_RUN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF.
    // The bound run must share the evaluation's organization AND AI system
    // identity; otherwise this is a cross-identity historical join and the
    // section fails closed rather than composing another system's trace.
    //   SAME_ORGANIZATION != SAME_AI_SYSTEM
    //   CROSS_SYSTEM_HISTORICAL_JOIN = INVALID
    if (
      run.organizationId !== evaluation.organizationId ||
      run.aiSystemId !== evaluation.aiSystemId
    ) {
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: 'EVALUATED_RUN_IDENTITY_MISMATCH',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scan = await (prisma as any).ai_security_scans.findFirst({
      where: { scanId: run.staticScanId, organizationId: run.organizationId },
      select: { scanId: true, commitSha: true, aiSystemId: true, operationCoverageIntelligence: true },
    });
    // PX-IDENTITY: STATIC_SCAN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF.
    // A bound scan carrying an explicit AI-system binding that differs from
    // the run's aiSystemId is a cross-system historical join. Historical
    // scans with scan.aiSystemId == null preserve legacy uncertainty (no
    // fabricated equality), but a present value must not contradict it.
    //   REPOSITORY_URL_MATCH != AI_SYSTEM_IDENTITY
    //   COMMIT_SHA_MATCH != AI_SYSTEM_IDENTITY
    if (scan && scan.aiSystemId != null && scan.aiSystemId !== run.aiSystemId) {
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: 'EVALUATED_SCAN_IDENTITY_MISMATCH',
        scanId: run.staticScanId,
        commitSha: scan.commitSha ?? null,
      };
    }
    if (!scan || scan.operationCoverageIntelligence == null) {
      // The evaluated scan predates operation-coverage persistence (or has no
      // snapshot). This is a historical-basis gap — never filled by current data.
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
      return { availability: 'NOT_AVAILABLE', unavailableReason: 'EVALUATED_SNAPSHOT_INVALID', scanId: run.staticScanId, commitSha: scan.commitSha ?? null };
    }

    return buildActionProofReportSectionFromSnapshot(data, scan.scanId, scan.commitSha ?? null);
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}

/**
 * Build the Action Proof section from an already-loaded, validated coverage
 * snapshot. No database access.
 */
export function buildActionProofReportSectionFromSnapshot(
  data: PersistedOperationCoverageIntelligence,
  scanId: string,
  commitSha: string | null,
): ActionProofReportSection {
  const validationError = validatePersistedSnapshot(data);
  if (validationError || data.authorityPlaneInvariants?.LIKELY_PROMOTES_CANONICAL_AUTHORITY === true) {
    return { availability: 'NOT_AVAILABLE', unavailableReason: 'EVALUATED_SNAPSHOT_INVALID', scanId, commitSha };
  }

  const projection = buildActionProofTraceProjection({
    scanId,
    toolCandidates: data.toolCandidates || [],
    toolRegistrationRelations: data.toolRegistrationRelations,
    pythonToolModelExposureRelations: data.pythonToolModelExposureRelations,
    pythonToolDispatchRelations: data.pythonToolDispatchRelations,
    toolImplementationRelations: data.toolImplementationRelations,
    handlerOperationRelations: data.handlerOperationRelations,
    handlerOperationCoverage: data.handlerOperationCoverage,
    operationArgumentProvenanceRelations: data.operationArgumentProvenanceRelations,
    argumentProvenanceCoverage: data.argumentProvenanceCoverage,
    actionContextBindingRelations: data.actionContextBindingRelations,
    actionContextBindingCoverage: data.actionContextBindingCoverage,
    actionConfirmationMediationRelations: data.actionConfirmationMediationRelations,
    pythonToolExposureCoverage: data.pythonToolExposureCoverage,
    extractionCompletion: data.extractionCompletion,
    extractionLimitations: data.extractionLimitations,
  });

  const coverageLimitations: string[] = [...(data.extractionLimitations ?? [])];
  if (data.extractionCompletion === 'NOT_COMPLETED') {
    coverageLimitations.push(
      'Repository extraction did not complete — local trace facts may be established while repository-wide proof scope remains incomplete.',
    );
  }

  return {
    availability: 'ESTABLISHED',
    scanId,
    commitSha,
    summary: projection.summary,
    traces: selectActionProofTraces(projection.traces, MAX_TRACES_IN_SECTION).map(summarizeTrace),
    tracesShown: Math.min(projection.traces.length, MAX_TRACES_IN_SECTION),
    totalTraces: projection.traces.length,
    coverageLimitations,
  };
}
