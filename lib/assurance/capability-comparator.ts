/**
 * E1 Closure Sections 10-12 — Five-Plane SET Comparator + Verdict Policy + Claim Mapping
 *
 * Section 10: Evaluate SETS of Capability Facts across five planes.
 *   REQUESTED, POLICY_AUTHORIZED, EFFECTIVELY_GRANTED, CODE_CAPABLE, OBSERVED.
 *
 * Correct semantics:
 *   GRANTED - POLICY → OVER_PRIVILEGED_GRANT
 *   CAPABLE - POLICY → UNDECLARED_CAPABILITY
 *   OBSERVED - POLICY → OBSERVED_OUTSIDE_OPERATING_ENVELOPE
 *   POLICY - REQUESTED → AUTHORITY_NOT_REQUESTED / least-privilege signal
 *   GRANTED beyond required/capable scope → EXCESS_GRANTED_AUTHORITY
 *   CAPABLE - OBSERVED → UNTESTED_CAPABILITY
 *   OBSERVED - CAPABLE → UNEXPLAINED_RUNTIME_BEHAVIOR
 *   REQUESTED - POLICY → REQUESTED_NOT_AUTHORIZED
 *
 * Section 11: Verdict policy — profile determines severity. No auto-BLOCK every mismatch.
 * Section 12: Comparator results map via exact profile mappings into U5 Control Claims.
 *
 * Do NOT compare AuthorityClass precedence as a proxy for scope excess.
 */

import {
  CapabilityFact,
  CapabilityComparisonResult,
  CapabilityComparisonRecord,
  FivePlaneSetComparisonResult,
  FivePlaneResult,
  PlaneResult,
  ProfileVerdict,
  AssurancePlane,
  AuthorityClass,
  VerdictPolicy,
  OperatingEnvelope,
  ClaimState,
  ClaimReasonCode,
} from './types';
import {
  coreCapabilityKeyToString,
} from './types';
import { compareVerdicts } from './profile-hierarchy';
import { CONTROL_CLAIM_CATALOG } from './claim-catalog';
import {
  sameCapability,
  scopeContains,
  constraintsContain,
  capabilityContains,
  capabilitySetDifference,
  capabilitySetIntersection,
  groupByCapability,
} from './capability-identity';

/**
 * Default verdict policy (LOCK defaults).
 * Profile may override these.
 */
export const DEFAULT_VERDICT_POLICY: VerdictPolicy = {
  observedUnauthorizedPrivileged: 'BLOCK',
  capableUnauthorizedPrivileged: 'BLOCK',
  grantedBeyondPolicy: 'REVIEW',
  unusedExcessPermission: 'REVIEW',
  untestedCapability: 'REVIEW',
  unknownOperation: 'REVIEW',
};

/**
 * Section 10: Compare SETS of capability facts across the five planes.
 *
 * Unlike the old single-fact comparator, this compares actual capability
 * sets and their scopes/constraints — not just presence/absence.
 */
export function compareCapabilitySets(params: {
  requested: CapabilityFact[];
  policy: CapabilityFact[];
  granted: CapabilityFact[];
  capable: CapabilityFact[];
  observed: CapabilityFact[];
  envelope?: OperatingEnvelope;
  verdictPolicy?: VerdictPolicy;
}): FivePlaneSetComparisonResult {
  const { requested, policy, granted, capable, observed } = params;
  const verdictPolicy = params.verdictPolicy ?? DEFAULT_VERDICT_POLICY;

  const comparisons: CapabilityComparisonRecord[] = [];

  // U6: Group by core semantic identity (family, subject, action, resource).
  // Optional dimensions and bounds are compared inside each candidate group.
  const allFacts = [...requested, ...policy, ...granted, ...capable, ...observed];
  const allKeys = new Set(allFacts.map(f => coreCapabilityKeyToString(f)));

  // For each unique capability, compare across planes
  for (const keyStr of allKeys) {
    const reqMatches = requested.filter(f => coreCapabilityKeyToString(f) === keyStr);
    const polMatches = policy.filter(f => coreCapabilityKeyToString(f) === keyStr);
    const graMatches = granted.filter(f => coreCapabilityKeyToString(f) === keyStr);
    const capMatches = capable.filter(f => coreCapabilityKeyToString(f) === keyStr);
    const obsMatches = observed.filter(f => coreCapabilityKeyToString(f) === keyStr);

    const hasReq = reqMatches.length > 0;
    const hasPol = polMatches.length > 0;
    const hasGra = graMatches.length > 0;
    const hasCap = capMatches.length > 0;
    const hasObs = obsMatches.length > 0;

    const planeComparisons: CapabilityComparisonResult[] = [];
    const evidenceIds: string[] = [];

    // Collect evidence IDs
    for (const f of [...reqMatches, ...polMatches, ...graMatches, ...capMatches, ...obsMatches]) {
      evidenceIds.push(...f.sourceEvidenceIds);
    }

    // GRANTED - POLICY → OVER_PRIVILEGED_GRANT
    // Granted capability not in policy (or granted scope exceeds policy scope)
    if (hasGra) {
      for (const gra of graMatches) {
        if (!hasPol || !policy.some(p => capabilityContains(p, gra) && sameCapability(p, gra))) {
          // Check if granted scope exceeds policy scope
          const matchingPolicy = polMatches.find(p => sameCapability(p, gra));
          if (matchingPolicy && !scopeContains(matchingPolicy.scope, gra.scope)) {
            planeComparisons.push('OVER_PRIVILEGED_GRANT');
          } else if (!matchingPolicy) {
            planeComparisons.push('OVER_PRIVILEGED_GRANT');
          }
        }
      }
    }

    // CAPABLE - POLICY → UNDECLARED_CAPABILITY
    if (hasCap) {
      for (const cap of capMatches) {
        const matchingPolicy = polMatches.find(p => sameCapability(p, cap));
        if (!matchingPolicy) {
          // If capable matches a REQUESTED capability and there is no explicit policy,
          // this is an UNTESTED capability, not an UNDECLARED one.
          const matchingRequested = reqMatches.find(r => sameCapability(r, cap));
          if (!matchingRequested) {
            planeComparisons.push('UNDECLARED_CAPABILITY');
          }
        } else if (cap.scope === 'UNKNOWN' || cap.scope === '') {
          // U6: unknown scope must not be conflated with outside policy
          planeComparisons.push('CAPABILITY_SCOPE_NOT_ESTABLISHED');
        } else if (!scopeContains(matchingPolicy.scope, cap.scope)) {
          // Capable exceeds policy scope
          planeComparisons.push('UNDECLARED_CAPABILITY');
        }
      }
    }

    // OBSERVED - POLICY → OBSERVED_OUTSIDE_OPERATING_ENVELOPE
    if (hasObs) {
      for (const obs of obsMatches) {
        const matchingPolicy = polMatches.find(p => sameCapability(p, obs));
        if (!matchingPolicy) {
          planeComparisons.push('OBSERVED_OUTSIDE_OPERATING_ENVELOPE');
        } else if (!scopeContains(matchingPolicy.scope, obs.scope)) {
          // Observed exceeds policy scope
          planeComparisons.push('OBSERVED_OUTSIDE_OPERATING_ENVELOPE');
        } else if (params.envelope) {
          // Check envelope constraints: regions, maxTargets, etc.
          if (!isWithinEnvelope(obs, params.envelope)) {
            planeComparisons.push('OBSERVED_OUTSIDE_OPERATING_ENVELOPE');
          }
        }
      }
    }

    // POLICY - REQUESTED → AUTHORITY_NOT_REQUESTED (least-privilege signal)
    if (hasPol && !hasReq) {
      planeComparisons.push('AUTHORITY_NOT_REQUESTED');
    }

    // GRANTED beyond required/capable scope → EXCESS_GRANTED_AUTHORITY
    if (hasGra && hasReq) {
      for (const gra of graMatches) {
        const matchingReq = reqMatches.find(r => sameCapability(r, gra));
        if (matchingReq && !scopeContains(matchingReq.scope, gra.scope)) {
          // Granted scope exceeds requested scope
          planeComparisons.push('EXCESS_GRANTED_AUTHORITY');
        }
      }
    }

    // REQUESTED and POLICY and CODE and OBSERVED are present but no qualifying GRANT
    // This is a genuine missing effective-grant evidence plane, not alignment.
    if (hasReq && hasPol && hasCap && !hasGra) {
      planeComparisons.push('EFFECTIVE_GRANT_NOT_PROVIDED');
    }

    // CAPABLE - OBSERVED → UNTESTED_CAPABILITY
    if (hasCap && !hasObs) {
      planeComparisons.push('UNTESTED_CAPABILITY');
    }

    // OBSERVED - CAPABLE → UNEXPLAINED_RUNTIME_BEHAVIOR
    if (hasObs && !hasCap) {
      planeComparisons.push('UNEXPLAINED_RUNTIME_BEHAVIOR');
    }

    // REQUESTED - POLICY → REQUESTED_NOT_AUTHORIZED
    if (hasReq && !hasPol) {
      planeComparisons.push('REQUESTED_NOT_AUTHORIZED');
    }

    // ALIGNED — all planes consistent for this capability
    if (planeComparisons.length === 0 && hasReq && hasPol && hasGra && hasCap && hasObs) {
      planeComparisons.push('ALIGNED');
    }

    // Compute verdict for this capability
    let verdict: ProfileVerdict = 'ALLOW';
    for (const comp of planeComparisons) {
      const compVerdict = comparisonToVerdict(comp, verdictPolicy, obsMatches, capMatches, graMatches);
      verdict = compareVerdicts(verdict, compVerdict);
    }

    // Map to claim key (Section 12)
    const primaryCapabilityId = reqMatches[0]?.capabilityId ?? capMatches[0]?.capabilityId ?? graMatches[0]?.capabilityId ?? obsMatches[0]?.capabilityId ?? keyStr;
    const mappedClaimKey = mapComparisonToClaim(planeComparisons, primaryCapabilityId);

    comparisons.push({
      capabilityKey: keyStr,
      capabilityId: primaryCapabilityId,
      requested: hasReq,
      policyAuthorized: hasPol,
      effectivelyGranted: hasGra,
      codeCapable: hasCap,
      observed: hasObs,
      comparisons: planeComparisons,
      mappedClaimKey,
      evidenceIds,
      verdict,
    });
  }

  // Compute overall verdict
  let overallVerdict: ProfileVerdict = 'ALLOW';
  for (const c of comparisons) {
    overallVerdict = compareVerdicts(overallVerdict, c.verdict);
  }

  // Compute summary
  const summary = {
    aligned: comparisons.filter(c => c.comparisons.includes('ALIGNED')).length,
    overPrivilegedGrant: comparisons.filter(c => c.comparisons.includes('OVER_PRIVILEGED_GRANT')).length,
    undeclaredCapability: comparisons.filter(c => c.comparisons.includes('UNDECLARED_CAPABILITY')).length,
    observedOutsideEnvelope: comparisons.filter(c => c.comparisons.includes('OBSERVED_OUTSIDE_OPERATING_ENVELOPE')).length,
    excessGrantedAuthority: comparisons.filter(c => c.comparisons.includes('EXCESS_GRANTED_AUTHORITY')).length,
    untestedCapability: comparisons.filter(c => c.comparisons.includes('UNTESTED_CAPABILITY')).length,
    unexplainedRuntimeBehavior: comparisons.filter(c => c.comparisons.includes('UNEXPLAINED_RUNTIME_BEHAVIOR')).length,
    requestedNotAuthorized: comparisons.filter(c => c.comparisons.includes('REQUESTED_NOT_AUTHORIZED')).length,
    authorityNotRequested: comparisons.filter(c => c.comparisons.includes('AUTHORITY_NOT_REQUESTED')).length,
  };

  return {
    comparisons,
    overallVerdict,
    summary,
  };
}

/**
 * Section 11: Map comparison results to verdicts using profile verdict policy.
 * Hard violations → BLOCK/REVIEW per policy. Soft issues → REVIEW. Aligned → ALLOW.
 */
function comparisonToVerdict(
  result: CapabilityComparisonResult,
  policy: VerdictPolicy,
  observedFacts: CapabilityFact[],
  capableFacts: CapabilityFact[],
  grantedFacts: CapabilityFact[] = [],
): ProfileVerdict {
  switch (result) {
    case 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE':
      // Observed unauthorized privileged/high-impact action → BLOCK
      if (observedFacts.some(f => isHighImpact(f))) {
        return policy.observedUnauthorizedPrivileged;
      }
      return 'REVIEW';

    case 'UNDECLARED_CAPABILITY':
      // Capable unauthorized privileged capability → BLOCK or REVIEW per profile
      if (capableFacts.some(f => isHighImpact(f))) {
        return policy.capableUnauthorizedPrivileged;
      }
      return 'REVIEW';

    case 'OVER_PRIVILEGED_GRANT':
    case 'EXCESS_GRANTED_AUTHORITY':
      // Granted beyond policy → BLOCK/REVIEW per authority/impact
      if (grantedFacts.some(f => isHighImpact(f))) {
        return 'BLOCK';
      }
      return policy.grantedBeyondPolicy;

    case 'AUTHORITY_NOT_REQUESTED':
      // Unused excess permission → normally REVIEW
      return policy.unusedExcessPermission;

    case 'EFFECTIVE_GRANT_NOT_PROVIDED':
      return 'REVIEW';

    case 'UNTESTED_CAPABILITY':
      return policy.untestedCapability;

    case 'UNEXPLAINED_RUNTIME_BEHAVIOR':
      return 'REVIEW';

    case 'REQUESTED_NOT_AUTHORIZED':
      return 'REVIEW';

    case 'REQUIRED_APPROVAL_STEP_MISSING':
      return 'BLOCK';

    case 'ALIGNED':
      return 'ALLOW';

    default:
      return 'REVIEW';
  }
}

/**
 * Check if a capability fact is high-impact using source-backed impact metadata first.
 * Generic action-substring heuristic is NOT sufficient for production BLOCK.
 */
function isHighImpact(fact: CapabilityFact): boolean {
  const impact = (fact.impact ?? '').toUpperCase();
  if (impact === 'HIGH' || impact === 'CRITICAL') return true;
  const blastRadius = (fact.impact ?? '').toUpperCase();
  if (blastRadius === 'HIGH' || blastRadius === 'CRITICAL') return true;

  // Structured constraints such as large target count or high change magnitude
  if (fact.targetCount !== undefined && fact.targetCount > 100) return true;
  if (fact.changeMagnitude !== undefined && fact.changeMagnitude > 100) return true;

  return false;
}

/**
 * Check if an observed capability is within the operating envelope constraints.
 */
function isWithinEnvelope(fact: CapabilityFact, envelope: OperatingEnvelope): boolean {
  const constraints = envelope.constraints;

  // Check regions
  if (constraints.regions && constraints.regions.length > 0) {
    const factRegion = fact.scope.toLowerCase();
    if (!constraints.regions.some(r => r.toLowerCase() === factRegion || factRegion.includes(r.toLowerCase()))) {
      return false;
    }
  }

  // Check maxTargetCount — structured value preferred over string parsing
  if (constraints.maxTargetCount !== undefined) {
    const targetCount = fact.targetCount;
    if (targetCount !== undefined) {
      if (targetCount > constraints.maxTargetCount) return false;
    } else {
      // REFERENCE_ONLY fallback for synthetic/legacy fixtures — marked, not canonical
      const scopeMatch = fact.scope.match(/(\d+)\s*targets?/i);
      if (scopeMatch) {
        const parsedTargetCount = parseInt(scopeMatch[1], 10);
        if (parsedTargetCount > constraints.maxTargetCount) return false;
      }
    }
  }

  // Check maxChangeMagnitude — structured value preferred
  if (constraints.maxChangeMagnitude !== undefined) {
    const changeMagnitude = fact.changeMagnitude;
    if (changeMagnitude !== undefined) {
      if (changeMagnitude > constraints.maxChangeMagnitude) return false;
    } else {
      const scopeMatch = fact.scope.match(/(\d+)\s*%/i);
      if (scopeMatch) {
        const parsedMagnitude = parseInt(scopeMatch[1], 10);
        if (parsedMagnitude > constraints.maxChangeMagnitude) return false;
      }
    }
  }

  // Check data classes
  if (constraints.prohibitedDataClasses && constraints.prohibitedDataClasses.length > 0) {
    if (fact.dataClass) {
      const factClass = fact.dataClass.toLowerCase();
      if (constraints.prohibitedDataClasses.some(dc => dc.toLowerCase() === factClass)) {
        return false;
      }
    }
  }

  // Check allowed environments
  if (constraints.allowedEnvironments && constraints.allowedEnvironments.length > 0) {
    if (fact.environment) {
      const factEnv = fact.environment.toLowerCase();
      if (!constraints.allowedEnvironments.some(e => e.toLowerCase() === factEnv)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Section 12: Map comparison results to U5 canonical claim keys.
 *
 * No parallel "profile verdict" may bypass U5.
 * U5 remains the canonical Assurance disposition engine.
 */
export function mapComparisonToClaim(comparisons: CapabilityComparisonResult[], capabilityId?: string): string | undefined {
  const resultType = comparisons.find(c =>
    c === 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE' ||
    c === 'OVER_PRIVILEGED_GRANT' ||
    c === 'EXCESS_GRANTED_AUTHORITY' ||
    c === 'UNDECLARED_CAPABILITY' ||
    c === 'REQUIRED_APPROVAL_STEP_MISSING' ||
    c === 'REQUESTED_NOT_AUTHORIZED' ||
    c === 'EFFECTIVE_GRANT_NOT_PROVIDED' ||
    c === 'ALIGNED' ||
    c === 'UNTESTED_CAPABILITY' ||
    c === 'UNEXPLAINED_RUNTIME_BEHAVIOR'
  );

  if (!resultType) return undefined;

  // No canonical capability identity → no exact claim mapping.
  if (!capabilityId) return undefined;

  const normalizedCapabilityId = capabilityId.toLowerCase();
  const matchingClaims = CONTROL_CLAIM_CATALOG.filter(claim => {
    const spec = claim.relevanceSpec;
    if (!spec) return false;
    const capIds = [
      ...spec.claimCapabilityIds,
      ...spec.contradictingCapabilityIds,
    ].map(c => c.toLowerCase());
    return capIds.includes(normalizedCapabilityId);
  });

  // U6: ambiguous capability→claim mapping must not silently choose a claim.
  if (matchingClaims.length !== 1) {
    return undefined;
  }

  return matchingClaims[0].claimKey;
}

/**
 * Section 12: Convert comparison results to claim state + reason codes.
 * Maps comparator results into U5 claim evaluation semantics.
 */
export function comparisonToClaimState(
  comparisons: CapabilityComparisonResult[],
  verdict?: ProfileVerdict,
): { claimState: ClaimState; reasonCodes: ClaimReasonCode[] } {
  // When the comparator has already rendered a canonical verdict, use it.
  // U5 remains the canonical Assurance disposition engine; the comparator is diagnostic.
  if (verdict === 'BLOCK') {
    for (const c of comparisons) {
      if (c === 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE') {
        return { claimState: 'CONTRADICTED', reasonCodes: ['OBSERVED_OUTSIDE_OPERATING_ENVELOPE', 'CAPABILITY_CONTRADICTION'] };
      }
      if (c === 'OVER_PRIVILEGED_GRANT' || c === 'EXCESS_GRANTED_AUTHORITY') {
        return { claimState: 'CONTRADICTED', reasonCodes: ['OVER_PRIVILEGED_GRANT_DETECTED'] };
      }
      if (c === 'REQUIRED_APPROVAL_STEP_MISSING') {
        return { claimState: 'CONTRADICTED', reasonCodes: ['REQUIRED_APPROVAL_STEP_MISSING', 'CAPABILITY_CONTRADICTION'] };
      }
      if (c === 'UNDECLARED_CAPABILITY') {
        return { claimState: 'CONTRADICTED', reasonCodes: ['UNDECLARED_CAPABILITY_DETECTED'] };
      }
    }
    return { claimState: 'CONTRADICTED', reasonCodes: ['CAPABILITY_CONTRADICTION'] };
  }

  if (verdict === 'REVIEW') {
    for (const c of comparisons) {
      if (c === 'EFFECTIVE_GRANT_NOT_PROVIDED') {
        return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['EFFECTIVE_GRANT_NOT_PROVIDED'] };
      }
      if (c === 'UNTESTED_CAPABILITY') {
        return { claimState: 'NOT_ASSESSED', reasonCodes: ['NOT_EVALUATED'] };
      }
      if (c === 'UNEXPLAINED_RUNTIME_BEHAVIOR') {
        return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['NOT_EVALUATED'] };
      }
      if (c === 'REQUESTED_NOT_AUTHORIZED') {
        return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['REQUESTED_NOT_AUTHORIZED'] };
      }
      if (c === 'OVER_PRIVILEGED_GRANT' || c === 'EXCESS_GRANTED_AUTHORITY') {
        return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['OVER_PRIVILEGED_GRANT_DETECTED'] };
      }
    }
    return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['NOT_EVALUATED'] };
  }

  if (verdict === 'ALLOW' || comparisons.includes('ALIGNED')) {
    // U6: five-plane ALIGNED is diagnostic; positive SUPPORTED must come from U5 evidence qualification.
    return { claimState: 'NOT_ASSESSED', reasonCodes: [] };
  }

  return { claimState: 'REVIEW_REQUIRED', reasonCodes: ['NOT_EVALUATED'] };
}

// ─── Legacy single-fact comparator (retained for backward compatibility) ─────
// The old compareCapabilityFacts is retained for existing tests but now
// delegates to the set comparator with single-element arrays.

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
  const result = compareCapabilitySets({
    requested: params.requested ? [params.requested] : [],
    policy: params.policy ? [params.policy] : [],
    granted: params.granted ? [params.granted] : [],
    capable: params.capable ? [params.capable] : [],
    observed: params.observed ? [params.observed] : [],
  });

  // Flatten comparisons for backward compatibility
  const allComparisons = result.comparisons.flatMap(c => c.comparisons);

  const planeResults: FivePlaneResult = {
    requested: params.requested ? 'SUPPORTED' : 'MISSING',
    policyAuthorized: params.policy ? 'SUPPORTED' : 'MISSING',
    effectivelyGranted: params.granted ? 'SUPPORTED' : 'MISSING',
    codeCapable: params.capable ? 'SUPPORTED' : 'MISSING',
    observed: params.observed ? 'SUPPORTED' : 'MISSING',
  };

  return {
    planeResults,
    comparisons: allComparisons,
    verdict: result.overallVerdict,
  };
}

/**
 * Section 10: Cross-actor capability comparison.
 * Checks if capabilities across actors conflict.
 */
export function compareCrossActorCapabilities(
  actor1Facts: CapabilityFact[],
  actor2Facts: CapabilityFact[]
): {
  conflicts: Array<{ capabilityId: string; reason: string }>;
  verdict: ProfileVerdict;
} {
  const conflicts: Array<{ capabilityId: string; reason: string }> = [];

  for (const f1 of actor1Facts) {
    for (const f2 of actor2Facts) {
      if (f1.resource === f2.resource && f1.scope === f2.scope) {
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
