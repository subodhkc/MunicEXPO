/**
 * U6 — Package Persistence and Lifecycle Service.
 *
 * One canonical service for issuing, retrieving, publishing, and revoking
 * immutable Assurance packages. Coordinates the pure package builder with
 * the Prisma persistence model.
 */

import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { buildAssuranceVerificationPackage, computePackageDigest, verifyAssurancePackage } from './u6-package';
import {
  U6Package,
  PackageVerificationResult,
  PublicVerificationResult,
} from './u6-types';
import { AssuranceEvaluation, AssuranceEvaluationV1_1 } from './types';
import { projectEvidenceForRun } from '@/lib/decision-pipeline/evidence-projection';

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
export async function loadExactRunEvidence(evaluation: AssuranceEvaluation): Promise<{ projectedEvidence: any[]; runRecord: any }> {
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

  const selectedEngines = Array.isArray(run.selectedEngines)
    ? run.selectedEngines as string[]
    : (run.selectedEngines ? [String(run.selectedEngines)] : []);

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

  return { projectedEvidence, runRecord: run };
}

export async function buildPackageFromEvaluation(
  evaluation: AssuranceEvaluation,
): Promise<U6Package> {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const { projectedEvidence, runRecord } = await loadExactRunEvidence(evaluation);

  const packageCandidate = buildAssuranceVerificationPackage({
    evaluation,
    projectedEvidence,
    buildIdentity: undefined,
    authoritySourceLabel: resolveAuthoritySourceLabel(v1_1),
    operatingEnvelopeApprovedAt: v1_1.operatingEnvelopeApprovedAt ? v1_1.operatingEnvelopeApprovedAt.toISOString() : undefined,
    approvalReference: v1_1.operatingEnvelopeApprovalReference ?? undefined,
    syntheticClassification: resolveSyntheticClassification(v1_1),
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
): Promise<{ publicVerificationId: string } | null> {
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
  await (prisma as any).assurance_packages.update({
    where: { id: existing.id },
    data: {
      publicationState: 'PUBLIC',
      publicVerificationId,
      publishedAt: new Date(),
      publishedBy: actor,
    },
  });

  return { publicVerificationId };
}

export async function revokeAssurancePackage(
  packageId: string,
  organizationId: string,
  actor: string,
  reason: string,
): Promise<boolean> {
  const existing = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId, publicationState: 'PUBLIC' },
  });
  if (!existing) return false;

  await (prisma as any).assurance_packages.update({
    where: { id: existing.id },
    data: {
      publicationState: 'REVOKED',
      revokedAt: new Date(),
      revokedBy: actor,
      revocationReason: reason,
    },
  });

  return true;
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

  if (row.publicationState === 'PRIVATE') return null;

  const pkg = await reconstructPackageFromRow(row);
  const verify = verifyAssurancePackage(pkg);
  const status: PublicVerificationResult['verificationStatus'] =
    row.publicationState === 'REVOKED' ? 'REVOKED' :
    verify.valid ? 'INTEGRITY_VERIFIED_AGAINST_HAIEC_RECORD' : 'INVALID_PACKAGE';

  return {
    publicVerificationId,
    publicationState: row.publicationState,
    verificationStatus: status,
    disposition: pkg.receipt.disposition,
    evaluatedAt: pkg.receipt.evaluationSnapshotAt,
    methodologyVersion: pkg.receipt.assuranceMethodologyVersion,
    reportSchemaVersion: pkg.report.reportVersion,
    profileLabel: pkg.receipt.profileId,
    profileVersion: pkg.receipt.profileVersion,
    scopeSummary: pkg.report.scopeStatement,
    receiptHash: pkg.receipt.receiptHash,
    merkleRoot: pkg.merkleRoot,
    merkleStatus: pkg.merkleStatus,
    syntheticClassification: pkg.syntheticClassification,
    publishedAt: row.publishedAt?.toISOString(),
    revokedAt: row.revokedAt?.toISOString(),
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

function resolveSyntheticClassification(v1_1: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' {
  if (v1_1.operatingEnvelopeId?.includes('synthetic') || v1_1.profileId?.includes('synthetic') || v1_1.operatingEnvelopeApprovalReference?.includes('synthetic')) {
    return 'SYNTHETIC_REFERENCE';
  }
  return 'NONE';
}

function resolveAuthoritySourceLabel(v1_1: AssuranceEvaluationV1_1): string | undefined {
  if (v1_1.operatingEnvelopeState !== 'APPROVED') return 'UNKNOWN';
  // Persisted authority source label is the evaluation-time source of truth.
  if (v1_1.operatingEnvelopeAuthoritySourceLabel) return v1_1.operatingEnvelopeAuthoritySourceLabel;
  if (v1_1.operatingEnvelopeApprovedBy) return 'AUTHORITATIVE_POLICY';
  return 'REFERENCE_DEFAULT';
}
