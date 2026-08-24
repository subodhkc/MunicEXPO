/**
 * E1 Closure Sections 17-23 — Ericsson / O-RAN Profile Source Truth
 *
 * Section 17: Telecom rule implementation status reflects actual scanner/runtime implementation.
 *   A profile rule definition alone is NEVER an ACTIVE detector.
 *
 * Section 19: Current O-RAN material: Application Protocols for R1 Services v11.00
 *   and updated Data Access, SME and AI/ML APIs. Do not leave stale v01.00 source references.
 *
 * Section 20: Expand public R1 seed vocabulary to include all relevant capability families.
 *   Matrix distinguishes SUPPORTED_SEED, KNOWN_NOT_IMPLEMENTED, UNKNOWN.
 *
 * Section 21: Exact O-RAN semantic mappings first. registerCallback ≠ MODEL_LIFECYCLE.
 *
 * Section 22: EIAP = Ericsson Intelligent Automation Platform (correct expansion).
 *
 * Section 23: No fictional proprietary Ericsson operations. Use generic extension
 *   placeholders ericsson.eiap.unknown.*.
 */

import {
  CapabilityFact,
  CapabilityFamily,
  AuthorityClass,
  EvidenceMethod,
  TelecomRuleImplementationStatus,
  FrameworkMappingEntry,
} from './types';
import { TELECOM_RULES } from './predefined-profiles';
import { InterfaceSpecification } from './profile-compiler';

// ─── Section 19/20: O-RAN R1 Capability Vocabulary ───────────────────────────
//
// Source: O-RAN-WG6 Application Protocols for R1 Services v11.00
// plus updated Data Access, SME and AI/ML APIs.
// This is a v0.1 reference seed — explicitly marked as synthetic/reference.

export type R1SeedStatus = 'SUPPORTED_SEED' | 'KNOWN_NOT_IMPLEMENTED' | 'UNKNOWN';

export interface R1CapabilitySeed {
  capabilityId: string;
  family: CapabilityFamily;
  description: string;
  sourceVersion: string;
  status: R1SeedStatus;
}

export const R1_CAPABILITY_VOCABULARY = {
  version: '0.1',
  sourceSpecId: 'O-RAN-WG6.R1-Application-Protocols',
  sourceSpecVersion: 'v11.00',
  sourceSpecDigest: 'oran-r1-application-protocols-v11.00',
  capabilities: [
    // Service management / exposure
    { capabilityId: 'r1.service-management.create', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Create rApp service instance', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.service-management.delete', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Delete rApp service instance', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.service-management.list', family: 'DATA_ACCESS' as CapabilityFamily, description: 'List rApp service instances', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.service-management.get', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Get rApp service instance details', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // Data registration / discovery / access / subscription
    { capabilityId: 'r1.data-registration.register', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Register data product', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.data-discovery.discover', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Discover data products', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.data-access.read', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Read data product', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.data-subscription.subscribe', family: 'RAG_CONTEXT_MEMORY' as CapabilityFamily, description: 'Subscribe to data stream', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.data-subscription.unsubscribe', family: 'RAG_CONTEXT_MEMORY' as CapabilityFamily, description: 'Unsubscribe from data stream', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // Configuration management
    { capabilityId: 'r1.configuration-management.read', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Read configuration', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.configuration-management.write', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Write configuration', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.configuration-management.delete', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Delete configuration', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // Configuration schema
    { capabilityId: 'r1.configuration-schema.get', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Get configuration schema', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // Fault management
    { capabilityId: 'r1.fault-management.subscribe', family: 'OBSERVABILITY' as CapabilityFamily, description: 'Subscribe to fault notifications', sourceVersion: 'v11.00', status: 'KNOWN_NOT_IMPLEMENTED' },
    // Performance / topology
    { capabilityId: 'r1.performance-management.subscribe', family: 'OBSERVABILITY' as CapabilityFamily, description: 'Subscribe to performance data', sourceVersion: 'v11.00', status: 'KNOWN_NOT_IMPLEMENTED' },
    { capabilityId: 'r1.topology-management.discover', family: 'RESOURCE_SCOPE' as CapabilityFamily, description: 'Discover topology', sourceVersion: 'v11.00', status: 'KNOWN_NOT_IMPLEMENTED' },
    // A1 policy
    { capabilityId: 'r1.a1-policy.create', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Create A1 policy', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.a1-policy.update', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Update A1 policy', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.a1-policy.delete', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Delete A1 policy', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.a1-policy.get', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Get A1 policy', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // AI/ML registration / discovery / training / deployment
    { capabilityId: 'r1.ai-ml.register', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Register ML model', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.ai-ml.discover', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Discover ML models', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.ai-ml.train', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Train ML model', sourceVersion: 'v11.00', status: 'KNOWN_NOT_IMPLEMENTED' },
    { capabilityId: 'r1.ai-ml.deploy', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Deploy ML model', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.ai-ml.retire', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Retire ML model', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    // Callbacks / notifications
    { capabilityId: 'r1.callback.register', family: 'EXTERNAL_EGRESS' as CapabilityFamily, description: 'Register callback endpoint', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
    { capabilityId: 'r1.callback.unregister', family: 'EXTERNAL_EGRESS' as CapabilityFamily, description: 'Unregister callback endpoint', sourceVersion: 'v11.00', status: 'SUPPORTED_SEED' },
  ] as R1CapabilitySeed[],
} as const;

// ─── Section 22/23: Ericsson EIAP Extension Vocabulary ───────────────────────
//
// EIAP = Ericsson Intelligent Automation Platform.
// No fictional proprietary operations. Use ericsson.eiap.unknown.* placeholders.

export const ERICSSON_EIAP_VOCABULARY = {
  version: '0.1',
  fullName: 'Ericsson Intelligent Automation Platform',
  sourceGaps: [
    'Ericsson EIAP proprietary API specifications are not publicly available',
    'EIAP-specific authorization model is not documented in public sources',
    'EIAP-specific actuation semantics are not documented in public sources',
    'EIAP-specific model deployment optimization semantics are not documented in public sources',
    'EIAP-specific callback/egress destinations are not documented in public sources',
  ],
  // Only public O-RAN R1 terms that EIAP is known to extend
  extendedCapabilities: [] as Array<{
    capabilityId: string;
    family: CapabilityFamily;
    description: string;
    proprietary: true;
  }>,
  // Section 23: Generic extension placeholders — no fictional operations
  unknownExtensionPlaceholders: [
    'ericsson.eiap.unknown.policy-management',
    'ericsson.eiap.unknown.model-management',
    'ericsson.eiap.unknown.callback-egress',
    'ericsson.eiap.unknown.actuation-optimization',
  ],
} as const;

// ─── Section 17/18: Ericsson Source-Truth Matrix ─────────────────────────────

export interface SourceTruthEntry {
  capabilityId: string;
  claimKey: string;
  sourceType: 'O_RAN_PUBLIC' | 'ERICSSON_PUBLIC' | 'ERICSSON_PROPRIETARY' | 'HAIEC_NATIVE' | 'UNKNOWN';
  coverageStatus: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED';
  implementationStatus: TelecomRuleImplementationStatus;
  evidenceProducers: string[];
  notes: string;
}

export const ERICSSON_SOURCE_TRUTH_MATRIX: SourceTruthEntry[] = [
  // Privileged action authorization
  {
    capabilityId: 'r1.a1-policy.create',
    claimKey: 'privileged-action-authorization',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 A1 policy creation is publicly specified in v11.00. HAIEC static scanner can detect authorization patterns.',
  },
  {
    capabilityId: 'r1.a1-policy.update',
    claimKey: 'privileged-action-authorization',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 A1 policy update is publicly specified in v11.00. Authorization check detection is partial.',
  },
  {
    capabilityId: 'r1.configuration-management.write',
    claimKey: 'privileged-action-authorization',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 configuration write is publicly specified in v11.00. Authorization check detection is partial.',
  },
  // Section 23: No fictional EIAP proprietary capability
  {
    capabilityId: 'ericsson.eiap.unknown.policy-management',
    claimKey: 'privileged-action-authorization',
    sourceType: 'ERICSSON_PROPRIETARY',
    coverageStatus: 'UNKNOWN',
    implementationStatus: 'REFERENCE_ONLY',
    evidenceProducers: [],
    notes: 'EIAP proprietary policy management semantics are unknown. Cannot evaluate without Ericsson EIAP specification. Must fail to REVIEW.',
  },
  // Untrusted input boundary
  {
    capabilityId: 'r1.data-subscription.subscribe',
    claimKey: 'untrusted-input-boundary',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 data subscription input handling is partially specified in v11.00.',
  },
  {
    capabilityId: 'r1.callback.register',
    claimKey: 'untrusted-input-boundary',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'STATIC_DETECTOR_ACTIVE',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 callback registration is publicly specified in v11.00. Destination validation detection is partial.',
  },
  // Runtime safety observation
  {
    capabilityId: 'r1.service-management.create',
    claimKey: 'runtime-safety-observation',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'RUNTIME_TEST_ACTIVE',
    evidenceProducers: ['saas-runtime'],
    notes: 'O-RAN R1 service management runtime behavior can be observed via runtime tests.',
  },
  // Model lifecycle
  {
    capabilityId: 'r1.ai-ml.deploy',
    claimKey: 'ai-inventory-completeness',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'RUNTIME_TEST_ACTIVE',
    evidenceProducers: ['saas-inventory', 'saas-static'],
    notes: 'O-RAN R1 ML model deployment can be inventoried. Static scanner can detect deploy patterns.',
  },
  {
    capabilityId: 'r1.ai-ml.retire',
    claimKey: 'ai-inventory-completeness',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    implementationStatus: 'PARTIAL_ENGINE_SUPPORT',
    evidenceProducers: ['saas-inventory', 'saas-static'],
    notes: 'O-RAN R1 ML model retire partially covered by inventory.',
  },
  {
    capabilityId: 'ericsson.eiap.unknown.model-management',
    claimKey: 'ai-inventory-completeness',
    sourceType: 'ERICSSON_PROPRIETARY',
    coverageStatus: 'UNKNOWN',
    implementationStatus: 'REFERENCE_ONLY',
    evidenceProducers: [],
    notes: 'EIAP proprietary model management semantics are unknown. Cannot inventory without Ericsson EIAP specification. Must fail to REVIEW.',
  },
] as const;

// ─── Section 19/21: O-RAN R1 Interface Specification (POC) ───────────────────
//
// Source: O-RAN-WG6 Application Protocols for R1 Services v11.00
// Unknown operations → REVIEW, not ALLOW.
// Section 21: registerCallback must NOT become MODEL_LIFECYCLE.

export const ORAN_R1_POC_SPECIFICATION: InterfaceSpecification = {
  specificationId: 'oran-wg6-r1',
  // Section 19: Corrected source version
  specificationVersion: 'v11.00-poc',
  specificationDigest: 'oran-r1-application-protocols-v11.00-poc',
  operations: [
    { operationId: 'listServices', method: 'GET', routeTemplate: '/services' },
    { operationId: 'createService', method: 'POST', routeTemplate: '/services' },
    { operationId: 'deleteService', method: 'DELETE', routeTemplate: '/services/{id}' },
    { operationId: 'getPolicy', method: 'GET', routeTemplate: '/policies/{id}' },
    { operationId: 'createPolicy', method: 'POST', routeTemplate: '/policies' },
    { operationId: 'updatePolicy', method: 'PUT', routeTemplate: '/policies/{id}' },
    { operationId: 'deletePolicy', method: 'DELETE', routeTemplate: '/policies/{id}' },
    { operationId: 'subscribeData', method: 'POST', routeTemplate: '/data/subscriptions' },
    { operationId: 'unsubscribeData', method: 'DELETE', routeTemplate: '/data/subscriptions/{id}' },
    { operationId: 'deployModel', method: 'POST', routeTemplate: '/models' },
    { operationId: 'retireModel', method: 'DELETE', routeTemplate: '/models/{id}' },
    // Section 21: registerCallback is exact O-RAN operation — must NOT become MODEL_LIFECYCLE
    { operationId: 'registerCallback', method: 'POST', routeTemplate: '/callbacks' },
    { operationId: 'unregisterCallback', method: 'DELETE', routeTemplate: '/callbacks/{id}' },
    { operationId: 'registerData', method: 'POST', routeTemplate: '/data/products' },
    { operationId: 'discoverData', method: 'GET', routeTemplate: '/data/products' },
    { operationId: 'readData', method: 'GET', routeTemplate: '/data/products/{id}' },
  ],
};

// ─── Section 17/18: Telecom Rule Coverage Matrix ─────────────────────────────
//
// Status now reflects implementationStatus, not just rule.status.

export interface RuleCoverageEntry {
  ruleId: string;
  detectionStatus: TelecomRuleImplementationStatus;
  staticCoverage: boolean;
  runtimeCoverage: boolean;
  actionWitnessRequired: boolean;
  notes: string;
  detectorMapping?: string;
}

/**
 * Section 17: Coverage matrix with ACTUAL implementation status.
 * A profile rule definition alone is NEVER an ACTIVE detector.
 */
export const TELECOM_RULE_COVERAGE_MATRIX: RuleCoverageEntry[] = TELECOM_RULES.map(rule => ({
  ruleId: rule.ruleId,
  detectionStatus: rule.implementationStatus ?? 'PROFILE_DEFINED',
  staticCoverage: rule.implementationStatus === 'STATIC_DETECTOR_ACTIVE' || rule.implementationStatus === 'PARTIAL_ENGINE_SUPPORT',
  runtimeCoverage: rule.implementationStatus === 'RUNTIME_TEST_ACTIVE' || rule.implementationStatus === 'ACTION_WITNESS_ACTIVE',
  actionWitnessRequired: rule.capabilityFamily === 'TOOL_ACTION_EXECUTION' ||
    rule.capabilityFamily === 'CONFIGURATION_ACTUATION' ||
    rule.implementationStatus === 'ACTION_WITNESS_ACTIVE',
  notes: rule.description,
  detectorMapping: rule.detectorMapping
    ? `${rule.detectorMapping.scannerModule ?? 'n/a'} / ${rule.detectorMapping.findingIdentity ?? 'n/a'}`
    : 'n/a',
}));

// ─── Section 23: EIAP Spec Gaps ──────────────────────────────────────────────

export const ERICSSON_EIAP_SPEC_GAPS = {
  gaps: [
    {
      gapId: 'eiap-gap-001',
      description: 'EIAP proprietary authorization model',
      impact: 'Cannot evaluate EIAP-specific privileged action authorization claims',
      disposition: 'REVIEW',
    },
    {
      gapId: 'eiap-gap-002',
      description: 'EIAP proprietary actuation semantics',
      impact: 'Cannot evaluate EIAP-specific configuration actuation claims',
      disposition: 'REVIEW',
    },
    {
      gapId: 'eiap-gap-003',
      description: 'EIAP proprietary model deployment optimization',
      impact: 'Cannot evaluate EIAP-specific model lifecycle claims',
      disposition: 'REVIEW',
    },
    {
      gapId: 'eiap-gap-004',
      description: 'EIAP proprietary callback/egress destinations',
      impact: 'Cannot evaluate EIAP-specific external egress claims',
      disposition: 'REVIEW',
    },
  ],
  policy: 'Unknown proprietary EIAP operations MUST fail to REVIEW, never ALLOW. Do not invent private Ericsson semantics.',
} as const;

// ─── Section 19: Safe POC Architecture ───────────────────────────────────────

export const ERICSSON_ORAN_POC_ARCHITECTURE = {
  architectureId: 'ericsson-oran-poc-v01',
  version: '0.1',
  r1SourceVersion: 'O-RAN-WG6.R1-Application-Protocols-v11.00',
  components: [
    {
      componentId: 'rapp-host',
      description: 'rApp hosting platform (O-RAN R1 interface)',
      usesPublicSpec: true,
      proprietarySemantics: false,
    },
    {
      componentId: 'a1-policy-management',
      description: 'A1 policy management (O-RAN public spec)',
      usesPublicSpec: true,
      proprietarySemantics: false,
    },
    {
      componentId: 'eiap-extension',
      description: 'Ericsson Intelligent Automation Platform extension (proprietary — semantics unknown)',
      usesPublicSpec: false,
      proprietarySemantics: true,
      disposition: 'REVIEW',
    },
  ],
  evidenceProducers: ['saas-static', 'saas-runtime', 'saas-inventory'],
  constraints: [
    'Only public O-RAN R1 vocabulary from v11.00 is used for canonical Assurance',
    'Proprietary EIAP operations fail to REVIEW, never ALLOW',
    'No invented Ericsson semantics',
    'All unknown operations require explicit human review',
    'EIAP = Ericsson Intelligent Automation Platform',
  ],
} as const;

// ─── Section 24: Compliance / Framework Mapping Preparation ──────────────────
//
// Exact/source-backed mappings without claiming certification/compliance.

export const O_RAN_COMPLIANCE_MAPPINGS: FrameworkMappingEntry[] = [
  {
    framework: 'O-RAN_SECURITY_REQUIREMENTS',
    controlIds: ['R1-SEC-01', 'R1-SEC-02'],
    mappingStrength: 'EXACT_RULE_MAPPING',
    sourceReference: { type: 'O_RAN_SPEC', identifier: 'O-RAN-WG6.R1-Application-Protocols', version: 'v11.00' },
  },
  {
    framework: 'NIST_AI_RMF',
    controlIds: ['MEASURE-2.3', 'MEASURE-2.4'],
    mappingStrength: 'PROFILE_MAPPING',
    sourceReference: { type: 'HAIEC_INTERNAL', identifier: 'haiec-agentic-baseline', version: '1.0' },
  },
  {
    framework: 'NIST_CYBERSECURITY_FRAMEWORK',
    controlIds: ['PR.AC-1', 'PR.DS-5'],
    mappingStrength: 'HEURISTIC_SUGGESTION',
  },
  {
    framework: 'OWASP_LLM',
    controlIds: ['LLM01', 'LLM06'],
    mappingStrength: 'EXACT_RULE_MAPPING',
    sourceReference: { type: 'HAIEC_INTERNAL', identifier: 'haiec-agentic-baseline', version: '1.0' },
  },
  {
    framework: 'ISO_27001',
    controlIds: ['A.9.4.1', 'A.9.4.5'],
    mappingStrength: 'HEURISTIC_SUGGESTION',
  },
  {
    framework: 'ISO_42001',
    controlIds: ['5.2'],
    mappingStrength: 'PROFILE_MAPPING',
    sourceReference: { type: 'HAIEC_INTERNAL', identifier: 'haiec-agentic-baseline', version: '1.0' },
  },
];
