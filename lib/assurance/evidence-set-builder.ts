/**
 * U5 B14/B20 — Control Evidence Set Builder
 *
 * Builds an exact Evidence Set for a claim evaluation.
 * Each member has an explicit role and epistemic class.
 * Produces a deterministic set digest.
 */

import { createHash } from 'crypto';
import {
  ControlClaimDefinition,
  ControlEvidenceSet,
  ControlEvidenceSetMember,
  EvidenceMemberRole,
  ExclusionReason,
  EpistemicClass,
} from './types';
import { classifyEvidence, isSelfReportedClass, isExternalClass } from './epistemic-classifier';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

/**
 * Projected evidence row — minimal shape needed for evidence set building.
 */
export interface ProjectedEvidence {
  id: string;
  sourceType: string;
  sourceId: string | null;
  producerRunId?: string | null;
  evidenceType: string;
  metadata: Record<string, unknown> | null;
  evidenceDate: Date;
  status: string;
  contentHash?: string | null;
  findings?: unknown[];
  coverageStatus?: string;
  coverageRatio?: number | null;
  producerOutcome?: string;
  /** A5: Rule IDs evaluated by this evidence's producer */
  evaluatedRuleIds?: string[];
  /** A5: Security concern IDs detected */
  concernIds?: string[];
  /** A5: Capability IDs this evidence is about */
  capabilityIds?: string[];
}

/**
 * Build a Control Evidence Set for a claim.
 *
 * Evaluates each piece of evidence against the claim's requirements
 * and assigns a role: SUPPORTING, CONTRADICTING, CONTEXT_ONLY, or EXCLUDED.
 */
export function buildControlEvidenceSet(params: {
  claim: ControlClaimDefinition;
  evidence: ProjectedEvidence[];
  evaluationSnapshotAt: Date;
}): ControlEvidenceSet {
  const { claim, evidence, evaluationSnapshotAt } = params;
  const members: ControlEvidenceSetMember[] = [];

  for (const ev of evidence) {
    const epistemicClass = classifyEvidence({
      sourceType: ev.sourceType,
      evidenceType: ev.evidenceType,
      metadata: ev.metadata,
    });

    const role = determineMemberRole(claim, ev, epistemicClass, evaluationSnapshotAt);
    const member: ControlEvidenceSetMember = {
      evidenceId: ev.id,
      role: role.role,
      epistemicClass,
      producerId: ev.sourceType,
      contentHash: ev.contentHash ?? undefined,
    };

    if (role.role === 'EXCLUDED' && role.exclusionReason) {
      member.exclusionReason = role.exclusionReason;
    }

    members.push(member);
  }

  // Sort members by evidenceId for deterministic digest
  members.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  const setDigest = computeEvidenceSetDigest(claim.claimKey, claim.version, members);

  return {
    claimKey: claim.claimKey,
    claimVersion: claim.version,
    members,
    setDigest,
  };
}

/**
 * A5: Check if evidence is relevant to a claim via exact semantic qualification.
 *
 * A piece of evidence can support or contradict a claim only when the claim's
 * semantic requirements match that evidence. Unrelated evidence is EXCLUDED
 * with NOT_RELEVANT_TO_CLAIM.
 *
 * Qualification considers:
 * - canonical producer ID (A6: acceptedProducerIds)
 * - evidenceType (A6: acceptedEvidenceTypes)
 * - evaluated rule/capability identifiers (A5)
 * - claim-specific capability requirements
 *
 * A scanner proves absence only for the security capability it actually evaluated.
 * Example: dependency-only SARIF cannot support privileged-action-authorization.
 */
function isEvidenceRelevantToClaim(
  claim: ControlClaimDefinition,
  ev: ProjectedEvidence,
  epistemicClass: EpistemicClass
): boolean {
  const spec = claim.relevanceSpec;
  if (!spec) {
    // 1.0 claims without relevanceSpec fall back to producer capability check
    return claim.requiredProducerCapabilities.some(rp =>
      rp === ev.sourceType || rp === resolveCanonicalProducerId(ev.sourceType)
    );
  }

  // A6: Check accepted producer IDs (canonical)
  const canonicalProducer = resolveCanonicalProducerId(ev.sourceType) ?? '';
  if (spec.acceptedProducerIds.length > 0) {
    if (!spec.acceptedProducerIds.includes(ev.sourceType) &&
        !spec.acceptedProducerIds.includes(canonicalProducer)) {
      return false;
    }
  }

  // A6: Check accepted evidence types
  if (spec.acceptedEvidenceTypes.length > 0) {
    if (!spec.acceptedEvidenceTypes.includes(ev.evidenceType)) {
      return false;
    }
  }

  // A5: Check capability IDs — if claim specifies capabilities, evidence must match
  if (spec.claimCapabilityIds.length > 0) {
    const evCapabilityIds = ev.capabilityIds ?? [];
    if (evCapabilityIds.length === 0) {
      // Evidence doesn't declare capabilities — can't prove relevance
      // Fall back to producer capability check
      return claim.requiredProducerCapabilities.some(rp =>
        rp === ev.sourceType || rp === resolveCanonicalProducerId(ev.sourceType)
      );
    }
    const hasRelevantCapability = spec.claimCapabilityIds.some(cap =>
      evCapabilityIds.includes(cap)
    );
    if (!hasRelevantCapability) {
      return false;
    }
  }

  return true;
}

/**
 * A8: Check for contradicting findings using EXACT matching only.
 *
 * Removes fuzzy includes() matching from canonical contradiction decisions.
 * Uses exact normalized rule ID, exact Security Concern ID, or exact
 * capability invariant.
 *
 * No BLOCK may originate solely from fuzzy substring matching.
 */
function hasExactContradictingFinding(
  claim: ControlClaimDefinition,
  ev: ProjectedEvidence
): boolean {
  const spec = claim.relevanceSpec;
  const rawFindings = Array.isArray(ev.findings) ? ev.findings : [];
  const findings = rawFindings as Array<{ ruleId?: string; concernId?: string; capabilityId?: string }>;

  // A8: Exact rule ID matching
  const contradictingRuleIds = spec?.contradictingRuleIds ?? claim.contradictionConditions;
  if (contradictingRuleIds.length > 0) {
    const hasExactRuleMatch = findings.some(f => {
      const fRule = (f.ruleId ?? '').toLowerCase();
      return contradictingRuleIds.some(cond => {
        const condLower = cond.toLowerCase();
        // EXACT match only (normalized for case + separator variants)
        return fRule === condLower ||
          fRule === condLower.replace(/_/g, '-') ||
          fRule === condLower.replace(/-/g, '_');
      });
    });
    if (hasExactRuleMatch) return true;
  }

  // A8: Exact concern ID matching
  if (spec?.contradictingConcernIds && spec.contradictingConcernIds.length > 0) {
    const hasExactConcernMatch = findings.some(f => {
      const fConcern = (f.concernId ?? '').toLowerCase();
      return spec.contradictingConcernIds.some(c => fConcern === c.toLowerCase());
    });
    if (hasExactConcernMatch) return true;
  }

  // A8: Exact capability ID matching
  if (spec?.contradictingCapabilityIds && spec.contradictingCapabilityIds.length > 0) {
    const hasExactCapabilityMatch = findings.some(f => {
      const fCap = (f.capabilityId ?? '').toLowerCase();
      return spec.contradictingCapabilityIds.some(c => fCap === c.toLowerCase());
    });
    if (hasExactCapabilityMatch) return true;
  }

  return false;
}

/**
 * A9: Check coverage policy satisfaction.
 *
 * UNKNOWN → never meets numeric requirement
 * PARTIAL with known ratio → meets requirement only if policy allows numeric
 *   partial coverage AND ratio >= threshold
 * COMPLETE → can satisfy semantic-completeness requirements
 */
function checkCoveragePolicy(
  claim: ControlClaimDefinition,
  ev: ProjectedEvidence
): { satisfied: boolean; reason?: ExclusionReason } {
  const policy = claim.coveragePolicy;
  if (!policy || policy === 'NO_COVERAGE_REQUIREMENT') {
    return { satisfied: true };
  }

  if (policy === 'COMPLETE_REQUIRED') {
    if (ev.coverageStatus === 'COMPLETE') return { satisfied: true };
    if (ev.coverageStatus === 'UNKNOWN' || !ev.coverageStatus) {
      return { satisfied: false, reason: 'COVERAGE_INSUFFICIENT' };
    }
    // PARTIAL cannot satisfy COMPLETE_REQUIRED
    return { satisfied: false, reason: 'COVERAGE_INSUFFICIENT' };
  }

  if (policy === 'MIN_RATIO') {
    const threshold = claim.coverageRatioThreshold ?? 0;
    if (ev.coverageStatus === 'UNKNOWN' || !ev.coverageStatus) {
      return { satisfied: false, reason: 'COVERAGE_INSUFFICIENT' };
    }
    if (ev.coverageStatus === 'COMPLETE') return { satisfied: true };
    // PARTIAL with known ratio
    if (ev.coverageStatus === 'PARTIAL') {
      const ratio = ev.coverageRatio ?? 0;
      if (ratio >= threshold) return { satisfied: true };
      return { satisfied: false, reason: 'COVERAGE_INSUFFICIENT' };
    }
    return { satisfied: false, reason: 'COVERAGE_INSUFFICIENT' };
  }

  return { satisfied: true };
}

/**
 * A6: Check whether the evidence proves the claim's relevant evaluation scope.
 *
 * Zero findings cannot support a technical claim unless the evidence
 * demonstrates that the exact capability/rule/concern the claim cares about
 * was within the evaluated scope.
 */
function evidenceProvesClaimScope(claim: ControlClaimDefinition, ev: ProjectedEvidence): boolean {
  const spec = claim.relevanceSpec;
  if (!spec) {
    // 1.0 claims without relevanceSpec fall back to producer capability
    return true;
  }

  const evCaps = new Set((ev.capabilityIds || []).map(c => c.toLowerCase()));
  const evRules = new Set((ev.evaluatedRuleIds || []).map(r => r.toLowerCase()));
  const evConcerns = new Set((ev.concernIds || []).map(c => c.toLowerCase()));

  if (spec.claimCapabilityIds.length > 0) {
    const claimCaps = spec.claimCapabilityIds.map(c => c.toLowerCase());
    if (claimCaps.some(c => evCaps.has(c))) return true;
  }

  if (spec.contradictingCapabilityIds.length > 0) {
    const capIds = spec.contradictingCapabilityIds.map(c => c.toLowerCase());
    if (capIds.some(c => evCaps.has(c))) return true;
  }

  if (spec.supportingRuleIds.length > 0) {
    const ruleIds = spec.supportingRuleIds.map(r => r.toLowerCase());
    if (ruleIds.some(r => evRules.has(r))) return true;
  }

  if (spec.contradictingRuleIds.length > 0) {
    const ruleIds = spec.contradictingRuleIds.map(r => r.toLowerCase());
    if (ruleIds.some(r => evRules.has(r))) return true;
  }

  if (spec.contradictingConcernIds.length > 0) {
    const concernIds = spec.contradictingConcernIds.map(c => c.toLowerCase());
    if (concernIds.some(c => evConcerns.has(c))) return true;
  }

  // If the claim has no specific scope requirements, any relevant evidence is acceptable.
  return (
    spec.claimCapabilityIds.length === 0 &&
    spec.contradictingCapabilityIds.length === 0 &&
    spec.supportingRuleIds.length === 0 &&
    spec.contradictingRuleIds.length === 0 &&
    spec.contradictingConcernIds.length === 0
  );
}

/**
 * Determine the role of a piece of evidence for a claim.
 *
 * A5: Evidence qualification is checked BEFORE role assignment.
 * A8: Contradiction matching is EXACT only — no fuzzy includes().
 * A9: Coverage policy replaces ambiguous numeric thresholds.
 * A10: PARTIAL + zero findings requires exact coverage policy satisfaction.
 * A11: Unrelated evidence cannot affect a claim.
 */
function determineMemberRole(
  claim: ControlClaimDefinition,
  ev: ProjectedEvidence,
  epistemicClass: EpistemicClass,
  evaluationSnapshotAt: Date
): { role: EvidenceMemberRole; exclusionReason?: ExclusionReason } {
  // EXCLUDED: After snapshot
  if (ev.evidenceDate > evaluationSnapshotAt) {
    return { role: 'EXCLUDED', exclusionReason: 'AFTER_SNAPSHOT' };
  }

  // EXCLUDED: Inactive evidence
  if (ev.status !== 'active') {
    return { role: 'EXCLUDED', exclusionReason: 'NOT_RELEVANT_TO_CLAIM' };
  }

  // A5: Evidence qualification — is this evidence relevant to this claim?
  if (!isEvidenceRelevantToClaim(claim, ev, epistemicClass)) {
    return { role: 'EXCLUDED', exclusionReason: 'NOT_RELEVANT_TO_CLAIM' };
  }

  // EXCLUDED: Self-reported when not allowed
  if (isSelfReportedClass(epistemicClass) && !claim.selfReportedCanSupport) {
    return { role: 'EXCLUDED', exclusionReason: 'SELF_REPORTED_NOT_ALLOWED' };
  }

  // EXCLUDED: External-only when not allowed
  if (isExternalClass(epistemicClass) && !claim.externalCanSupportAlone) {
    // External evidence can still be CONTEXT_ONLY
    return { role: 'CONTEXT_ONLY' };
  }

  // EXCLUDED: Stale evidence
  if (claim.maxEvidenceAgeDays !== null) {
    const ageMs = evaluationSnapshotAt.getTime() - ev.evidenceDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > claim.maxEvidenceAgeDays) {
      return { role: 'EXCLUDED', exclusionReason: 'STALE' };
    }
  }

  // EXCLUDED: Producer failed (A11: only for relevant producers)
  if (ev.producerOutcome === 'FAILED' || ev.producerOutcome === 'TIMEOUT' || ev.producerOutcome === 'ERROR') {
    return { role: 'EXCLUDED', exclusionReason: 'PRODUCER_FAILED' };
  }

  // A8: Check for contradicting findings using EXACT matching only
  if (hasExactContradictingFinding(claim, ev)) {
    return { role: 'CONTRADICTING' };
  }

  // Check if this evidence class is acceptable for the claim
  if (claim.acceptableEvidenceClasses.includes(epistemicClass)) {
    // Configuration/inventory/derived evidence is not findings-based.
    // Its presence IS the evidence — zero findings is normal.
    const isFindingsBased = epistemicClass === 'HAIEC_NATIVE_TECHNICAL' ||
      epistemicClass === 'EXTERNAL_TECHNICAL' || epistemicClass === 'RUNTIME_EMPIRICAL';

    // A9/A10: Check coverage policy
    const coverageCheck = checkCoveragePolicy(claim, ev);
    if (!coverageCheck.satisfied) {
      // A10: PARTIAL + zero findings cannot be SUPPORTING unless coverage policy is satisfied
      return { role: 'EXCLUDED', exclusionReason: coverageCheck.reason ?? 'COVERAGE_INSUFFICIENT' };
    }

    const rawFindings = Array.isArray(ev.findings) ? ev.findings : [];
    const findings = rawFindings as Array<{ ruleId?: string; severity?: string }>;

    // Zero findings handling
    if (findings.length === 0) {
      if (!isFindingsBased) {
        // Configuration/inventory/derived: presence IS the evidence
        return { role: 'SUPPORTING' };
      }
      // A6: zero findings only support when the evidence actually proves the
      // claim's relevant scope (capability, rule, or concern) was evaluated.
      const provesClaimScope = evidenceProvesClaimScope(claim, ev);
      if (claim.zeroFindingsCanSupport && provesClaimScope) {
        if (ev.coverageStatus === 'COMPLETE') {
          return { role: 'SUPPORTING' };
        }
        if (ev.coverageStatus === 'PARTIAL' && ev.coverageRatio != null && ev.coverageRatio >= (claim.coverageRatioThreshold ?? 0)) {
          return { role: 'SUPPORTING' };
        }
      }
      if (!claim.zeroFindingsCanSupport) {
        return { role: 'CONTEXT_ONLY' };
      }
      // Zero findings with unknown coverage → CONTEXT_ONLY (not SUPPORTING)
      if (ev.coverageStatus === 'UNKNOWN' || !ev.coverageStatus) {
        return { role: 'CONTEXT_ONLY' };
      }
    }

    // Evidence with findings that don't contradict → still supporting if findings are non-blocking
    return { role: 'SUPPORTING' };
  }

  // Not in acceptable classes → context only
  return { role: 'CONTEXT_ONLY' };
}

/**
 * A2: Compute deterministic Evidence Set digest using existing canonicalSerialize.
 * Commits to: claim key/version, methodology, member evidenceId, role, contentHash,
 * epistemicClass, exclusionReason.
 *
 * Uses canonicalSerialize from lib/evidence/deterministic-serialization.ts
 * which properly sorts object keys recursively and handles nested structures.
 *
 * The members array is SET-LIKE (sorted by evidenceId) so reordering does not
 * change the digest, but any semantic field change DOES change the digest.
 */
export function computeEvidenceSetDigest(
  claimKey: string,
  claimVersion: string,
  members: ControlEvidenceSetMember[]
): string {
  // Sort members by evidenceId for deterministic ordering (set-like)
  const sortedMembers = [...members].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  const digestInput = {
    claimKey,
    claimVersion,
    members: sortedMembers.map(m => ({
      evidenceId: m.evidenceId,
      role: m.role,
      contentHash: m.contentHash ?? '',
      epistemicClass: m.epistemicClass,
      exclusionReason: m.exclusionReason ?? '',
      producerId: m.producerId,
    })),
  };

  // Use existing HAIEC canonical serialization (sorts keys recursively)
  const canonical = canonicalSerialize(digestInput, new Set(['members']));

  return hashTextContent(canonical);
}
