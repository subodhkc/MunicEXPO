/**
 * U5 B17-B34 — Assurance Evaluator
 *
 * Orchestrates claim evaluations and computes system-level disposition.
 *
 * B19: Deterministic — no Date.now(), uses evaluationSnapshotAt
 * B30: Idempotent — same input → same output
 * B34: System disposition is deterministic policy evaluation
 * B41: No LLM — deterministic code only
 */

import { createHash } from 'crypto';
import {
  AssuranceEvaluation,
  AssuranceDisposition,
  ClaimEvaluationResult,
  ClaimState,
  ClaimReasonCode,
  ControlClaimDefinition,
} from './types';
import {
  ASSURANCE_METHODOLOGY_VERSION,
  ASSURANCE_METHODOLOGY_VERSION_1_1,
} from './types';
import { CONTROL_CLAIM_CATALOG, getApplicableClaims, getMandatoryClaims } from './claim-catalog';
import { evaluateClaim } from './claim-evaluator';
import { ProjectedEvidence, computeEvidenceSetDigest } from './evidence-set-builder';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

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
  /** A12: Profile-driven applicability — if provided, overrides producer-based */
  applicableClaimKeys?: string[];
  /** C1: Profile identity for 1.1 evaluations */
  profileId?: string;
  profileVersion?: string;
  profileDigest?: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
}): AssuranceEvaluation {
  const {
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evaluationSnapshotAt,
    evidence,
    availableProducerIds,
    applicableClaimKeys,
    profileId,
    profileVersion,
    profileDigest,
    operatingEnvelopeId,
    operatingEnvelopeVersion,
    operatingEnvelopeDigest,
  } = params;

  // A12: Determine applicable claims
  // If profile-driven applicability is provided, use it.
  // Otherwise, fall back to producer-based applicability (1.0 behavior).
  let allClaimsToEvaluate: ControlClaimDefinition[];
  if (applicableClaimKeys && applicableClaimKeys.length > 0) {
    // A12: Profile-driven applicability
    allClaimsToEvaluate = CONTROL_CLAIM_CATALOG.filter(claim =>
      applicableClaimKeys.includes(claim.claimKey)
    );
    // A12: ALL mandatory claims are still included even if not in applicableClaimKeys
    // — a mandatory claim not in the applicable list is NOT_APPLICABLE (if profile says so)
    // or NOT_ASSESSED (if producer is missing). Missing producer → NOT_ASSESSED, not NOT_APPLICABLE.
    const mandatoryNotListed = getMandatoryClaims().filter(
      claim => !applicableClaimKeys.includes(claim.claimKey)
    );
    allClaimsToEvaluate = [...allClaimsToEvaluate, ...mandatoryNotListed];
  } else {
    // 1.0 fallback: producer-based applicability
    const applicableClaims = getApplicableClaims(availableProducerIds);
    const mandatoryClaimsNotApplicable = CONTROL_CLAIM_CATALOG.filter(
      claim => claim.mandatory && !applicableClaims.some(a => a.claimKey === claim.claimKey)
    );
    allClaimsToEvaluate = [...applicableClaims, ...mandatoryClaimsNotApplicable];
  }

  // Evaluate each claim
  const claimResults: ClaimEvaluationResult[] = allClaimsToEvaluate.map(claim =>
    evaluateClaim({
      claim,
      evidence,
      evaluationSnapshotAt,
      applicableClaimKeys,
    })
  );

  // B34: Compute system-level disposition
  const disposition = computeDisposition(claimResults);

  // Compute claim counts by state
  const claimCounts = computeClaimCounts(claimResults);

  // Collect all reason codes
  const reasonCodes = [...new Set(claimResults.flatMap(r => r.reasonCodes))] as ClaimReasonCode[];

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

  return {
    id: evaluationId,
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    assuranceMethodologyVersion: ASSURANCE_METHODOLOGY_VERSION,
    evaluationSnapshotAt,
    disposition,
    evaluationStatus: 'COMPLETED',
    claimResults,
    claimCounts,
    reasonCodes,
    evidenceSetDigest,
    inputHash,
    outputHash,
    createdAt: evaluationSnapshotAt, // B19: deterministic — not Date.now()
  };
}

/**
 * B34: Compute system-level ALLOW/REVIEW/BLOCK disposition.
 *
 * BLOCK when: an applicable mandatory/critical claim is CONTRADICTED
 *   OR an explicitly configured blocking condition is satisfied.
 *
 * REVIEW when: a mandatory claim is PARTIALLY_SUPPORTED / INSUFFICIENT_EVIDENCE /
 *   REVIEW_REQUIRED / NOT_ASSESSED,
 *   OR required evidence is stale,
 *   OR required technical evidence is self-reported only,
 *   OR producer conflict cannot be automatically resolved.
 *
 * ALLOW only when: all applicable mandatory claims are SUPPORTED
 *   AND no blocking contradiction exists
 *   AND required Evidence dimensions are satisfied.
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
 * A4: Compute deterministic input hash using existing canonicalSerialize.
 *
 * Commits to:
 * - organization, system, run, snapshot, methodology
 * - profile ID/version/digest (1.1)
 * - operating-envelope digest (1.1)
 * - exact Evidence IDs with paired producerId, producerRunId, contentHash
 *   (ordered list sorted by stable identity — not parallel arrays)
 * - producer IDs
 *
 * Uses canonicalSerialize for proper nested key sorting.
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
  // A4: Ordered list of { evidenceId, producerId, producerRunId, contentHash }
  // sorted deterministically by stable identity — NOT parallel arrays
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
    methodologyVersion: ASSURANCE_METHODOLOGY_VERSION,
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
 * A3: Compute deterministic output hash using existing canonicalSerialize.
 *
 * Commits to:
 * - methodology version
 * - profile identity/version/digest (1.1)
 * - operating-envelope digest (1.1)
 * - disposition
 * - claim key/version, claim state, reason codes
 * - dimension/plane results
 * - Evidence Set digest
 * - support/contradiction counts
 *
 * Uses canonicalSerialize for proper nested key sorting.
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
 * B30: Check if two evaluations are idempotent (same input → same output).
 */
export function isIdempotent(
  eval1: AssuranceEvaluation,
  eval2: AssuranceEvaluation
): boolean {
  return eval1.inputHash === eval2.inputHash && eval1.outputHash === eval2.outputHash;
}
