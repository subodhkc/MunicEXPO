/**
 * E1 Closure — Predefined HAIEC Baseline Profiles
 *
 * B2: Clients NEVER start with an empty security rule set.
 *     HAIEC ships predefined rules.
 *
 * Hierarchy:
 *   HAIEC_CORE_BASELINE → HAIEC_AGENTIC_BASELINE → TELECOM_ORAN_BASELINE
 *   → ERICSSON_EIAP_PROFILE → CUSTOMER_PARAMETERS
 *
 * E1 Closure changes:
 *   Section 8: Arbitrary client default authority values labeled REFERENCE_DEFAULT.
 *   Section 17: Telecom rules have implementationStatus reflecting actual implementation.
 *   Section 19: R1 source version corrected to v11.00.
 *   Section 22: EIAP name corrected to "Ericsson Intelligent Automation Platform".
 *   Section 24: Compliance/framework mapping metadata added.
 */

import { AssuranceProfile, ProfileRule, CapabilityFamily, TelecomRuleImplementationStatus } from './types';
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

// ─── Section 17: Telecom Rules with implementation status ────────────────────
//
// Each rule now has implementationStatus reflecting ACTUAL implementation.
// A profile rule definition alone is NOT an ACTIVE detector.
// Source-audit against actual scanner/runtime implementation.

export const TELECOM_RULES: ProfileRule[] = [
  {
    ruleId: 'oran.r1.privileged-action-without-authentication',
    ruleType: 'STATE_RULE',
    description: 'Privileged R1 action requires authentication before execution',
    capabilityFamily: 'TOOL_ACTION_EXECUTION',
    severity: 'critical',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: privileged tool call, sink: R1 operation, guard: auth check',
      findingIdentity: 'privileged_action_without_authorization',
      coverageLimitations: 'Detects missing auth on privileged tool calls; does not verify auth correctness',
    },
    requiredGuards: ['authentication', 'authorization'],
  },
  {
    ruleId: 'oran.r1.scope-validation-missing',
    ruleType: 'STATE_RULE',
    description: 'R1 operation requires valid authorized scope',
    capabilityFamily: 'RESOURCE_SCOPE',
    severity: 'high',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: R1 operation call, sink: resource access, guard: scope validation',
      findingIdentity: 'scope_validation_missing',
      coverageLimitations: 'Detects missing scope validation; does not verify scope correctness',
    },
    requiredGuards: ['scope-validation'],
  },
  {
    ruleId: 'oran.r1.untrusted-resource-id-privileged-path',
    ruleType: 'PATH_RULE',
    description: 'Untrusted resource ID must not reach privileged R1 operation without validation',
    capabilityFamily: 'DATA_ACCESS',
    severity: 'critical',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: external input, sink: privileged R1 operation, guard: input validation',
      findingIdentity: 'untrusted_resource_id_privileged_path',
      coverageLimitations: 'Taint analysis from external input to privileged R1 operations',
    },
    requiredGuards: ['input-validation', 'authorization'],
  },
  {
    ruleId: 'oran.r1.llm-output-config-write-without-guard',
    ruleType: 'PATH_RULE',
    description: 'LLM/tool output must not reach CONFIG.WRITE without deterministic guard',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'critical',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: LLM output, sink: config write, guard: deterministic validation',
      findingIdentity: 'llm_output_config_write_without_guard',
      coverageLimitations: 'Detects LLM output reaching config write without deterministic guard',
    },
    requiredGuards: ['deterministic-guard', 'output-validation'],
  },
  {
    ruleId: 'oran.r1.write-exceeds-blast-radius',
    ruleType: 'STATE_RULE',
    description: 'Write operation must not exceed configured blast-radius constraint',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'high',
    status: 'PARTIAL_CAPABILITY',
    implementationStatus: 'PARTIAL_ENGINE_SUPPORT',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'state: write operation scope vs configured blast-radius',
      findingIdentity: 'write_exceeds_blast_radius',
      coverageLimitations: 'Partial — requires operating envelope configuration to evaluate',
    },
    requiredGuards: ['blast-radius-check'],
  },
  {
    ruleId: 'oran.r1.approval-required-action-no-approval',
    ruleType: 'SEQUENCE_RULE',
    description: 'Approval-required action must have valid approval before execution',
    capabilityFamily: 'HUMAN_AUTHORITY',
    severity: 'critical',
    status: 'PARTIAL_CAPABILITY',
    implementationStatus: 'ACTION_WITNESS_ACTIVE',
    detectorMapping: {
      runtimeImplementation: 'Action Witness trajectory validation: READ → ANALYZE → RECOMMEND → APPROVAL → WRITE',
      semantics: 'sequence: expected approval trajectory vs observed trajectory',
      findingIdentity: 'approval_required_action_no_approval',
      coverageLimitations: 'Requires Action Witness evidence for full sequence validation',
    },
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
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: data subscription call, sink: data stream, guard: subscription authorization',
      findingIdentity: 'unauthorized_data_subscription',
      coverageLimitations: 'Detects missing authorization on data subscription calls',
    },
    requiredGuards: ['subscription-authorization'],
  },
  {
    ruleId: 'oran.r1.unapproved-callback-egress',
    ruleType: 'STATE_RULE',
    description: 'Callback/egress destination must be approved before use',
    capabilityFamily: 'EXTERNAL_EGRESS',
    severity: 'high',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: callback registration, sink: external endpoint, guard: destination approval',
      findingIdentity: 'unapproved_callback_egress',
      coverageLimitations: 'Detects unapproved callback destinations; does not verify destination reachability',
    },
    requiredGuards: ['destination-approval'],
  },
  {
    ruleId: 'oran.r1.a1-mutation-outside-policy-type',
    ruleType: 'STATE_RULE',
    description: 'A1 policy mutation must be within authorized policy type',
    capabilityFamily: 'CONFIGURATION_ACTUATION',
    severity: 'high',
    status: 'PARTIAL_CAPABILITY',
    implementationStatus: 'PARTIAL_ENGINE_SUPPORT',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'state: A1 policy mutation vs authorized policy type',
      findingIdentity: 'a1_mutation_outside_policy_type',
      coverageLimitations: 'Partial — requires operating envelope policy type configuration',
    },
    requiredGuards: ['policy-type-validation'],
  },
  {
    ruleId: 'oran.r1.model-deploy-without-approved-identity',
    ruleType: 'STATE_RULE',
    description: 'Model deployment requires approved artifact identity and integrity',
    capabilityFamily: 'MODEL_LIFECYCLE',
    severity: 'high',
    status: 'ACTIVE',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'source: model deploy call, sink: model registry, guard: artifact identity verification',
      findingIdentity: 'model_deploy_without_approved_identity',
      coverageLimitations: 'Detects missing artifact identity verification on model deploy',
    },
    requiredGuards: ['artifact-identity-verification', 'integrity-check'],
  },
  {
    ruleId: 'oran.r1.agent-retry-privileged-mutation',
    ruleType: 'STATE_RULE',
    description: 'Agent retry loop must not repeat privileged mutation without authorization',
    capabilityFamily: 'TOOL_ACTION_EXECUTION',
    severity: 'high',
    status: 'PARTIAL_CAPABILITY',
    implementationStatus: 'PARTIAL_ENGINE_SUPPORT',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'state: retry loop with privileged mutation, guard: retry authorization',
      findingIdentity: 'agent_retry_privileged_mutation',
      coverageLimitations: 'Partial — retry loop detection is structural only',
    },
    requiredGuards: ['retry-authorization'],
  },
  {
    ruleId: 'oran.r1.missing-privileged-action-audit-trace',
    ruleType: 'STATE_RULE',
    description: 'Privileged action must produce audit trace',
    capabilityFamily: 'OBSERVABILITY',
    severity: 'medium',
    status: 'PARTIAL_CAPABILITY',
    implementationStatus: 'PARTIAL_ENGINE_SUPPORT',
    detectorMapping: {
      scannerModule: 'ai-security-scanner',
      semantics: 'state: privileged action without audit logging',
      findingIdentity: 'missing_privileged_action_audit_trace',
      coverageLimitations: 'Partial — detects missing audit logging patterns',
    },
    requiredGuards: ['audit-logging'],
  },
  {
    ruleId: 'oran.r1.undeclared-network-operation',
    ruleType: 'STATE_RULE',
    description: 'Network operation must be declared in operating envelope',
    capabilityFamily: 'EXTERNAL_EGRESS',
    severity: 'medium',
    status: 'PROFILE_ONLY',
    implementationStatus: 'PROFILE_DEFINED',
  },
  {
    ruleId: 'oran.r1.actuation-conflict-without-check',
    ruleType: 'STATE_RULE',
    description: 'Potential actuation conflict must be checked before execution',
    capabilityFamily: 'RESILIENCE',
    severity: 'high',
    status: 'NOT_YET_DETECTABLE',
    implementationStatus: 'FUTURE',
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
//
// Section 8: Arbitrary default values (maxTargetsPerAction=10, maxChangeMagnitude=100,
//   approvalThreshold=1) are labeled REFERENCE_DEFAULT — NOT AUTHORITATIVE_POLICY.
// Section 19: R1 source version corrected to v11.00.

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
      .filter(r => r.severity === 'critical' && r.implementationStatus === 'STATIC_DETECTOR_ACTIVE')
      .map(r => r.ruleId),
  },
  // Section 8: REFERENCE_DEFAULT — NOT AUTHORITATIVE_POLICY.
  // Customer/Ericsson/CSP authoritative policy replaces these values later.
  customerParameterSchema: {
    allowedR1Services: [],
    approvedModels: [],
    approvedTools: [],
    allowedDestinations: [],
    maxTargetsPerAction: 10,
    maxChangeMagnitude: 100,
    approvalThreshold: 1,
    allowedEnvironments: ['sandbox', 'test', 'staging'],
    authoritySourceLabel: 'REFERENCE_DEFAULT',
  },
  nonOverridableRuleIds: TELECOM_RULES
    .filter(r => r.severity === 'critical')
    .map(r => r.ruleId),
  // Section 19: Corrected R1 source version.
  // Current public O-RAN material: Application Protocols for R1 Services v11.00
  sourceReferences: [
    { type: 'O_RAN_SPEC', identifier: 'O-RAN-WG6.R1-Interface', version: 'v11.00', digest: 'oran-r1-v11.00-public' },
    { type: 'O_RAN_SPEC', identifier: 'O-RAN-WG6.R1-DataAccess-SME-AIML', version: 'v11.00', digest: 'oran-r1-data-v11.00-public' },
    { type: 'O_RAN_SPEC', identifier: 'O-RAN-A1', version: 'A1-Interface-v01.00' },
  ],
};

export const TELECOM_ORAN_BASELINE: AssuranceProfile = {
  ...telecomOranBaselineData,
  profileDigest: computeProfileDigest(telecomOranBaselineData),
};

// ─── B13: Ericsson EIAP Extension Profile ────────────────────────────────────
//
// Section 22: EIAP = Ericsson Intelligent Automation Platform.
//   Do NOT invent expansion of EIAP.
// Section 23: No fictional Ericsson operations. Use generic extension placeholders.

const ericssonEiapData: Omit<AssuranceProfile, 'profileDigest'> = {
  profileId: PROFILE_IDS.ERICSSON_EIAP_PROFILE,
  profileVersion: '0.1',
  displayName: 'Ericsson Intelligent Automation Platform (EIAP) rApp Extension',
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
    authoritySourceLabel: 'REFERENCE_DEFAULT',
  },
  nonOverridableRuleIds: [],
  sourceReferences: [
    // Section 22/23: Do not claim support for proprietary Ericsson APIs.
    // EIAP = Ericsson Intelligent Automation Platform.
    { type: 'ERICSSON_EIAP', identifier: 'ericsson-intelligent-automation-platform', version: '0.1' },
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
