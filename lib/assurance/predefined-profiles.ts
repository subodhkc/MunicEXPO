/**
 * E1 B2/B4/B5/B15 — Predefined HAIEC Baseline Profiles
 *
 * B2: Clients NEVER start with an empty security rule set.
 *     HAIEC ships predefined rules.
 *
 * Hierarchy:
 *   HAIEC_CORE_BASELINE → HAIEC_AGENTIC_BASELINE → TELECOM_ORAN_BASELINE
 *   → ERICSSON_EIAP_PROFILE → CUSTOMER_PARAMETERS
 */

import { AssuranceProfile, ProfileRule, CapabilityFamily } from './types';
import { PROFILE_IDS, computeProfileDigest } from './profile-hierarchy';

// ─── B15: Predefined Telecom Rule Families ───────────────────────────────────

export const TELECOM_RULE_FAMILIES = [
  'IDENTITY_AUTHORITY',
  'DATA_GOVERNANCE',
  'NETWORK_ACTUATION',
  'AGENTIC_EXECUTION',
  'MODEL_LIFECYCLE',
  'SUPPLY_CHAIN',
  'RESILIENCE_CONFLICT',
  'EVIDENCE_ACCOUNTABILITY',
] as const;

// ─── B16: Initial Telecom Rules ──────────────────────────────────────────────

export const TELECOM_RULES: ProfileRule[] = [
  {
    ruleId: 'oran.r1.privileged-action-without-authentication',
    ruleType: 'STATE_RULE',
    description: 'Privileged R1 action requires authentication before execution',
    capabilityFamily: 'TOOL_ACTION_EXECUTION',
    severity: 'critical',
    status: 'ACTIVE',
    requiredGuards: ['authentication', 'authorization'],
  },
  {
    ruleId: 'oran.r1.scope-validation-missing',
    ruleType: 'STATE_RULE',
    description: 'R1 operation requires valid authorized scope',
    capabilityFamily: 'RESOURCE_SCOPE',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['scope-validation'],
  },
  {
    ruleId: 'oran.r1.untrusted-resource-id-privileged-path',
    ruleType: 'PATH_RULE',
    description: 'Untrusted resource ID must not reach privileged R1 operation without validation',
    capabilityFamily: 'DATA_ACCESS',
    severity: 'critical',
    status: 'ACTIVE',
    requiredGuards: ['input-validation', 'authorization'],
  },
  {
    ruleId: 'oran.r1.llm-output-config-write-without-guard',
    ruleType: 'PATH_RULE',
    description: 'LLM/tool output must not reach CONFIG.WRITE without deterministic guard',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'critical',
    status: 'ACTIVE',
    requiredGuards: ['deterministic-guard', 'output-validation'],
  },
  {
    ruleId: 'oran.r1.write-exceeds-blast-radius',
    ruleType: 'STATE_RULE',
    description: 'Write operation must not exceed configured blast-radius constraint',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['blast-radius-check'],
  },
  {
    ruleId: 'oran.r1.approval-required-action-no-approval',
    ruleType: 'SEQUENCE_RULE',
    description: 'Approval-required action must have valid approval before execution',
    capabilityFamily: 'HUMAN_AUTHORITY',
    severity: 'critical',
    status: 'ACTIVE',
    requiredGuards: ['approval-verification'],
    expectedTrajectory: ['READ', 'ANALYZE', 'RECOMMEND', 'APPROVAL', 'CONFIG_WRITE'],
  },
  {
    ruleId: 'oran.r1.unauthorized-data-subscription',
    ruleType: 'STATE_RULE',
    description: 'Data subscription must be authorized before activation',
    capabilityFamily: 'DATA_ACCESS',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['subscription-authorization'],
  },
  {
    ruleId: 'oran.r1.unapproved-callback-egress',
    ruleType: 'STATE_RULE',
    description: 'Callback/egress destination must be approved before use',
    capabilityFamily: 'EXTERNAL_EGRESS',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['destination-approval'],
  },
  {
    ruleId: 'oran.r1.a1-mutation-outside-policy-type',
    ruleType: 'STATE_RULE',
    description: 'A1 policy mutation must be within authorized policy type',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['policy-type-validation'],
  },
  {
    ruleId: 'oran.r1.model-deploy-without-approved-identity',
    ruleType: 'STATE_RULE',
    description: 'Model deployment requires approved artifact identity and integrity',
    capabilityFamily: 'MODEL_LIFECYCLE',
    severity: 'high',
    status: 'ACTIVE',
    requiredGuards: ['artifact-identity-verification', 'integrity-check'],
  },
  {
    ruleId: 'oran.r1.agent-retry-privileged-mutation',
    ruleType: 'STATE_RULE',
    description: 'Agent retry loop must not repeat privileged mutation without authorization',
    capabilityFamily: 'TOOL_ACTION_EXECUTION',
    severity: 'high',
    status: 'PARTIAL_CAPABILITY',
    requiredGuards: ['retry-authorization'],
  },
  {
    ruleId: 'oran.r1.missing-privileged-action-audit-trace',
    ruleType: 'STATE_RULE',
    description: 'Privileged action must produce audit trace',
    capabilityFamily: 'OBSERVABILITY',
    severity: 'medium',
    status: 'ACTIVE',
    requiredGuards: ['audit-logging'],
  },
  {
    ruleId: 'oran.r1.undeclared-network-operation',
    ruleType: 'STATE_RULE',
    description: 'Network operation must be declared in operating envelope',
    capabilityFamily: 'EXTERNAL_EGRESS',
    severity: 'medium',
    status: 'PROFILE_ONLY',
  },
  {
    ruleId: 'oran.r1.actuation-conflict-without-check',
    ruleType: 'STATE_RULE',
    description: 'Potential actuation conflict must be checked before execution',
    capabilityFamily: 'RESILIENCE',
    severity: 'high',
    status: 'NOT_YET_DETECTABLE',
  },
];

// ─── B2: HAIEC Core Baseline Profile ─────────────────────────────────────────

const haiecCoreBaselineData: Omit<AssuranceProfile, 'profileDigest'> = {
  profileId: PROFILE_IDS.HAIEC_CORE_BASELINE,
  profileVersion: '1.0',
  displayName: 'HAIEC Core Baseline',
  parentProfileIds: [],
  claimPackVersions: {
    'privileged-action-authorization': '1.0',
    'untrusted-input-boundary': '1.0',
    'secret-exposure-prevention': '1.0',
    'tenant-boundary-enforcement': '1.0',
    'ai-inventory-completeness': '1.0',
  },
  rulePackVersions: {},
  capabilityVocabularyVersion: '1.0',
  applicabilityRules: [],
  coveragePolicy: 'COMPLETE_REQUIRED',
  freshnessPolicy: {
    'privileged-action-authorization': 90,
    'untrusted-input-boundary': 90,
    'secret-exposure-prevention': 30,
    'tenant-boundary-enforcement': 90,
    'ai-inventory-completeness': 180,
  },
  blockingPolicy: {
    criticalClaims: [
      'privileged-action-authorization',
      'untrusted-input-boundary',
      'secret-exposure-prevention',
      'tenant-boundary-enforcement',
    ],
    blockingRuleIds: [],
  },
  customerParameterSchema: {},
  nonOverridableRuleIds: [],
  sourceReferences: [
    { type: 'HAIEC_INTERNAL', identifier: 'haiec-core-baseline', version: '1.0' },
  ],
};

export const HAIEC_CORE_BASELINE: AssuranceProfile = {
  ...haiecCoreBaselineData,
  profileDigest: computeProfileDigest(haiecCoreBaselineData),
};

// ─── B2: HAIEC Agentic Baseline Profile ──────────────────────────────────────

const haiecAgenticBaselineData: Omit<AssuranceProfile, 'profileDigest'> = {
  profileId: PROFILE_IDS.HAIEC_AGENTIC_BASELINE,
  profileVersion: '1.0',
  displayName: 'HAIEC Agentic Security Baseline',
  parentProfileIds: [PROFILE_IDS.HAIEC_CORE_BASELINE],
  claimPackVersions: {
    'privileged-action-authorization': '1.0',
    'untrusted-input-boundary': '1.0',
    'secret-exposure-prevention': '1.0',
    'tenant-boundary-enforcement': '1.0',
    'runtime-safety-observation': '1.0',
    'ai-inventory-completeness': '1.0',
    'governance-declaration-presence': '1.0',
  },
  rulePackVersions: {},
  capabilityVocabularyVersion: '1.0',
  applicabilityRules: [],
  coveragePolicy: 'COMPLETE_REQUIRED',
  freshnessPolicy: {
    'privileged-action-authorization': 90,
    'untrusted-input-boundary': 90,
    'secret-exposure-prevention': 30,
    'tenant-boundary-enforcement': 90,
    'runtime-safety-observation': 60,
    'ai-inventory-completeness': 180,
    'governance-declaration-presence': 365,
  },
  blockingPolicy: {
    criticalClaims: [
      'privileged-action-authorization',
      'untrusted-input-boundary',
      'secret-exposure-prevention',
      'tenant-boundary-enforcement',
    ],
    blockingRuleIds: [],
  },
  customerParameterSchema: {
    approvedTools: [],
    allowedDestinations: [],
  },
  nonOverridableRuleIds: [
    'haiec.core.privileged-action-authorization',
    'haiec.core.secret-exposure-prevention',
    'haiec.core.tenant-boundary-enforcement',
  ],
  sourceReferences: [
    { type: 'HAIEC_INTERNAL', identifier: 'haiec-agentic-baseline', version: '1.0' },
  ],
};

export const HAIEC_AGENTIC_BASELINE: AssuranceProfile = {
  ...haiecAgenticBaselineData,
  profileDigest: computeProfileDigest(haiecAgenticBaselineData),
};

// ─── B13: Telecom/O-RAN Baseline Profile ─────────────────────────────────────

const telecomOranBaselineData: Omit<AssuranceProfile, 'profileDigest'> = {
  profileId: PROFILE_IDS.TELECOM_ORAN_BASELINE,
  profileVersion: '0.1',
  displayName: 'Telecom O-RAN rApp Baseline',
  parentProfileIds: [PROFILE_IDS.HAIEC_AGENTIC_BASELINE],
  claimPackVersions: {
    'privileged-action-authorization': '1.0',
    'untrusted-input-boundary': '1.0',
    'secret-exposure-prevention': '1.0',
    'tenant-boundary-enforcement': '1.0',
    'runtime-safety-observation': '1.0',
    'ai-inventory-completeness': '1.0',
    'governance-declaration-presence': '1.0',
    'regulatory-applicability-evaluation': '1.0',
  },
  rulePackVersions: {
    'oran.r1.rules': '0.1',
  },
  capabilityVocabularyVersion: '1.0',
  applicabilityRules: [
    { claimKey: 'privileged-action-authorization', predicate: 'system.usesR1Service === true' },
    { claimKey: 'untrusted-input-boundary', predicate: 'system.acceptsExternalInput === true' },
    { claimKey: 'tenant-boundary-enforcement', predicate: 'system.multiTenant === true' },
  ],
  coveragePolicy: 'COMPLETE_REQUIRED',
  freshnessPolicy: {
    'privileged-action-authorization': 90,
    'untrusted-input-boundary': 90,
    'secret-exposure-prevention': 30,
    'tenant-boundary-enforcement': 90,
    'runtime-safety-observation': 60,
    'ai-inventory-completeness': 180,
  },
  blockingPolicy: {
    criticalClaims: [
      'privileged-action-authorization',
      'untrusted-input-boundary',
      'secret-exposure-prevention',
      'tenant-boundary-enforcement',
    ],
    blockingRuleIds: TELECOM_RULES
      .filter(r => r.severity === 'critical' && r.status === 'ACTIVE')
      .map(r => r.ruleId),
  },
  customerParameterSchema: {
    allowedR1Services: [],
    approvedModels: [],
    approvedTools: [],
    allowedDestinations: [],
    maxTargetsPerAction: 10,
    maxChangeMagnitude: 100,
    approvalThreshold: 1,
    allowedEnvironments: ['sandbox', 'test', 'staging'],
  },
  nonOverridableRuleIds: TELECOM_RULES
    .filter(r => r.severity === 'critical')
    .map(r => r.ruleId),
  sourceReferences: [
    { type: 'O_RAN_SPEC', identifier: 'O-RAN-WG6', version: 'R1-Interface-v01.00' },
    { type: 'O_RAN_SPEC', identifier: 'O-RAN-A1', version: 'A1-Interface-v01.00' },
  ],
};

export const TELECOM_ORAN_BASELINE: AssuranceProfile = {
  ...telecomOranBaselineData,
  profileDigest: computeProfileDigest(telecomOranBaselineData),
};

// ─── B13: Ericsson EIAP Extension Profile ────────────────────────────────────

const ericssonEiapData: Omit<AssuranceProfile, 'profileDigest'> = {
  profileId: PROFILE_IDS.ERICSSON_EIAP_PROFILE,
  profileVersion: '0.1',
  displayName: 'Ericsson EIAP rApp Extension',
  parentProfileIds: [PROFILE_IDS.TELECOM_ORAN_BASELINE],
  claimPackVersions: {},
  rulePackVersions: {
    'ericsson.eiap.rules': '0.1',
  },
  capabilityVocabularyVersion: '1.0',
  applicabilityRules: [],
  coveragePolicy: 'COMPLETE_REQUIRED',
  freshnessPolicy: {},
  blockingPolicy: {
    criticalClaims: [],
    blockingRuleIds: [],
  },
  customerParameterSchema: {
    allowedRegions: [],
    allowedResourceTypes: [],
    allowedOperations: [],
    prohibitedDataClasses: ['RESTRICTED'],
  },
  nonOverridableRuleIds: [],
  sourceReferences: [
    // B13: Do not claim support for proprietary Ericsson APIs that are not actually known
    { type: 'ERICSSON_EIAP', identifier: 'ericsson-eiap-extensible', version: '0.1' },
  ],
};

export const ERICSSON_EIAP_PROFILE: AssuranceProfile = {
  ...ericssonEiapData,
  profileDigest: computeProfileDigest(ericssonEiapData),
};

// ─── All predefined profiles ─────────────────────────────────────────────────

export const ALL_PREDEFINED_PROFILES: AssuranceProfile[] = [
  HAIEC_CORE_BASELINE,
  HAIEC_AGENTIC_BASELINE,
  TELECOM_ORAN_BASELINE,
  ERICSSON_EIAP_PROFILE,
];

/**
 * Get a profile by ID from predefined profiles.
 */
export function getProfile(profileId: string): AssuranceProfile | undefined {
  return ALL_PREDEFINED_PROFILES.find(p => p.profileId === profileId);
}
