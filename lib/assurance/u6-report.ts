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
  ClaimState,
  PlaneAvailability,
  deriveFivePlaneComparisonState,
} from './types';
import { CONTROL_CLAIM_CATALOG } from './claim-catalog';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';
import {
  U6_REPORT_SCHEMA_VERSION,
  U6_REPORT_SCHEMA_VERSION_FP,
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
  EvaluatedScopeBinding,
  PackageVerificationResult,
  PublicVerificationResult,
  ActionProofReportSection,
  AgentReachabilityReportSection,
  EvaluationIntegrityReportSection,
  ActionAssuranceReportSection,
} from './u6-types';

export type { BuildIdentity, U6Package } from './u6-types';

function emptyBuildIdentity(): BuildIdentity {
  return { source: 'NOT_PROVIDED', explanation: 'BUILD_IDENTITY_NOT_PROVIDED' };
}

function resolveSyntheticClassification(evaluation: AssuranceEvaluationV1_1): 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' {
  if (evaluation.syntheticClassification) return evaluation.syntheticClassification;
  if (evaluation.operatingEnvelopeAuthoritySourceLabel === 'SYNTHETIC_REFERENCE_POLICY') return 'SYNTHETIC_REFERENCE';
  if (evaluation.operatingEnvelopeState !== 'APPROVED') return 'UNKNOWN';
  if (evaluation.operatingEnvelopeAuthoritySourceLabel) return 'NONE';
  return 'UNKNOWN';
}

/**
 * Build the report core WITHOUT the receipt hash / digest, then compute the digest.
 */
export function buildUnifiedAssuranceReport(
  evaluation: AssuranceEvaluation,
  bundle: EvidenceBundle,
  buildIdentity: BuildIdentity = emptyBuildIdentity(),
  projectedEvidence: DecisionEvidenceProjection[] = [],
  syntheticClass: 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' = resolveSyntheticClassification(evaluation as AssuranceEvaluationV1_1),
  authoritySourceLabel?: string,
  actionProof?: ActionProofReportSection,
  agentReachability?: AgentReachabilityReportSection,
  evaluationIntegrity?: EvaluationIntegrityReportSection,
  actionAssurance?: ActionAssuranceReportSection,
): UnifiedAssuranceReport {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;

  const claimResults = buildReportClaimResults(evaluation.claimResults, v1_1.fivePlaneComparisons || [], v1_1.applicableClaimKeys ?? []);
  const claimSummary = buildClaimSummary(evaluation.claimResults);
  const evidenceCoverage = buildProducerCoverageFromEvidence(projectedEvidence);
  const limitations = buildLimitations(evaluation, projectedEvidence, v1_1.planeAvailability ?? [], buildIdentity);

  const report: UnifiedAssuranceReport = {
    // FP-EMPTY-1: fivePlaneAnalysis is always present and now carries
    // comparisonState + a nullable overallVerdict, so every new report is
    // schema 1.5.0 regardless of which additive sections exist.
    // Historical 1.0.0-1.4.0 reports keep their persisted version and verify
    // under their own digests — persisted bytes are never rewritten.
    reportVersion: U6_REPORT_SCHEMA_VERSION_FP,
    reportId: `${evaluation.id}:report`,
    assuranceEvaluationId: evaluation.id,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
    buildIdentity,
    orchestratorRunId: evaluation.orchestratorRunId,
    evaluationSnapshotAt: evaluation.evaluationSnapshotAt.toISOString(),
    assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    reportGenerationStatus: 'COMPLETE',
    evidenceCoverageStatus: deriveEvidenceCoverageStatus(projectedEvidence),
    assuranceDisposition: evaluation.disposition,
    scopeStatement: buildScopeStatement(evaluation, v1_1),
    profile: {
      profileId: v1_1.profileId,
      profileVersion: v1_1.profileVersion,
      profileDigest: v1_1.profileDigest,
      profileDigestResolved: v1_1.profileDigestResolved,
      // Defect 13: Profile source references are NOT persisted in the current evaluation contract.
      // ResolvedProfile does not carry sourceReferences; AssuranceEvaluationV1_1 does not define profileSourceReferences.
      // Leave empty and document: PROFILE_SOURCE_REFERENCES_NOT_PERSISTED
      // Do not fetch sources from the internet at report time.
      sourceReferences: [],
      applicableClaimKeys: v1_1.applicableClaimKeys ?? [],
      claimPackVersions: v1_1.claimPackVersions,
      rulePackVersions: v1_1.rulePackVersions,
    },
    operatingEnvelope: v1_1.operatingEnvelopeId ? buildEnvelopeSection(v1_1, authoritySourceLabel) : undefined,
    dispositionExplanation: buildDispositionExplanation(evaluation),
    claimSummary,
    claimResults,
    fivePlaneAnalysis: buildFivePlaneReport(v1_1, actionAssurance?.pathLevelCodeCapability),
    evidenceCoverage,
    limitations,
    frameworkAlignment: buildFrameworkAlignment(evaluation.claimResults),
    evidenceBundle: buildBundleSummary(bundle),
    decisionReceipt: {
      receiptVersion: U6_RECEIPT_SCHEMA_VERSION,
      receiptId: `${evaluation.id}:receipt`,
      receiptHash: '',
    },
    reportDigest: '',
    syntheticClassification: syntheticClass,
    // PX-FINAL / ARI-P0: additive report sections. Present on new reports only —
    // absent on previously persisted reportJson, which keeps old packages verifying
    // under their original digest semantics.
    ...(actionProof ? { actionProof } : {}),
    ...(agentReachability ? { agentReachability } : {}),
    ...(evaluationIntegrity ? { evaluationIntegrity } : {}),
    ...(actionAssurance ? { actionAssurance } : {}),
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
  evaluatedScopeBinding?: EvaluatedScopeBinding, // G3-R1: optional scope binding
  receiptVersionOverride?: string, // G3-R1: schema version override
): AssuranceDecisionReceipt {
  const v1_1 = evaluation as AssuranceEvaluationV1_1;
  const claimStateSummary = computeClaimStateSummary(evaluation.claimResults);

  const receipt: AssuranceDecisionReceipt = {
    receiptVersion: receiptVersionOverride ?? U6_RECEIPT_SCHEMA_VERSION,
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
    authoritySourceLabel: report.operatingEnvelope?.authoritySourceLabel ??
      v1_1.operatingEnvelopeAuthoritySourceLabel ??
      'UNKNOWN',
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
    // G3-R1: Scope binding — included in receiptHash when present.
    // Absent (undefined) for legacy 1.0.0 receipts.
    evaluatedScopeBinding,
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
  // Part 8: Pure helper — maximum status is INTERNALLY_CONSISTENT.
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
    scopeSummary: `Assurance under profile ${receipt.profileId}${receipt.operatingEnvelopeId ? ` with envelope ${receipt.operatingEnvelopeId}` : '; no approved operating envelope was established for this evaluation'}`,
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
    reportId: report.reportId,
    assuranceEvaluationId: report.assuranceEvaluationId,
    organizationId: report.organizationId,
    aiSystemId: report.aiSystemId,
    buildIdentity: report.buildIdentity,
    orchestratorRunId: report.orchestratorRunId,
    evaluationSnapshotAt: report.evaluationSnapshotAt,
    assuranceMethodologyVersion: report.assuranceMethodologyVersion,
    reportGenerationStatus: report.reportGenerationStatus,
    evidenceCoverageStatus: report.evidenceCoverageStatus,
    assuranceDisposition: report.assuranceDisposition,
    scopeStatement: report.scopeStatement,
    profile: report.profile,
    operatingEnvelope: report.operatingEnvelope,
    dispositionExplanation: report.dispositionExplanation,
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
    // PX-FINAL: additive — included only when the section exists on the report.
    // Absent on legacy persisted reports, so old digests remain stable.
    // LOCK: NEW_REPORT_SECTION != SILENT_HASH_SEMANTIC_CHANGE
    ...(report.actionProof ? { actionProof: report.actionProof } : {}),
    // ARI-P0: additive historical Agent Reachability and Evaluation Integrity sections.
    // LOCK: ARI_REPORT_CONTENT_CHANGE => REPORT_DIGEST_CHANGE
    // LOCK: EI_REPORT_CONTENT_CHANGE => REPORT_DIGEST_CHANGE
    ...(report.agentReachability ? { agentReachability: report.agentReachability } : {}),
    ...(report.evaluationIntegrity ? { evaluationIntegrity: report.evaluationIntegrity } : {}),
    // S6: additive Action Assurance customer-facing projection section.
    // LOCK: ACTION_ASSURANCE_REPORT_CONTENT_CHANGE => REPORT_DIGEST_CHANGE
    ...(report.actionAssurance ? { actionAssurance: report.actionAssurance } : {}),
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
    // G3-R1: Scope binding committed into receiptHash.
    // For legacy 1.0.0 receipts, evaluatedScopeBinding is undefined →
    // canonicalSerialize omits it → hash unchanged → legacy verification still works.
    evaluatedScopeBinding: receipt.evaluatedScopeBinding,
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
      frameworkMappings: buildFrameworkAlignmentForClaim(c.claimKey, c.claimState),
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

/**
 * AA-FLAGSHIP-HARDENING-1: path-level code-capability truth carried in from
 * the same evaluation's Action Assurance section (derived from the evaluated
 * snapshot's handler-operation relations — the same grain the reporting
 * bundle's actionPaths carry).
 */
export interface PathLevelCodeCapability {
  totalActionPaths: number;
  codeCapableEstablishedPaths: number;
  codeCapablePartialPaths: number;
}

function buildFivePlaneReport(
  v1_1: AssuranceEvaluationV1_1,
  pathLevelCodeCapability?: PathLevelCodeCapability,
): FivePlaneReportSection {
  const facts = v1_1.capabilityFacts ?? { requested: [], policy: [], granted: [], capable: [], observed: [] };
  const persistedAvailability = v1_1.planeAvailability ?? buildDefaultPlaneAvailabilityReport();

  const comparisons = v1_1.fivePlaneComparisons || [];
  const comparisonState = v1_1.fivePlaneComparisonState
    ?? deriveFivePlaneComparisonState({ comparisons, planeAvailability: v1_1.planeAvailability });

  // AA-FLAGSHIP-HARDENING-1 — cross-surface consistency:
  // The CODE_CAPABLE plane entry in this section reports the U5
  // capability-comparison input grain. When the same evaluation's Action
  // Assurance establishes path-level code capability, the availability
  // explanation must name the narrower grain rather than implying
  // "no code capability exists".
  //
  //   ABSENT_COMPARISON_INPUT != ABSENT_CODE_CAPABILITY
  //   PATH_LEVEL_CODE_CAPABILITY != U5_CAPABILITY_COMPARISON_FACT
  //   CROSS_SURFACE_SEMANTIC_CONTRADICTION = INVALID_REPORT_PROJECTION
  const establishedPaths = pathLevelCodeCapability?.codeCapableEstablishedPaths ?? 0;
  const availability = persistedAvailability.map(entry => {
    if (entry.plane !== 'CODE_CAPABLE') return entry;
    if (entry.status === 'PRESENT') return entry;
    if (establishedPaths === 0) return entry;
    return {
      ...entry,
      // AA-REPORTING-INTERPRETATION-2: customer-facing wording — no internal
      // implementation labels (U5) in rendered copy.
      explanation:
        `No qualifying capability-comparison evidence was joined into this evaluation's authority comparison. ` +
        `Separately, path-level code capability was established on ${establishedPaths} of ` +
        `${pathLevelCodeCapability!.totalActionPaths} evaluated action path(s) in the same evaluation — ` +
        `see the Action Assurance section.`,
    };
  });

  const section: FivePlaneReportSection = {
    requested: facts.requested.map(f => mapCapabilityFactToReport(f)),
    policyAuthorized: facts.policy.map(f => mapCapabilityFactToReport(f)),
    effectivelyGranted: facts.granted.map(f => mapCapabilityFactToReport(f)),
    codeCapable: facts.capable.map(f => mapCapabilityFactToReport(f)),
    observed: facts.observed.map(f => mapCapabilityFactToReport(f)),
    comparisons,
    comparisonState,
    // FP-EMPTY-1: an empty comparison set has no verdict — never ALLOW.
    // The comparator verdict is subordinate to the canonical U5 disposition.
    overallVerdict: comparisons.length > 0 ? (v1_1.fivePlaneOverallVerdict ?? 'REVIEW') : null,
    availability,
    ...(pathLevelCodeCapability
      ? {
          pathLevelCodeCapability: {
            establishedPathCount: pathLevelCodeCapability.codeCapableEstablishedPaths,
            partialPathCount: pathLevelCodeCapability.codeCapablePartialPaths,
            totalPathCount: pathLevelCodeCapability.totalActionPaths,
          },
        }
      : {}),
  };

  assertFivePlaneConsistency(section);
  return section;
}

/**
 * AA-FLAGSHIP-HARDENING-1: report-projection invariant.
 * When the same evaluation carries established path-level code capability,
 * no plane availability entry may assert an unqualified absence of code
 * capability. Fail closed — an inconsistent projection must not ship.
 */
export function assertFivePlaneConsistency(section: FivePlaneReportSection): void {
  const established = section.pathLevelCodeCapability?.establishedPathCount ?? 0;
  if (established === 0) return;
  const entry = section.availability.find(a => a.plane === 'CODE_CAPABLE');
  if (!entry?.explanation) return;
  const assertsAbsence =
    /no qualifying capability/i.test(entry.explanation) ||
    /no code capability/i.test(entry.explanation) ||
    /capability (evidence|fact) was (provided|produced)/i.test(entry.explanation);
  const qualified = /path-level code capability/i.test(entry.explanation);
  if (assertsAbsence && !qualified) {
    throw new Error(
      'CROSS_SURFACE_SEMANTIC_CONTRADICTION: five-plane CODE_CAPABLE availability ' +
      'asserts absence while the same evaluation carries established path-level code capability',
    );
  }
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

function buildEnvelopeSection(v1_1: AssuranceEvaluationV1_1, authoritySourceLabel?: string) {
  // U6: authority source is the explicit evaluation-time label. approvedBy is provenance, not authority.
  const source =
    authoritySourceLabel ??
    v1_1.operatingEnvelopeAuthoritySourceLabel ??
    'UNKNOWN';
  return {
    envelopeId: v1_1.operatingEnvelopeId ?? '',
    envelopeVersion: v1_1.operatingEnvelopeVersion ?? '',
    envelopeDigest: v1_1.operatingEnvelopeDigest ?? '',
    state: v1_1.operatingEnvelopeState ?? 'UNKNOWN',
    authoritySourceLabel: source,
    approvedBy: v1_1.operatingEnvelopeApprovedBy,
    approvalReference: v1_1.operatingEnvelopeApprovalReference,
    synthetic: resolveSyntheticClassification(v1_1) === 'SYNTHETIC_REFERENCE',
  };
}

function buildScopeStatement(evaluation: AssuranceEvaluation, v1_1: AssuranceEvaluationV1_1): string {
  return `Assurance evaluated within the scope of profile ${v1_1.profileId}${v1_1.operatingEnvelopeId ? ` and operating envelope ${v1_1.operatingEnvelopeId}` : '; no approved operating envelope was established for this evaluation'} at ${evaluation.evaluationSnapshotAt.toISOString()}.`;
}

function buildProducerCoverageFromEvidence(projectedEvidence: DecisionEvidenceProjection[]): ProducerCoverageItem[] {
  // Part 28: Deterministic aggregation — fail closed on conflicting outcomes.
  const groups = new Map<string, {
    producerId: string;
    producerRunId: string | null;
    outcomes: string[];
    coverageStatuses: string[];
    coverageRatios: number[];
    limitations: string[];
    evidenceCount: number;
    targetSummary: { targetType: string; targetId?: string }[];
  }>();

  for (const ev of projectedEvidence) {
    const key = `${ev.producerId}|${ev.producerRunId ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.evidenceCount += 1;
      existing.outcomes.push(ev.producerOutcome ?? 'UNKNOWN');
      existing.coverageStatuses.push(ev.coverageStatus ?? 'UNKNOWN');
      if (ev.coverageRatio != null) existing.coverageRatios.push(ev.coverageRatio);
      (ev.limitations ?? []).forEach(l => {
        const desc = (l as any).description ?? (l as any).code ?? String(l);
        if (!existing.limitations.includes(desc)) existing.limitations.push(desc);
      });
      if (ev.target && !existing.targetSummary.some(t => t.targetType === ev.target.type && t.targetId === ev.target.id)) {
        existing.targetSummary.push({ targetType: ev.target.type, targetId: ev.target.id });
      }
    } else {
      groups.set(key, {
        producerId: ev.producerId,
        producerRunId: ev.producerRunId ?? null,
        outcomes: [ev.producerOutcome ?? 'UNKNOWN'],
        coverageStatuses: [ev.coverageStatus ?? 'UNKNOWN'],
        coverageRatios: ev.coverageRatio != null ? [ev.coverageRatio] : [],
        limitations: (ev.limitations ?? []).map(l => (l as any).description ?? (l as any).code ?? String(l)),
        evidenceCount: 1,
        targetSummary: ev.target ? [{ targetType: ev.target.type, targetId: ev.target.id }] : [],
      });
    }
  }

  return Array.from(groups.values()).map(g => ({
    producerId: g.producerId,
    producerRunId: g.producerRunId,
    producerOutcome: aggregateProducerOutcome(g.outcomes),
    coverageStatus: aggregateCoverageStatus(g.coverageStatuses),
    coverageRatio: aggregateCoverageRatio(g.coverageRatios),
    limitations: g.limitations,
    evidenceCount: g.evidenceCount,
    targetSummary: g.targetSummary,
  })).sort((a, b) => `${a.producerId}|${a.producerRunId ?? ''}`.localeCompare(`${b.producerId}|${b.producerRunId ?? ''}`));
}

/**
 * Part 28: Deterministic producer outcome aggregation — fail-closed precedence.
 */
function aggregateProducerOutcome(outcomes: string[]): string {
  const severity = ['FAILED', 'ERROR', 'TIMEOUT', 'CANCELLED', 'PARTIAL', 'UNKNOWN', 'SKIPPED', 'NOT_RUN', 'UNSUPPORTED', 'COMPLETE'];
  for (const s of severity) {
    if (outcomes.includes(s)) return s;
  }
  return 'UNKNOWN';
}

/**
 * Part 28: Deterministic coverage status aggregation.
 */
function aggregateCoverageStatus(statuses: string[]): string {
  if (statuses.includes('UNKNOWN')) return 'UNKNOWN';
  if (statuses.includes('PARTIAL')) return 'PARTIAL';
  if (statuses.every(s => s === 'COMPLETE')) return 'COMPLETE';
  return 'UNKNOWN';
}

/**
 * Part 28: Deterministic coverage ratio — null if incompatible scopes.
 */
function aggregateCoverageRatio(ratios: number[]): number | null {
  if (ratios.length === 0) return null;
  if (ratios.every(r => r === ratios[0])) return ratios[0];
  return null;
}

function buildLimitations(
  evaluation: AssuranceEvaluation,
  projectedEvidence: DecisionEvidenceProjection[] = [],
  planeAvailability: PlaneAvailability[] = [],
  buildIdentity?: BuildIdentity,
): LimitationItem[] {
  const limitations: Map<string, LimitationItem> = new Map();
  const add = (item: LimitationItem) => { if (!limitations.has(item.code)) limitations.set(item.code, item); };

  for (const claim of evaluation.claimResults) {
    for (const reason of claim.reasonCodes) {
      if (reason.includes('MISSING') || reason.includes('INSUFFICIENT')) {
        add({ code: reason, explanation: reason, scope: claim.claimKey });
      }
    }
  }

  for (const ev of projectedEvidence) {
    for (const l of ev.limitations ?? []) {
      add({ code: (l as any).code ?? 'PRODUCER_LIMITATION', explanation: (l as any).description ?? String(l), scope: ev.producerId });
    }
  }

  for (const plane of planeAvailability) {
    if (plane.status === 'NOT_EVALUATED') add({ code: 'PLANE_NOT_EVALUATED', explanation: `${plane.plane} not evaluated`, scope: plane.plane });
    if (plane.status === 'NOT_SUPPORTED_BY_CURRENT_PRODUCER') add({ code: 'PLANE_NOT_SUPPORTED', explanation: `${plane.plane} not supported by current producer`, scope: plane.plane });
  }

  // Part 13 / Defect 12 / Gate 4A: Build Identity limitation classification.
  // CONFLICT and NOT_PROVIDED both use source=NOT_PROVIDED but different explanations.
  // The cross-source conflict path emits "BUILD_IDENTITY_CONFLICT: buildBinding
  // contradicts Evidence on ..." — exact string equality would miss this and
  // silently downgrade a real conflict to ordinary NOT_PROVIDED.
  // Use a prefix-based predicate to classify deterministically.
  // BUILD_IDENTITY_CONFLICT != BUILD_IDENTITY_NOT_PROVIDED
  if (buildIdentity) {
    if (buildIdentity.source === 'NOT_PROVIDED') {
      const explanation = buildIdentity.explanation ?? '';
      if (explanation === 'BUILD_IDENTITY_CONFLICT' || explanation.startsWith('BUILD_IDENTITY_CONFLICT')) {
        add({ code: 'BUILD_IDENTITY_CONFLICT', explanation: 'Conflicting build identities were found in the evaluated Evidence. Positive Assurance mark is ineligible.', scope: 'build_identity' });
      } else {
        add({ code: 'BUILD_IDENTITY_NOT_PROVIDED', explanation: 'Build Identity was not established from the evaluated Evidence. Positive Assurance mark is ineligible.', scope: 'build_identity' });
      }
    }
  }

  return Array.from(limitations.values()).sort((a, b) => a.code.localeCompare(b.code));
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
          alignmentStatement: buildAlignmentStatement(c.claimState, c.claimKey, m.framework, controlId),
        });
      }
    }
  }
  return items;
}

function buildFrameworkAlignmentForClaim(claimKey: string, claimState?: ClaimState): FrameworkAlignmentItem[] {
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
      claimState,
      alignmentStatement: buildAlignmentStatement(claimState ?? 'NOT_ASSESSED', claimKey, m.framework, controlId),
    };
  });
}

/**
 * Part 32: Claim-state-aware framework alignment wording.
 * Never uses "compliant" or "supports" for non-SUPPORTED claims.
 */
function buildAlignmentStatement(
  claimState: ClaimState,
  claimKey: string,
  framework: string,
  controlId: string,
): string {
  switch (claimState) {
    case 'SUPPORTED':
      return `Evidence supporting this Control Claim was evaluated in relation to ${framework} ${controlId}.`;
    case 'PARTIALLY_SUPPORTED':
      return `This Control Claim is mapped to ${framework} ${controlId}; supporting Evidence is partial.`;
    case 'INSUFFICIENT_EVIDENCE':
      return `This Control Claim is mapped to ${framework} ${controlId}; available Evidence is insufficient for the claim.`;
    case 'REVIEW_REQUIRED':
      return `This Control Claim is mapped to ${framework} ${controlId}; additional review is required.`;
    case 'CONTRADICTED':
      return `Evidence contradicts this Control Claim, which is mapped to ${framework} ${controlId}.`;
    case 'NOT_ASSESSED':
      return `This Control Claim is mapped to ${framework} ${controlId}; it was not sufficiently assessed in this evaluation.`;
    case 'NOT_APPLICABLE':
      return `This Control Claim is mapped to ${framework} ${controlId} but was determined not applicable within the evaluated scope.`;
    default:
      return `This Control Claim is mapped to ${framework} ${controlId}.`;
  }
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

function deriveEvidenceCoverageStatus(projectedEvidence: DecisionEvidenceProjection[]): any {
  // Part 29: Account for all failure/uncertainty states.
  // Defect 4: NOT_ASSESSED != COMPLETE
  if (projectedEvidence.length === 0) return 'NOT_EVALUATED';

  const failureOutcomes = ['FAILED', 'ERROR', 'TIMEOUT', 'CANCELLED'];
  const hasFailed = projectedEvidence.some(ev => failureOutcomes.includes(ev.producerOutcome as string));
  if (hasFailed) return 'PARTIAL';

  // Defect 4: NOT_ASSESSED coverage prevents COMPLETE — use UNKNOWN (evidence exists but coverage not established)
  const hasNotAssessed = projectedEvidence.some(ev => ev.coverageStatus === 'NOT_ASSESSED');
  if (hasNotAssessed) return 'UNKNOWN';

  const hasUnknown = projectedEvidence.some(ev => ev.coverageStatus === 'UNKNOWN' || ev.producerOutcome === 'UNKNOWN');
  if (hasUnknown) return 'UNKNOWN';

  const hasPartial = projectedEvidence.some(ev =>
    ev.coverageStatus === 'PARTIAL' ||
    ev.producerOutcome === 'PARTIAL' ||
    ev.producerOutcome === 'SKIPPED' ||
    ev.producerOutcome === 'NOT_RUN' ||
    ev.producerOutcome === 'UNSUPPORTED'
  );
  if (hasPartial) return 'PARTIAL';

  // COMPLETE only when every relevant projected Evidence item has defensible COMPLETE coverage
  // and no failure/uncertainty condition applies.
  const allComplete = projectedEvidence.every(ev =>
    ev.coverageStatus === 'COMPLETE' && ev.producerOutcome === 'COMPLETE'
  );
  if (!allComplete) return 'UNKNOWN';

  return 'COMPLETE';
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

export function computeBundleDigest(bundle: EvidenceBundle): string {
  return hashTextContent(canonicalSerialize(buildBundleDigestPayload(bundle)));
}

function computeClaimStateSummary(claimResults: ClaimEvaluationResult[]): Record<any, number> {
  const summary: Record<string, number> = {};
  for (const c of claimResults) {
    summary[c.claimState] = (summary[c.claimState] ?? 0) + 1;
  }
  return summary;
}
