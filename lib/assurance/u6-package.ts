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

// ─── Gate 4A Phase A: Qualified Build Identity Source Policy ───────────────
//
// Only specific producer + target combinations are qualified to establish
// Build Identity dimensions from Evidence. A SHA-shaped target.version from
// an unqualified producer does NOT establish gitCommit.
//
// QUALIFIED_GIT_COMMIT_PRODUCERS:
//   saas-static (with target.type === 'REPOSITORY') → STATIC_REPOSITORY_COMMIT
//
// Gate 4A Phase B: ci-cd-scanner is NOT yet qualified for gitCommit.
//   CI_COMMIT_IDENTITY_QUALIFICATION = OPEN / UNPROVEN
//   CI may participate as explicitly bound Evidence, but cannot establish
//   Build Identity until repository identity compatibility is proven
//   (ci_scan_results.repositoryId → ai_system_assets mapping with
//    assetType=SOURCE_REPOSITORY). This is a PRODUCT_PREREQUISITE.
//   ORCHESTRATOR_CI_COMMIT remains dormant.
//
// NOT QUALIFIED for gitCommit from target.version:
//   saas-runtime   (target.type = ENDPOINT)
//   saas-wizard    (target.type = ASSESSMENT)
//   saas-regulatory(target.type = ASSESSMENT)
//   saas-inventory (target.type = AI_SYSTEM)
//   ci-cd-scanner  (NOT exact-run bound — schema change required)
//   sarif-import   (NOT exact-run bound — schema change required)
//
// SHA_SHAPED_VALUE != QUALIFIED_GIT_COMMIT
// NON_SOURCE_PRODUCER != STATIC_REPOSITORY_COMMIT
//
// CI commit identity may still flow through the Static scanner path when
// staticExecutionMode='ci-triggered' — that is Static Evidence provenance,
// not a separate CI Build Identity path.
//
// OUT-OF-CONTRACT PROVENANCE:
//   The canonical ProvenanceRef union (ContentHash, HMAC, HashChainRecord,
//   MerkleSnapshot, MerkleInclusionProof, RunReceipt) does NOT define
//   gitCommit, containerDigest, or packageDigest fields. No real producer
//   emits such fields. Build Identity must NOT derive dimensions from
//   out-of-contract provenance accessed via type escapes.
//   TYPE_ESCAPE != PROVENANCE_CONTRACT
//
//   containerDigest and packageDigest can only come from buildBinding.
//   A typed container/package build-provenance contract is a
//   PRODUCT_PREREQUISITE for Evidence-sourced artifact identity.

const QUALIFIED_GIT_COMMIT_PRODUCERS = new Set(['saas-static']);

export function isBuildIdentityConflict(identity: BuildIdentity | undefined | null): boolean {
  if (!identity || identity.source !== 'NOT_PROVIDED') return false;
  const explanation = identity.explanation ?? '';
  return explanation === 'BUILD_IDENTITY_CONFLICT' || explanation.startsWith('BUILD_IDENTITY_CONFLICT');
}

export function resolveBuildIdentity(
  evaluation: AssuranceEvaluation,
  projectedEvidence: DecisionEvidenceProjection[],
): BuildIdentity {
  // Gate 4A Phase A (final correction): Source-truth Build Identity resolution
  // from identity-qualified Evidence from the projection supplied for this
  // evaluation, with qualified source policy.
  //
  // resolveBuildIdentity consumes only identity-qualified Evidence from the
  // projection supplied for this evaluation. Git commit identity from Evidence
  // is currently accepted only from the exact Static scan relationship
  // represented by saas-static + REPOSITORY.
  //
  // Inventory time-bounded snapshot != repository commit proof.
  // Runtime evidence != repository commit proof.
  // Wizard evidence != repository commit proof.
  // Regulatory evidence != repository commit proof.
  //
  // Allowed sources by strength:
  //   1. persisted evaluation buildBinding (BUILD_PROFILE_BINDING) — ONLY when
  //      buildBinding contributes at least one identity dimension
  //      (gitCommit, containerDigest, packageDigest, applicationVersion).
  //      BUILD_PROFILE_BINDING_SOURCE REQUIRES BUILD_BINDING_IDENTITY_CONTRIBUTION.
  //   2. Static REPOSITORY target.version if valid Git SHA and producer is
  //      saas-static with target.type === 'REPOSITORY'
  //      (STATIC_REPOSITORY_COMMIT)
  //
  // ORCHESTRATOR_CI_COMMIT is NOT currently produced — ci-cd-scanner is not
  // exact-run bound (schema change required). CI commit identity may flow
  // through the Static scanner path via staticScanId.
  //
  // EVIDENCE_PROVENANCE is NOT currently produced — the canonical ProvenanceRef
  // union does not define gitCommit/containerDigest/packageDigest fields.
  //
  // STRONGER_SOURCE_PRECEDENCE != PERMISSION_TO_HIDE_CONFLICT
  // A stronger source may determine canonical selection only after
  // contradiction handling is explicit.

  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  // ── Collect gitCommit from qualified Evidence sources only ──
  const gitCommits = new Map<string, string>(); // value → source label

  for (const ev of projectedEvidence) {
    const producerId = ev.producerId as string;
    const targetType = ev.target?.type;
    const targetVersion = ev.target?.version;

    // Only saas-static with REPOSITORY target is qualified to establish
    // gitCommit from target.version. Other producers' target.version —
    // even if SHA-shaped — does NOT establish repository commit identity.
    // Gate 4A Phase A: Evidence-derived STATIC_REPOSITORY_COMMIT requires
    // a FULL 40-char Git SHA. Abbreviated prefixes are NOT exact commit
    // identity. ABBREVIATED_GIT_PREFIX != EXACT_SOURCE_COMMIT_IDENTITY.
    if (
      targetVersion && isFullGitSha(targetVersion) &&
      QUALIFIED_GIT_COMMIT_PRODUCERS.has(producerId) &&
      targetType === 'REPOSITORY'
    ) {
      gitCommits.set(targetVersion, 'STATIC_REPOSITORY_COMMIT');
    }

    // NOTE: Out-of-contract provenance extraction removed.
    // The canonical ProvenanceRef union does not define gitCommit,
    // containerDigest, or packageDigest. No real producer emits them.
    // containerDigest and packageDigest can only come from buildBinding.
  }

  // ── Source 1: buildBinding — compare against qualified Evidence ──
  //
  // Gate 4A Phase A final correction:
  //   BUILD_PROFILE_BINDING_SOURCE REQUIRES BUILD_BINDING_IDENTITY_CONTRIBUTION.
  //   A persisted buildBinding object may exist while contributing ZERO actual
  //   Build Identity dimensions (gitCommit, containerDigest, packageDigest,
  //   applicationVersion). Profile IDs, rule-pack versions, timestamps and
  //   other buildBinding metadata do NOT count as Build Identity contribution.
  //
  //   If buildBinding contributes zero identity dimensions, it must NOT own
  //   the source label. The Evidence-only resolution path determines source.
  //
  //   ZERO_IDENTITY_DIMENSIONS_FROM_BUILD_BINDING + STATIC_EVIDENCE_GIT_COMMIT
  //   = STATIC_REPOSITORY_COMMIT, not BUILD_PROFILE_BINDING.
  if (v1_1.buildBinding) {
    const bb = v1_1.buildBinding;

    // Deterministically calculate whether buildBinding contributes at least
    // one Build Identity dimension.
    const buildBindingContributesIdentity =
      !!bb.gitCommit ||
      !!bb.containerDigest ||
      !!bb.packageDigest ||
      !!bb.applicationVersion;

    // If buildBinding contributes zero identity dimensions, skip the
    // buildBinding branch entirely and fall through to Evidence-only
    // resolution. This prevents false BUILD_PROFILE_BINDING provenance.
    if (buildBindingContributesIdentity) {

      // Per-dimension cross-source conflict check against qualified Evidence.
      // Only gitCommit has a qualified Evidence source (Static REPOSITORY).
      // containerDigest/packageDigest have no qualified Evidence source,
      // so they cannot conflict with buildBinding.
      const conflicts: string[] = [];

      if (bb.gitCommit && gitCommits.size > 0 && !gitCommits.has(bb.gitCommit)) {
        conflicts.push('gitCommit');
      }

      if (conflicts.length > 0) {
        return {
          source: 'NOT_PROVIDED',
          explanation: `BUILD_IDENTITY_CONFLICT: buildBinding contradicts Evidence on ${conflicts.join(', ')}`,
        };
      }

      // Intra-Evidence conflict (multiple qualified Static commits)
      if (gitCommits.size > 1) {
        return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
      }

      // No conflict — buildBinding values are canonical (stronger source).
      // gitCommit absent from buildBinding but present in qualified Evidence
      // is filled from Evidence (mixed-source provenance, documented below).
      const identity: BuildIdentity = { source: 'BUILD_PROFILE_BINDING' };
      const evidenceDimensions: string[] = [];

      if (bb.gitCommit) {
        identity.gitCommit = bb.gitCommit;
      } else if (gitCommits.size === 1) {
        const [commit] = Array.from(gitCommits.entries())[0];
        identity.gitCommit = commit;
        evidenceDimensions.push('gitCommit');
      }

      if (bb.containerDigest) {
        identity.containerDigest = bb.containerDigest;
      }

      if (bb.packageDigest) {
        identity.packageDigest = bb.packageDigest;
      }

      if (bb.applicationVersion) {
        identity.applicationVersion = bb.applicationVersion;
      }

      // Mixed-source provenance: buildBinding is the strongest source and
      // contributed at least one dimension. Evidence filled gaps for dimensions
      // absent from buildBinding. The `source` field means "strongest source
      // contributing to the composite Build Identity" — BUILD_PROFILE_BINDING
      // is truthful when buildBinding contributed any dimension. The explanation
      // documents which dimensions came from Evidence.
      // COMPOSITE_IDENTITY != FALSE_SINGLE_SOURCE_PROVENANCE
      if (evidenceDimensions.length > 0) {
        identity.explanation = `MIXED_SOURCE: buildBinding + Evidence (${evidenceDimensions.join(', ')} from STATIC_REPOSITORY_COMMIT)`;
      }

      if (identity.gitCommit || identity.containerDigest || identity.packageDigest || identity.applicationVersion) {
        return identity;
      }
    }
  }

  // ── No buildBinding — resolve gitCommit from qualified Evidence alone ──

  if (gitCommits.size > 1) {
    return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
  }

  if (gitCommits.size === 1) {
    const [commit, source] = Array.from(gitCommits.entries())[0];
    return {
      gitCommit: commit,
      source: source as BuildIdentity['source'],
    };
  }

  // No qualified build evidence
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

/**
 * Part 12: Validate that a string is a plausible Git commit SHA.
 *
 * isValidGitSha accepts both full 40-char SHA-1 and 7+ char hex prefixes.
 * This is retained for general plausibility checks (e.g. buildBinding values
 * which are persisted profile bindings, not Evidence-derived identity).
 *
 * isFullGitSha requires a full 40-char hexadecimal SHA-1.
 * Gate 4A Phase A: Evidence-derived STATIC_REPOSITORY_COMMIT requires
 * EXACT_SOURCE_COMMIT_IDENTITY. An abbreviated prefix is NOT exact commit
 * identity. ABBREVIATED_GIT_PREFIX != EXACT_SOURCE_COMMIT_IDENTITY.
 * STATIC_REPOSITORY_COMMIT REQUIRES FULL_COMMIT_IDENTITY.
 */
function isValidGitSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/.test(sha) || /^[0-9a-f]{7,}$/.test(sha);
}

function isFullGitSha(sha: string): boolean {
  return /^[0-9a-f]{40}$/.test(sha);
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
