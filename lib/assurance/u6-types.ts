/**
 * U6 — Unified Assurance Reports, Evidence Bundles, Decision Receipts, Verification.
 *
 * Output/proof layer only. Does NOT make Assurance decisions.
 * Consumes U5 methodology 1.1 AssuranceEvaluation.
 */

import { AssuranceDisposition, ClaimState, CapabilityComparisonRecord, PlaneAvailability, ProfileVerdict } from './types';

export const U6_REPORT_SCHEMA_VERSION = '1.0.0' as const;
export const U6_BUNDLE_SCHEMA_VERSION = '1.0.0' as const;
export const U6_RECEIPT_SCHEMA_VERSION = '1.0.0' as const;

export type ReportGenerationStatus = 'COMPLETE' | 'PENDING' | 'FAILED';
export type EvidenceCoverageStatus = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_EVALUATED';
export type VerificationStatus = 'CRYPTOGRAPHICALLY_INTACT' | 'TAMPERED' | 'NOT_FOUND';

export interface UnifiedAssuranceReport {
  reportVersion: string;
  reportId: string;
  assuranceEvaluationId: string;
  organizationId: string;
  aiSystemId: string;
  buildId?: string;
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
  limitations: string[];
  frameworkAlignment: FrameworkAlignmentItem[];
  evidenceBundle: EvidenceBundleSummary;
  decisionReceipt: DecisionReceiptSummary;
  reportDigest: string;
  syntheticMarker?: string;
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
  limitations: string[];
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
}

export interface FrameworkAlignmentItem {
  framework: string;
  control: string;
  mappingStrength: string;
  evidenceClaimKey?: string;
  alignmentStatement: string;
}

export interface EvidenceBundleSummary {
  bundleVersion: string;
  bundleId: string;
  assuranceEvaluationId: string;
  membershipCount: number;
  bundleDigest: string;
  merkleRoot: string;
  algorithm: string;
  rule: string;
}

export interface EvidenceBundle {
  bundleVersion: string;
  bundleId: string;
  assuranceEvaluationId: string;
  members: EvidenceBundleMembership[];
  bundleDigest: string;
  merkleRoot: string;
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
  buildId?: string;
  orchestratorRunId: string;
  evaluationSnapshotAt: string;
  assuranceMethodologyVersion: string;
  profileId: string;
  profileVersion: string;
  profileDigestResolved: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  disposition: AssuranceDisposition;
  claimStateSummary: Record<ClaimState, number>;
  inputHash: string;
  outputHash: string;
  evidenceSetDigest: string;
  evidenceBundleDigest: string;
  evidenceMerkleRoot: string;
  reportDigest: string;
  limitations: string[];
  syntheticMarker?: string;
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

export interface PublicVerificationResult {
  receiptId: string;
  verificationStatus: VerificationStatus;
  disposition?: AssuranceDisposition;
  evaluatedAt?: string;
  methodologyVersion?: string;
  profileLabel?: string;
  profileVersion?: string;
  scopeSummary?: string;
  merkleRoot?: string;
  receiptHash?: string;
  syntheticMarker?: string;
  revoked: boolean;
}
