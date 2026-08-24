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
  computeBundleDigest,
  verifyBundleProof,
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
  operatingEnvelopeApprovedAt?: string;
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
  const synthetic = context.syntheticClassification ?? resolveSyntheticClassification(evaluation, v1_1);
  const report = buildUnifiedAssuranceReport(evaluation, bundle, buildIdentity, projectedEvidence, synthetic, context.authoritySourceLabel);

  // 3. Decision Receipt
  const receipt = buildDecisionReceipt(evaluation, report, bundle);

  // 4. Package Digest
  const semanticPackageDigest = computePackageDigest(evaluation.id, report, bundle, receipt);

  return {
    packageSchemaVersion: U6_VERIFICATION_SCHEMA_VERSION,
    packageId: 'PENDING_ISSUANCE',
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
    authoritySourceLabel: context.authoritySourceLabel ?? resolveAuthoritySourceLabel(evaluation, v1_1),
    operatingEnvelopeApprovedAt: context.operatingEnvelopeApprovedAt,
    approvalReference: context.approvalReference ?? v1_1.operatingEnvelopeApprovalReference ?? undefined,
    syntheticClassification: synthetic,
  };
}

export function verifyAssurancePackage(pkg: U6Package): PackageVerificationResult {
  const checks: any = {};

  // Recompute report digest
  const recomputedReportDigest = computeReportDigest(pkg.report);
  checks.reportDigestValid = recomputedReportDigest === pkg.semanticReportDigest && pkg.semanticReportDigest === pkg.report.reportDigest;

  // Recompute bundle digest
  const recomputedBundleDigest = computeBundleDigest(pkg.bundle);
  checks.bundleDigestValid = recomputedBundleDigest === pkg.bundle.bundleDigest && pkg.bundle.bundleDigest === pkg.bundleDigest;

  // Merkle root
  const recomputedBundleMerkle = computeBundleMerkleRoot(pkg.bundle);
  checks.merkleRootValid = recomputedBundleMerkle === pkg.merkleRoot && pkg.merkleRoot === pkg.bundle.merkleRoot && pkg.merkleRoot === pkg.receipt.evidenceMerkleRoot;
  checks.merkleStatusValid = pkg.merkleStatus === pkg.bundle.merkleStatus && pkg.merkleStatus === pkg.receipt.merkleStatus;

  // Recompute receipt hash
  const recomputedReceiptHash = computeReceiptHash(pkg.receipt);
  checks.receiptHashValid = recomputedReceiptHash === pkg.receipt.receiptHash && pkg.receipt.receiptHash === pkg.receiptHash;

  // Bindings
  checks.reportReceiptBindingValid = pkg.receipt.semanticReportDigest === pkg.semanticReportDigest && pkg.receipt.semanticReportDigest === pkg.report.reportDigest;
  checks.receiptBundleBindingValid = pkg.receipt.evidenceMerkleRoot === pkg.bundle.merkleRoot && pkg.receipt.evidenceMerkleRoot === pkg.merkleRoot && pkg.receipt.evidenceBundleDigest === pkg.bundle.bundleDigest;

  // Merkle proof verification: every expected membership proof must succeed
  checks.allMerkleProofsValid = verifyAllBundleMerkleProofs(pkg.bundle);

  // Top-level package digest
  checks.packageDigestValid = computePackageDigestFromPackage(pkg) === pkg.semanticPackageDigest;

  // Identity consistency
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
  const verifyResult = verifyAssurancePackage(pkg);
  const status: PublicVerificationResult['verificationStatus'] =
    publicationState === 'REVOKED' ? 'REVOKED' :
    verifyResult.valid ? 'INTEGRITY_VERIFIED_AGAINST_HAIEC_RECORD' : 'INVALID_PACKAGE';
  return {
    publicVerificationId,
    publicationState,
    verificationStatus: status,
    disposition: pkg.receipt.disposition,
    evaluatedAt: pkg.receipt.evaluationSnapshotAt,
    methodologyVersion: pkg.receipt.assuranceMethodologyVersion,
    reportSchemaVersion: pkg.report.reportVersion,
    profileLabel: pkg.receipt.profileId,
    profileVersion: pkg.receipt.profileVersion,
    scopeSummary: sanitizePublicScope(pkg.report.scopeStatement),
    receiptHash: pkg.receipt.receiptHash,
    merkleRoot: pkg.merkleRoot,
    merkleStatus: pkg.merkleStatus,
    syntheticClassification: pkg.syntheticClassification,
    publishedAt: undefined,
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
  assuranceEvaluationId: string,
  report: { reportVersion: string; reportDigest: string },
  bundle: { bundleVersion: string; bundleDigest: string; merkleRoot: string | null; merkleStatus: string },
  receipt: { receiptVersion: string; receiptHash: string; syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE' },
): string {
  const payload = {
    assuranceEvaluationId,
    reportSchemaVersion: report.reportVersion,
    bundleSchemaVersion: bundle.bundleVersion,
    receiptSchemaVersion: receipt.receiptVersion,
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

function computePackageDigestFromPackage(pkg: U6Package): string {
  return computePackageDigest(
    pkg.assuranceEvaluationId,
    { reportVersion: pkg.reportSchemaVersion, reportDigest: pkg.semanticReportDigest },
    { bundleVersion: pkg.bundleSchemaVersion, bundleDigest: pkg.bundleDigest, merkleRoot: pkg.merkleRoot, merkleStatus: pkg.merkleStatus },
    { receiptVersion: pkg.receiptSchemaVersion, receiptHash: pkg.receiptHash, syntheticClassification: pkg.syntheticClassification },
  );
}

function verifyAllBundleMerkleProofs(bundle: { merkleStatus: string; merkleRoot: string | null; members: any[] }): boolean {
  if (bundle.merkleStatus === 'NOT_AVAILABLE_EMPTY_SET' || bundle.merkleRoot === null) {
    return bundle.members.length === 0;
  }
  const proofs = bundleMerkleProofs(bundle as any);
  if (proofs.length !== bundle.members.length) return false;
  return proofs.every(({ leafHash, proof }) => verifyBundleProof(bundle as any, leafHash, proof));
}

function resolveSyntheticClassification(evaluation: AssuranceEvaluation, v1_1?: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' {
  if (v1_1?.operatingEnvelopeId?.includes('synthetic') || v1_1?.profileId?.includes('synthetic') || v1_1?.operatingEnvelopeApprovalReference?.includes('synthetic')) {
    return 'SYNTHETIC_REFERENCE';
  }
  return 'NONE';
}

function resolveAuthoritySourceLabel(_evaluation: AssuranceEvaluation, v1_1?: AssuranceEvaluationV1_1): string | undefined {
  if (v1_1?.operatingEnvelopeState !== 'APPROVED') return 'UNKNOWN';
  if (v1_1?.operatingEnvelopeApprovedBy) return 'AUTHORITATIVE_POLICY';
  return 'REFERENCE_DEFAULT';
}

function sanitizePublicScope(scope: string): string {
  // U6: strip internal-looking identifiers from the public scope statement.
  return scope
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<ID>')
    .replace(/env-[a-z0-9-]+/gi, '<ENVELOPE>')
    .replace(/run-[a-z0-9-]+/gi, '<RUN>');
}
