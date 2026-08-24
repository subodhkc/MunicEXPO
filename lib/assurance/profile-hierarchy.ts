/**
 * E1 B1-B3 — Enterprise Assurance Profile Hierarchy
 *
 * GENERIC enterprise profile architecture.
 *
 * Hierarchy:
 *   HAIEC_CORE_BASELINE
 *       ↓
 *   HAIEC_AGENTIC_BASELINE
 *       ↓
 *   INDUSTRY_PROFILE (e.g., TELECOM_ORAN_BASELINE)
 *       ↓
 *   ENTERPRISE_EXTENSION (e.g., ERICSSON_EIAP_PROFILE)
 *       ↓
 *   CUSTOMER_PARAMETERS
 *
 * B2: Clients NEVER start with an empty security rule set.
 *     HAIEC ships predefined rules.
 *     Weakening a locked HAIEC security baseline requires an explicit governed exception.
 *
 * B3: Versioned AssuranceProfile contract.
 * B19: Verdict precedence: INVALID_EVIDENCE > BLOCK > REVIEW > ALLOW.
 * B23: Rule mapping strength — HEURISTIC_SUGGESTION cannot influence canonical Assurance.
 */

import { createHash } from 'crypto';
import {
  AssuranceProfile,
  ProfileVerdict,
  MappingStrength,
} from './types';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

// ─── B2: Predefined Profile IDs ──────────────────────────────────────────────

export const PROFILE_IDS = {
  HAIEC_CORE_BASELINE: 'haiec.core.baseline',
  HAIEC_AGENTIC_BASELINE: 'haiec.agentic.baseline',
  TELECOM_ORAN_BASELINE: 'telecom.oran.rapp',
  ERICSSON_EIAP_PROFILE: 'ericsson.eiap.rapp',
  CUSTOMER_PARAMETERS: 'customer.custom',
} as const;

// ─── B19: Verdict precedence ─────────────────────────────────────────────────

/**
 * B19: Verdict precedence for profile capability decisions.
 * INVALID_EVIDENCE > BLOCK > REVIEW > ALLOW
 *
 * Do not average hard violations away.
 * One OBSERVED unauthorized privileged actuation can BLOCK even if dozens
 * of other capabilities align.
 */
export function compareVerdicts(a: ProfileVerdict, b: ProfileVerdict): ProfileVerdict {
  const precedence: Record<ProfileVerdict, number> = {
    INVALID_EVIDENCE: 4,
    BLOCK: 3,
    REVIEW: 2,
    ALLOW: 1,
  };
  return precedence[a] >= precedence[b] ? a : b;
}

// ─── B23: Mapping strength ───────────────────────────────────────────────────

/**
 * B23: Only non-heuristic mappings may influence canonical Assurance.
 * HEURISTIC_SUGGESTION may suggest candidate mappings but MUST NOT
 * SUPPORT, CONTRADICT, BLOCK, or ALLOW a canonical Assurance evaluation.
 */
export function canInfluenceCanonicalAssurance(strength: MappingStrength): boolean {
  return strength !== 'HEURISTIC_SUGGESTION';
}

// ─── B3: Profile digest computation ──────────────────────────────────────────

/**
 * B3/B33: Compute deterministic profile digest.
 * Commits to: profileId, version, claim/rule pack versions, capability vocab,
 * applicability rules, policies, non-overridable rules, source references.
 */
export function computeProfileDigest(profile: Omit<AssuranceProfile, 'profileDigest'>): string {
  const digestInput = {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    claimPackVersions: profile.claimPackVersions,
    rulePackVersions: profile.rulePackVersions,
    capabilityVocabularyVersion: profile.capabilityVocabularyVersion,
    applicabilityRules: profile.applicabilityRules,
    coveragePolicy: profile.coveragePolicy,
    freshnessPolicy: profile.freshnessPolicy,
    blockingPolicy: profile.blockingPolicy,
    nonOverridableRuleIds: profile.nonOverridableRuleIds,
    sourceReferences: profile.sourceReferences,
  };

  const canonical = canonicalSerialize(digestInput, new Set([
    'applicabilityRules', 'claimPackVersions', 'rulePackVersions',
    'freshnessPolicy', 'nonOverridableRuleIds', 'sourceReferences',
  ]));
  return hashTextContent(canonical);
}

// ─── B1: Profile inheritance ─────────────────────────────────────────────────

/**
 * B1/B18: Check if a profile inherits from another profile (directly or transitively).
 * Used to verify profile inheritance is deterministic.
 */
export function inheritsFrom(
  profile: AssuranceProfile,
  ancestorProfileId: string,
  allProfiles: AssuranceProfile[]
): boolean {
  if (profile.parentProfileIds.includes(ancestorProfileId)) {
    return true;
  }
  for (const parentId of profile.parentProfileIds) {
    const parent = allProfiles.find(p => p.profileId === parentId);
    if (parent && inheritsFrom(parent, ancestorProfileId, allProfiles)) {
      return true;
    }
  }
  return false;
}

/**
 * B2/B18: Get all non-overridable rule IDs from a profile and its ancestors.
 * Locked baseline rules cannot disappear silently when customer parameters are applied.
 */
export function getAllNonOverridableRuleIds(
  profile: AssuranceProfile,
  allProfiles: AssuranceProfile[]
): string[] {
  const ruleIds = new Set<string>(profile.nonOverridableRuleIds);
  for (const parentId of profile.parentProfileIds) {
    const parent = allProfiles.find(p => p.profileId === parentId);
    if (parent) {
      for (const id of getAllNonOverridableRuleIds(parent, allProfiles)) {
        ruleIds.add(id);
      }
    }
  }
  return Array.from(ruleIds);
}

/**
 * B2: Verify that customer parameters do not weaken locked baseline rules.
 * Returns true if the profile is valid (no locked rules removed).
 */
export function verifyLockedRulesPreserved(
  customerProfile: AssuranceProfile,
  baselineProfile: AssuranceProfile,
  allProfiles: AssuranceProfile[]
): { valid: boolean; violatedRules: string[] } {
  const lockedRules = getAllNonOverridableRuleIds(baselineProfile, allProfiles);
  const customerRules = new Set(customerProfile.nonOverridableRuleIds);

  // Customer cannot remove locked rules (only add more)
  const violated = lockedRules.filter(id => !customerRules.has(id));

  return {
    valid: violated.length === 0,
    violatedRules: violated,
  };
}
