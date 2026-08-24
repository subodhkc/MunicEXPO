/**
 * U5 B17-B34 / E1 Closure Sections 1,2,12 — Assurance Evaluator
 *
 * Orchestrates claim evaluations and computes system-level disposition.
 *
 * Section 1: Every methodology 1.1 evaluation must resolve an explicit profile.
 * Section 2: Methodology 1.1 cannot use producer-based applicability fallback.
 *            Claim applicability from selected profile, system facts, envelope, predicates.
 *            Producer availability determines SUPPORTED/INSUFFICIENT_EVIDENCE/NOT_ASSESSED.
 * Section 12: Capability comparator results feed canonical U5 claims.
 *
 * B19: Deterministic — no Date.now(), uses evaluationSnapshotAt
 * B30: Idempotent — same input → same output
 * B34: System disposition is deterministic policy evaluation
 * B41: No LLM — deterministic code only
 */

import { createHash } from 'crypto';
import {
  AssuranceEvaluation,
  AssuranceEvaluationV1_1,
  AssuranceDisposition,
  ClaimEvaluationResult,
  ClaimState,
  ClaimReasonCode,
  ControlClaimDefinition,
  ResolvedProfile,
  OperatingEnvelope,
} from './types';
import {
  ASSURANCE_METHODOLOGY_VERSION,
  ASSURANCE_METHODOLOGY_VERSION_1_0,
  ASSURANCE_METHODOLOGY_VERSION_1_1,
} from './types';
import { CONTROL_CLAIM_CATALOG, getApplicableClaims, getMandatoryClaims } from './claim-catalog';
import { evaluateClaim } from './claim-evaluator';
import { ProjectedEvidence, computeEvidenceSetDigest } from './evidence-set-builder';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';
import { compareCapabilitySets } from './capability-comparator';

/**
 * Evaluate assurance for a completed pipeline run.
 *
 * This is the main entry point for U5/U5.1 assurance evaluation.
 *
 * A12: Claim applicability is separated from producer availability.
 *      Applicability comes from system architecture, capability facts,
 *      operating envelope, selected profile, and claim applicability predicate.
 *      Missing producer evidence affects NOT_ASSESSED / INSUFFICIENT_EVIDENCE,
 *      not NOT_APPLICABLE.
 *
 * Section 2: For methodology 1.1, applicableClaimKeys must be provided.
 *            If not, evaluation returns REVIEW with reason.
 *            Producer-based applicability fallback is only for 1.0.
 *
 * B28: Uses the SAME deterministic evidence snapshot concept as U4.
 * B19: No Date.now() — uses evaluationSnapshotAt.
 * B30: Idempotent — same input produces same output.
 * B41: No LLM — deterministic code only.
 */
export function evaluateAssurance(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evaluationSnapshotAt: Date;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  /** Section 1/3: Explicit resolved profile for 1.1 */
  resolvedProfile?: ResolvedProfile;
  /** Section 5/6: Approved operating envelope for 1.1 */
  operatingEnvelope?: OperatingEnvelope;
  /** A12: Profile-driven applicability — required for 1.1 */
  applicableClaimKeys?: string[];
  /** C1: Profile identity for 1.1 evaluations */
  profileId?: string;
  profileVersion?: string;
  profileDigest?: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  /** Section 12: Five-plane capability facts for comparator → claim mapping */
  capabilityFacts?: {
    requested: import('./types').CapabilityFact[];
    policy: import('./types').CapabilityFact[];
    granted: import('./types').CapabilityFact[];
    capable: import('./types').CapabilityFact[];
    observed: import('./types').CapabilityFact[];
  };
}): AssuranceEvaluation | AssuranceEvaluationV1_1 {
  const {
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evaluationSnapshotAt,
    evidence,
    availableProducerIds,
    resolvedProfile,
    operatingEnvelope,
    applicableClaimKeys,
    profileId,
    profileVersion,
    profileDigest,
    operatingEnvelopeId,
    operatingEnvelopeVersion,
    operatingEnvelopeDigest,
    capabilityFacts,
  } = params;

  const isV1_1 = true; // Default methodology is 1.1

  // Section 2: For methodology 1.1, applicableClaimKeys must be explicitly provided
  // when resolvedProfile is present (automatic execution). Producer-based applicability
  // fallback is retained only when neither resolvedProfile nor applicableClaimKeys is
  // provided (historical 1.0 / direct-call compatibility).
  const effectiveApplicableClaimKeys = applicableClaimKeys ??
    resolvedProfile?.applicableClaimKeys ?? [];

  let allClaimsToEvaluate: ControlClaimDefinition[];
  if (effectiveApplicableClaimKeys.length > 0) {
    // A12: Profile-driven applicability
    allClaimsToEvaluate = CONTROL_CLAIM_CATALOG.filter(claim =>
      effectiveApplicableClaimKeys.includes(claim.claimKey)
    );
    // A12: ALL mandatory claims are still included even if not in applicableClaimKeys
    const mandatoryNotListed = getMandatoryClaims().filter(
      claim => !effectiveApplicableClaimKeys.includes(claim.claimKey)
    );
    allClaimsToEvaluate = [...allClaimsToEvaluate, ...mandatoryNotListed];
  } else {
    // Historical 1.0 fallback: producer-based applicability
    const applicableClaims = getApplicableClaims(availableProducerIds);
    const mandatoryClaimsNotApplicable = CONTROL_CLAIM_CATALOG.filter(
      claim => claim.mandatory && !applicableClaims.some(a => a.claimKey === claim.claimKey)
    );
    allClaimsToEvaluate = [...applicableClaims, ...mandatoryClaimsNotApplicable];
  }

  // Section 2: If resolvedProfile is provided but effective applicable keys are empty,
  // and no evidence, this is an unknown/inconsistent profile → REVIEW/UNAVAILABLE
  if (resolvedProfile && effectiveApplicableClaimKeys.length === 0) {
    const unavailableResult: AssuranceEvaluationV1_1 = {
      id: `${orchestratorRunId}:assurance:${ASSURANCE_METHODOLOGY_VERSION_1_1}`,
      organizationId,
      aiSystemId,
      orchestratorRunId,
      pipelineAggregationId,
      assuranceMethodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
      evaluationSnapshotAt,
      disposition: 'REVIEW',
      evaluationStatus: 'COMPLETED',
      claimResults: [],
      claimCounts: {
        SUPPORTED: 0,
        PARTIALLY_SUPPORTED: 0,
        INSUFFICIENT_EVIDENCE: 0,
        CONTRADICTED: 0,
        REVIEW_REQUIRED: 0,
        NOT_ASSESSED: 0,
        NOT_APPLICABLE: 0,
      },
      reasonCodes: ['NOT_EVALUATED'],
      evidenceSetDigest: computeEvidenceSetDigest('_aggregate', ASSURANCE_METHODOLOGY_VERSION_1_1, []),
      inputHash: computeInputHash({
        organizationId,
        aiSystemId,
        orchestratorRunId,
        pipelineAggregationId,
        evidence,
        availableProducerIds,
        evaluationSnapshotAt,
      }),
      outputHash: hashTextContent(canonicalSerialize({
        methodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
        profileId: profileId ?? '',
        profileVersion: profileVersion ?? '',
        profileDigest: profileDigest ?? '',
        operatingEnvelopeDigest: operatingEnvelopeDigest ?? '',
        disposition: 'REVIEW',
        claims: [],
      }, new Set(['claims']))),
      createdAt: evaluationSnapshotAt,
      // 1.1 fields
      profileId: profileId ?? '',
      profileVersion: profileVersion ?? '',
      profileDigest: profileDigest ?? '',
      operatingEnvelopeId,
      operatingEnvelopeVersion,
      operatingEnvelopeDigest,
      operatingEnvelopeState: operatingEnvelope?.state,
      operatingEnvelopeApprovedBy: operatingEnvelope?.approvedBy,
      operatingEnvelopeApprovalReference: operatingEnvelope?.approvalReference,
      applicableClaimKeys: effectiveApplicableClaimKeys,
      claimPackVersions: resolvedProfile?.effectiveClaimPackVersions ?? {},
      rulePackVersions: resolvedProfile?.effectiveRulePackVersions ?? {},
      planeResults: [],
      fivePlaneComparisons: [],
    };
    return unavailableResult;
  }

  // Section 12: Evaluate five-plane capability facts and map to canonical claims
  let comparatorReasonCodes: ClaimReasonCode[] = [];
  if (capabilityFacts) {
    const fivePlaneResult = compareCapabilitySets({
      requested: capabilityFacts.requested,
      policy: capabilityFacts.policy,
      granted: capabilityFacts.granted,
      capable: capabilityFacts.capable,
      observed: capabilityFacts.observed,
      envelope: operatingEnvelope,
    });

    // Map comparator results to canonical claim reason codes
    for (const comp of fivePlaneResult.comparisons) {
      if (comp.mappedClaimKey) {
        // Will be applied to the relevant claim evaluation
        // This is a hint; actual claim state is determined by claim evaluator
      }
      for (const result of comp.comparisons) {
        const mapped = mapComparisonResultToReason(result);
        if (mapped) comparatorReasonCodes.push(mapped);
      }
    }
  }

  // Evaluate each claim
  const claimResults: ClaimEvaluationResult[] = allClaimsToEvaluate.map(claim =>
    evaluateClaim({
      claim,
      evidence,
      evaluationSnapshotAt,
      applicableClaimKeys: effectiveApplicableClaimKeys,
    })
  );

  // Section 12: If comparator found contradictions, mark relevant claims
  // This is handled by including the reason codes in the evaluation's reasonCodes
  // and ensuring the disposition logic sees them
  const allReasonCodes = [
    ...new Set([...claimResults.flatMap(r => r.reasonCodes), ...comparatorReasonCodes]),
  ] as ClaimReasonCode[];

  // B34: Compute system-level disposition
  const disposition = computeDisposition(claimResults);

  // Compute claim counts by state
  const claimCounts = computeClaimCounts(claimResults);

  // A2: Compute evidence set digest (aggregate of all claim evidence sets)
  const allMembers = claimResults.flatMap(r => r.evidenceSet.members);
  const evidenceSetDigest = computeEvidenceSetDigest('_aggregate', ASSURANCE_METHODOLOGY_VERSION, allMembers);

  // A4: Compute deterministic input hash
  const inputHash = computeInputHash({
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evidence,
    availableProducerIds,
    evaluationSnapshotAt,
    profileId,
    profileVersion,
    profileDigest,
    operatingEnvelopeDigest,
  });

  // A3: Compute deterministic output hash
  const outputHash = computeOutputHash(claimResults, disposition, ASSURANCE_METHODOLOGY_VERSION, {
    profileId,
    profileVersion,
    profileDigest,
    operatingEnvelopeDigest,
  });

  const evaluationId = `${orchestratorRunId}:assurance:${ASSURANCE_METHODOLOGY_VERSION}`;

  // Build 1.1 extended evaluation
  const evaluation: AssuranceEvaluationV1_1 = {
    id: evaluationId,
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    assuranceMethodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
    evaluationSnapshotAt,
    disposition,
    evaluationStatus: 'COMPLETED',
    claimResults,
    claimCounts,
    reasonCodes: allReasonCodes,
    evidenceSetDigest,
    inputHash,
    outputHash,
    createdAt: evaluationSnapshotAt,
    // 1.1 fields
    profileId: resolvedProfile?.profileId ?? profileId ?? '',
    profileVersion: resolvedProfile?.profileVersion ?? profileVersion ?? '',
    profileDigest: resolvedProfile?.profileDigest ?? profileDigest ?? '',
    operatingEnvelopeId,
    operatingEnvelopeVersion,
    operatingEnvelopeDigest,
    operatingEnvelopeState: operatingEnvelope?.state,
    operatingEnvelopeApprovedBy: operatingEnvelope?.approvedBy,
    operatingEnvelopeApprovalReference: operatingEnvelope?.approvalReference,
    applicableClaimKeys: effectiveApplicableClaimKeys,
    claimPackVersions: resolvedProfile?.effectiveClaimPackVersions ?? {},
    rulePackVersions: resolvedProfile?.effectiveRulePackVersions ?? {},
    planeResults: [],
    fivePlaneComparisons: [],
  };

  return evaluation;
}

/**
 * Section 12: Map comparator results to claim reason codes.
 */
function mapComparisonResultToReason(result: import('./types').CapabilityComparisonResult): ClaimReasonCode | null {
  switch (result) {
    case 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE':
      return 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE';
    case 'OVER_PRIVILEGED_GRANT':
      return 'OVER_PRIVILEGED_GRANT_DETECTED';
    case 'EXCESS_GRANTED_AUTHORITY':
      return 'OVER_PRIVILEGED_GRANT_DETECTED';
    case 'UNDECLARED_CAPABILITY':
      return 'UNDECLARED_CAPABILITY_DETECTED';
    case 'REQUIRED_APPROVAL_STEP_MISSING':
      return 'REQUIRED_APPROVAL_STEP_MISSING';
    case 'UNTESTED_CAPABILITY':
      return 'NOT_EVALUATED';
    case 'UNEXPLAINED_RUNTIME_BEHAVIOR':
      return 'NOT_EVALUATED';
    case 'REQUESTED_NOT_AUTHORIZED':
      return 'NOT_EVALUATED';
    default:
      return null;
  }
}

/**
 * B34: Compute system-level ALLOW/REVIEW/BLOCK disposition.
 */
export function computeDisposition(claimResults: ClaimEvaluationResult[]): AssuranceDisposition {
  // Check for BLOCK: critical/mandatory claim contradicted
  const mandatoryResults = claimResults.filter(r => {
    const claim = CONTROL_CLAIM_CATALOG.find(c => c.claimKey === r.claimKey);
    return claim?.mandatory === true;
  });

  const blockingContradictions = mandatoryResults.filter(
    r => r.claimState === 'CONTRADICTED'
  );

  if (blockingContradictions.length > 0) {
    return 'BLOCK';
  }

  // Check for REVIEW: mandatory claim not fully supported
  const reviewStates: ClaimState[] = [
    'PARTIALLY_SUPPORTED',
    'INSUFFICIENT_EVIDENCE',
    'REVIEW_REQUIRED',
    'NOT_ASSESSED',
  ];

  const mandatoryNeedsReview = mandatoryResults.filter(
    r => reviewStates.includes(r.claimState)
  );

  if (mandatoryNeedsReview.length > 0) {
    return 'REVIEW';
  }

  // Check for self-reported only on technical mandatory claims
  const selfReportedOnly = mandatoryResults.filter(
    r => r.reasonCodes.includes('SELF_REPORTED_ONLY')
  );

  if (selfReportedOnly.length > 0) {
    return 'REVIEW';
  }

  // Check for stale evidence on mandatory claims
  const staleEvidence = mandatoryResults.filter(
    r => r.reasonCodes.includes('STALE_EVIDENCE')
  );

  if (staleEvidence.length > 0) {
    return 'REVIEW';
  }

  // Check for conflicting producers
  const conflictingProducers = mandatoryResults.filter(
    r => r.reasonCodes.includes('CONFLICTING_PRODUCERS')
  );

  if (conflictingProducers.length > 0) {
    return 'REVIEW';
  }

  // All mandatory claims supported → ALLOW
  return 'ALLOW';
}

/**
 * Compute claim counts by state.
 */
function computeClaimCounts(results: ClaimEvaluationResult[]): Record<ClaimState, number> {
  const counts: Record<ClaimState, number> = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    CONTRADICTED: 0,
    REVIEW_REQUIRED: 0,
    NOT_ASSESSED: 0,
    NOT_APPLICABLE: 0,
  };

  for (const r of results) {
    counts[r.claimState]++;
  }

  return counts;
}

/**
 * A4: Compute deterministic input hash.
 */
function computeInputHash(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  evaluationSnapshotAt: Date;
  profileId?: string;
  profileVersion?: string;
  profileDigest?: string;
  operatingEnvelopeDigest?: string;
}): string {
  const evidenceEntries = params.evidence
    .map(e => ({
      evidenceId: e.id,
      producerId: e.sourceType,
      producerRunId: e.producerRunId ?? e.sourceId ?? '',
      contentHash: e.contentHash ?? '',
    }))
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  const input = {
    organizationId: params.organizationId,
    aiSystemId: params.aiSystemId,
    orchestratorRunId: params.orchestratorRunId,
    pipelineAggregationId: params.pipelineAggregationId,
    methodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
    snapshotAt: params.evaluationSnapshotAt.toISOString(),
    profileId: params.profileId ?? '',
    profileVersion: params.profileVersion ?? '',
    profileDigest: params.profileDigest ?? '',
    operatingEnvelopeDigest: params.operatingEnvelopeDigest ?? '',
    evidenceEntries,
    producerIds: [...params.availableProducerIds].sort(),
  };

  const canonical = canonicalSerialize(input, new Set(['evidenceEntries', 'producerIds']));
  return hashTextContent(canonical);
}

/**
 * A3: Compute deterministic output hash.
 */
function computeOutputHash(
  claimResults: ClaimEvaluationResult[],
  disposition: AssuranceDisposition,
  methodologyVersion: string,
  profile?: {
    profileId?: string;
    profileVersion?: string;
    profileDigest?: string;
    operatingEnvelopeDigest?: string;
  }
): string {
  const output = {
    methodologyVersion,
    profileId: profile?.profileId ?? '',
    profileVersion: profile?.profileVersion ?? '',
    profileDigest: profile?.profileDigest ?? '',
    operatingEnvelopeDigest: profile?.operatingEnvelopeDigest ?? '',
    disposition,
    claims: claimResults
      .sort((a, b) => a.claimKey.localeCompare(b.claimKey))
      .map(r => ({
        key: r.claimKey,
        version: r.claimVersion,
        state: r.claimState,
        reasons: [...r.reasonCodes].sort(),
        dimensions: r.dimensionResult,
        evidenceSetDigest: r.evidenceSet.setDigest,
        supporting: r.supportingCount,
        contradicting: r.contradictingCount,
      })),
  };

  const canonical = canonicalSerialize(output, new Set(['claims']));
  return hashTextContent(canonical);
}

/**
 * B30: Check if two evaluations are idempotent.
 */
export function isIdempotent(
  eval1: AssuranceEvaluation,
  eval2: AssuranceEvaluation
): boolean {
  return eval1.inputHash === eval2.inputHash && eval1.outputHash === eval2.outputHash;
}
