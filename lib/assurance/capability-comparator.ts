/**
 * E1 B17/B18/B21 — Capability Comparator
 *
 * B17: Compares Requested, Policy, Granted, Capable, and Observed planes.
 * B18: Verdict precedence — INVALID_EVIDENCE > BLOCK > REVIEW > ALLOW.
 *      Do not average hard violations away.
 * B21: Supports cross-actor rules.
 */

import {
  CapabilityFact,
  CapabilityComparisonResult,
  FivePlaneResult,
  PlaneResult,
  ProfileVerdict,
  AssurancePlane,
  AuthorityClass,
} from './types';
import { compareVerdicts } from './profile-hierarchy';

/**
 * B17: Compare capability facts across the five planes.
 *
 * Requested: vendor/application declares it needs capability
 * Policy: customer/operator policy approves capability
 * Granted: IAM/platform/credentials actually grant capability
 * Capable: code/configuration can perform capability
 * Observed: controlled runtime evidence demonstrates behavior
 */
export function compareCapabilityFacts(params: {
  requested?: CapabilityFact;
  policy?: CapabilityFact;
  granted?: CapabilityFact;
  capable?: CapabilityFact;
  observed?: CapabilityFact;
}): {
  planeResults: FivePlaneResult;
  comparisons: CapabilityComparisonResult[];
  verdict: ProfileVerdict;
} {
  const requested = params.requested;
  const policy = params.policy;
  const granted = params.granted;
  const capable = params.capable;
  const observed = params.observed;

  const planeResults: FivePlaneResult = {
    requested: requested ? 'SUPPORTED' : 'MISSING',
    policyAuthorized: policy ? 'SUPPORTED' : 'MISSING',
    effectivelyGranted: granted ? 'SUPPORTED' : 'MISSING',
    codeCapable: capable ? 'SUPPORTED' : 'MISSING',
    observed: observed ? 'SUPPORTED' : 'MISSING',
  };

  const comparisons: CapabilityComparisonResult[] = [];

  // B17: OVER_PRIVILEGED_GRANT — granted exceeds requested
  if (granted && !requested) {
    comparisons.push('OVER_PRIVILEGED_GRANT');
  }

  // B17: UNDECLARED_CAPABILITY — capable but not requested
  if (capable && !requested) {
    comparisons.push('UNDECLARED_CAPABILITY');
  }

  // B17: OBSERVED_OUTSIDE_OPERATING_ENVELOPE — observed but not policy-authorized
  if (observed && !policy) {
    comparisons.push('OBSERVED_OUTSIDE_OPERATING_ENVELOPE');
  }

  // B17: EXCESS_GRANTED_AUTHORITY — granted authority exceeds policy
  if (granted && policy && isHigherAuthority(granted.authorityClass, policy.authorityClass)) {
    comparisons.push('EXCESS_GRANTED_AUTHORITY');
  }

  // B17: UNTESTED_CAPABILITY — capable but not observed
  if (capable && !observed) {
    comparisons.push('UNTESTED_CAPABILITY');
  }

  // B17: UNEXPLAINED_RUNTIME_BEHAVIOR — observed but not capable
  if (observed && !capable) {
    comparisons.push('UNEXPLAINED_RUNTIME_BEHAVIOR');
  }

  // B17: REQUESTED_NOT_AUTHORIZED — requested but not policy-authorized
  if (requested && !policy) {
    comparisons.push('REQUESTED_NOT_AUTHORIZED');
  }

  // B17: ALIGNED — all planes consistent
  if (comparisons.length === 0 && requested && policy && granted && capable && observed) {
    comparisons.push('ALIGNED');
  }

  // B18: Compute verdict with precedence
  let verdict: ProfileVerdict = 'ALLOW';
  for (const comparison of comparisons) {
    const comparisonVerdict = comparisonToVerdict(comparison);
    verdict = compareVerdicts(verdict, comparisonVerdict);
  }

  return { planeResults, comparisons, verdict };
}

/**
 * B18: Map comparison results to verdicts.
 * Hard violations → BLOCK. Soft issues → REVIEW. Aligned → ALLOW.
 */
function comparisonToVerdict(result: CapabilityComparisonResult): ProfileVerdict {
  switch (result) {
    case 'OVER_PRIVILEGED_GRANT':
    case 'UNDECLARED_CAPABILITY':
    case 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE':
    case 'EXCESS_GRANTED_AUTHORITY':
      return 'BLOCK';
    case 'UNTESTED_CAPABILITY':
    case 'UNEXPLAINED_RUNTIME_BEHAVIOR':
    case 'REQUESTED_NOT_AUTHORIZED':
      return 'REVIEW';
    case 'ALIGNED':
      return 'ALLOW';
    default:
      return 'REVIEW';
  }
}

/**
 * B17: Check if one authority class is higher than another.
 */
function isHigherAuthority(a: AuthorityClass, b: AuthorityClass): boolean {
  const precedence: Record<AuthorityClass, number> = {
    AUTHORITATIVE_POLICY: 4,
    EFFECTIVE_GRANT: 3,
    VENDOR_DECLARATION: 2,
    NON_AUTHORITATIVE: 1,
    UNKNOWN: 0,
  };
  return precedence[a] > precedence[b];
}

/**
 * B21: Cross-actor capability comparison.
 * Checks if capabilities across actors conflict (e.g., two agents acting on same resource).
 */
export function compareCrossActorCapabilities(
  actor1Facts: CapabilityFact[],
  actor2Facts: CapabilityFact[]
): {
  conflicts: Array<{ capabilityId: string; reason: string }>;
  verdict: ProfileVerdict;
} {
  const conflicts: Array<{ capabilityId: string; reason: string }> = [];

  // Check for same resource scope conflicts
  for (const f1 of actor1Facts) {
    for (const f2 of actor2Facts) {
      if (f1.resource === f2.resource && f1.scope === f2.scope) {
        // Same resource + scope → potential conflict
        if (f1.action !== f2.action) {
          conflicts.push({
            capabilityId: f1.capabilityId,
            reason: `Cross-actor conflict: ${f1.action} vs ${f2.action} on ${f1.resource}`,
          });
        }
      }
    }
  }

  let verdict: ProfileVerdict = 'ALLOW';
  if (conflicts.length > 0) {
    verdict = 'REVIEW';
  }

  return { conflicts, verdict };
}
