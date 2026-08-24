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
} from './types';
import { CONTROL_CLAIM_CATALOG } from './claim-catalog';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';
import {
  U6_REPORT_SCHEMA_VERSION,
  U6_BUNDLE_SCHEMA_VERSION,
  U6_RECEIPT_SCHEMA_VERSION,
  BuildIdentity,
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
  FrameworkAlignmentItem,
  LimitationItem,
  PackageVerificationResult,
  PublicVerificationResult,
} from './u6-types';

export type { BuildIdentity, U6Package } from './u6-types';

function emptyBuildIdentity(): BuildIdentity {
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

function syntheticClassification(evaluation: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' {
  const isSynthetic = evaluation.operatingEnvelopeId?.includes('synthetic') || evaluation.profileId?.includes('synthetic');
  return isSynthetic ? 'SYNTHETIC_REFERENCE' : 'NONE';
}

/**
 * Build the report core WITHOUT the receipt hash / digest, then compute the digest.
 */
export function buildUnifiedAssuranceReport(
  evaluation: AssuranceEvaluation,
  bundle: EvidenceBundle,
  buildIdentity: BuildIdentity = emptyBuildIdentity(),
): UnifiedAssuranceReport {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  const claimResults = buildReportClaimResults(evaluation.claimResults, v1_1.fivePlaneComparisons || [], v1_1.applicableClaimKeys ?? []);
  const claimSummary = buildClaimSummary(evaluation.claimResults);

  const report: UnifiedAssuranceReport = {
    reportVersion: U6_REPORT_SCHEMA_VERSION,
    reportId: `${evaluation.id}:report`,
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    buildIdentity,
    orchestratorRunId: evaluation.orchestratorRunId,
    evaluationSnapshotAt: evaluation.evaluationSnapshotAt.toISOString(),
    assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    reportGenerationStatus: 'COMPLETE',
    evidenceCoverageStatus: deriveEvidenceCoverageStatus(bundle),
    assuranceDisposition: evaluation.disposition,
    scopeStatement: buildScopeStatement(evaluation, v1_1),
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
    operatingEnvelope: v1_1.operatingEnvelopeId ? buildEnvelopeSection(v1_1) : undefined,
    dispositionExplanation: buildDispositionExplanation(evaluation),
    claimSummary,
    claimResults,
    fivePlaneAnalysis: buildFivePlaneReport(v1_1),
    evidenceCoverage: buildProducerCoverageFromBundle(bundle),
    limitations: buildLimitations(evaluation),
    frameworkAlignment: buildFrameworkAlignment(evaluation.claimResults),
    evidenceBundle: buildBundleSummary(bundle),
    decisionReceipt: {
      receiptVersion: U6_RECEIPT_SCHEMA_VERSION,
      receiptId: `${evaluation.id}:receipt`,
      receiptHash: '',
    },
    reportDigest: '',
    syntheticClassification: syntheticClassification(v1_1),
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
  const membershipMap = new Map<string, EvidenceBundleMembership>();

  for (const claim of evaluation.claimResults) {
    for (const member of claim.evidenceSet.members) {
      const ev = evidenceById.get(member.evidenceId);
      const key = `${claim.claimKey}|${claim.claimVersion}|${member.evidenceId}`;
      const existing = membershipMap.get(key);
      if (existing) {
        if (existing.role !== member.role) {
          throw new Error('EVIDENCE_BUNDLE_MEMBERSHIP_CONFLICT');
        }
        continue;
      }
      membershipMap.set(key, {
        evidenceId: member.evidenceId,
        contentHash: member.contentHash ?? ev?.contentHash ?? undefined,
        semanticDigest: ev?.semanticDigest ?? undefined,
        producerId: member.producerId,
        producerRunId: ev?.producerRunId ?? undefined,
        evidenceType: ev?.evidenceType ?? 'UNKNOWN',
        targetType: ev?.target?.type ?? 'UNKNOWN',
        targetId: ev?.target?.id,
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

  const members = Array.from(membershipMap.values()).sort((a, b) =>
    `${a.claimKey}|${a.claimVersion}|${a.evidenceId}`.localeCompare(`${b.claimKey}|${b.claimVersion}|${b.evidenceId}`)
  );

  const leaves = members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m))));
  const merkleStatus = leaves.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE_EMPTY_SET';
  const root = leaves.length > 0 ? merkleRoot(leaves) : null;

  const bundle: EvidenceBundle = {
    bundleVersion: U6_BUNDLE_SCHEMA_VERSION,
    bundleId: `${evaluation.id}:bundle`,
    assuranceEvaluationId: evaluation.id,
    members,
    bundleDigest: '',
    merkleRoot: root,
    merkleStatus,
    algorithm: 'sha256',
    rule: 'pair-sort-concat',
  };

  bundle.bundleDigest = hashTextContent(canonicalSerialize(buildBundleDigestPayload(bundle)));
  return bundle;
}

/**
 * Build a Decision Receipt that binds the bundle digest and report digest.
 */
export function buildDecisionReceipt(
  evaluation: AssuranceEvaluation,
  report: UnifiedAssuranceReport,
  bundle: EvidenceBundle,
): AssuranceDecisionReceipt {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const claimStateSummary = computeClaimStateSummary(evaluation.claimResults);

  const receipt: AssuranceDecisionReceipt = {
    receiptVersion: U6_RECEIPT_SCHEMA_VERSION,
    receiptId: `${evaluation.id}:receipt`,
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    buildIdentity: report.buildIdentity,
    orchestratorRunId: evaluation.orchestratorRunId,
    evaluationSnapshotAt: evaluation.evaluationSnapshotAt.toISOString(),
    assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    profileId: v1_1.profileId,
    profileVersion: v1_1.profileVersion,
    profileDigestResolved: v1_1.profileDigestResolved,
    operatingEnvelopeId: v1_1.operatingEnvelopeId,
    operatingEnvelopeVersion: v1_1.operatingEnvelopeVersion,
    operatingEnvelopeDigest: v1_1.operatingEnvelopeDigest,
    authoritySourceLabel: v1_1.operatingEnvelopeState === 'APPROVED' ? (v1_1.operatingEnvelopeApprovedBy ? 'AUTHORITATIVE_POLICY' : 'REFERENCE_DEFAULT') : 'UNKNOWN',
    syntheticClassification: report.syntheticClassification,
    disposition: evaluation.disposition,
    claimStateSummary,
    inputHash: evaluation.inputHash,
    outputHash: evaluation.outputHash,
    evidenceSetDigest: evaluation.evidenceSetDigest,
    evidenceBundleDigest: bundle.bundleDigest,
    evidenceMerkleRoot: bundle.merkleRoot,
    merkleStatus: bundle.merkleStatus,
    semanticReportDigest: report.reportDigest,
    limitations: report.limitations.map(l => l.code),
    receiptHash: '',
  };

  receipt.receiptHash = computeReceiptHash(receipt);
  // Update report's decision receipt summary after receipt hash is known
  report.decisionReceipt.receiptHash = receipt.receiptHash;
  return receipt;
}

/**
 * Recompute and verify the receipt, bundle, and report integrity.
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
  if (receipt.semanticReportDigest !== report.reportDigest) reasons.push('receipt does not bind report');
  if (receipt.evidenceMerkleRoot !== bundle.merkleRoot) reasons.push('receipt does not bind bundle');

  return { valid: reasons.length === 0, reasons };
}

/**
 * Generate Merkle inclusion proofs for every bundle member.
 */
export function bundleMerkleProofs(bundle: EvidenceBundle): { leafHash: string; proof: any }[] {
  if (bundle.merkleRoot === null || bundle.merkleStatus === 'NOT_AVAILABLE_EMPTY_SET') return [];
  const leaves = bundle.members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m))));
  return leaves.map(leaf => ({
    leafHash: leaf,
    proof: merkleProofForLeaf(leaves, leaf),
  }));
}

/**
 * Verify an individual bundle Merkle proof.
 */
export function verifyBundleProof(bundle: EvidenceBundle, leafHash: string, proof: any): boolean {
  if (bundle.merkleRoot === null || !proof) return false;
  return proof.root === bundle.merkleRoot && verifyMerkleProof(proof) && proof.leaf === leafHash;
}

/**
 * Build a public-safe verification result from a receipt.
 */
export function publicVerification(receipt: AssuranceDecisionReceipt): PublicVerificationResult {
  return {
    publicVerificationId: '',
    publicationState: 'PUBLIC',
    verificationStatus: 'INTERNALLY_CONSISTENT',
    disposition: receipt.disposition,
    evaluatedAt: receipt.evaluationSnapshotAt,
    methodologyVersion: receipt.assuranceMethodologyVersion,
    reportSchemaVersion: U6_REPORT_SCHEMA_VERSION,
    profileLabel: receipt.profileId,
    profileVersion: receipt.profileVersion,
    scopeSummary: `Assurance under profile ${receipt.profileId} with envelope ${receipt.operatingEnvelopeId ?? 'none'}`,
    receiptHash: receipt.receiptHash,
    merkleRoot: receipt.evidenceMerkleRoot,
    merkleStatus: receipt.merkleStatus,
    syntheticClassification: receipt.syntheticClassification,
  };
}

export function computeBundleMerkleRoot(bundle: EvidenceBundle): string | null {
  const leaves = bundle.members.map(m => hashTextContent(canonicalSerialize(buildMembershipPayload(m))));
  if (leaves.length === 0) return null;
  return merkleRoot(leaves);
}

export function computeReportDigest(report: UnifiedAssuranceReport): string {
  const payload = {
    reportVersion: report.reportVersion,
    assuranceEvaluationId: report.assuranceEvaluationId,
    organizationId: report.organizationId,
    aiSystemId: report.aiSystemId,
    buildIdentity: report.buildIdentity,
    orchestratorRunId: report.orchestratorRunId,
    evaluationSnapshotAt: report.evaluationSnapshotAt,
    assuranceMethodologyVersion: report.assuranceMethodologyVersion,
    assuranceDisposition: report.assuranceDisposition,
    profile: report.profile,
    operatingEnvelope: report.operatingEnvelope,
    claimSummary: report.claimSummary,
    claimResults: report.claimResults.map(c => ({
      ...c,
      frameworkMappings: c.frameworkMappings,
    })),
    fivePlaneAnalysis: report.fivePlaneAnalysis,
    evidenceCoverage: report.evidenceCoverage,
    limitations: report.limitations,
    frameworkAlignment: report.frameworkAlignment,
    evidenceBundle: {
      bundleVersion: report.evidenceBundle.bundleVersion,
      bundleId: report.evidenceBundle.bundleId,
      membershipCount: report.evidenceBundle.membershipCount,
      bundleDigest: report.evidenceBundle.bundleDigest,
      merkleRoot: report.evidenceBundle.merkleRoot,
      merkleStatus: report.evidenceBundle.merkleStatus,
    },
    decisionReceipt: {
      receiptVersion: report.decisionReceipt.receiptVersion,
      receiptId: report.decisionReceipt.receiptId,
    },
    syntheticClassification: report.syntheticClassification,
  };
  return hashTextContent(canonicalSerialize(payload));
}

export function computeReceiptHash(receipt: AssuranceDecisionReceipt): string {
  const payload = {
    receiptVersion: receipt.receiptVersion,
    assuranceEvaluationId: receipt.assuranceEvaluationId,
    organizationId: receipt.organizationId,
    aiSystemId: receipt.aiSystemId,
    buildIdentity: receipt.buildIdentity,
    orchestratorRunId: receipt.orchestratorRunId,
    evaluationSnapshotAt: receipt.evaluationSnapshotAt,
    assuranceMethodologyVersion: receipt.assuranceMethodologyVersion,
    profileId: receipt.profileId,
    profileVersion: receipt.profileVersion,
    profileDigestResolved: receipt.profileDigestResolved,
    operatingEnvelopeId: receipt.operatingEnvelopeId,
    operatingEnvelopeVersion: receipt.operatingEnvelopeVersion,
    operatingEnvelopeDigest: receipt.operatingEnvelopeDigest,
    authoritySourceLabel: receipt.authoritySourceLabel,
    syntheticClassification: receipt.syntheticClassification,
    disposition: receipt.disposition,
    claimStateSummary: receipt.claimStateSummary,
    inputHash: receipt.inputHash,
    outputHash: receipt.outputHash,
    evidenceSetDigest: receipt.evidenceSetDigest,
    evidenceBundleDigest: receipt.evidenceBundleDigest,
    evidenceMerkleRoot: receipt.evidenceMerkleRoot,
    merkleStatus: receipt.merkleStatus,
    semanticReportDigest: receipt.semanticReportDigest,
    limitations: receipt.limitations,
  };
  return hashTextContent(canonicalSerialize(payload));
}

function buildReportClaimResults(
  claimResults: ClaimEvaluationResult[],
  comparisons: any[],
  applicableClaimKeys: string[],
): ReportClaimResult[] {
  return claimResults.map(c => {
    const def = CONTROL_CLAIM_CATALOG.find(x => x.claimKey === c.claimKey);
    const isApplicable = applicableClaimKeys.includes(c.claimKey);
    const isMandatory = !!def?.mandatory;
    const criticality = (def?.criticality ?? (isMandatory ? 'critical' : 'high')) as 'critical' | 'high' | 'medium' | 'low';
    const applicability = isApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE';
    const limitations: LimitationItem[] = c.reasonCodes
      .filter(r => r.includes('MISSING') || r.includes('INSUFFICIENT'))
      .map(r => ({ code: r, explanation: r }));
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
      relevantPlaneComparisons: comparisons.filter((comp: any) => comp.mappedClaimKey === c.claimKey).map((comp: any) => comp.capabilityKey),
      frameworkMappings: buildFrameworkAlignmentForClaim(c.claimKey),
      limitations,
    };
  });
}

function buildClaimSummary(claimResults: ClaimEvaluationResult[]): ClaimSummaryItem[] {
  const defMap = new Map(CONTROL_CLAIM_CATALOG.map(c => [c.claimKey, c]));
  return claimResults.map(c => ({
    claimKey: c.claimKey,
    claimVersion: c.claimVersion,
    claimState: c.claimState,
    criticality: (defMap.get(c.claimKey)?.criticality ?? (defMap.get(c.claimKey)?.mandatory ? 'critical' : 'high')) as 'critical' | 'high' | 'medium' | 'low',
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

function buildEnvelopeSection(v1_1: AssuranceEvaluationV1_1) {
  return {
    envelopeId: v1_1.operatingEnvelopeId ?? '',
    envelopeVersion: v1_1.operatingEnvelopeVersion ?? '',
    envelopeDigest: v1_1.operatingEnvelopeDigest ?? '',
    state: v1_1.operatingEnvelopeState ?? 'UNKNOWN',
    authoritySourceLabel: v1_1.operatingEnvelopeState === 'APPROVED' ? (v1_1.operatingEnvelopeApprovedBy ? 'AUTHORITATIVE_POLICY' : 'REFERENCE_DEFAULT') : 'UNKNOWN',
    approvedBy: v1_1.operatingEnvelopeApprovedBy,
    approvalReference: v1_1.operatingEnvelopeApprovalReference,
    synthetic: syntheticClassification(v1_1) === 'SYNTHETIC_REFERENCE',
  };
}

function buildScopeStatement(evaluation: AssuranceEvaluation, v1_1: AssuranceEvaluationV1_1): string {
  return `Assurance evaluated within the scope of profile ${v1_1.profileId} and operating envelope ${v1_1.operatingEnvelopeId ?? 'none'} at ${evaluation.evaluationSnapshotAt.toISOString()}.`;
}

function buildProducerCoverageFromBundle(bundle: EvidenceBundle): ProducerCoverageItem[] {
  const groups = new Map<string, ProducerCoverageItem>();
  for (const m of bundle.members) {
    const key = `${m.producerId}|${m.producerRunId ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.evidenceCount += 1;
      m.limitations.forEach(l => { if (!existing.limitations.includes(l)) existing.limitations.push(l); });
    } else {
      groups.set(key, {
        producerId: m.producerId,
        producerRunId: m.producerRunId ?? null,
        producerOutcome: m.producerOutcome,
        coverageStatus: m.coverageStatus,
        coverageRatio: m.coverageRatio,
        limitations: [...m.limitations],
        evidenceCount: 1,
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => `${a.producerId}|${a.producerRunId ?? ''}`.localeCompare(`${b.producerId}|${b.producerRunId ?? ''}`));
}

function buildLimitations(evaluation: AssuranceEvaluation): LimitationItem[] {
  const limitations: LimitationItem[] = [];
  for (const claim of evaluation.claimResults) {
    for (const reason of claim.reasonCodes) {
      if (reason.includes('MISSING') || reason.includes('INSUFFICIENT')) {
        limitations.push({ code: reason, explanation: reason, scope: claim.claimKey });
      }
    }
  }
  return limitations;
}

function buildFrameworkAlignment(claimResults: ClaimEvaluationResult[]): FrameworkAlignmentItem[] {
  const items: FrameworkAlignmentItem[] = [];
  for (const c of claimResults) {
    const def = CONTROL_CLAIM_CATALOG.find(x => x.claimKey === c.claimKey);
    if ((def as any)?.frameworkMappings) {
      for (const m of (def as any).frameworkMappings) {
        const controlId = Array.isArray(m.controlIds) ? m.controlIds[0] : (m.control ?? m.reference ?? 'unknown');
        items.push({
          framework: m.framework,
          reference: controlId,
          control: controlId,
          mappingStrength: m.mappingStrength ?? 'HEURISTIC',
          evidenceClaimKey: c.claimKey,
          claimState: c.claimState,
          alignmentStatement: `Evidence supports ${c.claimKey}: maps to ${m.framework} ${controlId}`,
        });
      }
    }
  }
  return items;
}

function buildFrameworkAlignmentForClaim(claimKey: string): FrameworkAlignmentItem[] {
  const def = CONTROL_CLAIM_CATALOG.find(x => x.claimKey === claimKey);
  if (!(def as any)?.frameworkMappings) return [];
  return (def as any).frameworkMappings.map((m: any) => {
    const controlId = Array.isArray(m.controlIds) ? m.controlIds[0] : (m.control ?? m.reference ?? 'unknown');
    return {
      framework: m.framework,
      reference: controlId,
      control: controlId,
      mappingStrength: m.mappingStrength ?? 'HEURISTIC',
      evidenceClaimKey: claimKey,
      alignmentStatement: `Evidence supports ${claimKey}: maps to ${m.framework} ${controlId}`,
    };
  });
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

function deriveEvidenceCoverageStatus(bundle: EvidenceBundle): any {
  if (bundle.members.length === 0) return 'NOT_EVALUATED';
  const hasPartial = bundle.members.some(m => m.coverageStatus === 'PARTIAL' || m.coverageStatus === 'UNKNOWN');
  return hasPartial ? 'PARTIAL' : 'COMPLETE';
}

function buildBundleSummary(bundle: EvidenceBundle): EvidenceBundleSummary {
  return {
    bundleVersion: bundle.bundleVersion,
    bundleId: bundle.bundleId,
    assuranceEvaluationId: bundle.assuranceEvaluationId,
    membershipCount: bundle.members.length,
    bundleDigest: bundle.bundleDigest,
    merkleRoot: bundle.merkleRoot,
    merkleStatus: bundle.merkleStatus,
    algorithm: bundle.algorithm,
    rule: bundle.rule,
  };
}

function buildMembershipPayload(m: EvidenceBundleMembership) {
  return {
    bundleVersion: U6_BUNDLE_SCHEMA_VERSION,
    claimKey: m.claimKey,
    claimVersion: m.claimVersion,
    evidenceId: m.evidenceId,
    producerId: m.producerId,
    producerRunId: m.producerRunId,
    contentHash: m.contentHash,
    semanticDigest: m.semanticDigest,
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
    merkleStatus: bundle.merkleStatus,
    members: bundle.members.map(m => ({
      evidenceId: m.evidenceId,
      contentHash: m.contentHash,
      semanticDigest: m.semanticDigest,
      producerId: m.producerId,
      producerRunId: m.producerRunId,
      evidenceType: m.evidenceType,
      targetType: m.targetType,
      targetId: m.targetId,
      coverageStatus: m.coverageStatus,
      coverageRatio: m.coverageRatio,
      producerOutcome: m.producerOutcome,
      limitations: m.limitations,
      claimKey: m.claimKey,
      claimVersion: m.claimVersion,
      role: m.role,
      epistemicClass: m.epistemicClass,
      exclusionReason: m.exclusionReason,
      artifactRefs: m.artifactRefs,
      provenanceRefs: m.provenanceRefs,
    })),
  };
}

function computeClaimStateSummary(claimResults: ClaimEvaluationResult[]): Record<any, number> {
  const summary: Record<string, number> = {};
  for (const c of claimResults) {
    summary[c.claimState] = (summary[c.claimState] ?? 0) + 1;
  }
  return summary;
}
