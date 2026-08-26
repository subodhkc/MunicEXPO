/**
 * U6 — Unified Assurance Reports, Evidence Bundles, Decision Receipts, Verification.
 *
 * Output/proof layer only. Does NOT make Assurance decisions.
 * Consumes U5 methodology 1.1 AssuranceEvaluation.
 */

import { AssuranceDisposition, ClaimState, CapabilityComparisonRecord, CapabilityFact, PlaneAvailability, ProfileVerdict } from './types';

export const U6_REPORT_SCHEMA_VERSION = '1.0.0' as const;
export const U6_BUNDLE_SCHEMA_VERSION = '1.0.0' as const;
export const U6_RECEIPT_SCHEMA_VERSION = '1.0.0' as const;
export const U6_VERIFICATION_SCHEMA_VERSION = '1.0.0' as const;

export type ReportGenerationStatus = 'COMPLETE' | 'PENDING' | 'FAILED';
export type EvidenceCoverageStatus = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_EVALUATED';
export type MerkleStatus = 'AVAILABLE' | 'NOT_AVAILABLE_EMPTY_SET';

export type VerificationStatus =
  | 'INTERNALLY_CONSISTENT'
  | 'INTEGRITY_VERIFIED_AGAINST_HAIEC_RECORD'
  | 'INVALID_PACKAGE'
  | 'REVOKED'
  | 'NOT_FOUND';

export interface BuildIdentity {
  applicationVersion?: string;
  gitCommit?: string;
  containerDigest?: string;
  packageDigest?: string;
  source?: 'BUILD_PROFILE_BINDING' | 'EVIDENCE_PROVENANCE' | 'ORCHESTRATOR_CI_COMMIT' | 'STATIC_REPOSITORY_COMMIT' | 'NOT_PROVIDED';
  explanation?: string;
}

// ─── PX1.2 — Evaluated Scope Snapshot (Sections 9-14, corrected in PX1.2A-R) ─
//
// CONNECTED ASSET = mutable current system topology
// EVALUATED SCOPE SNAPSHOT = immutable historical evaluation input
//
// Never derive a historical result from CURRENT mutable asset state.
//
// Additive type. Does NOT alter U5 evaluation. Does NOT create a parallel
// scope engine. This is the smallest deterministic immutable snapshot to
// state:
//   - which AI System was evaluated
//   - which connected assets were included (with identity at evaluation time)
//   - which environment
//   - which repository/commit/build
//   - which runtime endpoint
//   - which interface specification digest/version
//   - which producer runs
//   - which assets were explicitly NOT evaluated
//   - what identity was unresolved
//   - what limitations remained
//
// An Assurance Result applies to: AI System + Evaluated Scope.
// Never imply whole-system evaluation when only one asset was inspected.
//
// Conceptually:
//   AssuranceResult = f(AI_System, Evaluated_Scope, Evidence, Profile, Operating_Envelope)
//
// scopeDigest = WHAT WAS IN SCOPE (computed via canonical serialization)
// evidenceSetDigest = WHICH EVIDENCE SUPPORTED THE EVALUATION (distinct)
//
// Historical evaluations without persisted scope must remain readable:
//   EVALUATED_SCOPE_NOT_CAPTURED — do not issue a false new digest for old
//   evaluations.

export const EVALUATED_SCOPE_SCHEMA_VERSION = '1.0';

export interface EvaluatedScopeAssetSnapshot {
  /**
   * Connected Asset ID (ai_system_assets.id) ONLY — never a URL, digest,
   * or external provider ID. When no Connected Asset binding exists,
   * this is undefined and canonicalLocator identifies the evaluated target.
   *
   * CONNECTED_ASSET_ID != EXTERNAL_LOCATOR
   */
  connectedAssetId?: string;
  assetType: string;
  displayName: string;
  /**
   * External/provider/source stable locator identity at evaluation time.
   * Can exist without connectedAssetId when no canonical asset binding exists.
   */
  canonicalLocator?: string;
  /** Identity state at evaluation (NOT_VERIFIED | VERIFIED | CONFLICTED) */
  identityStateAtEvaluation?: string;
  /** Environment at evaluation time */
  environment?: string;
  /** Build identity captured for this asset at evaluation time */
  gitCommit?: string;
  containerDigest?: string;
  packageDigest?: string;
  /** Interface specification digest/version (for INTERFACE_SPECIFICATION assets) */
  interfaceSpecDigest?: string;
  interfaceSpecVersion?: string;
  /** Endpoint identity at evaluation time */
  endpoint?: string;
  /** Was this asset included in the evaluation? */
  evaluationInclusionState: 'EVALUATED' | 'NOT_EVALUATED' | 'UNAVAILABLE';
  /** If not evaluated, why */
  notEvaluatedReason?: string;
  /** Producer/evidence references for this asset */
  producerRunIds?: string[];
}

export interface EvaluatedScopeSnapshot {
  /** Schema version for deterministic parsing */
  scopeSchemaVersion: typeof EVALUATED_SCOPE_SCHEMA_VERSION;
  /** Organization ID — tenant scoping */
  organizationId: string;
  /** AI System ID (ai_systems.id) — canonical primary identity */
  aiSystemId: string;
  /** When the scope snapshot was captured (immutable) */
  evaluationSnapshotAt: string;
  /** Orchestrator run ID that produced the evaluated Evidence */
  orchestratorRunId?: string;
  /** Environment evaluated (production, staging, development, testing) */
  environment?: string;
  /** Asset snapshots at evaluation time (immutable) */
  assetSnapshots: EvaluatedScopeAssetSnapshot[];
  /** Producer runs included in this evaluation */
  producerRunIds?: string[];
  /** Identity dimensions that remained unresolved */
  unresolvedIdentity?: string[];
  /**
   * Scope limitations — limitations defining the evaluated boundary ONLY.
   * Examples: asset identity unresolved, deployment identity unavailable,
   * specified asset excluded from evaluation, environment not established.
   *
   * SCOPE_LIMITATION != GENERIC_EVIDENCE_LIMITATION
   * Generic Evidence producer limitations remain on Evidence/evaluation and
   * do NOT change scopeDigest unless they actually change WHAT was in scope.
   */
  scopeLimitations?: string[];
  /**
   * Deterministic scope digest — same semantic scope → same digest.
   * Computed via canonicalSerialize + hashTextContent (existing infrastructure).
   * Changed evaluated asset identity/scope → different digest.
   * Array ordering does not create nondeterministic digest changes where
   * order is semantically irrelevant (assetSnapshots is set-like: sorted by
   * semantic key before serialization).
   */
  scopeDigest: string;
  /** Human-readable scope summary for display (derived, not authoritative) */
  scopeSummary: string;
}

/**
 * Bounded limitation marker for historical evaluations without persisted scope.
 * Do NOT issue a false new scope digest for old evaluations.
 */
export const EVALUATED_SCOPE_NOT_CAPTURED = 'EVALUATED_SCOPE_NOT_CAPTURED';

export interface U6Package {
  packageSchemaVersion: typeof U6_REPORT_SCHEMA_VERSION;
  packageId: string;
  assuranceEvaluationId: string;
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  reportSchemaVersion: string;
  bundleSchemaVersion: string;
  receiptSchemaVersion: string;
  verificationSchemaVersion: string;
  semanticPackageDigest: string;
  semanticReportDigest: string;
  bundleDigest: string;
  receiptHash: string;
  merkleRoot: string | null;
  merkleStatus: MerkleStatus;
  report: UnifiedAssuranceReport;
  bundle: EvidenceBundle;
  receipt: AssuranceDecisionReceipt;
  buildIdentity: BuildIdentity;
  profileIdentity: ReportProfileSection;
  operatingEnvelopeIdentity?: ReportEnvelopeSection;
  authoritySourceLabel?: string;
  operatingEnvelopeApprovedAt?: string;
  approvalReference?: string;
  syntheticClassification: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN';
}

export interface UnifiedAssuranceReport {
  reportVersion: string;
  reportId: string;
  assuranceEvaluationId: string;
  organizationId: string;
  aiSystemId: string;
  buildIdentity: BuildIdentity;
  orchestratorRunId: string;
  evaluationSnapshotAt: string;
  assuranceMethodologyVersion: string;
  reportGenerationStatus: ReportGenerationStatus;
  evidenceCoverageStatus: EvidenceCoverageStatus;
  assuranceDisposition: AssuranceDisposition;
  scopeStatement: string;
  profile: ReportProfileSection;
  operatingEnvelope?: ReportEnvelopeSection;
  dispositionExplanation: string;
  claimSummary: ClaimSummaryItem[];
  claimResults: ReportClaimResult[];
  fivePlaneAnalysis: FivePlaneReportSection;
  evidenceCoverage: ProducerCoverageItem[];
  limitations: LimitationItem[];
  frameworkAlignment: FrameworkAlignmentItem[];
  evidenceBundle: EvidenceBundleSummary;
  decisionReceipt: DecisionReceiptSummary;
  reportDigest: string;
  syntheticClassification: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN';
}

export interface ReportProfileSection {
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  profileDigestResolved: string;
  sourceReferences: { type: string; identifier: string; version: string }[];
  applicableClaimKeys: string[];
  claimPackVersions: Record<string, string>;
  rulePackVersions: Record<string, string>;
}

export interface ReportEnvelopeSection {
  envelopeId: string;
  envelopeVersion: string;
  envelopeDigest: string;
  state: string;
  authoritySourceLabel: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalReference?: string;
  synthetic: boolean;
}

export interface ClaimSummaryItem {
  claimKey: string;
  claimVersion: string;
  claimState: ClaimState;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  supporting: number;
  contradicting: number;
  excluded: number;
}

export interface ReportClaimResult {
  claimKey: string;
  claimVersion: string;
  statement: string;
  claimState: ClaimState;
  reasonCodes: string[];
  criticality: 'critical' | 'high' | 'medium' | 'low';
  mandatory: boolean;
  applicability: string;
  supportingCount: number;
  contradictingCount: number;
  excludedCount: number;
  evidenceSetDigest: string;
  relevantPlaneComparisons: string[];
  frameworkMappings: FrameworkAlignmentItem[];
  limitations: LimitationItem[];
}

export interface FivePlaneReportSection {
  requested: PlaneReportItem[];
  policyAuthorized: PlaneReportItem[];
  effectivelyGranted: PlaneReportItem[];
  codeCapable: PlaneReportItem[];
  observed: PlaneReportItem[];
  comparisons: CapabilityComparisonRecord[];
  overallVerdict: ProfileVerdict;
  availability: PlaneAvailability[];
}

export interface PlaneReportItem {
  capabilityId: string;
  capabilityFamily?: string;
  action: string;
  resource: string;
  scope: string;
  sourceLocation?: string;
  constraints?: string[];
  impact?: string;
  discoveryBasis?: string;
  capabilityCoverage?: string;
  evidenceIds: string[];
  evidenceMethod: string;
  authorityClass: string;
  authoritySourceLabel?: string;
  availability: string;
}

export interface ProducerCoverageItem {
  producerId: string;
  producerRunId: string | null;
  producerOutcome: string;
  coverageStatus: string;
  coverageRatio: number | null;
  limitations: string[];
  evidenceCount: number;
  targetSummary?: { targetType: string; targetId?: string }[];
}

export interface LimitationItem {
  code: string;
  explanation: string;
  scope?: string;
}

export interface FrameworkAlignmentItem {
  framework: string;
  reference: string;
  control: string;
  mappingStrength: string;
  evidenceClaimKey?: string;
  claimState?: ClaimState;
  alignmentStatement: string;
}

export interface EvidenceBundleSummary {
  bundleVersion: string;
  bundleId: string;
  assuranceEvaluationId: string;
  membershipCount: number;
  bundleDigest: string;
  merkleRoot: string | null;
  merkleStatus: MerkleStatus;
  algorithm: string;
  rule: string;
}

export interface EvidenceBundle {
  bundleVersion: string;
  bundleId: string;
  assuranceEvaluationId: string;
  members: EvidenceBundleMembership[];
  bundleDigest: string;
  merkleRoot: string | null;
  merkleStatus: MerkleStatus;
  algorithm: 'sha256';
  rule: 'pair-sort-concat';
}

export interface EvidenceBundleMembership {
  evidenceId: string;
  contentHash?: string;
  semanticDigest?: string;
  producerId: string;
  producerRunId?: string;
  evidenceType: string;
  targetType: string;
  targetId?: string;
  coverageStatus: string;
  coverageRatio: number | null;
  producerOutcome: string;
  limitations: string[];
  claimKey?: string;
  claimVersion?: string;
  role: 'SUPPORTING' | 'CONTRADICTING' | 'CONTEXT_ONLY' | 'EXCLUDED';
  epistemicClass: string;
  exclusionReason?: string;
  artifactRefs: { storeType: string; storageKey?: string; contentHash?: string }[];
  provenanceRefs: { type: string; hash?: string }[];
}

export interface AssuranceDecisionReceipt {
  receiptVersion: string;
  receiptId: string;
  assuranceEvaluationId: string;
  organizationId: string;
  aiSystemId: string;
  buildIdentity: BuildIdentity;
  orchestratorRunId: string;
  evaluationSnapshotAt: string;
  assuranceMethodologyVersion: string;
  profileId: string;
  profileVersion: string;
  profileDigestResolved: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  authoritySourceLabel?: string;
  syntheticClassification: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN';
  disposition: AssuranceDisposition;
  claimStateSummary: Record<ClaimState, number>;
  inputHash: string;
  outputHash: string;
  evidenceSetDigest: string;
  evidenceBundleDigest: string;
  evidenceMerkleRoot: string | null;
  merkleStatus: MerkleStatus;
  semanticReportDigest: string;
  limitations: string[];
  receiptHash: string;
}

export interface DecisionReceiptSummary {
  receiptVersion: string;
  receiptId: string;
  receiptHash: string;
}

export interface VerificationPackage {
  receipt: AssuranceDecisionReceipt;
  report: UnifiedAssuranceReport;
  bundle: EvidenceBundle;
  proofs: { leafHash: string; proof: any }[];
}

export interface PackageVerificationResult {
  reportDigestValid: boolean;
  packageDigestValid: boolean;
  receiptHashValid: boolean;
  bundleDigestValid: boolean;
  merkleRootValid: boolean;
  allMerkleProofsValid: boolean;
  reportReceiptBindingValid: boolean;
  receiptBundleBindingValid: boolean;
  evaluationIdentityValid: boolean;
  profileIdentityValid: boolean;
  envelopeIdentityValid: boolean;
  buildIdentityValid: boolean;
  syntheticIdentityValid: boolean;
  publicationState?: 'PRIVATE' | 'PUBLIC' | 'REVOKED';
  valid: boolean;
  integrityStatus: VerificationStatus;
}

export interface PublicVerificationResult {
  publicVerificationId: string;
  publicationState: 'PUBLIC' | 'REVOKED';
  verificationStatus: VerificationStatus;
  disposition?: AssuranceDisposition;
  evaluatedAt?: string;
  methodologyVersion?: string;
  reportSchemaVersion?: string;
  profileLabel?: string;
  profileVersion?: string;
  scopeSummary?: string;
  receiptHash?: string;
  merkleRoot?: string | null;
  merkleStatus?: MerkleStatus;
  syntheticClassification?: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN';
  publishedAt?: string;
  revokedAt?: string;
  assuranceMark?: {
    label: string;
    status: string;
    eligible: boolean;
  };
}
