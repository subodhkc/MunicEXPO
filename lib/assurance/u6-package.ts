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
  DeploymentIdentity,
  U6Package,
  PackageVerificationResult,
  PublicVerificationResult,
  EvaluatedScopeBinding,
  EvaluatedScopeSnapshot,
  EvaluatedScopeAssetSnapshot,
} from './u6-types';
import { resolvePublicProfileLabel } from './u6-public-profile-label';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';
import { parseGitHubUrl } from '@/lib/ai-security/url-utils';

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
  // Gate 4A: Full Evaluated Scope snapshot — when provided, enables CI commit
  // qualification via repository compatibility (ORCHESTRATOR_CI_COMMIT).
  // The snapshot's assetSnapshots contain frozen provider + canonicalLocator
  // + identityStateAtEvaluation used by the compatibility predicate.
  evaluatedScopeSnapshot?: EvaluatedScopeSnapshot;
}

export function buildAssuranceVerificationPackage(
  context: PackageBuildContext,
): U6Package {
  const { evaluation, projectedEvidence } = context;
  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  const buildIdentity = context.buildIdentity ?? resolveBuildIdentity(evaluation, projectedEvidence, context.evaluatedScopeSnapshot);

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

  // G3-R1: Override report version if scope binding present.
  // CRITICAL: The report digest was computed inside buildUnifiedAssuranceReport
  // using the legacy 1.0.0 versions. When G3 scope binding upgrades the schema
  // versions to 1.1.0, the digest MUST be recomputed so that
  //   EVALUATION_USED_TO_BUILD_PACKAGE == EVALUATION_RECONSTRUCTED_FOR_VERIFICATION
  // Otherwise the persisted semanticReportDigest binds to 1.0.0 content while
  // the persisted reportJson carries 1.1.0 content, and reload verification
  // fails with reportDigestValid=false.
  //
  // The report's decisionReceipt.receiptVersion must also be upgraded here,
  // because computeReportDigest includes decisionReceipt.receiptVersion in its
  // payload, and reportReceiptSummaryValid checks that the report's embedded
  // receipt version matches the actual receipt's version.
  if (hasScopeBinding) {
    report.reportVersion = reportSchemaVersion;
    report.decisionReceipt.receiptVersion = receiptSchemaVersion;
    report.reportDigest = computeReportDigest(report);
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
// Gate 4A: ci-cd-scanner is qualified for gitCommit (ORCHESTRATOR_CI_COMMIT)
//   when ALL of the following are proven:
//     - CI evidence is explicitly bound to the evaluation (guaranteed by projection)
//     - Evaluated Scope belongs to the same evaluation context (org, AI system, run)
//     - Evaluated Scope snapshot is provided (schema 1.1+ with frozen provider)
//     - A SOURCE_REPOSITORY asset exists in the immutable Evaluated Scope
//     - asset.evaluationInclusionState === 'EVALUATED'
//     - asset.identityStateAtEvaluation === 'VERIFIED'
//     - CI repository identity exactly matches frozen repository identity
//       (via canonical normalization — parseGitHubUrl for GitHub provider)
//     - CI commit (target.version) is a full 40-character Git SHA
//     - CI origin is source-proven (triggerEvent='github_app_pr' — provider-derived)
//   If any dimension is missing, conflicted, or ambiguous → NOT qualified.
//   ORCHESTRATOR_CI_COMMIT is activated only when all predicates return true.
//   CALLER_DECLARED_CI != BUILD_IDENTITY_SOURCE_PROVEN.
//
// NOT QUALIFIED for gitCommit from target.version:
//   saas-runtime   (target.type = ENDPOINT)
//   saas-wizard    (target.type = ASSESSMENT)
//   saas-regulatory(target.type = ASSESSMENT)
//   saas-inventory (target.type = AI_SYSTEM)
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

// ─── Gate 4A: CI Repository Compatibility Predicate ─────────────────────────
//
// Determines whether a CI result's repository identity is proven compatible
// with a VERIFIED SOURCE_REPOSITORY asset in the immutable Evaluated Scope.
//
// This is NOT a second Build Identity engine. It is a compatibility predicate
// that feeds into the existing resolveBuildIdentity source-policy resolver.
// The existing canonical package/Build Identity path remains owner.
//
// Required truths (ALL must hold):
//   - Evaluated Scope snapshot is provided (schema 1.1+ with frozen provider)
//   - A SOURCE_REPOSITORY asset exists in the immutable Evaluated Scope
//   - asset.evaluationInclusionState === 'EVALUATED'
//   - asset.identityStateAtEvaluation === 'VERIFIED'
//   - CI repository identity exactly matches frozen repository identity
//     (via canonical normalization — parseGitHubUrl for GitHub provider)
//
// If any dimension is missing, conflicted, or ambiguous → NOT compatible.
// CURRENT_CONNECTED_ASSET != HISTORICAL_EVALUATED_SCOPE.
// SAME_REPOSITORY_NAME != SAME_REPOSITORY_IDENTITY.
// SAME_REPOSITORY_URL_STRING != PROVEN_CANONICAL_IDENTITY (unless normalization proves it).

/**
 * Check if a CI repository identity is compatible with a VERIFIED SOURCE_REPOSITORY
 * asset in the frozen Evaluated Scope.
 *
 * @param scope - The immutable Evaluated Scope snapshot (frozen at evaluation time)
 * @param ciRepositoryId - The CI result's repository identity (target.id = repositoryId)
 * @returns true only if ALL compatibility dimensions are proven
 */
export function ciRepositoryCompatibleWithEvaluatedScope(
  scope: EvaluatedScopeSnapshot,
  ciRepositoryId: string,
): boolean {
  // Find a compatible SOURCE_REPOSITORY asset in the frozen scope
  const compatibleAsset = scope.assetSnapshots.find(asset =>
    isCIRepositoryCompatibleWithAsset(asset, ciRepositoryId)
  );
  return compatibleAsset !== undefined;
}

/**
 * Check if a single Evaluated Scope asset is a compatible SOURCE_REPOSITORY
 * for the given CI repository identity.
 *
 * All dimensions must hold. Any missing/conflicted/ambiguous dimension → false.
 */
function isCIRepositoryCompatibleWithAsset(
  asset: EvaluatedScopeAssetSnapshot,
  ciRepositoryId: string,
): boolean {
  // Must be SOURCE_REPOSITORY
  if (asset.assetType !== 'SOURCE_REPOSITORY') return false;

  // Must have been EVALUATED (not retired/excluded)
  if (asset.evaluationInclusionState !== 'EVALUATED') return false;

  // Identity must have been VERIFIED at evaluation time
  // NOT_VERIFIED → NOT qualified. CONFLICTED → NOT qualified.
  if (asset.identityStateAtEvaluation !== 'VERIFIED') return false;

  // Repository identity must match via canonical normalization
  return repositoryIdentityMatches(asset, ciRepositoryId);
}

/**
 * Determine if a frozen asset's repository identity matches the CI repository
 * identity using canonical normalization.
 *
 * Uses the existing parseGitHubUrl() helper for GitHub repositories.
 * For non-GitHub providers, no canonical normalization helper exists —
 * returns false (do NOT infer equality without canonical proof).
 *
 * SAME_REPOSITORY_URL_STRING != PROVEN_CANONICAL_IDENTITY unless canonical
 * normalization proves it.
 */
function repositoryIdentityMatches(
  asset: EvaluatedScopeAssetSnapshot,
  ciRepositoryId: string,
): boolean {
  const provider = asset.provider;
  const canonicalLocator = asset.canonicalLocator;

  // Provider and canonicalLocator must both be frozen
  // Historical 1.0 scopes without provider → UNPROVEN
  if (!provider || !canonicalLocator) return false;

  if (provider === 'github') {
    // Use existing parseGitHubUrl() to normalize the asset's canonical locator
    // (repo URL → owner/repo). This IS canonical normalization proving equivalence.
    const parsed = parseGitHubUrl(canonicalLocator);
    if (!parsed) return false;
    const assetOwnerRepo = `${parsed.owner}/${parsed.repo}`;

    // CI repositoryId from GitHub App is repoFullName (owner/repo).
    // CI repositoryId from manual API may not be owner/repo — validate format.
    // Normalize both to lowercase for canonical comparison (GitHub is case-insensitive).
    const ciNormalized = ciRepositoryId.toLowerCase().trim();
    if (!/^[^/]+\/[^/]+$/.test(ciNormalized)) return false;

    return assetOwnerRepo === ciNormalized;
  }

  // For non-GitHub providers, no canonical normalization helper exists.
  // Do NOT infer equality. SAME_REPOSITORY_NAME != SAME_REPOSITORY_IDENTITY.
  return false;
}

// ─── Gate 4A Correction A: Exact Evaluation/Scope Identity Guard ────────────
//
// Before CI Evidence may establish ORCHESTRATOR_CI_COMMIT, the supplied
// persisted Evaluated Scope must match the Assurance evaluation on all
// existing applicable immutable identity dimensions.
//
// This is NOT a second evaluation-compatibility framework. It is a minimal
// guard that the scope belongs to the same evaluation context.
//
// If an identity required by the current contract conflicts → CI_COMMIT_NOT_QUALIFIED.
// Missing identity dimensions are not inferred — they fail closed.

/**
 * Check if the Evaluated Scope belongs to the same evaluation context.
 * All available dimensions must match. Missing dimensions fail closed.
 */
function evaluatedScopeMatchesEvaluation(
  scope: EvaluatedScopeSnapshot,
  evaluation: AssuranceEvaluation,
): boolean {
  // organizationId: both scope and evaluation carry this; required.
  if (scope.organizationId !== evaluation.organizationId) return false;

  // aiSystemId: both scope and evaluation carry this; required.
  if (scope.aiSystemId !== evaluation.aiSystemId) return false;

  // orchestratorRunId: scope may carry it; evaluation carries it.
  // If scope has it, it must match. If scope lacks it, fail closed
  // (cannot prove the scope belongs to this evaluation).
  if (!scope.orchestratorRunId) return false;
  if (scope.orchestratorRunId !== evaluation.orchestratorRunId) return false;

  return true;
}

// ─── Gate 4A Correction B: Source-Proven CI Origin ──────────────────────────
//
// ci_scan_results.repositoryId has mixed origin:
//   - GitHub App path → provider-derived repository identity (triggerEvent='github_app_pr')
//   - Manual API path → caller-provided repository identity (triggerEvent='manual')
//
// Only provider-derived CI identity may establish ORCHESTRATOR_CI_COMMIT.
// Manual/caller-declared rows remain valid CI Evidence but:
//   MANUAL_OR_DECLARED_CI != BUILD_IDENTITY_SOURCE_PROVEN
//
// The triggerEvent field is set deterministically by each writer:
//   - GitHub App writer: hardcoded 'github_app_pr'
//   - Manual API writer: hardcoded 'manual' (Correction B: no longer accepts caller-supplied value)
//
// Historical/ambiguous rows with other triggerEvent values → NOT qualified.

/** triggerEvent value set by the GitHub App CI writer (provider-derived). */
const CI_TRIGGER_GITHUB_APP_PR = 'github_app_pr';

/**
 * Check if a CI evidence projection carries a source-proven origin.
 * Only GitHub App provider-derived CI may establish Build Identity.
 */
function isCIEvidenceSourceProven(ev: DecisionEvidenceProjection): boolean {
  const triggerEvent = (ev as any).__ciTriggerEvent;
  return triggerEvent === CI_TRIGGER_GITHUB_APP_PR;
}

export function resolveBuildIdentity(
  evaluation: AssuranceEvaluation,
  projectedEvidence: DecisionEvidenceProjection[],
  evaluatedScope?: EvaluatedScopeSnapshot,
): BuildIdentity {
  // Gate 4A: Source-truth Build Identity resolution from identity-qualified
  // Evidence from the projection supplied for this evaluation, with qualified
  // source policy.
  //
  // resolveBuildIdentity consumes only identity-qualified Evidence from the
  // projection supplied for this evaluation. Git commit identity from Evidence
  // is accepted from:
  //   - saas-static + REPOSITORY target → STATIC_REPOSITORY_COMMIT
  //   - ci-cd-scanner + REPOSITORY target → ORCHESTRATOR_CI_COMMIT
  //     (only when ciRepositoryCompatibleWithEvaluatedScope proves repository
  //      compatibility with the frozen Evaluated Scope)
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
  //   3. CI REPOSITORY target.version if valid Git SHA and producer is
  //      ci-cd-scanner with target.type === 'REPOSITORY' AND
  //      ciRepositoryCompatibleWithEvaluatedScope proves:
  //        - evaluatedScope is provided (schema 1.1+ with frozen provider)
  //        - SOURCE_REPOSITORY asset in scope with evaluationInclusionState=EVALUATED
  //        - asset.identityStateAtEvaluation === 'VERIFIED'
  //        - CI repository identity matches frozen repository identity
  //      (ORCHESTRATOR_CI_COMMIT)
  //
  // EVIDENCE_PROVENANCE is NOT currently produced — the canonical ProvenanceRef
  // union does not define gitCommit/containerDigest/packageDigest fields.
  //
  // STRONGER_SOURCE_PRECEDENCE != PERMISSION_TO_HIDE_CONFLICT
  // A stronger source may determine canonical selection only after
  // contradiction handling is explicit.
  //
  // Static + CI same exact SHA → compatible (no false conflict).
  // Static + CI different SHA → BUILD_IDENTITY_CONFLICT (fail closed).
  // buildBinding + CI different SHA → BUILD_IDENTITY_CONFLICT (fail closed).

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

    // Gate 4A: CI commit qualification via repository compatibility.
    // ci-cd-scanner may establish ORCHESTRATOR_CI_COMMIT when ALL of:
    //   - CI evidence is explicitly bound to this evaluation (Phase B projection)
    //   - Evaluated Scope belongs to the same evaluation context (Correction A)
    //   - CI repository identity is proven compatible with a VERIFIED
    //     SOURCE_REPOSITORY asset in the frozen Evaluated Scope
    //   - CI origin is source-proven (provider-derived, not caller-declared) (Correction B)
    //
    // SHA_SHAPED_VALUE != EXACT_COMMIT_IDENTITY: requires full 40-char SHA.
    // SAME_REPOSITORY_NAME != SAME_REPOSITORY_IDENTITY: requires canonical
    // normalization proof (parseGitHubUrl for GitHub).
    // CURRENT_CONNECTED_ASSET != HISTORICAL_EVALUATED_SCOPE: uses frozen
    // snapshot, not current topology.
    // CALLER_DECLARED_CI != BUILD_IDENTITY_SOURCE_PROVEN.
    // WRONG_EVALUATION_SCOPE != CI_COMMIT_QUALIFIED.
    if (
      targetVersion && isFullGitSha(targetVersion) &&
      producerId === PRODUCER_IDS.CI_CD_SCANNER &&
      targetType === 'REPOSITORY' &&
      evaluatedScope &&
      evaluatedScopeMatchesEvaluation(evaluatedScope, evaluation) &&
      isCIEvidenceSourceProven(ev)
    ) {
      const ciRepoId = ev.target?.id;
      if (ciRepoId && ciRepositoryCompatibleWithEvaluatedScope(evaluatedScope, ciRepoId)) {
        // Same SHA from Static and CI is compatible — do not duplicate the
        // dimension. Static is the stronger, more direct source; if Static
        // already qualified this SHA, CI does not overwrite the label.
        // STATIC_CI_SAME_COMMIT_COMPATIBLE = YES.
        if (!gitCommits.has(targetVersion)) {
          gitCommits.set(targetVersion, 'ORCHESTRATOR_CI_COMMIT');
        }
      }
    }

    // NOTE: Out-of-contract provenance extraction removed.
    // The canonical ProvenanceRef union does not define gitCommit,
    // containerDigest, or packageDigest. No real producer emits them.
    // containerDigest and packageDigest can only come from buildBinding.
  }

  // ── Gate 4A: Resolve build/deployment identity from frozen Evaluated Scope ──
  //
  // Build artifact and deployment identity come from VERIFIED Connected Assets
  // frozen into the immutable Evaluated Scope. Only VERIFIED + EVALUATED assets
  // with a frozen canonicalIdentity can establish build/deployment identity.
  //
  // Fix A: The scope must belong to the EXACT evaluation (org, AI System, run).
  //   WRONG_ORG_SCOPE / WRONG_AI_SYSTEM_SCOPE / WRONG_RUN_SCOPE
  //   => no scope build/deployment identity.
  //   This is the same guard used for CI commit qualification. The caller
  //   loading the right scope is NOT the canonical Build Identity guard.
  //
  // Fix B: CONFLICT != ABSENCE. resolveBuildIdentityFromScope returns a typed
  //   result (NONE | RESOLVED | CONFLICT). CONFLICT propagates as
  //   BUILD_IDENTITY_CONFLICT, not silently cleared to NOT_PROVIDED.
  //
  // Fix C: Scope identity participates in the SAME per-dimension resolution as
  //   buildBinding and Evidence. buildBinding no longer returns before scope
  //   identity is computed. Per-dimension conflicts across all sources are
  //   detected in one pass.
  //
  // Fix D: containerDigest requires a valid immutable digest representation
  //   (sha256:<64hex>). MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
  //
  // Fix E: deploymentIdentity requires a real provider value. 'unknown' is
  //   NOT a proven deployment provider.
  //
  // MANUAL_ASSET_REGISTRATION != VERIFIED_BUILD_IDENTITY.
  // DISPLAY_NAME != BUILD_IDENTITY.
  // DEPLOYMENT_URL != DEPLOYED_ARTIFACT_IDENTITY.
  //
  // Missing dimensions remain NOT_PROVIDED — not every AI application has a
  // container, package digest, or conventional deployment object.
  // APPLICABLE_AND_PROVEN | APPLICABLE_BUT_NOT_PROVIDED | NOT_APPLICABLE.

  const scopeResolution = resolveBuildIdentityFromScope(evaluatedScope, evaluation);

  // Fix B: Scope conflict propagates immediately — CONFLICT != ABSENCE.
  if (scopeResolution.status === 'CONFLICT') {
    return {
      source: 'NOT_PROVIDED',
      explanation: `BUILD_IDENTITY_CONFLICT: scope ${scopeResolution.dimensions.join(', ')}`,
    };
  }

  const scopeIdentity = scopeResolution.status === 'RESOLVED' ? scopeResolution.identity : null;

  // ── Source 1: buildBinding — composes with Evidence AND scope ──
  //
  // Gate 4A Phase A final correction:
  //   BUILD_PROFILE_BINDING_SOURCE REQUIRES BUILD_BINDING_IDENTITY_CONTRIBUTION.
  //   A persisted buildBinding object may exist while contributing ZERO actual
  //   Build Identity dimensions (gitCommit, containerDigest, packageDigest,
  //   applicationVersion). Profile IDs, rule-pack versions, timestamps and
  //   other buildBinding metadata do NOT count as Build Identity contribution.
  //
  //   If buildBinding contributes zero identity dimensions, it must NOT own
  //   the source label. The Evidence-only/scope-only resolution path
  //   determines source.
  //
  //   ZERO_IDENTITY_DIMENSIONS_FROM_BUILD_BINDING + STATIC_EVIDENCE_GIT_COMMIT
  //   = STATIC_REPOSITORY_COMMIT, not BUILD_PROFILE_BINDING.
  //
  // Fix C: buildBinding now composes with scope identity in the SAME pass.
  //   Per-dimension conflicts between buildBinding and scope are detected.
  //   buildBinding.containerDigest A + scope.containerDigest B => CONFLICT.
  //   buildBinding.applicationVersion + scope.deploymentIdentity => both kept.
  if (v1_1.buildBinding) {
    const bb = v1_1.buildBinding;

    const buildBindingContributesIdentity =
      !!bb.gitCommit ||
      !!bb.containerDigest ||
      !!bb.packageDigest ||
      !!bb.applicationVersion;

    if (buildBindingContributesIdentity) {

      // Per-dimension cross-source conflict check against Evidence AND scope.
      const conflicts: string[] = [];

      if (bb.gitCommit && gitCommits.size > 0 && !gitCommits.has(bb.gitCommit)) {
        conflicts.push('gitCommit');
      }

      // Fix C: buildBinding vs scope per-dimension conflict.
      if (bb.containerDigest && scopeIdentity?.containerDigest && bb.containerDigest !== scopeIdentity.containerDigest) {
        conflicts.push('containerDigest');
      }
      if (bb.packageDigest && scopeIdentity?.packageDigest && bb.packageDigest !== scopeIdentity.packageDigest) {
        conflicts.push('packageDigest');
      }

      if (conflicts.length > 0) {
        return {
          source: 'NOT_PROVIDED',
          explanation: `BUILD_IDENTITY_CONFLICT: buildBinding contradicts Evidence/scope on ${conflicts.join(', ')}`,
        };
      }

      // Intra-Evidence conflict (multiple qualified Static commits)
      if (gitCommits.size > 1) {
        return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_CONFLICT' };
      }

      // No conflict — compose buildBinding + Evidence + scope dimensions.
      const identity: BuildIdentity = { source: 'BUILD_PROFILE_BINDING' };
      const evidenceDimensions: string[] = [];
      const scopeDimensions: string[] = [];
      let evidenceSourceLabel = 'STATIC_REPOSITORY_COMMIT';

      if (bb.gitCommit) {
        identity.gitCommit = bb.gitCommit;
      } else if (gitCommits.size === 1) {
        const [commit, label] = Array.from(gitCommits.entries())[0];
        identity.gitCommit = commit;
        evidenceDimensions.push('gitCommit');
        evidenceSourceLabel = label;
      }

      if (bb.containerDigest) {
        identity.containerDigest = bb.containerDigest;
      } else if (scopeIdentity?.containerDigest) {
        identity.containerDigest = scopeIdentity.containerDigest;
        scopeDimensions.push('containerDigest');
      }

      if (bb.packageDigest) {
        identity.packageDigest = bb.packageDigest;
      } else if (scopeIdentity?.packageDigest) {
        identity.packageDigest = scopeIdentity.packageDigest;
        scopeDimensions.push('packageDigest');
      }

      if (bb.applicationVersion) {
        identity.applicationVersion = bb.applicationVersion;
      }

      // Fix C: deployment identity has no buildBinding dimension — scope
      // deployment identity is carried alongside buildBinding dimensions.
      if (scopeIdentity?.deploymentIdentity) {
        identity.deploymentIdentity = scopeIdentity.deploymentIdentity;
        scopeDimensions.push('deploymentIdentity');
      }

      // Truthful mixed-source provenance (Fix 7).
      // COMPOSITE_IDENTITY != FALSE_SINGLE_SOURCE_PROVENANCE.
      const mixedParts: string[] = [];
      if (evidenceDimensions.length > 0) {
        mixedParts.push(`Evidence (${evidenceDimensions.join(', ')} from ${evidenceSourceLabel})`);
      }
      if (scopeDimensions.length > 0) {
        mixedParts.push(`Evaluated Scope (${scopeDimensions.join(', ')})`);
      }
      if (mixedParts.length > 0) {
        identity.explanation = `MIXED_SOURCE: buildBinding + ${mixedParts.join(' + ')}`;
      }

      if (identity.gitCommit || identity.containerDigest || identity.packageDigest || identity.applicationVersion || identity.deploymentIdentity) {
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
    const identity: BuildIdentity = {
      gitCommit: commit,
      source: source as BuildIdentity['source'],
    };

    // Merge build/deployment identity from scope
    const scopeDimensions: string[] = [];
    if (scopeIdentity?.containerDigest) {
      identity.containerDigest = scopeIdentity.containerDigest;
      scopeDimensions.push('containerDigest');
    }
    if (scopeIdentity?.packageDigest) {
      identity.packageDigest = scopeIdentity.packageDigest;
      scopeDimensions.push('packageDigest');
    }
    if (scopeIdentity?.deploymentIdentity) {
      identity.deploymentIdentity = scopeIdentity.deploymentIdentity;
      scopeDimensions.push('deploymentIdentity');
    }

    // Truthful mixed-source provenance (Fix 7).
    if (scopeDimensions.length > 0) {
      identity.explanation = `MIXED_SOURCE: ${source} (gitCommit) + Evaluated Scope (${scopeDimensions.join(', ')})`;
    }

    return identity;
  }

  // No qualified gitCommit from Evidence — but build/deployment identity
  // from scope may still be available (e.g., deployment-only identity).
  if (scopeIdentity && (scopeIdentity.containerDigest || scopeIdentity.packageDigest || scopeIdentity.deploymentIdentity)) {
    return {
      ...scopeIdentity,
      source: 'EVALUATED_SCOPE_ASSET',
    };
  }

  // No qualified build evidence
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

/**
 * Gate 4A: Resolve build/deployment identity from the frozen Evaluated Scope.
 *
 * Fix A: Requires the scope to belong to the EXACT evaluation (org, AI System,
 *   orchestrator run). WRONG_ORG_SCOPE / WRONG_AI_SYSTEM_SCOPE / WRONG_RUN_SCOPE
 *   => status: 'NONE' (no scope identity contributes).
 *
 * Fix B: Returns a typed result — NONE | RESOLVED | CONFLICT.
 *   CONFLICT is NOT silently converted to ABSENCE. The caller propagates
 *   BUILD_IDENTITY_CONFLICT with the conflicting dimensions listed.
 *
 * Fix D: containerDigest requires a valid immutable digest representation
 *   (sha256:<64hex>). MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
 *   Validation is applied here at resolution time so that tampered or
 *   malformed frozen values do not establish false identity.
 *
 * Fix E: deploymentIdentity requires a real provider value.
 *   'unknown' is NOT a proven deployment provider.
 *
 * Only VERIFIED assets with frozen canonicalIdentity can establish
 * build/deployment identity. NOT_VERIFIED → UNPROVEN.
 * Historical 1.1 scopes without canonicalIdentity → UNPROVEN.
 *
 * Does NOT query current Connected Assets. Uses only the frozen snapshot.
 * CURRENT_CONNECTED_ASSET != HISTORICAL_EVALUATED_SCOPE.
 */
type ScopeBuildIdentityResolution =
  | { status: 'NONE' }
  | { status: 'RESOLVED'; identity: Pick<BuildIdentity, 'containerDigest' | 'packageDigest' | 'deploymentIdentity'> }
  | { status: 'CONFLICT'; dimensions: string[] };

function resolveBuildIdentityFromScope(
  scope: EvaluatedScopeSnapshot | undefined,
  evaluation: AssuranceEvaluation,
): ScopeBuildIdentityResolution {
  if (!scope?.assetSnapshots) {
    return { status: 'NONE' };
  }

  // Fix A: The scope must belong to the EXACT evaluation.
  // This is the same guard used for CI commit qualification.
  // The caller loading the right scope is NOT the canonical Build Identity guard.
  if (!evaluatedScopeMatchesEvaluation(scope, evaluation)) {
    return { status: 'NONE' };
  }

  // Collect VERIFIED + EVALUATED build/deployment identity dimensions.
  // Fix D: containerDigest requires valid sha256:<64hex> format.
  // Fix E: deploymentIdentity requires a real provider (not 'unknown'/empty).
  const containerDigests = new Set<string>();
  const packageDigests = new Set<string>();
  const deploymentIdentities = new Set<string>();

  let containerDigest: string | undefined;
  let packageDigest: string | undefined;
  let deploymentIdentity: DeploymentIdentity | undefined;

  for (const asset of scope.assetSnapshots) {
    if (asset.evaluationInclusionState !== 'EVALUATED') continue;
    if (asset.identityStateAtEvaluation !== 'VERIFIED') continue;

    // Fix D: Validate container digest format. MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
    if (asset.containerDigest && isValidContainerDigest(asset.containerDigest)) {
      containerDigests.add(asset.containerDigest);
      if (!containerDigest) containerDigest = asset.containerDigest;
    }

    if (asset.packageDigest) {
      packageDigests.add(asset.packageDigest);
      if (!packageDigest) packageDigest = asset.packageDigest;
    }

    // Fix E: deploymentIdentity requires a real provider value.
    // 'unknown' is NOT a proven deployment provider.
    if (asset.deploymentIdentity &&
        asset.deploymentIdentity.deploymentProvider &&
        asset.deploymentIdentity.deploymentProvider.trim() !== '' &&
        asset.deploymentIdentity.deploymentProvider !== 'unknown') {
      deploymentIdentities.add(JSON.stringify(asset.deploymentIdentity));
      if (!deploymentIdentity) deploymentIdentity = asset.deploymentIdentity;
    }
  }

  // Fix B: Detect conflicts — multiple different VERIFIED values for the same
  // dimension is a CONFLICT, not an absence. CONFLICT != ABSENCE.
  const conflictDimensions: string[] = [];
  if (containerDigests.size > 1) conflictDimensions.push('containerDigest');
  if (packageDigests.size > 1) conflictDimensions.push('packageDigest');
  if (deploymentIdentities.size > 1) conflictDimensions.push('deploymentIdentity');

  if (conflictDimensions.length > 0) {
    return { status: 'CONFLICT', dimensions: conflictDimensions };
  }

  if (!containerDigest && !packageDigest && !deploymentIdentity) {
    return { status: 'NONE' };
  }

  return {
    status: 'RESOLVED',
    identity: { containerDigest, packageDigest, deploymentIdentity },
  };
}

/**
 * Gate 4A Fix D: Validate that a string is a valid immutable container digest.
 *
 * Supports the canonical OCI digest representation:
 *   sha256:<64 hexadecimal characters>
 *
 * MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
 * A Docker tag like "latest" or "my-image:v3" is NOT an immutable digest.
 * A malformed sha256 is NOT a valid digest.
 *
 * This is the smallest deterministic validation appropriate to current product
 * truth. It does NOT create a registry library. When a future producer
 * provides digests with a different algorithm (e.g., sha512), this validator
 * can be extended.
 */
function isValidContainerDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value);
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
