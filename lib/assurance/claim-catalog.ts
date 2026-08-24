/**
 * U5 B37/B38 — Initial Control Claim Catalog
 *
 * SMALL, SOURCE-BACKED catalog. Only claims that current HAIEC evidence
 * can meaningfully evaluate are included.
 *
 * SOURCE WINS — no aspirational claims.
 */

import { ControlClaimDefinition } from './types';

export const CONTROL_CLAIM_CATALOG: ControlClaimDefinition[] = [
  // ─── 1. Privileged Action Authorization ──────────────────────────────────
  // Source: SaaS Static scanner detects privileged tool actions and authorization checks
  {
    claimKey: 'privileged-action-authorization',
    statement: 'Privileged AI tool actions require authorization before execution.',
    version: '1.0',
    criticality: 'critical',
    requiredDimensions: ['CODE_CAPABILITY'],
    acceptableEvidenceClasses: ['HAIEC_NATIVE_TECHNICAL', 'EXTERNAL_TECHNICAL'],
    requiredProducerCapabilities: ['saas-static'],
    coverageRequirement: 80,
    maxEvidenceAgeDays: 90,
    selfReportedCanSupport: false,
    externalCanSupportAlone: true,
    zeroFindingsCanSupport: true,
    contradictionConditions: ['privileged_action_without_authorization'],
    manualReviewConditions: ['conflicting_static_findings'],
    frameworkMappings: [
      { framework: 'NIST_AI_RMF', controlIds: ['MEASURE-2.3'] },
      { framework: 'OWASP_LLM', controlIds: ['LLM01', 'LLM06'] },
    ],
    mandatory: true,
    // E1 1.1 extensions
    coveragePolicy: 'MIN_RATIO',
    coverageRatioThreshold: 0.8,
    relevanceSpec: {
      acceptedProducerIds: ['saas-static', 'ci-cd-scanner', 'sarif-import'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['privileged_action_without_authorization', 'privileged-action-without-authorization'],
      contradictingConcernIds: ['privileged-action-without-authorization'],
      contradictingCapabilityIds: ['tool-action-execution-without-authz'],
      supportingRuleIds: [],
      claimCapabilityIds: ['tool-action-execution'],
    },
  },

  // ─── 2. Untrusted Input Boundary ─────────────────────────────────────────
  // Source: SaaS Static scanner detects prompt injection / untrusted input handling
  {
    claimKey: 'untrusted-input-boundary',
    statement: 'Untrusted input is constrained before privileged model or tool use.',
    version: '1.0',
    criticality: 'critical',
    requiredDimensions: ['CODE_CAPABILITY'],
    acceptableEvidenceClasses: ['HAIEC_NATIVE_TECHNICAL', 'EXTERNAL_TECHNICAL'],
    requiredProducerCapabilities: ['saas-static'],
    coverageRequirement: 80,
    maxEvidenceAgeDays: 90,
    selfReportedCanSupport: false,
    externalCanSupportAlone: true,
    zeroFindingsCanSupport: true,
    contradictionConditions: ['unconstrained_input_to_privileged_path'],
    manualReviewConditions: ['ambiguous_input_handling'],
    frameworkMappings: [
      { framework: 'NIST_AI_RMF', controlIds: ['MEASURE-2.4'] },
      { framework: 'OWASP_LLM', controlIds: ['LLM01'] },
    ],
    mandatory: true,
    // E1 1.1 extensions
    coveragePolicy: 'MIN_RATIO',
    coverageRatioThreshold: 0.8,
    relevanceSpec: {
      acceptedProducerIds: ['saas-static', 'ci-cd-scanner', 'sarif-import'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['unconstrained_input_to_privileged_path', 'unconstrained-input-to-privileged-path'],
      contradictingConcernIds: ['unconstrained-input-to-privileged-path'],
      contradictingCapabilityIds: ['untrusted-input-to-privileged-path'],
      supportingRuleIds: [],
      claimCapabilityIds: ['input-boundary-enforcement'],
    },
  },

  // ─── 3. Secret Exposure Prevention ───────────────────────────────────────
  // Source: SaaS Static + CI/AppSec scanners detect hardcoded secrets
  {
    claimKey: 'secret-exposure-prevention',
    statement: 'No hardcoded secrets or credentials are present in the evaluated code.',
    version: '1.0',
    criticality: 'critical',
    requiredDimensions: ['CODE_CAPABILITY'],
    acceptableEvidenceClasses: ['HAIEC_NATIVE_TECHNICAL', 'EXTERNAL_TECHNICAL'],
    requiredProducerCapabilities: ['saas-static'],
    coverageRequirement: 95,
    maxEvidenceAgeDays: 30,
    selfReportedCanSupport: false,
    externalCanSupportAlone: true,
    zeroFindingsCanSupport: true,
    contradictionConditions: ['hardcoded_secret_detected'],
    manualReviewConditions: ['potential_secret_with_low_confidence'],
    frameworkMappings: [
      { framework: 'SOC2', controlIds: ['CC6.1'] },
      { framework: 'NIST_AI_RMF', controlIds: ['MEASURE-1.1'] },
    ],
    mandatory: true,
    // E1 1.1 extensions
    coveragePolicy: 'MIN_RATIO',
    coverageRatioThreshold: 0.95,
    relevanceSpec: {
      acceptedProducerIds: ['saas-static', 'ci-cd-scanner', 'sarif-import'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['hardcoded_secret_detected', 'hardcoded-secret-detected'],
      contradictingConcernIds: ['hardcoded-secret-detected'],
      contradictingCapabilityIds: ['secret-exposure'],
      supportingRuleIds: [],
      claimCapabilityIds: ['secret-exposure-prevention'],
    },
  },

  // ─── 4. Tenant Boundary Enforcement ──────────────────────────────────────
  // Source: SaaS Static scanner detects cross-tenant data access patterns
  {
    claimKey: 'tenant-boundary-enforcement',
    statement: 'Tenant boundaries are enforced for scoped operations.',
    version: '1.0',
    criticality: 'critical',
    requiredDimensions: ['CODE_CAPABILITY'],
    acceptableEvidenceClasses: ['HAIEC_NATIVE_TECHNICAL'],
    requiredProducerCapabilities: ['saas-static'],
    coverageRequirement: 80,
    maxEvidenceAgeDays: 90,
    selfReportedCanSupport: false,
    externalCanSupportAlone: false,
    zeroFindingsCanSupport: true,
    contradictionConditions: ['cross_tenant_access_without_check'],
    manualReviewConditions: ['ambiguous_tenant_scoping'],
    frameworkMappings: [
      { framework: 'SOC2', controlIds: ['CC6.6'] },
      { framework: 'NIST_AI_RMF', controlIds: ['MEASURE-1.3'] },
    ],
    mandatory: true,
    // E1 1.1 extensions
    coveragePolicy: 'MIN_RATIO',
    coverageRatioThreshold: 0.8,
    relevanceSpec: {
      acceptedProducerIds: ['saas-static'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['cross_tenant_access_without_check', 'cross-tenant-access-without-check'],
      contradictingConcernIds: ['cross-tenant-access-without-check'],
      contradictingCapabilityIds: ['cross-tenant-access'],
      supportingRuleIds: [],
      claimCapabilityIds: ['tenant-boundary-enforcement'],
    },
  },

  // ─── 5. Runtime Safety Property Observation ──────────────────────────────
  // Source: Runtime testing demonstrates safety properties within tested scope
  {
    claimKey: 'runtime-safety-observation',
    statement: 'Runtime testing did not observe a safety-property violation within the evaluated test scope.',
    version: '1.0',
    criticality: 'high',
    requiredDimensions: ['OBSERVED_RUNTIME'],
    acceptableEvidenceClasses: ['RUNTIME_EMPIRICAL'],
    requiredProducerCapabilities: ['saas-runtime'],
    coverageRequirement: 70,
    maxEvidenceAgeDays: 60,
    selfReportedCanSupport: false,
    externalCanSupportAlone: false,
    zeroFindingsCanSupport: true,
    contradictionConditions: ['runtime_safety_violation_observed'],
    manualReviewConditions: ['incomplete_runtime_coverage'],
    frameworkMappings: [
      { framework: 'NIST_AI_RMF', controlIds: ['MEASURE-2.7'] },
    ],
    mandatory: false,
    // E1 1.1 extensions
    coveragePolicy: 'MIN_RATIO',
    coverageRatioThreshold: 0.7,
    relevanceSpec: {
      acceptedProducerIds: ['saas-runtime'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['runtime_safety_violation_observed', 'runtime-safety-violation-observed'],
      contradictingConcernIds: ['runtime-safety-violation-observed'],
      contradictingCapabilityIds: ['runtime-safety-violation'],
      supportingRuleIds: [],
      claimCapabilityIds: ['runtime-safety-observation'],
    },
  },

  // ─── 6. AI System Inventory Completeness ─────────────────────────────────
  // Source: AI Inventory producer provides system registration data
  {
    claimKey: 'ai-inventory-completeness',
    statement: 'The evaluated AI system is registered in inventory with required metadata.',
    version: '1.0',
    criticality: 'medium',
    requiredDimensions: ['AUTHORIZED_SCOPE'],
    acceptableEvidenceClasses: ['OBSERVED_CONFIGURATION'],
    requiredProducerCapabilities: ['saas-inventory'],
    coverageRequirement: null,
    maxEvidenceAgeDays: 180,
    selfReportedCanSupport: false,
    externalCanSupportAlone: false,
    zeroFindingsCanSupport: false,
    contradictionConditions: ['system_not_in_inventory'],
    manualReviewConditions: ['incomplete_inventory_metadata'],
    frameworkMappings: [
      { framework: 'NIST_AI_RMF', controlIds: ['IDENTIFY-1.1'] },
      { framework: 'ISO_42001', controlIds: ['5.2'] },
    ],
    mandatory: true,
    // E1 1.1 extensions
    coveragePolicy: 'NO_COVERAGE_REQUIREMENT',
    relevanceSpec: {
      acceptedProducerIds: ['saas-inventory'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['system_not_in_inventory', 'system-not-in-inventory'],
      contradictingConcernIds: ['system-not-in-inventory'],
      contradictingCapabilityIds: ['inventory-completeness'],
      supportingRuleIds: [],
      claimCapabilityIds: ['ai-inventory-completeness'],
    },
  },

  // ─── 7. Governance Declaration Presence ──────────────────────────────────
  // Source: Wizard provides self-reported governance declarations
  {
    claimKey: 'governance-declaration-presence',
    statement: 'Governance declarations for the AI system are documented.',
    version: '1.0',
    criticality: 'medium',
    requiredDimensions: ['AUTHORIZED_SCOPE'],
    acceptableEvidenceClasses: ['SELF_REPORTED'],
    requiredProducerCapabilities: ['saas-wizard'],
    coverageRequirement: null,
    maxEvidenceAgeDays: 365,
    selfReportedCanSupport: true,
    externalCanSupportAlone: false,
    zeroFindingsCanSupport: false,
    contradictionConditions: [],
    manualReviewConditions: ['governance_declaration_incomplete'],
    frameworkMappings: [
      { framework: 'NIST_AI_RMF', controlIds: ['GOVERN-1.1'] },
      { framework: 'ISO_42001', controlIds: ['5.1'] },
    ],
    mandatory: false,
    // E1 1.1 extensions
    coveragePolicy: 'NO_COVERAGE_REQUIREMENT',
    relevanceSpec: {
      acceptedProducerIds: ['saas-wizard'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: [],
      contradictingConcernIds: [],
      contradictingCapabilityIds: [],
      supportingRuleIds: [],
      claimCapabilityIds: ['governance-declaration'],
    },
  },

  // ─── 8. Regulatory Applicability Evaluation ──────────────────────────────
  // Source: Regulatory producer evaluates jurisdictional applicability
  {
    claimKey: 'regulatory-applicability-evaluation',
    statement: 'Regulatory applicability for the evaluated jurisdiction has been assessed.',
    version: '1.0',
    criticality: 'high',
    requiredDimensions: ['AUTHORIZED_SCOPE'],
    acceptableEvidenceClasses: ['DERIVED'],
    requiredProducerCapabilities: ['saas-regulatory'],
    coverageRequirement: null,
    maxEvidenceAgeDays: 365,
    selfReportedCanSupport: false,
    externalCanSupportAlone: false,
    zeroFindingsCanSupport: false,
    contradictionConditions: ['applicable_regulation_not_assessed'],
    manualReviewConditions: ['ambiguous_jurisdiction'],
    frameworkMappings: [
      { framework: 'EU_AI_ACT', controlIds: ['Art-9'] },
      { framework: 'NYC_LL144', controlIds: ['§20-05'] },
    ],
    mandatory: false,
    // E1 1.1 extensions
    coveragePolicy: 'NO_COVERAGE_REQUIREMENT',
    relevanceSpec: {
      acceptedProducerIds: ['saas-regulatory', 'nyc-ll144'],
      acceptedEvidenceTypes: [],
      contradictingRuleIds: ['applicable_regulation_not_assessed', 'applicable-regulation-not-assessed'],
      contradictingConcernIds: ['applicable-regulation-not-assessed'],
      contradictingCapabilityIds: ['regulatory-applicability'],
      supportingRuleIds: [],
      claimCapabilityIds: ['regulatory-applicability-evaluation'],
    },
  },
];

/**
 * Look up a claim by key.
 */
export function getClaim(claimKey: string): ControlClaimDefinition | undefined {
  return CONTROL_CLAIM_CATALOG.find(c => c.claimKey === claimKey);
}

/**
 * Get all mandatory claims.
 */
export function getMandatoryClaims(): ControlClaimDefinition[] {
  return CONTROL_CLAIM_CATALOG.filter(c => c.mandatory);
}

/**
 * Get all claims applicable to a given set of producer capabilities.
 * A claim is applicable if at least one of its required producers is available.
 */
export function getApplicableClaims(availableProducerIds: string[]): ControlClaimDefinition[] {
  return CONTROL_CLAIM_CATALOG.filter(claim =>
    claim.requiredProducerCapabilities.some(req => availableProducerIds.includes(req))
  );
}

