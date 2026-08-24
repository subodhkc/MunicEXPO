/**
 * U5 B17-B34 / E1 Closure Sections 1,2,5,9,12 — Assurance Evaluator
 *
 * Orchestrates claim evaluations, five-plane capability comparison,
 * comparator → U5 claim merge, and final U5 disposition.
 *
 * U5 remains the canonical Assurance engine. No parallel "profile verdict" bypasses it.
 *
 * B19: Deterministic — no Date.now(), uses evaluationSnapshotAt
 * B30: Idempotent — same input → same output
 * B34: System disposition is deterministic policy evaluation
 * B41: No LLM — deterministic code only
 */

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
  ControlEvidenceSet,
  ControlEvidenceSetMember,
  CapabilityFact,
  CapabilityComparisonRecord,
  ProfileVerdict,
  FivePlaneResult,
  EvidenceMemberRole,
  EpistemicClass,
} from './types';
import { ASSURANCE_METHODOLOGY_VERSION_1_1 } from './types';
import { CONTROL_CLAIM_CATALOG, getMandatoryClaims } from './claim-catalog';
import { evaluateClaim } from './claim-evaluator';
import { ProjectedEvidence, computeEvidenceSetDigest } from './evidence-set-builder';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';
import { compareCapabilitySets, comparisonToClaimState } from './capability-comparator';
import { buildPlaneAvailability } from './capability-fact-projection';

export const ASSURANCE_METHODOLOGY_VERSION = '1.1';

/**
 * Evaluate assurance for a completed pipeline run.
 *
 * Methodology 1.1 requires a successfully resolved profile and approved envelope.
 * No producer-based applicability fallback.
 *
 * Sequence:
 *   base evidence-backed claim evaluation
 *   five-plane capability comparison
 *   exact comparison → claim mapping
 *   merge comparator outcome into affected Control Claim
 *   final claim state
 *   computeDisposition(final claimResults)
 */
export function evaluateAssurance(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evaluationSnapshotAt: Date;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  /** Section 1/3: Explicit resolved profile for 1.1 — required */
  resolvedProfile?: ResolvedProfile;
  /** Section 5/6: Approved operating envelope for 1.1 */
  operatingEnvelope?: OperatingEnvelope;
  /** Section 1: Five-plane capability facts — evidence-backed */
  capabilityFacts?: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  /** C1: Explicit profile identity (optional override) */
  profileId?: string;
  profileVersion?: string;
  profileDigest?: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
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
    capabilityFacts,
    profileId,
    profileVersion,
    profileDigest,
    operatingEnvelopeId,
    operatingEnvelopeVersion,
    operatingEnvelopeDigest,
  } = params;

  // Section 13: Methodology 1.1 requires an explicit successfully resolved profile.
  // No producer-based applicability fallback.
  if (!resolvedProfile) {
    return buildUnavailableEvaluation({
      organizationId,
      aiSystemId,
      orchestratorRunId,
      pipelineAggregationId,
      evaluationSnapshotAt,
      evidence,
      availableProducerIds,
      operatingEnvelope,
      profileId: profileId ?? '',
      profileVersion: profileVersion ?? '',
      profileDigest: profileDigest ?? '',
      reason: 'ASSURANCE_PROFILE_NOT_RESOLVED',
    });
  }

  const effectiveApplicableClaimKeys = resolvedProfile.applicableClaimKeys;

  // Section 14: Determine applicable claims from profile. Mandatory claims are evaluated
  // only when applicable under the resolved profile/system scope.
  const allClaimsToEvaluate = CONTROL_CLAIM_CATALOG.filter(claim =>
    effectiveApplicableClaimKeys.includes(claim.claimKey) ||
    claim.mandatory && effectiveApplicableClaimKeys.includes(claim.claimKey)
  );

  // Base evidence-backed claim evaluation
  let claimResults: ClaimEvaluationResult[] = allClaimsToEvaluate.map(claim =>
    evaluateClaim({
      claim,
      evidence,
      evaluationSnapshotAt,
      applicableClaimKeys: effectiveApplicableClaimKeys,
    })
  );

  let fivePlaneResult: ReturnType<typeof compareCapabilitySets> | undefined;
  let fivePlaneComparisons: CapabilityComparisonRecord[] = [];
  let fivePlaneOverallVerdict: ProfileVerdict = 'ALLOW';

  if (capabilityFacts) {
    fivePlaneResult = compareCapabilitySets({
      requested: capabilityFacts.requested,
      policy: capabilityFacts.policy,
      granted: capabilityFacts.granted,
      capable: capabilityFacts.capable,
      observed: capabilityFacts.observed,
      envelope: operatingEnvelope,
    });

    fivePlaneComparisons = fivePlaneResult.comparisons;
    fivePlaneOverallVerdict = fivePlaneResult.overallVerdict;

    // Section 5: Merge comparator outcomes into canonical U5 claim results
    for (const comparison of fivePlaneComparisons) {
      if (comparison.mappedClaimKey) {
        claimResults = mergeComparisonIntoClaim(
          claimResults,
          comparison,
          evidence,
          effectiveApplicableClaimKeys
        );
      }
    }
  }

  // Section 12: All comparator reason codes are also retained on the evaluation
  const comparatorReasonCodes = fivePlaneComparisons.flatMap(c =>
    c.comparisons.flatMap(comp => mapComparisonResultToReason(comp))
  );
  const allReasonCodes = [
    ...new Set([...claimResults.flatMap(r => r.reasonCodes), ...comparatorReasonCodes]),
  ] as ClaimReasonCode[];

  // B34: Compute system-level disposition from final U5 claim states
  const disposition = computeDisposition(claimResults);

  // Compute claim counts by state
  const claimCounts = computeClaimCounts(claimResults);

  // A2: Compute aggregate evidence set digest (over final claim evidence sets)
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
    resolvedProfile,
    operatingEnvelope,
    capabilityFacts,
  });

  // A3: Compute deterministic output hash
  const outputHash = computeOutputHash(
    claimResults,
    disposition,
    ASSURANCE_METHODOLOGY_VERSION,
    resolvedProfile,
    operatingEnvelope,
    fivePlaneOverallVerdict
  );

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
    profileId: resolvedProfile.profileId,
    profileVersion: resolvedProfile.profileVersion,
    profileDigest: resolvedProfile.profileDigest,
    profileDigestResolved: resolvedProfile.profileDigestResolved,
    operatingEnvelopeId,
    operatingEnvelopeVersion,
    operatingEnvelopeDigest,
    operatingEnvelopeState: operatingEnvelope?.state,
    operatingEnvelopeApprovedBy: operatingEnvelope?.approvedBy,
    operatingEnvelopeApprovedAt: operatingEnvelope?.approvedAt,
    operatingEnvelopeAuthoritySourceLabel: operatingEnvelope?.authoritySourceLabel,
    operatingEnvelopeApprovalReference: operatingEnvelope?.approvalReference,
    claimPackVersions: resolvedProfile.effectiveClaimPackVersions,
    rulePackVersions: resolvedProfile.effectiveRulePackVersions,
    applicableClaimKeys: effectiveApplicableClaimKeys,
    fivePlaneOverallVerdict,
    fivePlaneComparisons,
    capabilityFacts,
    planeAvailability: capabilityFacts ? buildPlaneAvailability(capabilityFacts, availableProducerIds) : undefined,
  };

  return evaluation;
}

function buildUnavailableEvaluation(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evaluationSnapshotAt: Date;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  operatingEnvelope?: OperatingEnvelope;
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  reason: string;
}): AssuranceEvaluationV1_1 {
  const {
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evaluationSnapshotAt,
    evidence,
    availableProducerIds,
    operatingEnvelope,
    profileId,
    profileVersion,
    profileDigest,
    reason,
  } = params;

  const emptyCounts: Record<ClaimState, number> = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    CONTRADICTED: 0,
    REVIEW_REQUIRED: 0,
    NOT_ASSESSED: 0,
    NOT_APPLICABLE: 0,
  };

  return {
    id: `${orchestratorRunId}:assurance:${ASSURANCE_METHODOLOGY_VERSION_1_1}:unavailable`,
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    assuranceMethodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
    evaluationSnapshotAt,
    disposition: 'REVIEW',
    evaluationStatus: 'COMPLETED',
    claimResults: [],
    claimCounts: emptyCounts,
    reasonCodes: ['NOT_EVALUATED', reason as ClaimReasonCode],
    evidenceSetDigest: computeEvidenceSetDigest('_aggregate', ASSURANCE_METHODOLOGY_VERSION_1_1, []),
    inputHash: computeInputHash({
      organizationId, aiSystemId, orchestratorRunId, pipelineAggregationId, evidence, availableProducerIds,
      evaluationSnapshotAt,
    }),
    outputHash: hashTextContent(canonicalSerialize({
      methodologyVersion: ASSURANCE_METHODOLOGY_VERSION_1_1,
      profileId,
      profileVersion,
      profileDigest,
      operatingEnvelopeDigest: operatingEnvelope?.envelopeDigest ?? '',
      disposition: 'REVIEW',
      claims: [],
    }, new Set(['claims']))),
    createdAt: evaluationSnapshotAt,
    profileId,
    profileVersion,
    profileDigest,
    profileDigestResolved: profileDigest,
    operatingEnvelopeId: operatingEnvelope?.envelopeId,
    operatingEnvelopeVersion: operatingEnvelope?.envelopeVersion,
    operatingEnvelopeDigest: operatingEnvelope?.envelopeDigest,
    operatingEnvelopeState: operatingEnvelope?.state,
    operatingEnvelopeApprovedBy: operatingEnvelope?.approvedBy,
    operatingEnvelopeApprovalReference: operatingEnvelope?.approvalReference,
    claimPackVersions: {},
    rulePackVersions: {},
    applicableClaimKeys: [],
    fivePlaneOverallVerdict: 'REVIEW',
    planeResults: [],
    fivePlaneComparisons: [],
    capabilityFacts: {
      requested: [],
      policy: [],
      granted: [],
      capable: [],
      observed: [],
    },
    planeAvailability: buildPlaneAvailability({
      requested: [],
      policy: [],
      granted: [],
      capable: [],
      observed: [],
    }),
  };
}

/**
 * Section 5: Merge a five-plane capability comparison into the affected U5 claim.
 *
 * Precedence:
 * - existing CONTRADICTED remains CONTRADICTED
 * - comparator BLOCK-level contradiction → CONTRADICTED
 * - comparator REVIEW-level result → REVIEW_REQUIRED unless existing is stronger
 * - SUPPORTED must never overwrite a contradiction
 * - NOT_ASSESSED + qualifying contradiction → CONTRADICTED
 */
function mergeComparisonIntoClaim(
  claimResults: ClaimEvaluationResult[],
  comparison: CapabilityComparisonRecord,
  evidence: ProjectedEvidence[],
  applicableClaimKeys: string[]
): ClaimEvaluationResult[] {
  const claimKey = comparison.mappedClaimKey!;
  const claim = CONTROL_CLAIM_CATALOG.find(c => c.claimKey === claimKey);
  if (!claim) return claimResults;

  const existingIndex = claimResults.findIndex(r => r.claimKey === claimKey);

  // If claim not yet in results, create an initial NOT_ASSESSED result
  let existing: ClaimEvaluationResult;
  if (existingIndex === -1) {
    existing = {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'NOT_ASSESSED',
      reasonCodes: [],
      dimensionResult: {
        authorizedScope: 'MISSING',
        codeCapability: 'MISSING',
        observedRuntime: 'MISSING',
      },
      evidenceSet: {
        claimKey: claim.claimKey,
        claimVersion: claim.version,
        setDigest: computeEvidenceSetDigest(claim.claimKey, claim.version, []),
        members: [],
      },
      supportingCount: 0,
      contradictingCount: 0,
      excludedCount: 0,
      explanation: '',
    };
  } else {
    existing = claimResults[existingIndex];
  }

  // Get claim state + reason codes from comparator using canonical verdict
  const mapped = comparisonToClaimState(comparison.comparisons, comparison.verdict);

  // Determine merged claim state (precedence)
  let mergedState: ClaimState = existing.claimState;
  if (existing.claimState === 'CONTRADICTED') {
    // existing CONTRADICTED remains
    mergedState = 'CONTRADICTED';
  } else if (mapped.claimState === 'CONTRADICTED') {
    mergedState = 'CONTRADICTED';
  } else if (mapped.claimState === 'REVIEW_REQUIRED') {
    mergedState = rankState(mergedState) < rankState('REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : mergedState;
  } else if (mapped.claimState === 'SUPPORTED' && existing.claimState === 'NOT_ASSESSED') {
    mergedState = 'SUPPORTED';
  }

  // Merge reason codes (dedupe)
  const mergedReasonCodes = [...new Set([...existing.reasonCodes, ...mapped.reasonCodes])];

  // Section 7: Add comparator evidence to the claim's evidence set
  const members = [...existing.evidenceSet.members];
  for (const evidenceId of comparison.evidenceIds) {
    const ev = evidence.find(e => e.id === evidenceId);
    if (!ev) continue;
    const role = determineEvidenceRole(comparison.comparisons, ev);
    const epistemicClass: EpistemicClass =
      ev.sourceType === 'saas-runtime' ? 'RUNTIME_EMPIRICAL' :
      ev.sourceType === 'saas-static' ? 'HAIEC_NATIVE_TECHNICAL' :
      ev.sourceType === 'saas-inventory' ? 'OBSERVED_CONFIGURATION' : 'DERIVED';
    const member: ControlEvidenceSetMember = {
      evidenceId: ev.id,
      role,
      epistemicClass,
      producerId: resolveCanonicalProducerId(ev.sourceType) ?? ev.sourceType,
      contentHash: ev.contentHash ?? undefined,
    };
    if (!members.some(m => m.evidenceId === ev.id)) {
      members.push(member);
    }
  }

  const updated: ClaimEvaluationResult = {
    ...existing,
    claimState: mergedState,
    reasonCodes: mergedReasonCodes as ClaimReasonCode[],
    evidenceSet: {
      ...existing.evidenceSet,
      setDigest: computeEvidenceSetDigest(claim.claimKey, claim.version, members),
      members,
    },
    contradictingCount: mergedState === 'CONTRADICTED' ? (existing.contradictingCount + 1) : existing.contradictingCount,
  };

  if (existingIndex === -1) {
    return [...claimResults, updated];
  }
  return claimResults.map((r, i) => (i === existingIndex ? updated : r));
}

function rankState(state: ClaimState): number {
  const ranks: Record<ClaimState, number> = {
    NOT_APPLICABLE: 0,
    SUPPORTED: 1,
    PARTIALLY_SUPPORTED: 2,
    NOT_ASSESSED: 3,
    INSUFFICIENT_EVIDENCE: 4,
    REVIEW_REQUIRED: 5,
    CONTRADICTED: 6,
  };
  return ranks[state] ?? 0;
}

function determineEvidenceRole(
  comparisons: string[],
  ev: ProjectedEvidence
): EvidenceMemberRole {
  if (comparisons.includes('OBSERVED_OUTSIDE_OPERATING_ENVELOPE') ||
      comparisons.includes('OVER_PRIVILEGED_GRANT') ||
      comparisons.includes('UNDECLARED_CAPABILITY') ||
      comparisons.includes('EXCESS_GRANTED_AUTHORITY') ||
      comparisons.includes('REQUIRED_APPROVAL_STEP_MISSING')) {
    return 'CONTRADICTING';
  }
  if (comparisons.includes('ALIGNED')) return 'SUPPORTING';
  return 'CONTEXT_ONLY';
}

function mapComparisonResultToReason(result: string): ClaimReasonCode[] {
  switch (result) {
    case 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE':
      return ['OBSERVED_OUTSIDE_OPERATING_ENVELOPE', 'CAPABILITY_CONTRADICTION'];
    case 'OVER_PRIVILEGED_GRANT':
      return ['OVER_PRIVILEGED_GRANT_DETECTED'];
    case 'EXCESS_GRANTED_AUTHORITY':
      return ['EXCESS_GRANTED_AUTHORITY'];
    case 'UNDECLARED_CAPABILITY':
      return ['UNDECLARED_CAPABILITY_DETECTED'];
    case 'REQUIRED_APPROVAL_STEP_MISSING':
      return ['REQUIRED_APPROVAL_STEP_MISSING', 'CAPABILITY_CONTRADICTION'];
    case 'UNTESTED_CAPABILITY':
      return ['UNTESTED_CAPABILITY'];
    case 'UNEXPLAINED_RUNTIME_BEHAVIOR':
      return ['UNEXPLAINED_RUNTIME_BEHAVIOR'];
    case 'REQUESTED_NOT_AUTHORIZED':
      return ['REQUESTED_NOT_AUTHORIZED'];
    case 'EFFECTIVE_GRANT_NOT_PROVIDED':
      return ['EFFECTIVE_GRANT_NOT_PROVIDED'];
    case 'CAPABILITY_OUTSIDE_POLICY':
      return ['CAPABILITY_OUTSIDE_POLICY'];
    case 'SCOPE_EXCEEDS_POLICY':
      return ['SCOPE_EXCEEDS_POLICY'];
    case 'TARGET_COUNT_EXCEEDS_POLICY':
      return ['TARGET_COUNT_EXCEEDS_POLICY'];
    case 'CHANGE_MAGNITUDE_EXCEEDS_POLICY':
      return ['CHANGE_MAGNITUDE_EXCEEDS_POLICY'];
    case 'ALIGNED':
      return ['SUPPORTED_BY_RUNTIME_EVIDENCE'];
    default:
      return [];
  }
}

export function computeDisposition(claimResults: ClaimEvaluationResult[]): AssuranceDisposition {
  const mandatoryResults = claimResults.filter(r => {
    const claim = CONTROL_CLAIM_CATALOG.find(c => c.claimKey === r.claimKey);
    return claim?.mandatory === true;
  });

  const blockingContradictions = mandatoryResults.filter(r => r.claimState === 'CONTRADICTED');
  if (blockingContradictions.length > 0) return 'BLOCK';

  const reviewStates: ClaimState[] = [
    'PARTIALLY_SUPPORTED',
    'INSUFFICIENT_EVIDENCE',
    'REVIEW_REQUIRED',
    'NOT_ASSESSED',
  ];
  const mandatoryNeedsReview = mandatoryResults.filter(r => reviewStates.includes(r.claimState));
  if (mandatoryNeedsReview.length > 0) return 'REVIEW';

  const selfReportedOnly = mandatoryResults.filter(r => r.reasonCodes.includes('SELF_REPORTED_ONLY'));
  if (selfReportedOnly.length > 0) return 'REVIEW';

  const staleEvidence = mandatoryResults.filter(r => r.reasonCodes.includes('STALE_EVIDENCE'));
  if (staleEvidence.length > 0) return 'REVIEW';

  const conflictingProducers = mandatoryResults.filter(r => r.reasonCodes.includes('CONFLICTING_PRODUCERS'));
  if (conflictingProducers.length > 0) return 'REVIEW';

  return 'ALLOW';
}

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
  for (const r of results) counts[r.claimState]++;
  return counts;
}

function computeInputHash(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  evaluationSnapshotAt: Date;
  resolvedProfile?: ResolvedProfile;
  profileId?: string;
  profileVersion?: string;
  profileDigest?: string;
  operatingEnvelope?: OperatingEnvelope;
  capabilityFacts?: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
}): string {
  const evidenceEntries = params.evidence
    .map(e => ({
      evidenceId: e.id,
      producerId: resolveCanonicalProducerId(e.sourceType) ?? e.sourceType,
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
    profileId: params.resolvedProfile?.profileId ?? params.profileId ?? '',
    profileVersion: params.resolvedProfile?.profileVersion ?? params.profileVersion ?? '',
    profileDigest: params.resolvedProfile?.profileDigest ?? params.profileDigest ?? '',
    profileDigestResolved: params.resolvedProfile?.profileDigestResolved ?? '',
    claimPackVersions: params.resolvedProfile?.effectiveClaimPackVersions ?? {},
    rulePackVersions: params.resolvedProfile?.effectiveRulePackVersions ?? {},
    operatingEnvelopeDigest: params.operatingEnvelope?.envelopeDigest ?? '',
    operatingEnvelopeApprovedBy: params.operatingEnvelope?.approvedBy ?? '',
    operatingEnvelopeState: params.operatingEnvelope?.state ?? '',
    fivePlaneRequested: params.capabilityFacts?.requested.map(f => f.evidenceId).sort() ?? [],
    fivePlanePolicy: params.capabilityFacts?.policy.map(f => f.evidenceId).sort() ?? [],
    fivePlaneGranted: params.capabilityFacts?.granted.map(f => f.evidenceId).sort() ?? [],
    fivePlaneCapable: params.capabilityFacts?.capable.map(f => f.evidenceId).sort() ?? [],
    fivePlaneObserved: params.capabilityFacts?.observed.map(f => f.evidenceId).sort() ?? [],
    evidenceEntries,
    producerIds: [...params.availableProducerIds].sort(),
  };

  const canonical = canonicalSerialize(input, new Set([
    'evidenceEntries', 'producerIds', 'fivePlaneRequested', 'fivePlanePolicy',
    'fivePlaneGranted', 'fivePlaneCapable', 'fivePlaneObserved',
  ]));
  return hashTextContent(canonical);
}

function computeOutputHash(
  claimResults: ClaimEvaluationResult[],
  disposition: AssuranceDisposition,
  methodologyVersion: string,
  resolvedProfile?: ResolvedProfile,
  operatingEnvelope?: OperatingEnvelope,
  fivePlaneOverallVerdict?: ProfileVerdict,
): string {
  const output = {
    methodologyVersion,
    profileId: resolvedProfile?.profileId ?? '',
    profileVersion: resolvedProfile?.profileVersion ?? '',
    profileDigest: resolvedProfile?.profileDigest ?? '',
    profileDigestResolved: resolvedProfile?.profileDigestResolved ?? '',
    claimPackVersions: resolvedProfile?.effectiveClaimPackVersions ?? {},
    rulePackVersions: resolvedProfile?.effectiveRulePackVersions ?? {},
    operatingEnvelopeDigest: operatingEnvelope?.envelopeDigest ?? '',
    operatingEnvelopeApprovedBy: operatingEnvelope?.approvedBy ?? '',
    fivePlaneOverallVerdict: fivePlaneOverallVerdict ?? 'ALLOW',
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

export function isIdempotent(
  eval1: AssuranceEvaluation,
  eval2: AssuranceEvaluation
): boolean {
  return eval1.inputHash === eval2.inputHash && eval1.outputHash === eval2.outputHash;
}
