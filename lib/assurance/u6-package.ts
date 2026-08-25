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
  syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN';
  verificationSchemaVersion?: string;
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

  // 4. Package Digest — commits to the actual package verification schema version
  const verificationSchemaVersion = context.verificationSchemaVersion ?? U6_VERIFICATION_SCHEMA_VERSION;
  const semanticPackageDigest = computePackageDigest(evaluation.id, verificationSchemaVersion, report, bundle, receipt);

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
    verificationSchemaVersion,
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

  // ── Cross-object identity binding (Part 10) ──────────────────────────
  // PACKAGE ↔ REPORT
  checks.evaluationIdentityValid =
    pkg.assuranceEvaluationId === pkg.report.assuranceEvaluationId &&
    pkg.receipt.assuranceEvaluationId === pkg.assuranceEvaluationId;
  checks.organizationIdentityValid =
    pkg.organizationId === pkg.report.organizationId &&
    pkg.receipt.organizationId === pkg.organizationId;
  checks.aiSystemIdentityValid =
    pkg.aiSystemId === pkg.report.aiSystemId &&
    pkg.receipt.aiSystemId === pkg.aiSystemId;
  checks.orchestratorRunIdentityValid =
    pkg.orchestratorRunId === pkg.report.orchestratorRunId &&
    pkg.receipt.orchestratorRunId === pkg.orchestratorRunId;

  // Schema version binding across package ↔ report ↔ bundle ↔ receipt
  checks.schemaVersionBindingValid =
    pkg.reportSchemaVersion === pkg.report.reportVersion &&
    pkg.bundleSchemaVersion === pkg.bundle.bundleVersion &&
    pkg.receiptSchemaVersion === pkg.receipt.receiptVersion;

  // Profile identity binding
  checks.profileIdentityValid =
    pkg.receipt.profileId === pkg.report.profile.profileId &&
    pkg.receipt.profileVersion === pkg.report.profile.profileVersion &&
    pkg.receipt.profileDigestResolved === pkg.report.profile.profileDigestResolved;

  // Operating envelope identity binding
  checks.envelopeIdentityValid =
    pkg.report.operatingEnvelope === undefined ||
    (pkg.receipt.operatingEnvelopeId === pkg.report.operatingEnvelope.envelopeId &&
     pkg.receipt.operatingEnvelopeVersion === pkg.report.operatingEnvelope.envelopeVersion &&
     pkg.receipt.operatingEnvelopeDigest === pkg.report.operatingEnvelope.envelopeDigest);

  // Authority source label binding
  checks.authoritySourceBindingValid =
    pkg.authoritySourceLabel === undefined ||
    pkg.authoritySourceLabel === pkg.report.operatingEnvelope?.authoritySourceLabel;

  // Build identity binding — canonical comparison, not JSON.stringify (Part 9)
  checks.buildIdentityValid =
    canonicalSerialize(pkg.receipt.buildIdentity) === canonicalSerialize(pkg.buildIdentity) &&
    canonicalSerialize(pkg.report.buildIdentity) === canonicalSerialize(pkg.buildIdentity);

  // Synthetic classification binding
  checks.syntheticIdentityValid =
    pkg.receipt.syntheticClassification === pkg.syntheticClassification &&
    pkg.report.syntheticClassification === pkg.syntheticClassification;

  // Report evidence bundle summary ↔ actual bundle
  checks.reportBundleSummaryValid =
    pkg.report.evidenceBundle.bundleDigest === pkg.bundle.bundleDigest &&
    pkg.report.evidenceBundle.merkleRoot === pkg.bundle.merkleRoot &&
    pkg.report.evidenceBundle.merkleStatus === pkg.bundle.merkleStatus &&
    pkg.report.evidenceBundle.membershipCount === pkg.bundle.members.length;

  // Report decision receipt summary ↔ actual receipt
  checks.reportReceiptSummaryValid =
    pkg.report.decisionReceipt.receiptVersion === pkg.receipt.receiptVersion &&
    pkg.report.decisionReceipt.receiptId === pkg.receipt.receiptId &&
    pkg.report.decisionReceipt.receiptHash === pkg.receipt.receiptHash;

  // Receipt ↔ report digest binding
  checks.receiptReportDigestValid =
    pkg.receipt.semanticReportDigest === pkg.report.reportDigest &&
    pkg.receipt.semanticReportDigest === pkg.semanticReportDigest;

  // Receipt ↔ bundle digest binding
  checks.receiptBundleDigestValid =
    pkg.receipt.evidenceBundleDigest === pkg.bundle.bundleDigest &&
    pkg.receipt.evidenceBundleDigest === pkg.bundleDigest;

  // Receipt ↔ Merkle root binding
  checks.receiptMerkleRootValid =
    pkg.receipt.evidenceMerkleRoot === pkg.bundle.merkleRoot &&
    pkg.receipt.evidenceMerkleRoot === pkg.merkleRoot;

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
  // Part 8: Pure helpers may only say INTERNALLY_CONSISTENT — they did not query the HAIEC persistence anchor.
  const status: PublicVerificationResult['verificationStatus'] =
    publicationState === 'REVOKED' ? 'REVOKED' :
    verifyResult.valid ? 'INTERNALLY_CONSISTENT' : 'INVALID_PACKAGE';
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
    // Part 22: Construct safe scope summary, not regex-redacted private scope
    scopeSummary: `HAIEC Assurance evaluation completed under ${pkg.receipt.profileId ?? 'the selected Assurance Profile'}. The public verification confirms the recorded decision and package integrity without exposing private Evidence or operating-envelope identifiers.`,
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
  projectedEvidence: DecisionEvidenceProjection[],
): BuildIdentity {
  // Part 12: Source-truth Build Identity resolution from EXACT Evidence selected for the evaluated run.
  // Allowed sources by strength:
  //   1. persisted evaluation buildBinding if exact and available
  //   2. exact-run CI Evidence with an exact commit/build reference
  //   3. exact-run Static REPOSITORY target.version if it is a valid Git commit SHA
  //   4. exact canonical Evidence provenance if an explicit build/package/container identity already exists

  const gitCommits = new Set<string>();
  const containerDigests = new Set<string>();
  const packageDigests = new Set<string>();

  for (const ev of projectedEvidence) {
    // Source 3: target.version as Git commit SHA
    const targetVersion = ev.target?.version;
    if (targetVersion && isValidGitSha(targetVersion)) {
      gitCommits.add(targetVersion);
    }

    // Source 4: provenance refs with explicit build/package/container identity
    for (const ref of ev.provenanceRefs ?? []) {
      const refAny = ref as any;
      if (refAny.gitCommit && isValidGitSha(refAny.gitCommit)) {
        gitCommits.add(refAny.gitCommit);
      }
      if (refAny.containerDigest) {
        containerDigests.add(refAny.containerDigest);
      }
      if (refAny.packageDigest) {
        packageDigests.add(refAny.packageDigest);
      }
    }
  }

  // Part 12: Conflict detection
  if (gitCommits.size > 1) {
    return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
  }
  if (gitCommits.size === 1) {
    return { source: 'ORCHESTRATOR_CI_COMMIT', gitCommit: Array.from(gitCommits)[0] };
  }

  if (containerDigests.size > 1) {
    return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
  }
  if (containerDigests.size === 1) {
    return { source: 'EVIDENCE_PROVENANCE', containerDigest: Array.from(containerDigests)[0] };
  }

  if (packageDigests.size > 1) {
    return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
  }
  if (packageDigests.size === 1) {
    return { source: 'EVIDENCE_PROVENANCE', packageDigest: Array.from(packageDigests)[0] };
  }

  // Part 12: No exact build evidence
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

/**
 * Part 12: Validate that a string is a plausible Git commit SHA (40-char hex or 7+ char hex prefix).
 */
function isValidGitSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/.test(sha) || /^[0-9a-f]{7,}$/.test(sha);
}

export function computePackageDigest(
  assuranceEvaluationId: string,
  verificationSchemaVersion: string,
  report: { reportVersion: string; reportDigest: string },
  bundle: { bundleVersion: string; bundleDigest: string; merkleRoot: string | null; merkleStatus: string },
  receipt: { receiptVersion: string; receiptHash: string; syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' },
): string {
  const payload = {
    assuranceEvaluationId,
    reportSchemaVersion: report.reportVersion,
    bundleSchemaVersion: bundle.bundleVersion,
    receiptSchemaVersion: receipt.receiptVersion,
    verificationSchemaVersion,
    semanticReportDigest: report.reportDigest,
    bundleDigest: bundle.bundleDigest,
    merkleRoot: bundle.merkleRoot,
    merkleStatus: bundle.merkleStatus,
    receiptHash: receipt.receiptHash,
    syntheticClassification: receipt.syntheticClassification ?? 'UNKNOWN',
  };
  return hashTextContent(canonicalSerialize(payload));
}

function computePackageDigestFromPackage(pkg: U6Package): string {
  return computePackageDigest(
    pkg.assuranceEvaluationId,
    pkg.verificationSchemaVersion,
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

function resolveSyntheticClassification(evaluation: AssuranceEvaluation, v1_1?: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' {
  if (v1_1?.syntheticClassification) return v1_1.syntheticClassification;
  if (v1_1?.operatingEnvelopeAuthoritySourceLabel === 'SYNTHETIC_REFERENCE_POLICY') return 'SYNTHETIC_REFERENCE';
  if (v1_1?.operatingEnvelopeState !== 'APPROVED') return 'UNKNOWN';
  if (v1_1?.operatingEnvelopeAuthoritySourceLabel) return 'NONE';
  return 'UNKNOWN';
}

function resolveAuthoritySourceLabel(_evaluation: AssuranceEvaluation, v1_1?: AssuranceEvaluationV1_1): string {
  // U6: authority source is the explicit evaluation-time label. approvedBy is provenance, not authority.
  return v1_1?.operatingEnvelopeAuthoritySourceLabel ?? 'UNKNOWN';
}

// sanitizePublicScope removed — Part 22: use buildPublicScopeSummary() in u6-package-service.ts instead
