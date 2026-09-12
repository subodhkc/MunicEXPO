/**
 * U6 — Package Persistence and Lifecycle Service.
 *
 * One canonical service for issuing, retrieving, publishing, and revoking
 * immutable Assurance packages. Coordinates the pure package builder with
 * the Prisma persistence model.
 */

import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { buildActionProofReportSection } from './u6-action-proof-section';
import { buildAgentReachabilityReportSection } from './u6-agent-reachability-section';
import { buildEvaluationIntegrityReportSection } from './u6-evaluation-integrity-section';
import { buildActionAssuranceReportSection } from './u6-action-assurance-section';
import { normalizeSelectedEnginesResult } from '@/lib/audit-orchestrator/selected-engines-normalizer';
import { buildAssuranceVerificationPackage, computePackageDigest, verifyAssurancePackage } from './u6-package';
import {
  U6Package,
  PackageVerificationResult,
  PublicVerificationResult,
  type ActionAssuranceRunContext,
} from './u6-types';
import { AssuranceEvaluation, AssuranceEvaluationV1_1 } from './types';
import { projectEvidenceForRun } from '@/lib/decision-pipeline/evidence-projection';
import { resolvePublicProfileLabel } from './u6-public-profile-label';
import { getEvaluatedScopeByEvaluationId, getScopeIdByEvaluationId, getScopeDigestByEvaluationId } from './scope-persistence';
import { EvaluatedScopeBinding, EVALUATED_SCOPE_SCHEMA_VERSION } from './u6-types';
import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { PassportU6Lineage } from './agentic-production-passport';

export interface PackageIssueResult {
  status: 'CREATED' | 'IDEMPOTENT' | 'CONFLICT';
  packageId: string;
  package: U6Package;
}

export type PublicationState = 'PRIVATE' | 'PUBLIC' | 'REVOKED';

export interface PackageAuthorizationContext {
  userId: string;
  organizationId: string;
  canViewEvidence?: boolean;
  canAdminister?: boolean;
}

const PACKAGE_SCHEMA_VERSIONS = {
  report: '1.0.0',
  bundle: '1.0.0',
  receipt: '1.0.0',
} as const;

/**
 * Resource-first: load only ownership fields before authorization.
 */
export async function getEvaluationOwnership(evaluationId: string): Promise<{ id: string; organizationId: string; aiSystemId: string; orchestratorRunId: string } | null> {
  const row = await prisma.assurance_evaluations.findUnique({
    where: { id: evaluationId },
    select: { id: true, organizationId: true, aiSystemId: true, orchestratorRunId: true },
  });
  if (!row) return null;
  return row as any;
}

/**
 * Part 2: Resource-first package ownership — load minimal fields before authorization.
 * Do NOT load full Evidence before authorization.
 */
export async function getPackageOwnership(packageId: string): Promise<{
  packageId: string;
  organizationId: string;
  assuranceEvaluationId: string;
  publicationState: string;
} | null> {
  const row = await (prisma as any).assurance_packages.findFirst({
    where: { packageId },
    select: {
      packageId: true,
      organizationId: true,
      assuranceEvaluationId: true,
      publicationState: true,
    },
  });
  if (!row) return null;
  return row;
}

/**
 * Load the full AssuranceEvaluation for package building after authorization.
 *
 * Reconstructs the U5 evaluation contract from persisted records using the
 * same internal as the orchestrator-run loader.
 */
export async function loadFullAssuranceEvaluation(evaluationId: string): Promise<AssuranceEvaluation | null> {
  const ownership = await getEvaluationOwnership(evaluationId);
  if (!ownership) return null;
  const { getAssuranceEvaluationById } = await import('./persistence');
  return getAssuranceEvaluationById(evaluationId, ownership.organizationId);
}

/**
 * Load exact run Evidence from the orchestrator run associated with the evaluation.
 */
export async function loadExactRunEvidence(evaluation: AssuranceEvaluation): Promise<{ projectedEvidence: any[]; runRecord: any; selectedEngines: string[] }> {
  const run = await prisma.audit_orchestrator_runs.findUnique({
    where: { id: evaluation.orchestratorRunId },
    select: {
      id: true,
      organizationId: true,
      aiSystemId: true,
      staticScanId: true,
      runtimeTestId: true,
      wizardAssessmentId: true,
      regulatoryReportId: true,
      completedAt: true,
      selectedEngines: true,
    },
  });

  if (!run) {
    throw new Error('ORCHESTRATOR_RUN_NOT_FOUND');
  }

  // PX-IDENTITY: evaluated-system identity continuity. An orchestratorRunId
  // match alone is NOT evaluated-system identity proof. The bound run must
  // carry the SAME organization and AI system identity as the evaluation;
  // anything else is a cross-identity historical join and fails closed.
  // LOCKS:
  //   ORCHESTRATOR_RUN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF
  //   SAME_ORGANIZATION != SAME_AI_SYSTEM
  //   CROSS_SYSTEM_HISTORICAL_JOIN = INVALID
  if (
    run.organizationId !== evaluation.organizationId ||
    run.aiSystemId !== evaluation.aiSystemId
  ) {
    throw new Error(
      `EVALUATED_RUN_IDENTITY_MISMATCH: orchestrator run ${run.id} does not share the evaluation's organizationId/aiSystemId`,
    );
  }

  // PX-IDENTITY: run→scan identity continuity for the bound static scan.
  // STATIC_SCAN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF. When the bound
  // scan carries an explicit ai_systems binding (scan.aiSystemId != null) it
  // MUST equal run.aiSystemId; a differing value is a cross-system join.
  // Historical scans with scan.aiSystemId == null preserve legacy uncertainty —
  // we never fabricate equality, but a bound scan cannot contradict it either.
  // scan.organizationId is nullable on legacy rows; when present it must equal
  // run.organizationId (NO_CROSS_ORGANIZATION_COMPOSITION).
  if (run.staticScanId) {
    const boundScan = await (prisma as any).ai_security_scans.findFirst({
      where: { scanId: run.staticScanId },
      select: { organizationId: true, aiSystemId: true },
    });
    if (boundScan) {
      if (
        (boundScan.organizationId != null && boundScan.organizationId !== run.organizationId) ||
        (boundScan.aiSystemId != null && boundScan.aiSystemId !== run.aiSystemId)
      ) {
        throw new Error(
          `EVALUATED_SCAN_IDENTITY_MISMATCH: bound static scan ${run.staticScanId} does not share the orchestrator run's organizationId/aiSystemId`,
        );
      }
    }
  }

  // Gate 4A Phase B: Inspect selectedEngines parse state.
  // INVALID must NOT become ordinary empty participation.
  // MALFORMED_SELECTED_ENGINES_AS_CLEAN_EMPTY_PATHS = 0 in the REAL package consumer.
  const parseResult = normalizeSelectedEnginesResult(run.selectedEngines);
  if (parseResult.state === 'INVALID') {
    throw new Error('INVALID_SELECTED_ENGINES: run has malformed selectedEngines data; cannot build package');
  }
  const selectedEngines = parseResult.engines;

  const projectedEvidence = await projectEvidenceForRun({
    organizationId: run.organizationId,
    aiSystemId: run.aiSystemId,
    orchestratorRunId: run.id,
    staticScanId: run.staticScanId,
    runtimeTestId: run.runtimeTestId,
    wizardAssessmentId: run.wizardAssessmentId,
    regulatoryReportId: run.regulatoryReportId,
    selectedEngines,
    completedAt: evaluation.evaluationSnapshotAt,
  });

  return { projectedEvidence, runRecord: run, selectedEngines };
}

export async function buildPackageFromEvaluation(
  evaluation: AssuranceEvaluation,
): Promise<U6Package> {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const { projectedEvidence, runRecord, selectedEngines } = await loadExactRunEvidence(evaluation);

  // Gate 4A Phase B: Package reconstruction uses canonical snapshot verification.
  // The canonical protection is in projectEvidenceForRun():
  //   attachment frozen digest → recompute from current producer-native row
  //   → mismatch/deletion fails closed with BOUND_EXTERNAL_EVIDENCE_SNAPSHOT_MISMATCH
  //   or BOUND_EXTERNAL_EVIDENCE_MISSING or BOUND_EXTERNAL_EVIDENCE_SNAPSHOT_INVALID.
  // The package service receives only verified projection output.
  // No second parity engine is needed here.
  // PACKAGE_RECONSTRUCTION_USES_CANONICAL_SNAPSHOT_VERIFICATION = YES.

  // G3-R1: Load Evaluated Scope for canonical U6 binding.
  // Legacy evaluations without scope → no binding → legacy 1.0.0 schema.
  // New evaluations with scope → binding in receipt → 1.1.0 schema.
  const scopeSnapshot = await getEvaluatedScopeByEvaluationId(
    evaluation.id,
    evaluation.organizationId,
  );
  const evaluatedScopeId = scopeSnapshot ? await getScopeIdByEvaluationId(evaluation.id) : null;

  let evaluatedScopeBinding: EvaluatedScopeBinding | undefined;
  if (scopeSnapshot && evaluatedScopeId) {
    evaluatedScopeBinding = {
      evaluatedScopeId,
      scopeSchemaVersion: scopeSnapshot.scopeSchemaVersion,
      scopeDigest: scopeSnapshot.scopeDigest,
    };
  }

  // PX-FINAL: Action Proof & Evidence Frontier — historical basis only.
  // Bound to the exact evaluated source scan via orchestratorRunId →
  // staticScanId. Never falls back to a current/latest scan.
  const actionProof = await buildActionProofReportSection(evaluation);

  // ARI-P0: Agent Reachability + Evaluation Integrity — historical basis only.
  const agentReachability = await buildAgentReachabilityReportSection(evaluation);
  const evaluationIntegrity = await buildEvaluationIntegrityReportSection(evaluation);

  // S6: Agentic Assurance / Action Assurance customer-facing projection — historical basis only.
  // Pass exact-run participation context so the projection can distinguish
  // NOT_ANALYZED from ANALYZED_EMPTY and preserve producer outcome semantics.
  const actionAssuranceRunContext: ActionAssuranceRunContext = {
    selectedEngines,
    staticScanId: runRecord.staticScanId,
    runtimeTestId: runRecord.runtimeTestId,
    wizardAssessmentId: runRecord.wizardAssessmentId,
    regulatoryReportId: runRecord.regulatoryReportId,
    orchestratorRunId: runRecord.id,
    completedAt: runRecord.completedAt ? runRecord.completedAt.toISOString() : undefined,
  };
  const actionAssurance = await buildActionAssuranceReportSection(evaluation, projectedEvidence, actionAssuranceRunContext);

  const packageCandidate = buildAssuranceVerificationPackage({
    evaluation,
    projectedEvidence,
    buildIdentity: undefined,
    actionProof,
    agentReachability,
    evaluationIntegrity,
    actionAssurance,
    authoritySourceLabel: resolveAuthoritySourceLabel(v1_1),
    operatingEnvelopeApprovedAt: v1_1.operatingEnvelopeApprovedAt ? v1_1.operatingEnvelopeApprovedAt.toISOString() : undefined,
    approvalReference: v1_1.operatingEnvelopeApprovalReference ?? undefined,
    syntheticClassification: resolveSyntheticClassification(v1_1),
    // G3-R1: Pass scope binding to canonical U6 construction
    evaluatedScopeBinding,
    // Gate 4A: Pass full scope snapshot for CI repository compatibility qualification
    evaluatedScopeSnapshot: scopeSnapshot ?? undefined,
  });

  return packageCandidate;
}

/**
 * Issue a canonical U6 package for an Assurance evaluation.
 *
 * Builds the full candidate package, then enforces idempotency/conflict
 * by composite identity: evaluationId + schema versions.
 */
export async function issueAssurancePackage(
  evaluation: AssuranceEvaluation,
): Promise<PackageIssueResult> {
  const packageCandidate = await buildPackageFromEvaluation(evaluation);

  // G3-R1: Scope binding is now in the package candidate (from buildPackageFromEvaluation).
  // Extract for DB metadata persistence.
  const evaluatedScopeId = packageCandidate.receipt.evaluatedScopeBinding?.evaluatedScopeId ?? null;
  const scopeDigest = packageCandidate.receipt.evaluatedScopeBinding?.scopeDigest ?? null;

  const existing = await (prisma as any).assurance_packages.findUnique({
    where: {
      assuranceEvaluationId_reportSchemaVersion_bundleSchemaVersion_receiptSchemaVersion_verificationSchemaVersion: {
        assuranceEvaluationId: evaluation.id,
        reportSchemaVersion: packageCandidate.reportSchemaVersion,
        bundleSchemaVersion: packageCandidate.bundleSchemaVersion,
        receiptSchemaVersion: packageCandidate.receiptSchemaVersion,
        verificationSchemaVersion: packageCandidate.verificationSchemaVersion,
      },
    },
  });

  if (existing) {
    if (existing.semanticPackageDigest === packageCandidate.semanticPackageDigest) {
      const persisted = await reconstructPackageFromRow(existing);
      return { status: 'IDEMPOTENT', packageId: existing.packageId, package: persisted };
    }
    return { status: 'CONFLICT', packageId: existing.packageId, package: packageCandidate };
  }

  const packageId = nanoid(32);
  packageCandidate.packageId = packageId;

  try {
    await (prisma as any).assurance_packages.create({
      data: {
      packageId,
      organizationId: evaluation.organizationId,
      aiSystemId: evaluation.aiSystemId,
      assuranceEvaluationId: evaluation.id,
      orchestratorRunId: evaluation.orchestratorRunId,
      reportSchemaVersion: packageCandidate.reportSchemaVersion,
      bundleSchemaVersion: packageCandidate.bundleSchemaVersion,
      receiptSchemaVersion: packageCandidate.receiptSchemaVersion,
      verificationSchemaVersion: packageCandidate.verificationSchemaVersion,
      semanticPackageDigest: packageCandidate.semanticPackageDigest,
      semanticReportDigest: packageCandidate.semanticReportDigest,
      bundleDigest: packageCandidate.bundleDigest,
      receiptHash: packageCandidate.receiptHash,
      merkleRoot: packageCandidate.merkleRoot,
      merkleStatus: packageCandidate.merkleStatus,
      reportJson: packageCandidate.report as any,
      bundleJson: packageCandidate.bundle as any,
      receiptJson: packageCandidate.receipt as any,
      buildIdentity: packageCandidate.buildIdentity as any,
      profileIdentity: packageCandidate.profileIdentity as any,
      operatingEnvelopeIdentity: packageCandidate.operatingEnvelopeIdentity as any,
      authoritySourceLabel: packageCandidate.authoritySourceLabel,
      operatingEnvelopeApprovedAt: packageCandidate.operatingEnvelopeApprovedAt ? new Date(packageCandidate.operatingEnvelopeApprovedAt) : undefined,
      approvalReference: packageCandidate.approvalReference,
      syntheticClassification: packageCandidate.syntheticClassification,
      publicationState: 'PRIVATE',
      // G3: Scope binding for U6 package
      evaluatedScopeId,
      scopeDigest,
    },
  });

    return { status: 'CREATED', packageId, package: packageCandidate };
  } catch (createError: any) {
    // Concurrent package creation with the same composite key → IDEMPOTENT or CONFLICT.
    const p2002Target = Array.isArray(createError?.meta?.target) ? createError.meta.target.join(' ') : createError?.meta?.target;
    if (createError?.code === 'P2002' && p2002Target && (p2002Target.includes('assurance_packages_evaluation_version_key') || p2002Target.includes('verificationSchemaVersion'))) {
      const existing = await (prisma as any).assurance_packages.findUnique({
        where: {
          assuranceEvaluationId_reportSchemaVersion_bundleSchemaVersion_receiptSchemaVersion_verificationSchemaVersion: {
            assuranceEvaluationId: evaluation.id,
            reportSchemaVersion: packageCandidate.reportSchemaVersion,
            bundleSchemaVersion: packageCandidate.bundleSchemaVersion,
            receiptSchemaVersion: packageCandidate.receiptSchemaVersion,
            verificationSchemaVersion: packageCandidate.verificationSchemaVersion,
          },
        },
      });
      if (existing) {
        if (existing.semanticPackageDigest === packageCandidate.semanticPackageDigest) {
          const persisted = await reconstructPackageFromRow(existing);
          return { status: 'IDEMPOTENT', packageId: existing.packageId, package: persisted };
        }
        return { status: 'CONFLICT', packageId: existing.packageId, package: packageCandidate };
      }
    }
    throw createError;
  }
}

export async function getAssurancePackage(
  packageId: string,
  organizationId: string,
): Promise<{ package: U6Package; publicationState: PublicationState; publicVerificationId?: string } | null> {
  const row = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId },
  });
  if (!row) return null;

  return { package: await reconstructPackageFromRow(row), publicationState: row.publicationState, publicVerificationId: row.publicVerificationId };
}

export async function publishAssurancePackage(
  packageId: string,
  organizationId: string,
  actor: string,
): Promise<{ publicVerificationId: string; status: 'CREATED' | 'IDEMPOTENT' } | null> {
  // Part 17: Atomic publication — use conditional update to prevent races.
  // Part 19: Repeated publish of already-PUBLIC package returns existing alias.

  // First check if already PUBLIC (idempotent case)
  const alreadyPublic = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'PUBLIC' },
    select: { id: true, publicVerificationId: true },
  });
  if (alreadyPublic?.publicVerificationId) {
    return { publicVerificationId: alreadyPublic.publicVerificationId, status: 'IDEMPOTENT' };
  }

  // Check for REVOKED — fail closed (Part 19)
  const revoked = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'REVOKED' },
    select: { id: true },
  });
  if (revoked) {
    throw new Error('CANNOT_REPUBLISH_REVOKED_PACKAGE');
  }

  // Load the PRIVATE package
  const existing = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'PRIVATE' },
  });
  if (!existing) return null;

  const pkg = await reconstructPackageFromRow(existing);
  const verify = verifyAssurancePackage(pkg);
  if (!verify.valid) {
    throw new Error('CANNOT_PUBLISH_INVALID_PACKAGE');
  }

  const publicVerificationId = nanoid(24);

  // Part 17: Atomic conditional update — only transitions if still PRIVATE.
  // If two concurrent requests race, only one will update a row (updateMany returns count).
  const result = await (prisma as any).assurance_packages.updateMany({
    where: { id: existing.id, publicationState: 'PRIVATE' },
    data: {
      publicationState: 'PUBLIC',
      publicVerificationId,
      publishedAt: new Date(),
      publishedBy: actor,
    },
  });

  if (result.count === 0) {
    // Another concurrent request won the race — return the existing public alias.
    const winner = await (prisma as any).assurance_packages.findFirst({
      where: { packageId, organizationId, publicationState: 'PUBLIC' },
      select: { publicVerificationId: true },
    });
    if (winner?.publicVerificationId) {
      return { publicVerificationId: winner.publicVerificationId, status: 'IDEMPOTENT' };
    }
    // Package may have been revoked concurrently
    return null;
  }

  return { publicVerificationId, status: 'CREATED' };
}

export async function revokeAssurancePackage(
  packageId: string,
  organizationId: string,
  actor: string,
  reason: string,
): Promise<{ status: 'REVOKED' | 'ALREADY_REVOKED' | 'NOT_PUBLIC' } | null> {
  // Part 20: Revoke only PUBLIC packages. PRIVATE cannot be revoked as published.
  // Part 20: Repeated revoke returns deterministic already-revoked result.

  // Check if already revoked (idempotent)
  const alreadyRevoked = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'REVOKED' },
    select: { id: true },
  });
  if (alreadyRevoked) {
    return { status: 'ALREADY_REVOKED' };
  }

  // Check if package exists and is PUBLIC
  const existing = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'PUBLIC' },
  });
  if (!existing) {
    // Check if it's PRIVATE — reject because never publicly issued
    const privatePkg = await (prisma as any).assurance_packages.findFirst({
      where: { packageId, organizationId, publicationState: 'PRIVATE' },
      select: { id: true },
    });
    if (privatePkg) return { status: 'NOT_PUBLIC' };
    return null; // Not found
  }

  // Atomic conditional update
  const result = await (prisma as any).assurance_packages.updateMany({
    where: { id: existing.id, publicationState: 'PUBLIC' },
    data: {
      publicationState: 'REVOKED',
      revokedAt: new Date(),
      revokedBy: actor,
      revocationReason: reason,
    },
  });

  if (result.count === 0) {
    // Concurrent operation — check if already revoked
    const recheck = await (prisma as any).assurance_packages.findFirst({
      where: { packageId, organizationId, publicationState: 'REVOKED' },
      select: { id: true },
    });
    return recheck ? { status: 'ALREADY_REVOKED' } : null;
  }

  return { status: 'REVOKED' };
}

export async function verifyPersistedAssurancePackage(
  packageId: string,
  organizationId: string,
): Promise<PackageVerificationResult | null> {
  const result = await getAssurancePackage(packageId, organizationId);
  if (!result) return null;
  return verifyAssurancePackage(result.package);
}

export async function getPublicVerification(
  publicVerificationId: string,
): Promise<PublicVerificationResult | null> {
  const row = await (prisma as any).assurance_packages.findUnique({
    where: { publicVerificationId },
  });
  if (!row) return null;

  // Part 23: PRIVATE packages are not publicly resolvable.
  if (row.publicationState === 'PRIVATE') return null;

  const pkg = await reconstructPackageFromRow(row);
  const verify = verifyAssurancePackage(pkg);
  // Part 8: This loads from persistence, so anchored wording is correct.
  const status: PublicVerificationResult['verificationStatus'] =
    row.publicationState === 'REVOKED' ? 'REVOKED' :
    verify.valid ? 'INTEGRITY_VERIFIED_AGAINST_HAIEC_RECORD' : 'INVALID_PACKAGE';

  // Part 21-22: Strict public allowlist — no private identifiers leaked.
  // Part 25: Include assurance mark eligibility for public packages.
  // Defect 1: Load persisted evaluationStatus from assurance_evaluations.
  // Defect 2: Load operatingEnvelopeState and authoritySourceLabel from profile binding.
  let assuranceMark: PublicVerificationResult['assuranceMark'] | undefined;
  if (row.publicationState === 'PUBLIC') {
    const evalRow = await prisma.assurance_evaluations.findUnique({
      where: { id: row.assuranceEvaluationId },
      select: { evaluationStatus: true },
    });
    const bindingRow = await (prisma as any).assurance_evaluation_profile_bindings.findUnique({
      where: { assuranceEvaluationId: row.assuranceEvaluationId },
      select: { operatingEnvelopeState: true, operatingEnvelopeAuthoritySourceLabel: true },
    });
    const persistedEvaluationStatus = evalRow?.evaluationStatus ?? 'UNKNOWN';
    const persistedEnvelopeState = bindingRow?.operatingEnvelopeState ?? undefined;
    const persistedAuthorityLabel = bindingRow?.operatingEnvelopeAuthoritySourceLabel ?? undefined;

    const { evaluateAssuranceMarkEligibility } = await import('./u6-badge');
    const markResult = evaluateAssuranceMarkEligibility({
      pkg,
      packageVerification: verify,
      anchorValid: verify.valid,
      publicationState: row.publicationState,
      evaluationStatus: persistedEvaluationStatus,
      operatingEnvelopeState: persistedEnvelopeState,
      authoritySourceLabel: persistedAuthorityLabel,
    });
    if (markResult.eligible) {
      const { POSITIVE_MARK_LABEL, POSITIVE_MARK_STATUS } = await import('./u6-badge');
      assuranceMark = {
        label: POSITIVE_MARK_LABEL,
        status: POSITIVE_MARK_STATUS,
        eligible: true,
      };
    }
  }

  return {
    publicVerificationId,
    publicationState: row.publicationState,
    verificationStatus: status,
    disposition: pkg.receipt.disposition,
    evaluatedAt: pkg.receipt.evaluationSnapshotAt,
    methodologyVersion: pkg.receipt.assuranceMethodologyVersion,
    reportSchemaVersion: pkg.report.reportVersion,
    // Defect 3: Public-safe profile label — use bounded allowlist resolver, not raw profileId
    profileLabel: resolvePublicProfileLabel(pkg.receipt.profileId),
    profileVersion: pkg.receipt.profileVersion,
    // Part 22: Construct safe scope summary using public label, not profileId
    scopeSummary: buildPublicScopeSummary(pkg),
    receiptHash: pkg.receipt.receiptHash,
    merkleRoot: pkg.merkleRoot,
    merkleStatus: pkg.merkleStatus,
    syntheticClassification: pkg.syntheticClassification,
    publishedAt: row.publishedAt?.toISOString(),
    revokedAt: row.revokedAt?.toISOString(),
    assuranceMark,
  };
}

/**
 * Part 22: Construct a public-safe scope summary from safe structured values.
 * Defect 3: Use public profile label, never raw profileId.
 * Never expose private identifiers (orgId, aiSystemId, envelopeId, etc.).
 */
function buildPublicScopeSummary(pkg: U6Package): string {
  const profileLabel = resolvePublicProfileLabel(pkg.receipt.profileId);
  return `HAIEC Assurance evaluation completed under ${profileLabel}. The public verification confirms the recorded decision and package integrity without exposing private Evidence or operating-envelope identifiers.`;
}

/**
 * Passport U6 lineage — shared identity-continuity gate.
 *
 *   PACKAGE_EXISTS != PACKAGE_BELONGS_TO_THIS_PASSPORT
 *   PACKAGE_IDENTITY_MATCH_REQUIRED = YES
 *
 * A package for another org / AI system / evaluation / run must never bind —
 * fail closed, never downgrade to "partial binding".
 */
function assertPackageBelongsToPassport(
  output: EvaluatedAssuranceOutput,
  pkg: U6Package,
): void {
  const id = output.evaluationIdentity;
  const mismatches: string[] = [];
  if (pkg.organizationId !== id.organizationId) mismatches.push('organizationId');
  if (pkg.aiSystemId !== id.aiSystemId) mismatches.push('aiSystemId');
  if (pkg.assuranceEvaluationId !== id.evaluationId) mismatches.push('assuranceEvaluationId');
  if (pkg.orchestratorRunId !== id.orchestratorRunId) mismatches.push('orchestratorRunId');
  if (mismatches.length > 0) {
    throw new Error(
      `PASSPORT_U6_IDENTITY_MISMATCH: package ${pkg.packageId} does not share the passport evaluation identity (${mismatches.join(', ')})`,
    );
  }
}

/**
 * Bind an already-loaded package object to a Passport lineage envelope.
 * Pure verification can establish INTERNAL CONSISTENCY only —
 *   PURE_VERIFY != HAIEC_RECORD_VERIFIED.
 */
export function buildPassportU6LineageFromPackage(
  output: EvaluatedAssuranceOutput,
  pkg: U6Package,
): PassportU6Lineage {
  assertPackageBelongsToPassport(output, pkg);
  const verification = verifyAssurancePackage(pkg);
  if (!verification.valid) {
    throw new Error(
      `PASSPORT_U6_VERIFICATION_FAILED: package ${pkg.packageId} is not internally consistent`,
    );
  }
  return {
    bindingState: 'BOUND_INTERNAL_CONSISTENCY',
    // No canonical persisted lifecycle evidence for a caller-supplied object.
    publicationState: 'NOT_ASSESSED',
    packageId: pkg.packageId,
    semanticPackageDigest: pkg.semanticPackageDigest,
    semanticReportDigest: pkg.semanticReportDigest,
    receiptHash: pkg.receiptHash,
    merkleRoot: pkg.merkleRoot ?? undefined,
    assuranceEvaluationId: pkg.assuranceEvaluationId,
    orchestratorRunId: pkg.orchestratorRunId,
    packageSchemaVersion: pkg.packageSchemaVersion,
    assuranceMethodologyVersion: pkg.receipt.assuranceMethodologyVersion ?? undefined,
    limitations: [
      'Package integrity verified as internally consistent; persistence-bound HAIEC record verification not performed.',
    ],
  };
}

/**
 * Resolve the canonical U6 lineage envelope for a Passport.
 *
 *   NO_LATEST_U6_FALLBACK = YES — an explicit exact packageId is required.
 *   When none is supplied the Passport is truthfully NOT_BOUND.
 *
 * A packageId that does not resolve inside the passport's organization
 * fails closed without an existence leak (org-scoped lookup only).
 * When the persisted package verifies, the strongest claim is
 *   BOUND_VERIFIED_AGAINST_HAIEC_RECORD — package integrity verified
 *   against the HAIEC record, not certification.
 */
export async function resolvePassportU6Lineage(
  output: EvaluatedAssuranceOutput,
  u6PackageId?: string,
): Promise<PassportU6Lineage> {
  if (!u6PackageId) {
    return {
      bindingState: 'NOT_BOUND',
      publicationState: 'NOT_ASSESSED',
      limitations: [
        'This Passport represents the evaluated HAIEC output but is not bound to an issued U6 Decision Receipt/package.',
        'NO_PACKAGE != PACKAGE_VERIFIED; NO_PACKAGE != VERIFICATION_FAILURE; NO_PACKAGE != CERTIFICATION.',
      ],
    };
  }
  const loaded = await getAssurancePackage(u6PackageId, output.evaluationIdentity.organizationId);
  if (!loaded) {
    throw new Error('PASSPORT_U6_PACKAGE_NOT_FOUND');
  }
  const lineage = buildPassportU6LineageFromPackage(output, loaded.package);
  // Lifecycle truth is a separate axis from integrity: a REVOKED package can
  // still be integrity-verified, and integrity verification does not imply
  // current publication. REVOKED != INVALID_PACKAGE.
  const publicationState =
    loaded.publicationState === 'PUBLIC' || loaded.publicationState === 'REVOKED'
      ? loaded.publicationState
      : 'PRIVATE';
  return {
    ...lineage,
    bindingState: 'BOUND_VERIFIED_AGAINST_HAIEC_RECORD',
    publicationState,
    limitations: [
      'Package integrity verified against the persisted HAIEC record — integrity verification, not certification.',
      ...(publicationState === 'REVOKED'
        ? [
            'Package record is REVOKED. Integrity verification does not imply current publication or active issuance status.',
          ]
        : []),
    ],
  };
}

async function reconstructPackageFromRow(row: any): Promise<U6Package> {
  return {
    packageSchemaVersion: row.verificationSchemaVersion,
    packageId: row.packageId,
    assuranceEvaluationId: row.assuranceEvaluationId,
    organizationId: row.organizationId,
    aiSystemId: row.aiSystemId,
    orchestratorRunId: row.orchestratorRunId,
    reportSchemaVersion: row.reportSchemaVersion,
    bundleSchemaVersion: row.bundleSchemaVersion,
    receiptSchemaVersion: row.receiptSchemaVersion,
    verificationSchemaVersion: row.verificationSchemaVersion,
    semanticPackageDigest: row.semanticPackageDigest,
    semanticReportDigest: row.semanticReportDigest,
    bundleDigest: row.bundleDigest,
    receiptHash: row.receiptHash,
    merkleRoot: row.merkleRoot,
    merkleStatus: row.merkleStatus,
    report: row.reportJson as any,
    bundle: row.bundleJson as any,
    receipt: row.receiptJson as any,
    buildIdentity: row.buildIdentity as any,
    profileIdentity: row.profileIdentity as any,
    operatingEnvelopeIdentity: row.operatingEnvelopeIdentity as any,
    authoritySourceLabel: row.authoritySourceLabel,
    operatingEnvelopeApprovedAt: row.operatingEnvelopeApprovedAt?.toISOString(),
    approvalReference: row.approvalReference,
    syntheticClassification: row.syntheticClassification,
  };
}

function resolveSyntheticClassification(v1_1: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' {
  if (v1_1.syntheticClassification) return v1_1.syntheticClassification;
  if (v1_1.operatingEnvelopeAuthoritySourceLabel === 'SYNTHETIC_REFERENCE_POLICY') return 'SYNTHETIC_REFERENCE';
  if (v1_1.operatingEnvelopeState !== 'APPROVED') return 'UNKNOWN';
  if (v1_1.operatingEnvelopeAuthoritySourceLabel) return 'NONE';
  return 'UNKNOWN';
}

function resolveAuthoritySourceLabel(v1_1: AssuranceEvaluationV1_1): string {
  // U6: authority source is the explicit evaluation-time label. approvedBy is provenance, not authority.
  return v1_1.operatingEnvelopeAuthoritySourceLabel ?? 'UNKNOWN';
}
