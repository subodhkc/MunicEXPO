/**
 * U5 B25-B32 — Claim Evaluator
 *
 * Deterministic evaluation of a single control claim against an evidence set.
 *
 * Rules:
 * - SELF_REPORTED cannot SUPPORT a technical claim
 * - UNKNOWN coverage cannot produce SUPPORTED when coverage is required
 * - 0 findings + UNKNOWN coverage ≠ SUPPORTED
 * - Producer failure ≠ SUPPORTED
 * - Contradicting evidence takes precedence over supportive absence
 * - No Date.now() — uses evaluationSnapshotAt
 * - No LLM — deterministic code only
 */

import {
  ClaimEvaluationResult,
  ClaimReasonCode,
  ClaimState,
  ControlClaimDefinition,
  DimensionResult,
  ThreeDimensionResult,
} from './types';
import { buildControlEvidenceSet, ProjectedEvidence } from './evidence-set-builder';
import { isSelfReportedClass, isExternalClass, isTechnicalClass } from './epistemic-classifier';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

/**
 * Evaluate a single claim against projected evidence.
 */
export function evaluateClaim(params: {
  claim: ControlClaimDefinition;
  evidence: ProjectedEvidence[];
  evaluationSnapshotAt: Date;
}): ClaimEvaluationResult {
  const { claim, evidence, evaluationSnapshotAt } = params;

  // Build the evidence set
  const evidenceSet = buildControlEvidenceSet({ claim, evidence, evaluationSnapshotAt });

  const supporting = evidenceSet.members.filter(m => m.role === 'SUPPORTING');
  const contradicting = evidenceSet.members.filter(m => m.role === 'CONTRADICTING');
  const excluded = evidenceSet.members.filter(m => m.role === 'EXCLUDED');

  // ─── B13: Contradiction precedence ──────────────────────────────────────
  // Contradicting qualifying evidence takes precedence over supportive absence
  if (contradicting.length > 0) {
    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'CONTRADICTED',
      reasonCodes: ['CONTRADICTING_FINDING'],
      dimensionResult: computeDimensionResult(claim, supporting, contradicting),
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: `Claim contradicted by ${contradicting.length} piece(s) of qualifying evidence.`,
    };
  }

  // ─── B12: Producer failure ──────────────────────────────────────────────
  const failedProducers = evidence.filter(
    ev => ev.producerOutcome === 'FAILED' || ev.producerOutcome === 'TIMEOUT' || ev.producerOutcome === 'ERROR'
  );
  if (failedProducers.length > 0 && supporting.length === 0) {
    const reason: ClaimReasonCode = failedProducers.some(ev => ev.producerOutcome === 'TIMEOUT')
      ? 'PRODUCER_TIMEOUT'
      : 'PRODUCER_FAILED';
    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'INSUFFICIENT_EVIDENCE',
      reasonCodes: [reason],
      dimensionResult: computeDimensionResult(claim, supporting, contradicting),
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: `Required producer(s) failed: ${failedProducers.map(ev => ev.sourceType).join(', ')}`,
    };
  }

  // ─── B28: Self-reported only ────────────────────────────────────────────
  // Check if the only evidence available is self-reported (even if excluded)
  // This takes precedence over coverage unknown and not-assessed checks
  const selfReportedExcluded = excluded.filter(m => m.exclusionReason === 'SELF_REPORTED_NOT_ALLOWED');
  const selfReportedSupporting = supporting.filter(m => isSelfReportedClass(m.epistemicClass));
  const technicalSupporting = supporting.filter(m => isTechnicalClass(m.epistemicClass));
  if (
    !claim.selfReportedCanSupport &&
    technicalSupporting.length === 0 &&
    (selfReportedSupporting.length > 0 || selfReportedExcluded.length > 0)
  ) {
    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'INSUFFICIENT_EVIDENCE',
      reasonCodes: ['SELF_REPORTED_ONLY'],
      dimensionResult: computeDimensionResult(claim, supporting, contradicting),
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: 'Only self-reported evidence available — cannot support a technical claim.',
    };
  }

  // ─── B29: External evidence only ────────────────────────────────────────
  // Check supporting AND context_only for external evidence
  const contextOnly = evidenceSet.members.filter(m => m.role === 'CONTEXT_ONLY');
  const externalInAny = [...supporting, ...contextOnly].filter(m => isExternalClass(m.epistemicClass));
  const nativeSupporting = supporting.filter(m => m.epistemicClass === 'HAIEC_NATIVE_TECHNICAL');
  if (externalInAny.length > 0 && nativeSupporting.length === 0 && !claim.externalCanSupportAlone) {
    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'REVIEW_REQUIRED',
      reasonCodes: ['EXTERNAL_SOURCE_ONLY'],
      dimensionResult: computeDimensionResult(claim, supporting, contradicting),
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: 'Only external evidence available — HAIEC-native evidence required for this claim.',
    };
  }

  // ─── B11/B27: Zero findings + UNKNOWN coverage ──────────────────────────
  if (supporting.length === 0 && claim.coverageRequirement !== null) {
    // Check if any evidence had UNKNOWN coverage
    const unknownCoverageEvidence = evidence.filter(
      ev => ev.coverageStatus === 'UNKNOWN' || !ev.coverageStatus
    );
    if (unknownCoverageEvidence.length > 0) {
      return {
        claimKey: claim.claimKey,
        claimVersion: claim.version,
        claimState: 'INSUFFICIENT_EVIDENCE',
        reasonCodes: ['COVERAGE_UNKNOWN'],
        dimensionResult: computeDimensionResult(claim, supporting, contradicting),
        evidenceSet,
        supportingCount: supporting.length,
        contradictingCount: contradicting.length,
        excludedCount: excluded.length,
        explanation: 'Coverage is UNKNOWN — absence of findings cannot become proof of absence.',
      };
    }
  }

  // ─── No supporting evidence at all ──────────────────────────────────────
  if (supporting.length === 0) {
    // Check if any evidence exists for the required producers (using canonical IDs)
    const requiredProducerEvidence = evidence.filter(ev =>
      claim.requiredProducerCapabilities.some(rp =>
        rp === ev.sourceType || rp === resolveCanonicalProducerId(ev.sourceType)
      )
    );

    if (requiredProducerEvidence.length === 0) {
      // No evidence from required producers at all
      return {
        claimKey: claim.claimKey,
        claimVersion: claim.version,
        claimState: 'NOT_ASSESSED',
        reasonCodes: ['NOT_EVALUATED'],
        dimensionResult: computeDimensionResult(claim, supporting, contradicting),
        evidenceSet,
        supportingCount: supporting.length,
        contradictingCount: contradicting.length,
        excludedCount: excluded.length,
        explanation: 'No qualifying evaluation of this claim occurred.',
      };
    }

    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'INSUFFICIENT_EVIDENCE',
      reasonCodes: ['MISSING_REQUIRED_TECHNICAL_EVIDENCE'],
      dimensionResult: computeDimensionResult(claim, supporting, contradicting),
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: 'Evidence exists but is not sufficient to substantiate the claim.',
    };
  }

  // ─── B25: Check required dimensions ─────────────────────────────────────
  const dimensionResult = computeDimensionResult(claim, supporting, contradicting);
  const missingDimensions = (Object.entries(dimensionResult) as [string, DimensionResult][])
    .filter(([_, result]) => result === 'MISSING')
    .map(([dim]) => dim);

  if (missingDimensions.length > 0 && claim.requiredDimensions.length > 0) {
    // Check if all required dimensions are satisfied
    const requiredDimsMissing = claim.requiredDimensions.some(dim => {
      const result = dimensionResult[dimToKey(dim)];
      return result === 'MISSING';
    });

    if (requiredDimsMissing) {
      return {
        claimKey: claim.claimKey,
        claimVersion: claim.version,
        claimState: 'PARTIALLY_SUPPORTED',
        reasonCodes: ['MISSING_REQUIRED_DIMENSION', 'PARTIAL_REQUIREMENTS_MET'],
        dimensionResult,
        evidenceSet,
        supportingCount: supporting.length,
        contradictingCount: contradicting.length,
        excludedCount: excluded.length,
        explanation: `Supportive evidence exists, but required dimensions missing: ${missingDimensions.join(', ')}`,
      };
    }
  }

  // ─── B25: Coverage check ────────────────────────────────────────────────
  if (claim.coverageRequirement !== null) {
    const supportingWithCoverage = supporting.filter(m => {
      const ev = evidence.find(e => e.id === m.evidenceId);
      return ev && ev.coverageStatus === 'COMPLETE';
    });

    if (supportingWithCoverage.length === 0) {
      // Check if coverage is insufficient
      const partialCoverageEvidence = evidence.filter(ev => ev.coverageStatus === 'PARTIAL');
      if (partialCoverageEvidence.length > 0) {
        return {
          claimKey: claim.claimKey,
          claimVersion: claim.version,
          claimState: 'PARTIALLY_SUPPORTED',
          reasonCodes: ['COVERAGE_INSUFFICIENT', 'PARTIAL_REQUIREMENTS_MET'],
          dimensionResult,
          evidenceSet,
          supportingCount: supporting.length,
          contradictingCount: contradicting.length,
          excludedCount: excluded.length,
          explanation: `Coverage is PARTIAL — claim partially supported with incomplete coverage.`,
        };
      }
    }
  }

  // ─── B25: Stale evidence check ──────────────────────────────────────────
  const staleExcluded = excluded.filter(m => m.exclusionReason === 'STALE');
  if (staleExcluded.length > 0 && supporting.length === 0) {
    return {
      claimKey: claim.claimKey,
      claimVersion: claim.version,
      claimState: 'REVIEW_REQUIRED',
      reasonCodes: ['STALE_EVIDENCE'],
      dimensionResult,
      evidenceSet,
      supportingCount: supporting.length,
      contradictingCount: contradicting.length,
      excludedCount: excluded.length,
      explanation: 'Required evidence is stale — fresh evidence needed.',
    };
  }

  // ─── SUPPORTED ──────────────────────────────────────────────────────────
  const reasonCodes: ClaimReasonCode[] = [];
  if (technicalSupporting.length > 0) {
    reasonCodes.push('SUPPORTED_BY_REQUIRED_TECHNICAL_EVIDENCE');
  }
  if (supporting.some(m => m.epistemicClass === 'RUNTIME_EMPIRICAL')) {
    reasonCodes.push('SUPPORTED_BY_RUNTIME_EVIDENCE');
  }
  if (supporting.some(m => m.epistemicClass === 'OBSERVED_CONFIGURATION')) {
    reasonCodes.push('SUPPORTED_BY_CONFIGURATION_EVIDENCE');
  }
  if (supporting.some(m => m.epistemicClass === 'SELF_REPORTED')) {
    reasonCodes.push('SUPPORTED_BY_CONFIGURATION_EVIDENCE');
  }

  return {
    claimKey: claim.claimKey,
    claimVersion: claim.version,
    claimState: 'SUPPORTED',
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['SUPPORTED_BY_REQUIRED_TECHNICAL_EVIDENCE'],
    dimensionResult,
    evidenceSet,
    supportingCount: supporting.length,
    contradictingCount: contradicting.length,
    excludedCount: excluded.length,
    explanation: `Claim supported by ${supporting.length} piece(s) of qualifying evidence within evaluated scope.`,
  };
}

/**
 * Compute three-dimension result for a claim.
 */
function computeDimensionResult(
  claim: ControlClaimDefinition,
  supporting: Array<{ epistemicClass: string }>,
  contradicting: Array<{ epistemicClass: string }>
): ThreeDimensionResult {
  const result: ThreeDimensionResult = {
    authorizedScope: 'NOT_REQUIRED',
    codeCapability: 'NOT_REQUIRED',
    observedRuntime: 'NOT_REQUIRED',
  };

  if (claim.requiredDimensions.includes('AUTHORIZED_SCOPE')) {
    result.authorizedScope = computeDimensionState(
      supporting.filter(m => m.epistemicClass === 'OBSERVED_CONFIGURATION' || m.epistemicClass === 'SELF_REPORTED' || m.epistemicClass === 'DERIVED'),
      contradicting.filter(m => m.epistemicClass === 'OBSERVED_CONFIGURATION' || m.epistemicClass === 'SELF_REPORTED' || m.epistemicClass === 'DERIVED')
    );
  }

  if (claim.requiredDimensions.includes('CODE_CAPABILITY')) {
    result.codeCapability = computeDimensionState(
      supporting.filter(m => m.epistemicClass === 'HAIEC_NATIVE_TECHNICAL' || m.epistemicClass === 'EXTERNAL_TECHNICAL'),
      contradicting.filter(m => m.epistemicClass === 'HAIEC_NATIVE_TECHNICAL' || m.epistemicClass === 'EXTERNAL_TECHNICAL')
    );
  }

  if (claim.requiredDimensions.includes('OBSERVED_RUNTIME')) {
    result.observedRuntime = computeDimensionState(
      supporting.filter(m => m.epistemicClass === 'RUNTIME_EMPIRICAL'),
      contradicting.filter(m => m.epistemicClass === 'RUNTIME_EMPIRICAL')
    );
  }

  return result;
}

function computeDimensionState(
  supporting: Array<{ epistemicClass: string }>,
  contradicting: Array<{ epistemicClass: string }>
): DimensionResult {
  if (contradicting.length > 0) return 'CONTRADICTED';
  if (supporting.length > 0) return 'SUPPORTED';
  return 'MISSING';
}

function dimToKey(dim: string): 'authorizedScope' | 'codeCapability' | 'observedRuntime' {
  switch (dim) {
    case 'AUTHORIZED_SCOPE': return 'authorizedScope';
    case 'CODE_CAPABILITY': return 'codeCapability';
    case 'OBSERVED_RUNTIME': return 'observedRuntime';
    default: return 'authorizedScope';
  }
}
