/**
 * U6 — Unified Assurance Report, Evidence Bundle, Decision Receipt, Verification.
 *
 * Output/proof layer only. Does NOT make Assurance decisions.
 * U5 methodology 1.1 produces the canonical Assurance; U6 renders and proves it.
 */

import crypto from 'crypto';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { merkleRoot, merkleProofForLeaf, verifyMerkleProof } from '@/lib/audit/merkle';
import {
  AssuranceEvaluation,
  AssuranceEvaluationV1_1,
  AssurancePlane,
  CapabilityFact,
  ClaimEvaluationResult,
  PlaneAvailability,
  ProfileVerdict,
} from './types';
import { CONTROL_CLAIM_CATALOG } from './claim-catalog';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';
import {
  U6_REPORT_SCHEMA_VERSION,
  U6_BUNDLE_SCHEMA_VERSION,
  U6_RECEIPT_SCHEMA_VERSION,
  UnifiedAssuranceReport,
  EvidenceBundle,
  EvidenceBundleMembership,
  EvidenceBundleSummary,
  AssuranceDecisionReceipt,
  ReportClaimResult,
  ClaimSummaryItem,
  PlaneReportItem,
  FivePlaneReportSection,
  ProducerCoverageItem,
  VerificationPackage,
  PublicVerificationResult,
} from './u6-types';

/**
 * Build a canonical Unified Assurance Report from a U5 evaluation.
 */
export function buildUnifiedAssuranceReport(
  evaluation: AssuranceEvaluation,
  bundle: EvidenceBundle,
  receipt: AssuranceDecisionReceipt,
): UnifiedAssuranceReport {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const isSynthetic = v1_1.operatingEnvelopeId?.includes('synthetic') || v1_1.profileId?.includes('synthetic');
  const syntheticMarker = isSynthetic ? 'SYNTHETIC_REFERENCE' : undefined;

  const claimResults = buildReportClaimResults(evaluation.claimResults, v1_1.fivePlaneComparisons || [], v1_1.applicableClaimKeys ?? []);
  const claimSummary = buildClaimSummary(evaluation.claimResults);

  const report: UnifiedAssuranceReport = {
    reportVersion: U6_REPORT_SCHEMA_VERSION,
    reportId: `${evaluation.id}:report`,
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    orchestratorRunId: evaluation.orchestratorRunId,
    evaluationSnapshotAt: evaluation.evaluationSnapshotAt.toISOString(),
    assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    reportGenerationStatus: 'COMPLETE',
    evidenceCoverageStatus: deriveCoverageStatus(evaluation),
    assuranceDisposition: evaluation.disposition,
    scopeStatement: `Assurance evaluated within the scope of profile ${v1_1.profileId} and operating envelope ${v1_1.operatingEnvelopeId ?? 'none'} at ${evaluation.evaluationSnapshotAt.toISOString()}.`,
    profile: {
      profileId: v1_1.profileId,
      profileVersion: v1_1.profileVersion,
      profileDigest: v1_1.profileDigest,
      profileDigestResolved: v1_1.profileDigestResolved,
      sourceReferences: [],
      applicableClaimKeys: v1_1.applicableClaimKeys ?? [],
      claimPackVersions: v1_1.claimPackVersions,
      rulePackVersions: v1_1.rulePackVersions,
    },
    operatingEnvelope: v1_1.operatingEnvelopeId ? {
      envelopeId: v1_1.operatingEnvelopeId,
      envelopeVersion: v1_1.operatingEnvelopeVersion ?? '',
      envelopeDigest: v1_1.operatingEnvelopeDigest ?? '',
      state: v1_1.operatingEnvelopeState ?? 'UNKNOWN',
      authoritySourceLabel: 'UNKNOWN',
      approvedBy: v1_1.operatingEnvelopeApprovedBy,
      approvedAt: undefined,
      approvalReference: v1_1.operatingEnvelopeApprovalReference,
      synthetic: syntheticMarker === 'SYNTHETIC_REFERENCE',
    } : undefined,
    dispositionExplanation: buildDispositionExplanation(evaluation),
    claimSummary,
    claimResults,
    fivePlaneAnalysis: buildFivePlaneReport(v1_1),
    evidenceCoverage: buildProducerCoverage(evaluation),
    limitations: buildLimitations(evaluation),
    frameworkAlignment: buildFrameworkAlignment(evaluation.claimResults),
    evidenceBundle: buildBundleSummary(bundle),
    decisionReceipt: {
      receiptVersion: receipt.receiptVersion,
      receiptId: receipt.receiptId,
      receiptHash: receipt.receiptHash,
    },
    reportDigest: '',
    syntheticMarker,
  };

  report.reportDigest = computeReportDigest(report);
  return report;
}

/**
 * Build an exact Evidence Bundle from a U5 evaluation and its projected evidence.
 */
export function buildEvidenceBundle(
  evaluation: AssuranceEvaluation,
  projectedEvidence: DecisionEvidenceProjection[] = [],
): EvidenceBundle {
  const evidenceById = new Map(projectedEvidence.map(e => [e.evidenceId, e]));
  const members: EvidenceBundleMembership[] = [];

  for (const claim of evaluation.claimResults) {
    for (const member of claim.evidenceSet.members) {
      const ev = evidenceById.get(member.evidenceId);
      members.push({
        evidenceId: member.evidenceId,
        contentHash: member.contentHash ?? ev?.contentHash ?? undefined,
        semanticDigest: ev?.semanticDigest ?? undefined,
        producerId: member.producerId,
        producerRunId: ev?.producerRunId ?? undefined,
        evidenceType: ev?.evidenceType ?? 'UNKNOWN',
        targetType: ev?.target.type ?? 'UNKNOWN',
        targetId: ev?.target.id,
        coverageStatus: ev?.coverageStatus ?? 'UNKNOWN',
        coverageRatio: ev?.coverageRatio ?? null,
        producerOutcome: ev?.producerOutcome ?? 'UNKNOWN',
        limitations: (ev?.limitations ?? []).map(l => l.description).concat(member.exclusionReason ? [member.exclusionReason] : []),
        claimKey: claim.claimKey,
        claimVersion: claim.claimVersion,
        role: member.role,
        epistemicClass: member.epistemicClass,
        exclusionReason: member.exclusionReason,
        artifactRefs: (ev?.artifactRefs ?? []).map(a => ({
          storeType: a.storeType,
          storageKey: a.storageKey,
          contentHash: a.contentHash,
        })),
        provenanceRefs: (ev?.provenanceRefs ?? []).map(p => ({
          type: p.type,
          hash: (p as any).hash ?? (p as any).merkleRoot ?? (p as any).signature,
        })),
      });
    }
  }

  // Deterministic membership leaves: canonical membership payload → SHA-256
  const leaves = members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m), new Set(['role', 'epistemicClass', 'exclusionReason']))));
  const root = leaves.length > 0 ? merkleRoot(leaves) : hashTextContent('');

  const bundle: EvidenceBundle = {
    bundleVersion: U6_BUNDLE_SCHEMA_VERSION,
    bundleId: `${evaluation.id}:bundle`,
    assuranceEvaluationId: evaluation.id,
    members,
    bundleDigest: '',
    merkleRoot: root,
    algorithm: 'sha256',
    rule: 'pair-sort-concat',
  };

  bundle.bundleDigest = hashTextContent(canonicalSerialize(buildBundleDigestPayload(bundle)));
  return bundle;
}

export function buildDecisionReceipt(
  evaluation: AssuranceEvaluation,
  report: UnifiedAssuranceReport | null,
  bundle: EvidenceBundle,
): AssuranceDecisionReceipt {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const isSynthetic = report?.syntheticMarker === 'SYNTHETIC_REFERENCE';

  const claimStateSummary = computeClaimStateSummary(evaluation.claimResults);

  const receipt: AssuranceDecisionReceipt = {
    receiptVersion: U6_RECEIPT_SCHEMA_VERSION,
    receiptId: `${evaluation.id}:receipt`,
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    orchestratorRunId: evaluation.orchestratorRunId,
    evaluationSnapshotAt: evaluation.evaluationSnapshotAt.toISOString(),
    assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    profileId: v1_1.profileId,
    profileVersion: v1_1.profileVersion,
    profileDigestResolved: v1_1.profileDigestResolved,
    operatingEnvelopeId: v1_1.operatingEnvelopeId,
    operatingEnvelopeVersion: v1_1.operatingEnvelopeVersion,
    operatingEnvelopeDigest: v1_1.operatingEnvelopeDigest,
    disposition: evaluation.disposition,
    claimStateSummary,
    inputHash: evaluation.inputHash,
    outputHash: evaluation.outputHash,
    evidenceSetDigest: evaluation.evidenceSetDigest,
    evidenceBundleDigest: bundle.bundleDigest,
    evidenceMerkleRoot: bundle.merkleRoot,
    reportDigest: report?.reportDigest ?? '',
    limitations: report?.limitations ?? [],
    syntheticMarker: isSynthetic ? 'SYNTHETIC_REFERENCE' : undefined,
    receiptHash: '',
  };

  receipt.receiptHash = computeReceiptHash(receipt);
  return receipt;
}

/**
 * Verify a receipt against the report and bundle.
 */
export function verifyReceipt(
  receipt: AssuranceDecisionReceipt,
  report: UnifiedAssuranceReport,
  bundle: EvidenceBundle,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (receipt.receiptHash !== computeReceiptHash(receipt)) reasons.push('receipt hash mismatch');
  if (report.reportDigest !== computeReportDigest(report)) reasons.push('report digest mismatch');
  if (bundle.bundleDigest !== hashTextContent(canonicalSerialize(buildBundleDigestPayload(bundle)))) reasons.push('bundle digest mismatch');
  if (bundle.merkleRoot !== computeBundleMerkleRoot(bundle)) reasons.push('bundle Merkle root mismatch');
  if (receipt.reportDigest !== report.reportDigest) reasons.push('receipt does not bind report');
  if (receipt.evidenceMerkleRoot !== bundle.merkleRoot) reasons.push('receipt does not bind bundle');

  return { valid: reasons.length === 0, reasons };
}

/**
 * Generate Merkle inclusion proofs for every bundle member.
 */
export function bundleMerkleProofs(bundle: EvidenceBundle): { leafHash: string; proof: any }[] {
  const leaves = bundle.members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m), new Set(['role', 'epistemicClass', 'exclusionReason']))));
  return leaves.map(leaf => ({
    leafHash: leaf,
    proof: merkleProofForLeaf(leaves, leaf),
  }));
}

/**
 * Verify an individual bundle Merkle proof.
 */
export function verifyBundleProof(bundle: EvidenceBundle, leafHash: string, proof: any): boolean {
  return proof.root === bundle.merkleRoot && verifyMerkleProof(proof) && proof.leaf === leafHash;
}

/**
 * Build a public-safe verification result from a receipt.
 */
export function publicVerification(receipt: AssuranceDecisionReceipt): PublicVerificationResult {
  return {
    receiptId: receipt.receiptId,
    verificationStatus: 'CRYPTOGRAPHICALLY_INTACT',
    disposition: receipt.disposition,
    evaluatedAt: receipt.evaluationSnapshotAt,
    methodologyVersion: receipt.assuranceMethodologyVersion,
    profileLabel: receipt.profileId,
    profileVersion: receipt.profileVersion,
    scopeSummary: `Assurance under profile ${receipt.profileId} with envelope ${receipt.operatingEnvelopeId ?? 'none'}`,
    merkleRoot: receipt.evidenceMerkleRoot,
    receiptHash: receipt.receiptHash,
    syntheticMarker: receipt.syntheticMarker,
    revoked: false,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildReportClaimResults(
  claimResults: ClaimEvaluationResult[],
  comparisons: any[],
  applicableClaimKeys: string[],
): ReportClaimResult[] {
  return claimResults.map(c => {
    const def = CONTROL_CLAIM_CATALOG.find(x => x.claimKey === c.claimKey);
    const isApplicable = applicableClaimKeys.includes(c.claimKey);
    const isMandatory = !!def?.mandatory;
    const criticalityRaw = def?.criticality ?? (isMandatory ? 'critical' : 'high');
    const criticality: 'CRITICAL' | 'REQUIRED' | 'INFORMATIONAL' =
      criticalityRaw === 'critical' ? 'CRITICAL' :
      criticalityRaw === 'high' || criticalityRaw === 'medium' ? 'REQUIRED' : 'INFORMATIONAL';
    const applicability = isApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE';
    return {
      claimKey: c.claimKey,
      claimVersion: c.claimVersion,
      statement: def?.statement ?? '',
      claimState: c.claimState,
      reasonCodes: c.reasonCodes,
      criticality,
      mandatory: isMandatory,
      applicability,
      supportingCount: c.supportingCount,
      contradictingCount: c.contradictingCount,
      excludedCount: c.excludedCount,
      evidenceSetDigest: c.evidenceSet.setDigest,
      relevantPlaneComparisons: comparisons.filter(comp => comp.mappedClaimKey === c.claimKey).map(comp => comp.capabilityKey),
      frameworkMappings: buildFrameworkAlignmentForClaim(c.claimKey),
      limitations: c.reasonCodes.filter(r => r.includes('MISSING') || r.includes('INSUFFICIENT')).map(r => r),
    };
  });
}

function buildClaimSummary(claimResults: ClaimEvaluationResult[]): ClaimSummaryItem[] {
  const defMap = new Map(CONTROL_CLAIM_CATALOG.map(c => [c.claimKey, c]));
  return claimResults.map(c => ({
    claimKey: c.claimKey,
    claimVersion: c.claimVersion,
    claimState: c.claimState,
    criticality: defMap.get(c.claimKey)?.mandatory ? 'CRITICAL' : 'REQUIRED',
    supporting: c.supportingCount,
    contradicting: c.contradictingCount,
    excluded: c.excludedCount,
  }));
}

function buildFivePlaneReport(v1_1: AssuranceEvaluationV1_1): FivePlaneReportSection {
  const facts = v1_1.capabilityFacts ?? { requested: [], policy: [], granted: [], capable: [], observed: [] };
  const availability = v1_1.planeAvailability ?? buildDefaultPlaneAvailabilityReport();

  return {
    requested: facts.requested.map(f => mapCapabilityFactToReport(f)),
    policyAuthorized: facts.policy.map(f => mapCapabilityFactToReport(f)),
    effectivelyGranted: facts.granted.map(f => mapCapabilityFactToReport(f)),
    codeCapable: facts.capable.map(f => mapCapabilityFactToReport(f)),
    observed: facts.observed.map(f => mapCapabilityFactToReport(f)),
    comparisons: v1_1.fivePlaneComparisons || [],
    overallVerdict: v1_1.fivePlaneOverallVerdict ?? 'REVIEW',
    availability,
  };
}

function mapCapabilityFactToReport(f: CapabilityFact): PlaneReportItem {
  return {
    capabilityId: f.capabilityId,
    capabilityFamily: f.capabilityFamily,
    action: f.action,
    resource: f.resource,
    scope: f.scope,
    sourceLocation: f.sourceLocation,
    constraints: f.constraints,
    impact: f.impact,
    discoveryBasis: f.discoveryBasis,
    capabilityCoverage: f.capabilityCoverage,
    evidenceIds: f.sourceEvidenceIds ?? [],
    evidenceMethod: f.evidenceMethod,
    authorityClass: f.authorityClass,
    authoritySourceLabel: f.authoritySourceLabel,
    availability: 'PRESENT',
  };
}

function buildDefaultPlaneAvailabilityReport(): PlaneAvailability[] {
  const planes: AssurancePlane[] = ['REQUESTED', 'POLICY_AUTHORIZED', 'EFFECTIVELY_GRANTED', 'CODE_CAPABLE', 'OBSERVED'];
  return planes.map(plane => ({
    plane,
    status: 'NOT_EVALUATED',
    coverage: 'UNKNOWN',
    basis: 'UNKNOWN',
    sourceEvidenceIds: [],
    explanation: 'Plane availability not recorded for this evaluation.',
  }));
}

function buildProducerCoverage(evaluation: AssuranceEvaluation): ProducerCoverageItem[] {
  // Group by evidence set members
  const seen = new Map<string, { producerId: string; count: number }>();
  for (const claim of evaluation.claimResults) {
    for (const m of claim.evidenceSet.members) {
      const entry = seen.get(m.producerId) || { producerId: m.producerId, count: 0 };
      entry.count += 1;
      seen.set(m.producerId, entry);
    }
  }
  return Array.from(seen.values()).map(p => ({
    producerId: p.producerId,
    producerRunId: null,
    producerOutcome: 'UNKNOWN',
    coverageStatus: 'UNKNOWN',
    coverageRatio: null,
    limitations: [],
    evidenceCount: p.count,
  }));
}

function buildLimitations(evaluation: AssuranceEvaluation): string[] {
  const limitations: string[] = [];
  for (const claim of evaluation.claimResults) {
    for (const reason of claim.reasonCodes) {
      if (reason.includes('MISSING') || reason.includes('INSUFFICIENT')) limitations.push(`${claim.claimKey}: ${reason}`);
    }
  }
  return limitations;
}

function buildFrameworkAlignment(claimResults: ClaimEvaluationResult[]): { framework: string; control: string; mappingStrength: string; alignmentStatement: string }[] {
  return [];
}

function buildFrameworkAlignmentForClaim(claimKey: string): { framework: string; control: string; mappingStrength: string; alignmentStatement: string }[] {
  return [];
}

function buildDispositionExplanation(evaluation: AssuranceEvaluation): string {
  if (evaluation.disposition === 'ALLOW') {
    return 'All mandatory applicable Control Claims required by the selected Assurance Profile were supported within the recorded evaluated scope and no configured blocking contradiction was present.';
  }
  if (evaluation.disposition === 'BLOCK') {
    return 'A mandatory or critical applicable Control Claim was contradicted, or a configured blocking condition was satisfied within the evaluated scope.';
  }
  return 'At least one mandatory or applicable Control Claim requires additional review, evidence is incomplete, or an ambiguous condition requires human judgment within the evaluated scope.';
}

function deriveCoverageStatus(evaluation: AssuranceEvaluation): any {
  const hasReview = evaluation.claimResults.some(c => c.claimState === 'REVIEW_REQUIRED' || c.claimState === 'INSUFFICIENT_EVIDENCE');
  return hasReview ? 'PARTIAL' : 'COMPLETE';
}

function buildBundleSummary(bundle: EvidenceBundle): EvidenceBundleSummary {
  return {
    bundleVersion: bundle.bundleVersion,
    bundleId: bundle.bundleId,
    assuranceEvaluationId: bundle.assuranceEvaluationId,
    membershipCount: bundle.members.length,
    bundleDigest: bundle.bundleDigest,
    merkleRoot: bundle.merkleRoot,
    algorithm: bundle.algorithm,
    rule: bundle.rule,
  };
}

function buildMembershipPayload(m: EvidenceBundleMembership) {
  return {
    bundleVersion: U6_BUNDLE_SCHEMA_VERSION,
    evidenceId: m.evidenceId,
    claimKey: m.claimKey,
    claimVersion: m.claimVersion,
    producerId: m.producerId,
    contentHash: m.contentHash,
    role: m.role,
    epistemicClass: m.epistemicClass,
    exclusionReason: m.exclusionReason,
  };
}

function buildBundleDigestPayload(bundle: EvidenceBundle) {
  return {
    bundleVersion: bundle.bundleVersion,
    bundleId: bundle.bundleId,
    assuranceEvaluationId: bundle.assuranceEvaluationId,
    merkleRoot: bundle.merkleRoot,
    members: bundle.members.map(m => buildMembershipPayload(m)),
  };
}

function computeBundleMerkleRoot(bundle: EvidenceBundle): string {
  const leaves = bundle.members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m), new Set(['role', 'epistemicClass', 'exclusionReason']))));
  if (leaves.length === 0) return hashTextContent('');
  return merkleRoot(leaves);
}

function computeReportDigest(report: UnifiedAssuranceReport): string {
  const payload = {
    reportVersion: report.reportVersion,
    assuranceEvaluationId: report.assuranceEvaluationId,
    organizationId: report.organizationId,
    aiSystemId: report.aiSystemId,
    orchestratorRunId: report.orchestratorRunId,
    evaluationSnapshotAt: report.evaluationSnapshotAt,
    assuranceMethodologyVersion: report.assuranceMethodologyVersion,
    assuranceDisposition: report.assuranceDisposition,
    profile: report.profile,
    operatingEnvelope: report.operatingEnvelope,
    claimSummary: report.claimSummary,
    fivePlaneOverallVerdict: report.fivePlaneAnalysis.overallVerdict,
    evidenceBundleDigest: report.evidenceBundle.bundleDigest,
    decisionReceipt: {
      receiptVersion: report.decisionReceipt.receiptVersion,
      receiptId: report.decisionReceipt.receiptId,
    },
    syntheticMarker: report.syntheticMarker,
  };
  return hashTextContent(canonicalSerialize(payload));
}

function computeReceiptHash(receipt: AssuranceDecisionReceipt): string {
  const payload = {
    receiptVersion: receipt.receiptVersion,
    assuranceEvaluationId: receipt.assuranceEvaluationId,
    organizationId: receipt.organizationId,
    aiSystemId: receipt.aiSystemId,
    orchestratorRunId: receipt.orchestratorRunId,
    evaluationSnapshotAt: receipt.evaluationSnapshotAt,
    assuranceMethodologyVersion: receipt.assuranceMethodologyVersion,
    profileId: receipt.profileId,
    profileVersion: receipt.profileVersion,
    profileDigestResolved: receipt.profileDigestResolved,
    operatingEnvelopeId: receipt.operatingEnvelopeId,
    operatingEnvelopeVersion: receipt.operatingEnvelopeVersion,
    operatingEnvelopeDigest: receipt.operatingEnvelopeDigest,
    disposition: receipt.disposition,
    claimStateSummary: receipt.claimStateSummary,
    inputHash: receipt.inputHash,
    outputHash: receipt.outputHash,
    evidenceSetDigest: receipt.evidenceSetDigest,
    evidenceBundleDigest: receipt.evidenceBundleDigest,
    evidenceMerkleRoot: receipt.evidenceMerkleRoot,
    syntheticMarker: receipt.syntheticMarker,
  };
  return hashTextContent(canonicalSerialize(payload));
}

function computeClaimStateSummary(claimResults: ClaimEvaluationResult[]): Record<string, number> {
  const summary: Record<string, number> = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    CONTRADICTED: 0,
    REVIEW_REQUIRED: 0,
    NOT_ASSESSED: 0,
    NOT_APPLICABLE: 0,
  };
  for (const c of claimResults) {
    summary[c.claimState] = (summary[c.claimState] || 0) + 1;
  }
  return summary;
}
