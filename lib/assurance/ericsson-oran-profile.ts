/**
 * E1 B13 — Ericsson / O-RAN Profile Foundation
 *
 * O-RAN profile ID/version: telecom.oran.rapp / 0.1
 * Ericsson EIAP extension ID/version: ericsson.eiap.rapp / 0.1
 *
 * R1 capability vocabulary: derived from public O-RAN WG6 R1 interface specs.
 *
 * CRITICAL: Do NOT invent private Ericsson semantics.
 * Where proprietary EIAP semantics are unavailable, use explicit unknown/review states
 * and document source gaps.
 *
 * Unknown proprietary EIAP operation fails to REVIEW, not ALLOW.
 */

import { CapabilityFact, CapabilityFamily, AuthorityClass, EvidenceMethod } from './types';
import { TELECOM_RULES } from './predefined-profiles';
import { InterfaceSpecification } from './profile-compiler';

// ─── B13: O-RAN R1 Capability Vocabulary ─────────────────────────────────────

/**
 * R1 capability vocabulary derived from public O-RAN WG6 R1 interface documentation.
 * Source: O-RAN-WG6 R1 Interface (publicly available specifications).
 *
 * These are PUBLIC O-RAN vocabulary terms, not proprietary Ericsson semantics.
 */
export const R1_CAPABILITY_VOCABULARY = {
  version: '0.1',
  capabilities: [
    // Service Management
    { capabilityId: 'r1.service-management.create', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Create rApp service instance' },
    { capabilityId: 'r1.service-management.delete', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Delete rApp service instance' },
    { capabilityId: 'r1.service-management.list', family: 'DATA_ACCESS' as CapabilityFamily, description: 'List rApp service instances' },
    // Policy Management
    { capabilityId: 'r1.policy-management.create', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Create A1 policy' },
    { capabilityId: 'r1.policy-management.delete', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Delete A1 policy' },
    { capabilityId: 'r1.policy-management.update', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'Update A1 policy' },
    { capabilityId: 'r1.policy-management.get', family: 'DATA_ACCESS' as CapabilityFamily, description: 'Get A1 policy' },
    // Data Subscription
    { capabilityId: 'r1.data-subscription.subscribe', family: 'RAG_CONTEXT_MEMORY' as CapabilityFamily, description: 'Subscribe to data stream' },
    { capabilityId: 'r1.data-subscription.unsubscribe', family: 'RAG_CONTEXT_MEMORY' as CapabilityFamily, description: 'Unsubscribe from data stream' },
    // Model Management
    { capabilityId: 'r1.model-management.deploy', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Deploy ML model' },
    { capabilityId: 'r1.model-management.retire', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'Retire ML model' },
    { capabilityId: 'r1.model-management.list', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'List deployed models' },
    // Callbacks/Egress
    { capabilityId: 'r1.callback.register', family: 'EXTERNAL_EGRESS' as CapabilityFamily, description: 'Register callback endpoint' },
  ],
} as const;

// ─── B13: Ericsson EIAP Extension Vocabulary ─────────────────────────────────

/**
 * Ericsson EIAP extension vocabulary.
 *
 * SOURCE GAP: Ericsson EIAP (Extensible Intelligent rApp Platform) proprietary
 * specifications are NOT publicly available. This vocabulary contains ONLY:
 *   1. Public O-RAN R1 terms that Ericsson EIAP extends
 *   2. Generic extension points (clearly marked as unknown)
 *
 * Any proprietary Ericsson EIAP operation that is not in this vocabulary
 * MUST fail to REVIEW — never ALLOW.
 */
export const ERICSSON_EIAP_VOCABULARY = {
  version: '0.1',
  sourceGaps: [
    'Ericsson EIAP proprietary API specifications are not publicly available',
    'EIAP-specific authorization model is not documented in public sources',
    'EIAP-specific actuation semantics are not documented in public sources',
  ],
  // Only public O-RAN R1 terms that EIAP is known to extend
  extendedCapabilities: [
    { capabilityId: 'eiap.r1-ext.policy-management.advanced-update', family: 'CONFIGURATION_ACTUATION' as CapabilityFamily, description: 'EIAP-extended A1 policy update (proprietary semantics unknown)', proprietary: true },
    { capabilityId: 'eiap.r1-ext.model-management.optimized-deploy', family: 'MODEL_LIFECYCLE' as CapabilityFamily, description: 'EIAP-optimized model deployment (proprietary semantics unknown)', proprietary: true },
  ],
} as const;

// ─── B13: Ericsson Source-Truth Matrix ───────────────────────────────────────

/**
 * B13: Ericsson source-truth matrix.
 *
 * Maps each capability/claim to its evidence source and coverage status.
 * Explicitly marks proprietary EIAP semantics as UNKNOWN.
 */
export interface SourceTruthEntry {
  capabilityId: string;
  claimKey: string;
  sourceType: 'O_RAN_PUBLIC' | 'ERICSSON_PUBLIC' | 'ERICSSON_PROPRIETARY' | 'HAIEC_NATIVE' | 'UNKNOWN';
  coverageStatus: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED';
  evidenceProducers: string[];
  notes: string;
}

export const ERICSSON_SOURCE_TRUTH_MATRIX: SourceTruthEntry[] = [
  // Privileged action authorization
  {
    capabilityId: 'r1.policy-management.create',
    claimKey: 'privileged-action-authorization',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 policy creation is publicly specified. HAIEC static scanner can detect authorization patterns.',
  },
  {
    capabilityId: 'r1.policy-management.update',
    claimKey: 'privileged-action-authorization',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 policy update is publicly specified. Authorization check detection is partial.',
  },
  {
    capabilityId: 'eiap.r1-ext.policy-management.advanced-update',
    claimKey: 'privileged-action-authorization',
    sourceType: 'ERICSSON_PROPRIETARY',
    coverageStatus: 'UNKNOWN',
    evidenceProducers: [],
    notes: 'EIAP advanced policy update semantics are proprietary. Cannot evaluate without Ericsson EIAP specification. Must fail to REVIEW.',
  },
  // Untrusted input boundary
  {
    capabilityId: 'r1.data-subscription.subscribe',
    claimKey: 'untrusted-input-boundary',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 data subscription input handling is partially specified.',
  },
  // Runtime safety observation
  {
    capabilityId: 'r1.service-management.create',
    claimKey: 'runtime-safety-observation',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-runtime'],
    notes: 'O-RAN R1 service management runtime behavior can be observed via runtime tests.',
  },
  // Model lifecycle
  {
    capabilityId: 'r1.model-management.deploy',
    claimKey: 'ai-inventory-completeness',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-inventory', 'saas-static'],
    notes: 'O-RAN R1 model deployment can be inventoried. Static scanner can detect deploy patterns.',
  },
  {
    capabilityId: 'eiap.r1-ext.model-management.optimized-deploy',
    claimKey: 'ai-inventory-completeness',
    sourceType: 'ERICSSON_PROPRIETARY',
    coverageStatus: 'UNKNOWN',
    evidenceProducers: [],
    notes: 'EIAP optimized model deployment semantics are proprietary. Cannot inventory without Ericsson EIAP specification. Must fail to REVIEW.',
  },
  // Callback/egress
  {
    capabilityId: 'r1.callback.register',
    claimKey: 'untrusted-input-boundary',
    sourceType: 'O_RAN_PUBLIC',
    coverageStatus: 'PARTIAL',
    evidenceProducers: ['saas-static'],
    notes: 'O-RAN R1 callback registration is publicly specified. Destination validation detection is partial.',
  },
];

// ─── B13: O-RAN R1 Interface Specification (POC) ─────────────────────────────

/**
 * B13: Safe proof-of-concept O-RAN R1 interface specification.
 *
 * This is a POC specification derived from PUBLIC O-RAN WG6 documentation.
 * It does NOT include any proprietary Ericsson EIAP extensions.
 *
 * Unknown operations in this specification fail to REVIEW, not ALLOW.
 */
export const ORAN_R1_POC_SPECIFICATION: InterfaceSpecification = {
  specificationId: 'oran-wg6-r1',
  specificationVersion: '0.1-poc',
  specificationDigest: 'oran-r1-poc-digest-v01',
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
    { operationId: 'registerCallback', method: 'POST', routeTemplate: '/callbacks' },
  ],
};

// ─── B13: Telecom Predefined Rules Coverage Matrix ───────────────────────────

export interface RuleCoverageEntry {
  ruleId: string;
  detectionStatus: 'ACTIVE' | 'PARTIAL_CAPABILITY' | 'PROFILE_ONLY' | 'NOT_YET_DETECTABLE';
  staticCoverage: boolean;
  runtimeCoverage: boolean;
  actionWitnessRequired: boolean;
  notes: string;
}

/**
 * B13: Coverage matrix for telecom predefined rules.
 * Maps each rule to its detection capabilities.
 */
export const TELECOM_RULE_COVERAGE_MATRIX: RuleCoverageEntry[] = TELECOM_RULES.map(rule => ({
  ruleId: rule.ruleId,
  detectionStatus: rule.status,
  staticCoverage: rule.status === 'ACTIVE',
  runtimeCoverage: rule.ruleType === 'SEQUENCE_RULE' || rule.ruleType === 'PATH_RULE',
  actionWitnessRequired: rule.capabilityFamily === 'TOOL_ACTION_EXECUTION' ||
    rule.capabilityFamily === 'CONFIGURATION_ACTUATION',
  notes: rule.description,
}));

// ─── B13: Ericsson EIAP Spec Gaps ────────────────────────────────────────────

/**
 * B13: Explicit private EIAP specification gaps.
 *
 * These gaps MUST be documented and MUST NOT be filled with invented semantics.
 * Unknown proprietary EIAP operations fail to REVIEW, not ALLOW.
 */
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

// ─── B13: Safe POC Architecture ──────────────────────────────────────────────

/**
 * B13: Safe proof-of-concept architecture for Ericsson/O-RAN.
 *
 * This POC architecture:
 *   1. Uses ONLY public O-RAN R1 vocabulary
 *   2. Marks all proprietary EIAP extensions as UNKNOWN/REVIEW
 *   3. Does not invent private Ericsson semantics
 *   4. Produces explicit review states for unknown operations
 */
export const ERICSSON_ORAN_POC_ARCHITECTURE = {
  architectureId: 'ericsson-oran-poc-v01',
  version: '0.1',
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
      description: 'Ericsson EIAP extension (proprietary — semantics unknown)',
      usesPublicSpec: false,
      proprietarySemantics: true,
      disposition: 'REVIEW',
    },
  ],
  evidenceProducers: ['saas-static', 'saas-runtime', 'saas-inventory'],
  constraints: [
    'Only public O-RAN R1 vocabulary is used for canonical Assurance',
    'Proprietary EIAP operations fail to REVIEW, never ALLOW',
    'No invented Ericsson semantics',
    'All unknown operations require explicit human review',
  ],
} as const;
