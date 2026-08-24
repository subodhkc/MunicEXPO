/**
 * E1 Closure Section 3 — Profile Resolver
 *
 * Deterministic profile resolution — NO LLM.
 *
 * Input: organization, AI system, evaluation run, approved profile configuration.
 * Output: resolved profile, inherited parent profiles, effective claim pack,
 *         effective rule pack, effective non-overridable rules, effective customer
 *         parameters, profile digest, applicable claim keys.
 *
 * Unknown/inconsistent profile → REVIEW / evaluation unavailable.
 * Never silently fall back from an explicitly configured specialized profile
 * to a weaker generic profile.
 */

import {
  AssuranceProfile,
  ResolvedProfile,
  ProfileResolutionResult,
  OperatingEnvelope,
  ApplicabilityRule,
} from './types';
import {
  PROFILE_IDS,
  getAllNonOverridableRuleIds,
  computeProfileDigest,
} from './profile-hierarchy';
import { ALL_PREDEFINED_PROFILES, getProfile } from './predefined-profiles';
import { CONTROL_CLAIM_CATALOG } from './claim-catalog';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

/**
 * System architecture facts used for applicability predicate evaluation.
 */
export interface SystemArchitectureFacts {
  usesR1Service?: boolean;
  acceptsExternalInput?: boolean;
  multiTenant?: boolean;
  usesAgenticTools?: boolean;
  usesModelDeployment?: boolean;
  usesDataSubscription?: boolean;
  usesCallbacks?: boolean;
  usesA1Policy?: boolean;
  [key: string]: unknown;
}

/**
 * Profile resolver input — explicit/configured profile selection.
 */
export interface ProfileResolverInput {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  /**
   * Explicitly configured profile ID.
   * If not provided, defaults to HAIEC_AGENTIC_BASELINE.
   * If provided but unknown → REVIEW (never silent fallback to generic).
   */
  configuredProfileId?: string;
  /** Approved operating envelope (if any) */
  operatingEnvelope?: OperatingEnvelope;
  /** System architecture facts for applicability evaluation */
  systemArchitectureFacts?: SystemArchitectureFacts;
}

/**
 * Resolve an Assurance Profile deterministically.
 *
 * Section 3 rules:
 * - No LLM — deterministic code only.
 * - Default: HAIEC_AGENTIC_BASELINE when no specialized profile configured.
 * - Specialized: TELECOM_ORAN_BASELINE or another inherited profile.
 * - Ericsson reference fixture: ERICSSON_EIAP_PROFILE (explicit, not inferred from repo name).
 * - Unknown/inconsistent → REVIEW, never silent fallback to weaker generic.
 */
export function resolveProfile(input: ProfileResolverInput): ProfileResolutionResult {
  const configuredProfileId = input.configuredProfileId ?? PROFILE_IDS.HAIEC_AGENTIC_BASELINE;

  // Look up the configured profile
  const profile = getProfile(configuredProfileId);

  if (!profile) {
    // Unknown profile → REVIEW, never silent fallback
    return {
      status: 'REVIEW',
      reason: `Unknown profile ID: ${configuredProfileId}. Cannot resolve — no silent fallback to generic.`,
    };
  }

  // Build inheritance chain (root → leaf)
  const inheritedProfileIds = getInheritanceChain(profile, ALL_PREDEFINED_PROFILES);

  // Collect all profiles in the chain
  const chainProfiles: AssuranceProfile[] = inheritedProfileIds
    .map(id => getProfile(id))
    .filter((p): p is AssuranceProfile => p !== undefined);

  // Merge effective claim pack versions (child overrides parent)
  const effectiveClaimPackVersions = mergeClaimPacks(chainProfiles);

  // Merge effective rule pack versions
  const effectiveRulePackVersions = mergeRulePacks(chainProfiles);

  // Merge effective non-overridable rule IDs
  const effectiveNonOverridableRuleIds = getAllNonOverridableRuleIds(profile, ALL_PREDEFINED_PROFILES);

  // Merge effective customer parameters (child overrides parent)
  const effectiveCustomerParameters = mergeCustomerParameters(chainProfiles);

  // Evaluate applicability rules to determine applicable claim keys
  const applicableClaimKeys = evaluateApplicabilityRules(
    profile,
    chainProfiles,
    input.systemArchitectureFacts ?? {},
    input.operatingEnvelope
  );

  // Compute resolved profile digest (commits to all effective fields)
  const profileDigestResolved = computeResolvedProfileDigest({
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileDigest: profile.profileDigest,
    inheritedProfileIds,
    effectiveClaimPackVersions,
    effectiveRulePackVersions,
    effectiveNonOverridableRuleIds,
    effectiveCustomerParameters,
    applicableClaimKeys,
  });

  const resolvedProfile: ResolvedProfile = {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileDigest: profile.profileDigest,
    displayName: profile.displayName,
    inheritedProfileIds,
    effectiveClaimPackVersions,
    effectiveRulePackVersions,
    effectiveNonOverridableRuleIds,
    effectiveCustomerParameters,
    applicableClaimKeys,
    profileDigestResolved,
  };

  // Verify envelope profile binding if envelope is provided
  if (input.operatingEnvelope) {
    const envelope = input.operatingEnvelope;
    if (envelope.profileId !== profile.profileId) {
      return {
        status: 'REVIEW',
        resolvedProfile,
        operatingEnvelope: envelope,
        reason: `Operating envelope profileId (${envelope.profileId}) does not match resolved profile (${profile.profileId}).`,
      };
    }
    // Section 6: DRAFT envelope cannot authorize ALLOW
    if (envelope.state !== 'APPROVED') {
      return {
        status: 'REVIEW',
        resolvedProfile,
        operatingEnvelope: envelope,
        reason: `Operating envelope is in ${envelope.state} state — only APPROVED envelope may provide POLICY_AUTHORIZED evidence.`,
      };
    }
  }

  return {
    status: 'RESOLVED',
    resolvedProfile,
    operatingEnvelope: input.operatingEnvelope,
  };
}

/**
 * Get the inheritance chain (root → leaf) for a profile.
 */
function getInheritanceChain(profile: AssuranceProfile, allProfiles: AssuranceProfile[]): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  function walk(p: AssuranceProfile): void {
    if (visited.has(p.profileId)) return;
    visited.add(p.profileId);
    for (const parentId of p.parentProfileIds) {
      const parent = allProfiles.find(ap => ap.profileId === parentId);
      if (parent) walk(parent);
    }
    chain.push(p.profileId);
  }

  walk(profile);
  return chain;
}

/**
 * Merge claim pack versions from root → leaf (child overrides parent).
 */
function mergeClaimPacks(chain: AssuranceProfile[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const p of chain) {
    for (const [key, version] of Object.entries(p.claimPackVersions)) {
      merged[key] = version;
    }
  }
  return merged;
}

/**
 * Merge rule pack versions from root → leaf.
 */
function mergeRulePacks(chain: AssuranceProfile[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const p of chain) {
    for (const [key, version] of Object.entries(p.rulePackVersions)) {
      merged[key] = version;
    }
  }
  return merged;
}

/**
 * Merge customer parameters from root → leaf (child overrides parent).
 */
function mergeCustomerParameters(chain: AssuranceProfile[]): import('./types').CustomerParameterSchema {
  const merged: import('./types').CustomerParameterSchema = {};
  for (const p of chain) {
    const schema = p.customerParameterSchema;
    if (schema.allowedRegions) merged.allowedRegions = [...(merged.allowedRegions ?? []), ...schema.allowedRegions];
    if (schema.allowedResourceTypes) merged.allowedResourceTypes = [...(merged.allowedResourceTypes ?? []), ...schema.allowedResourceTypes];
    if (schema.allowedOperations) merged.allowedOperations = [...(merged.allowedOperations ?? []), ...schema.allowedOperations];
    if (schema.allowedR1Services) merged.allowedR1Services = [...(merged.allowedR1Services ?? []), ...schema.allowedR1Services];
    if (schema.approvedModels) merged.approvedModels = [...(merged.approvedModels ?? []), ...schema.approvedModels];
    if (schema.approvedTools) merged.approvedTools = [...(merged.approvedTools ?? []), ...schema.approvedTools];
    if (schema.allowedDestinations) merged.allowedDestinations = [...(merged.allowedDestinations ?? []), ...schema.allowedDestinations];
    if (schema.prohibitedDataClasses) merged.prohibitedDataClasses = [...(merged.prohibitedDataClasses ?? []), ...schema.prohibitedDataClasses];
    if (schema.allowedEnvironments) merged.allowedEnvironments = [...(merged.allowedEnvironments ?? []), ...schema.allowedEnvironments];
    if (schema.maxTargetsPerAction !== undefined) merged.maxTargetsPerAction = schema.maxTargetsPerAction;
    if (schema.maxChangeMagnitude !== undefined) merged.maxChangeMagnitude = schema.maxChangeMagnitude;
    if (schema.approvalThreshold !== undefined) merged.approvalThreshold = schema.approvalThreshold;
    if (schema.authoritySourceLabel) merged.authoritySourceLabel = schema.authoritySourceLabel;
  }
  return merged;
}

/**
 * Evaluate applicability rules to determine applicable claim keys.
 *
 * Section 2: Claim applicability is determined from:
 * - selected Assurance Profile
 * - system architecture/capability facts
 * - approved Operating Envelope
 * - explicit applicability predicates.
 *
 * Producer availability determines SUPPORTED/INSUFFICIENT_EVIDENCE/NOT_ASSESSED,
 * but never applicability.
 */
function evaluateApplicabilityRules(
  profile: AssuranceProfile,
  chainProfiles: AssuranceProfile[],
  systemFacts: SystemArchitectureFacts,
  envelope?: OperatingEnvelope,
): string[] {
  const applicableKeys = new Set<string>();

  // Collect all applicability rules from the profile chain
  const allRules: ApplicabilityRule[] = [];
  for (const p of chainProfiles) {
    allRules.push(...p.applicabilityRules);
  }

  // Evaluate each applicability rule against system facts
  for (const rule of allRules) {
    const matches = evaluatePredicate(rule.predicate, systemFacts);
    const isApplicable = rule.negated ? !matches : matches;
    if (isApplicable) {
      applicableKeys.add(rule.claimKey);
    }
  }

  // If no applicability rules matched, default to all mandatory claims
  // plus claims whose required producers are relevant to the system
  if (applicableKeys.size === 0) {
    for (const claim of CONTROL_CLAIM_CATALOG) {
      if (claim.mandatory) {
        applicableKeys.add(claim.claimKey);
      }
    }
  }

  // Always include mandatory claims (they are always evaluated)
  for (const claim of CONTROL_CLAIM_CATALOG) {
    if (claim.mandatory) {
      applicableKeys.add(claim.claimKey);
    }
  }

  // If envelope is provided, add claims related to envelope constraints
  if (envelope) {
    // Envelope with approval requirements → privileged-action-authorization applicable
    if (envelope.constraints.approvalRequirements.some(a => a.requiresApproval)) {
      applicableKeys.add('privileged-action-authorization');
    }
    // Envelope with operations → runtime-safety-observation applicable
    if (envelope.constraints.allowedOperations.length > 0) {
      applicableKeys.add('runtime-safety-observation');
    }
  }

  return Array.from(applicableKeys).sort();
}

/**
 * Evaluate a simple predicate string against system facts.
 * Supports: `system.property === true/false`, `system.property === 'value'`
 */
function evaluatePredicate(predicate: string, facts: SystemArchitectureFacts): boolean {
  // Simple predicate evaluation: system.X === true
  const match = predicate.match(/^system\.(\w+)\s*===\s*(true|false|'[^']*'|"[^"]*"|\d+)$/);
  if (!match) {
    // Unknown predicate format → fail closed (not applicable)
    return false;
  }
  const [, property, value] = match;
  const factValue = facts[property];
  if (factValue === undefined) return false;

  if (value === 'true') return factValue === true;
  if (value === 'false') return factValue === false;
  if (value.startsWith("'") || value.startsWith('"')) {
    return String(factValue) === value.slice(1, -1);
  }
  return String(factValue) === value;
}

/**
 * Compute deterministic resolved profile digest.
 * Commits to all effective fields after inheritance merge.
 */
function computeResolvedProfileDigest(params: {
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  inheritedProfileIds: string[];
  effectiveClaimPackVersions: Record<string, string>;
  effectiveRulePackVersions: Record<string, string>;
  effectiveNonOverridableRuleIds: string[];
  effectiveCustomerParameters: import('./types').CustomerParameterSchema;
  applicableClaimKeys: string[];
}): string {
  const digestInput = {
    profileId: params.profileId,
    profileVersion: params.profileVersion,
    profileDigest: params.profileDigest,
    inheritedProfileIds: params.inheritedProfileIds,
    effectiveClaimPackVersions: params.effectiveClaimPackVersions,
    effectiveRulePackVersions: params.effectiveRulePackVersions,
    effectiveNonOverridableRuleIds: params.effectiveNonOverridableRuleIds,
    effectiveCustomerParameters: params.effectiveCustomerParameters,
    applicableClaimKeys: params.applicableClaimKeys,
  };

  const canonical = canonicalSerialize(digestInput, new Set([
    'inheritedProfileIds', 'effectiveClaimPackVersions', 'effectiveRulePackVersions',
    'effectiveNonOverridableRuleIds', 'applicableClaimKeys',
  ]));
  return hashTextContent(canonical);
}
