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
  U6_VERIFICATION_SCHEMA_VERSION_G3,
  U6_RECEIPT_SCHEMA_VERSION,
  U6_RECEIPT_SCHEMA_VERSION_G3,
  U6_REPORT_SCHEMA_VERSION,
  U6_REPORT_SCHEMA_VERSION_G3,
  BuildIdentity,
  U6Package,
  PackageVerificationResult,
  PublicVerificationResult,
  EvaluatedScopeBinding,
} from './u6-types';
import { resolvePublicProfileLabel } from './u6-public-profile-label';

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
  // G3-R1: Scope binding — when provided, the receipt commits to the scope
  // via evaluatedScopeBinding in computeReceiptHash, and schema versions
  // are upgraded to 1.1.0.
  evaluatedScopeBinding?: EvaluatedScopeBinding;
}

export function buildAssuranceVerificationPackage(
  context: PackageBuildContext,
): U6Package {
  const { evaluation, projectedEvidence } = context;
  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  const buildIdentity = context.buildIdentity ?? resolveBuildIdentity(evaluation, projectedEvidence);

  // G3-R1: When scope binding is provided, use G3 schema versions (1.1.0).
  // Legacy packages (no scope binding) use 1.0.0 and remain verifiable under 1.0.0.
  const hasScopeBinding = !!context.evaluatedScopeBinding;
  const receiptSchemaVersion = hasScopeBinding ? U6_RECEIPT_SCHEMA_VERSION_G3 : U6_RECEIPT_SCHEMA_VERSION;
  const reportSchemaVersion = hasScopeBinding ? U6_REPORT_SCHEMA_VERSION_G3 : U6_REPORT_SCHEMA_VERSION;
  const verificationSchemaVersion = context.verificationSchemaVersion ??
    (hasScopeBinding ? U6_VERIFICATION_SCHEMA_VERSION_G3 : U6_VERIFICATION_SCHEMA_VERSION);

  // 1. Evidence Bundle
  const bundle = buildEvidenceBundle(evaluation, projectedEvidence);

  // 2. Unified Assurance Report Core
  const synthetic = context.syntheticClassification ?? resolveSyntheticClassification(evaluation, v1_1);
  const report = buildUnifiedAssuranceReport(evaluation, bundle, buildIdentity, projectedEvidence, synthetic, context.authoritySourceLabel);

  // G3-R1: Override report version if scope binding present
  if (hasScopeBinding) {
    report.reportVersion = reportSchemaVersion;
  }

  // 3. Decision Receipt — with scope binding if provided
  const receipt = buildDecisionReceipt(evaluation, report, bundle, context.evaluatedScopeBinding, receiptSchemaVersion);

  // 4. Package Digest — commits to the actual package verification schema version
  const semanticPackageDigest = computePackageDigest(evaluation.id, verificationSchemaVersion, report, bundle, receipt);

  return {
    packageSchemaVersion: verificationSchemaVersion,
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

  // G3-R1: Evaluated Scope binding validation.
  // For schema 1.1.0+ packages: scope binding MUST be present and consistent.
  // For legacy 1.0.0 packages: scope binding is absent (undefined) — still valid.
  const isG3Schema = pkg.receiptSchemaVersion === '1.1.0' || pkg.verificationSchemaVersion === '1.1.0';
  if (isG3Schema) {
    checks.scopeBindingPresentValid =
      pkg.receipt.evaluatedScopeBinding !== undefined &&
      pkg.receipt.evaluatedScopeBinding !== null;
    if (checks.scopeBindingPresentValid) {
      const sb = pkg.receipt.evaluatedScopeBinding!;
      checks.scopeBindingConsistentValid =
        sb.evaluatedScopeId !== '' &&
        sb.scopeDigest !== '' &&
        sb.scopeSchemaVersion !== '';
    } else {
      checks.scopeBindingConsistentValid = false;
    }
  } else {
    // Legacy schema: no scope binding expected
    checks.scopeBindingPresentValid = true;
    checks.scopeBindingConsistentValid = true;
  }

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
    // Defect 3: Public-safe profile label — bounded allowlist, not raw profileId
    profileLabel: resolvePublicProfileLabel(pkg.receipt.profileId),
    profileVersion: pkg.receipt.profileVersion,
    // Defect 3: Construct safe scope summary using public label, not profileId
    scopeSummary: `HAIEC Assurance evaluation completed under ${resolvePublicProfileLabel(pkg.receipt.profileId)}. The public verification confirms the recorded decision and package integrity without exposing private Evidence or operating-envelope identifiers.`,
    receiptHash: pkg.receipt.receiptHash,
    merkleRoot: pkg.merkleRoot,
    merkleStatus: pkg.merkleStatus,
    syntheticClassification: pkg.syntheticClassification,
    publishedAt: undefined,
    revokedAt,
  };
}

export function resolveBuildIdentity(
  evaluation: AssuranceEvaluation,
  projectedEvidence: DecisionEvidenceProjection[],
): BuildIdentity {
  // Defect 5/6/7: Source-truth Build Identity resolution from EXACT Evidence selected for the evaluated run.
  // Allowed sources by strength:
  //   1. persisted evaluation buildBinding if exact and available (BUILD_PROFILE_BINDING)
  //   2. exact-run CI Evidence with an exact commit/build reference (ORCHESTRATOR_CI_COMMIT)
  //   3. exact-run Static REPOSITORY target.version if valid Git SHA (STATIC_REPOSITORY_COMMIT)
  //   4. exact canonical Evidence provenance (EVIDENCE_PROVENANCE)
  //
  // Defect 7: Non-conflicting identifiers across dimensions are preserved.
  //   gitCommit + containerDigest + packageDigest can coexist.
  //   Only conflicting values for the SAME dimension → BUILD_IDENTITY_CONFLICT.
  //
  // Defect 8: CI exact-run binding is NOT currently available in projectEvidenceForRun().
  //   ci-cd-scanner and sarif-import are not bound to orchestrator runs.
  //   Therefore ORCHESTRATOR_CI_COMMIT is not currently produced from Evidence.
  //   This is a truthful limitation, not a failure.

  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  // Source 1: buildBinding (Defect 5)
  if (v1_1.buildBinding) {
    const bb = v1_1.buildBinding;
    const identity: BuildIdentity = {
      source: 'BUILD_PROFILE_BINDING',
    };
    if (bb.gitCommit) identity.gitCommit = bb.gitCommit;
    if (bb.containerDigest) identity.containerDigest = bb.containerDigest;
    if (bb.packageDigest) identity.packageDigest = bb.packageDigest;
    if (bb.applicationVersion) identity.applicationVersion = bb.applicationVersion;
    // Only return if at least one identifier is present
    if (identity.gitCommit || identity.containerDigest || identity.packageDigest || identity.applicationVersion) {
      return identity;
    }
  }

  // Collect identifiers from Evidence, tracking source per dimension
  const gitCommits = new Map<string, string>(); // value → source label
  const containerDigests = new Map<string, string>();
  const packageDigests = new Map<string, string>();

  for (const ev of projectedEvidence) {
    const producerId = ev.producerId as string;

    // Source 3: target.version as Git commit SHA (Defect 6: label by producer)
    const targetVersion = ev.target?.version;
    if (targetVersion && isValidGitSha(targetVersion)) {
      // Defect 6: Static evidence gets STATIC_REPOSITORY_COMMIT, not ORCHESTRATOR_CI_COMMIT
      // Defect 8: CI producer would get ORCHESTRATOR_CI_COMMIT, but ci-cd-scanner is not currently bound
      const sourceLabel = producerId === 'ci-cd-scanner' ? 'ORCHESTRATOR_CI_COMMIT' : 'STATIC_REPOSITORY_COMMIT';
      gitCommits.set(targetVersion, sourceLabel);
    }

    // Source 4: provenance refs with explicit build/package/container identity
    for (const ref of ev.provenanceRefs ?? []) {
      const refAny = ref as any;
      if (refAny.gitCommit && isValidGitSha(refAny.gitCommit)) {
        gitCommits.set(refAny.gitCommit, 'EVIDENCE_PROVENANCE');
      }
      if (refAny.containerDigest) {
        containerDigests.set(refAny.containerDigest, 'EVIDENCE_PROVENANCE');
      }
      if (refAny.packageDigest) {
        packageDigests.set(refAny.packageDigest, 'EVIDENCE_PROVENANCE');
      }
    }
  }

  // Defect 7: Conflict detection per dimension. Non-conflicting dimensions coexist.
  const hasGitConflict = gitCommits.size > 1;
  const hasContainerConflict = containerDigests.size > 1;
  const hasPackageConflict = packageDigests.size > 1;

  if (hasGitConflict || hasContainerConflict || hasPackageConflict) {
    return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
  }

  // Defect 7: Build identity preserving all non-conflicting identifiers
  const identity: BuildIdentity = {};
  const sources: string[] = [];

  if (gitCommits.size === 1) {
    const [commit, source] = Array.from(gitCommits.entries())[0];
    identity.gitCommit = commit;
    sources.push(source);
  }

  if (containerDigests.size === 1) {
    const [digest, source] = Array.from(containerDigests.entries())[0];
    identity.containerDigest = digest;
    sources.push(source);
  }

  if (packageDigests.size === 1) {
    const [digest, source] = Array.from(packageDigests.entries())[0];
    identity.packageDigest = digest;
    sources.push(source);
  }

  if (sources.length > 0) {
    // Defect 7: Source is the strongest source that contributed.
    // Priority: BUILD_PROFILE_BINDING > ORCHESTRATOR_CI_COMMIT > STATIC_REPOSITORY_COMMIT > EVIDENCE_PROVENANCE
    if (sources.includes('ORCHESTRATOR_CI_COMMIT')) {
      identity.source = 'ORCHESTRATOR_CI_COMMIT';
    } else if (sources.includes('STATIC_REPOSITORY_COMMIT')) {
      identity.source = 'STATIC_REPOSITORY_COMMIT';
    } else {
      identity.source = 'EVIDENCE_PROVENANCE';
    }
    return identity;
  }

  // No exact build evidence
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
