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
import { AssuranceEvaluation } from './types';
import { projectEvidenceForRun } from '@/lib/decision-pipeline/evidence-projection';

export interface PackageIssueResult {
  status: 'CREATED' | 'IDEMPOTENT' | 'CONFLICT';
  packageId: string;
  package: U6Package;
}

export type PublicationState = 'PRIVATE' | 'PUBLIC' | 'REVOKED';

export interface PackagePublicationContext {
  actor: string;
  canPublish: boolean;
}

const SCHEMA_VERSIONS = {
  report: '1.0.0',
  bundle: '1.0.0',
  receipt: '1.0.0',
} as const;

/**
 * Issue a canonical U6 package for an Assurance evaluation.
 *
 * Builds the full candidate package, then enforces idempotency/conflict
 * by composite identity: evaluationId + schema versions.
 */
export async function issueAssurancePackage(
  evaluation: AssuranceEvaluation,
): Promise<PackageIssueResult> {
  const v1_1 = evaluation as any;

  const projectedEvidence = await projectEvidenceForRun({
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    orchestratorRunId: evaluation.orchestratorRunId,
    staticScanId: v1_1.staticScanId,
    runtimeTestId: v1_1.runtimeTestId,
    wizardAssessmentId: v1_1.wizardAssessmentId,
    regulatoryReportId: v1_1.regulatoryReportId,
    selectedEngines: v1_1.selectedEngines ?? [],
    completedAt: evaluation.evaluationSnapshotAt,
  });

  const packageCandidate = buildAssuranceVerificationPackage({
    evaluation,
    projectedEvidence,
    buildIdentity: undefined,
    authoritySourceLabel: v1_1.operatingEnvelopeState === 'APPROVED' ? 'AUTHORITATIVE_POLICY' : undefined,
    operatingEnvelopeApprovedAt: v1_1.operatingEnvelopeApprovedAt,
    approvalReference: v1_1.operatingEnvelopeApprovalReference,
    syntheticClassification: (v1_1.operatingEnvelopeId?.includes('synthetic') || v1_1.profileId?.includes('synthetic')) ? 'SYNTHETIC_REFERENCE' : 'NONE',
  });

  const packageId = nanoid(32);
  packageCandidate.packageId = packageId;

  const existing = await (prisma as any).assurance_packages.findUnique({
    where: {
      assuranceEvaluationId_reportSchemaVersion_bundleSchemaVersion_receiptSchemaVersion: {
        assuranceEvaluationId: evaluation.id,
        reportSchemaVersion: packageCandidate.reportSchemaVersion,
        bundleSchemaVersion: packageCandidate.bundleSchemaVersion,
        receiptSchemaVersion: packageCandidate.receiptSchemaVersion,
      },
    },
  });

  if (existing) {
    if (existing.semanticPackageDigest === packageCandidate.semanticPackageDigest) {
      return { status: 'IDEMPOTENT', packageId: existing.packageId, package: packageCandidate };
    }
    return { status: 'CONFLICT', packageId: existing.packageId, package: packageCandidate };
  }

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
      operatingEnvelopeApprovedAt: packageCandidate.operatingEnvelopeApprovedAt,
      approvalReference: packageCandidate.approvalReference,
      syntheticClassification: packageCandidate.syntheticClassification,
      publicationState: 'PRIVATE',
    },
  });

  return { status: 'CREATED', packageId, package: packageCandidate };
}

export async function getAssurancePackage(
  packageId: string,
  organizationId: string,
): Promise<{ package: U6Package; publicationState: PublicationState; publicVerificationId?: string } | null> {
  const row = await (prisma as any).assurance_packages.findFirst({
    where: { packageId, organizationId },
  });
  if (!row) return null;

  const pkg: U6Package = {
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
    syntheticClassification: row.syntheticClassification,
  };

  return {
    package: pkg,
    publicationState: row.publicationState,
    publicVerificationId: row.publicVerificationId,
  };
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

  const pkg: U6Package = {
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
    syntheticClassification: row.syntheticClassification,
  };

  const verification = verifyAssurancePackage(pkg);
  const status: PublicVerificationResult['verificationStatus'] =
    row.publicationState === 'REVOKED' ? 'REVOKED' :
    verification.valid ? 'INTERNALLY_CONSISTENT' : 'INVALID_PACKAGE';

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
