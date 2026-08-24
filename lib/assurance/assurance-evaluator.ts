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
import { ASSURANCE_METHODOLOGY_VERSION } from './types';
import { CONTROL_CLAIM_CATALOG, getApplicableClaims } from './claim-catalog';
import { evaluateClaim } from './claim-evaluator';
import { ProjectedEvidence } from './evidence-set-builder';
import { computeEvidenceSetDigest } from './evidence-set-builder';

/**
 * Evaluate assurance for a completed pipeline run.
 *
 * This is the main entry point for U5 assurance evaluation.
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
}): AssuranceEvaluation {
  const {
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evaluationSnapshotAt,
    evidence,
    availableProducerIds,
  } = params;

  // B37/B38: Get applicable claims based on available producer capabilities.
  // ALL mandatory claims are included even if their producers are not available —
  // a mandatory claim with no available producer is NOT_ASSESSED, which produces REVIEW.
  const applicableClaims = getApplicableClaims(availableProducerIds);
  const mandatoryClaimsNotApplicable = CONTROL_CLAIM_CATALOG.filter(
    claim => claim.mandatory && !applicableClaims.some(a => a.claimKey === claim.claimKey)
  );
  const allClaimsToEvaluate = [...applicableClaims, ...mandatoryClaimsNotApplicable];

  // Evaluate each claim
  const claimResults: ClaimEvaluationResult[] = allClaimsToEvaluate.map(claim =>
    evaluateClaim({
      claim,
      evidence,
      evaluationSnapshotAt,
    })
  );

  // B34: Compute system-level disposition
  const disposition = computeDisposition(claimResults);

  // Compute claim counts by state
  const claimCounts = computeClaimCounts(claimResults);

  // Collect all reason codes
  const reasonCodes = [...new Set(claimResults.flatMap(r => r.reasonCodes))] as ClaimReasonCode[];

  // B20: Compute evidence set digest (aggregate of all claim evidence sets)
  const allMembers = claimResults.flatMap(r => r.evidenceSet.members);
  const evidenceSetDigest = computeEvidenceSetDigest('_aggregate', ASSURANCE_METHODOLOGY_VERSION, allMembers);

  // B19: Compute deterministic input hash
  const inputHash = computeInputHash({
    organizationId,
    aiSystemId,
    orchestratorRunId,
    pipelineAggregationId,
    evidence,
    availableProducerIds,
    evaluationSnapshotAt,
  });

  // B19: Compute deterministic output hash
  const outputHash = computeOutputHash(claimResults, disposition, ASSURANCE_METHODOLOGY_VERSION);

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
 * B19: Compute deterministic input hash.
 * Commits to: org, system, run, evidence IDs + content hashes + producer IDs + snapshot time.
 */
function computeInputHash(params: {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  evidence: ProjectedEvidence[];
  availableProducerIds: string[];
  evaluationSnapshotAt: Date;
}): string {
  const input = {
    organizationId: params.organizationId,
    aiSystemId: params.aiSystemId,
    orchestratorRunId: params.orchestratorRunId,
    pipelineAggregationId: params.pipelineAggregationId,
    methodologyVersion: ASSURANCE_METHODOLOGY_VERSION,
    snapshotAt: params.evaluationSnapshotAt.toISOString(),
    evidenceIds: params.evidence.map(e => e.id).sort(),
    contentHashes: params.evidence.map(e => e.contentHash ?? '').sort(),
    producerIds: [...params.availableProducerIds].sort(),
  };

  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * B19: Compute deterministic output hash.
 * Commits to: claim results + disposition + methodology version.
 */
function computeOutputHash(
  claimResults: ClaimEvaluationResult[],
  disposition: AssuranceDisposition,
  methodologyVersion: string
): string {
  const output = {
    methodologyVersion,
    disposition,
    claims: claimResults
      .sort((a, b) => a.claimKey.localeCompare(b.claimKey))
      .map(r => ({
        key: r.claimKey,
        state: r.claimState,
        reasons: [...r.reasonCodes].sort(),
        digest: r.evidenceSet.setDigest,
        supporting: r.supportingCount,
        contradicting: r.contradictingCount,
      })),
  };

  const canonical = JSON.stringify(output, Object.keys(output).sort());
  return createHash('sha256').update(canonical).digest('hex');
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
