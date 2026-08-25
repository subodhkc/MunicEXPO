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
  source?: 'BUILD_PROFILE_BINDING' | 'EVIDENCE_PROVENANCE' | 'ORCHESTRATOR_CI_COMMIT' | 'NOT_PROVIDED';
  explanation?: string;
}

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
