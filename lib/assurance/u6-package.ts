/**
 * U6 — Canonical Assurance Package Builder and Verifier.
 *
 * Orchestrates deterministic bundle, report, receipt, and package digest
 * construction. Pure TypeScript: no database, no route logic.
 */

import crypto from 'crypto';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';
import type { AssuranceEvaluation, AssuranceEvaluationV1_1 } from './types';
import {
  buildEvidenceBundle,
  buildUnifiedAssuranceReport,
  buildDecisionReceipt,
  verifyReceipt,
  bundleMerkleProofs,
  computeBundleMerkleRoot,
  computeReportDigest,
  computeReceiptHash,
} from './u6-report';
import {
  U6_VERIFICATION_SCHEMA_VERSION,
  BuildIdentity,
  U6Package,
  PackageVerificationResult,
  PublicVerificationResult,
} from './u6-types';

export type { U6Package } from './u6-types';

export interface PackageBuildContext {
  evaluation: AssuranceEvaluation;
  projectedEvidence: DecisionEvidenceProjection[];
  buildIdentity?: BuildIdentity;
  authoritySourceLabel?: string;
  operatingEnvelopeApprovedAt?: Date;
  approvalReference?: string;
  syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE';
}

export function buildAssuranceVerificationPackage(
  context: PackageBuildContext,
): U6Package {
  const { evaluation, projectedEvidence } = context;
  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  const buildIdentity = context.buildIdentity ?? resolveBuildIdentity(evaluation, projectedEvidence);

  // 1. Evidence Bundle
  const bundle = buildEvidenceBundle(evaluation, projectedEvidence);

  // 2. Unified Assurance Report Core
  const report = buildUnifiedAssuranceReport(evaluation, bundle, buildIdentity);

  // 3. Decision Receipt
  const receipt = buildDecisionReceipt(evaluation, report, bundle);

  // 4. Package Digest
  const semanticPackageDigest = computePackageDigest(evaluation, report, bundle, receipt);

  const synthetic = context.syntheticClassification ?? syntheticClassification(evaluation);

  return {
    packageSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    packageId: crypto.randomUUID(),
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    orchestratorRunId: evaluation.orchestratorRunId,
    reportSchemaVersion: report.reportVersion,
    bundleSchemaVersion: bundle.bundleVersion,
    receiptSchemaVersion: receipt.receiptVersion,
    verificationSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    semanticPackageDigest,
    semanticReportDigest: report.reportDigest,
    bundleDigest: bundle.bundleDigest,
    receiptHash: receipt.receiptHash,
    merkleRoot: bundle.merkleRoot,
    merkleStatus: bundle.merkleStatus,
    report,
    bundle,
    receipt,
    buildIdentity,
    profileIdentity: report.profile,
    operatingEnvelopeIdentity: report.operatingEnvelope,
    authoritySourceLabel: context.authoritySourceLabel ?? receipt.authoritySourceLabel,
    operatingEnvelopeApprovedAt: context.operatingEnvelopeApprovedAt?.toISOString(),
    approvalReference: context.approvalReference,
    syntheticClassification: synthetic,
  };
}

export function verifyAssurancePackage(pkg: U6Package): PackageVerificationResult {
  const checks: any = {};

  // Recompute digests
  const recomputedReportDigest = computeReportDigest(pkg.report);
  checks.reportDigestValid = recomputedReportDigest === pkg.semanticReportDigest;

  const recomputedBundleDigest = pkg.bundle.bundleDigest;
  const recomputedBundleMerkle = computeBundleMerkleRoot(pkg.bundle);
  checks.bundleDigestValid = recomputedBundleDigest === pkg.bundle.bundleDigest;
  checks.merkleRootValid = recomputedBundleMerkle === pkg.merkleRoot;

  const recomputedReceiptHash = computeReceiptHash(pkg.receipt);
  checks.receiptHashValid = recomputedReceiptHash === pkg.receipt.receiptHash;

  checks.reportReceiptBindingValid = pkg.receipt.semanticReportDigest === pkg.semanticReportDigest;
  checks.receiptBundleBindingValid = pkg.receipt.evidenceMerkleRoot === pkg.merkleRoot && pkg.receipt.evidenceBundleDigest === pkg.bundleDigest;

  const receiptVerify = verifyReceipt(pkg.receipt, pkg.report, pkg.bundle);
  checks.allMerkleProofsValid = receiptVerify.valid;

  checks.evaluationIdentityValid = pkg.receipt.assuranceEvaluationId === pkg.assuranceEvaluationId;
  checks.profileIdentityValid = pkg.receipt.profileId === pkg.report.profile.profileId;
  checks.envelopeIdentityValid = pkg.receipt.operatingEnvelopeId === pkg.report.operatingEnvelope?.envelopeId;
  checks.buildIdentityValid = JSON.stringify(pkg.receipt.buildIdentity) === JSON.stringify(pkg.buildIdentity);
  checks.syntheticIdentityValid = pkg.receipt.syntheticClassification === pkg.syntheticClassification;

  const allValid = Object.values(checks).every(v => v === true);
  return {
    ...checks,
    valid: allValid,
    integrityStatus: allValid ? 'INTERNALLY_CONSISTENT' : 'INVALID_PACKAGE',
  };
}

export function buildPublicVerificationResult(
  pkg: U6Package,
  publicVerificationId: string,
  publicationState: 'PUBLIC' | 'REVOKED' = 'PUBLIC',
  revokedAt?: string,
): PublicVerificationResult {
  return {
    publicVerificationId,
    publicationState,
    verificationStatus: 'INTERNALLY_CONSISTENT',
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
    revokedAt,
  };
}

export function resolveBuildIdentity(
  _evaluation: AssuranceEvaluation,
  _projectedEvidence: DecisionEvidenceProjection[],
): BuildIdentity {
  // U6: source-truth build identity resolver placeholder.
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

export function computePackageDigest(
  evaluation: AssuranceEvaluation,
  report: { reportDigest: string },
  bundle: { bundleDigest: string; merkleRoot: string | null; merkleStatus: string },
  receipt: { receiptHash: string; syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE' },
): string {
  const payload = {
    assuranceEvaluationId: evaluation.id,
    reportSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    bundleSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    receiptSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    verificationSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    semanticReportDigest: report.reportDigest,
    bundleDigest: bundle.bundleDigest,
    merkleRoot: bundle.merkleRoot,
    merkleStatus: bundle.merkleStatus,
    receiptHash: receipt.receiptHash,
    syntheticClassification: receipt.syntheticClassification ?? 'NONE',
  };
  return hashTextContent(canonicalSerialize(payload));
}

function syntheticClassification(evaluation: AssuranceEvaluation): 'NONE' | 'SYNTHETIC_REFERENCE' {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const isSynthetic = v1_1.operatingEnvelopeId?.includes('synthetic') || v1_1.profileId?.includes('synthetic');
  return isSynthetic ? 'SYNTHETIC_REFERENCE' : 'NONE';
}
