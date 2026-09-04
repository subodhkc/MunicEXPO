/**
 * AI Action & Access Map — Sample Projection (DEMO)
 *
 * A FIXED, SYNTHETIC, ILLUSTRATIVE topology projection for the Sample Map
 * experience. This is NOT evidence. It is NOT an Assurance evaluation. It
 * is NOT persisted. It does NOT call any production API, database, or
 * mutation endpoint.
 *
 * Permanent locks:
 *   SAMPLE_DATA != EVIDENCE
 *   SAMPLE_MAP != CUSTOMER_TOPOLOGY
 *   SYNTHETIC_RELATION != SOURCE_ESTABLISHED_RELATION
 *   ILLUSTRATIVE_OBSERVATION != OBSERVED_PLANE_FACT
 *   DEMO != ASSURANCE
 *
 * The sample DTO conforms to TopologyProjectionResult so the existing
 * presentation layer (ActionAccessMapView) can render it without a second
 * visualization implementation. The presentation layer does not treat
 * sample data as production truth — it renders whatever projection it
 * receives. The separation is enforced by:
 *   1. This file is the ONLY source of sample topology data
 *   2. The sample route uses this constant directly (no fetch)
 *   3. Node IDs use the `sample-node:` prefix (production uses `node:`)
 *   4. organizationId / aiSystemId are clearly synthetic
 *   5. No scanProvenance, no real commit SHA, no real scan ID
 *
 * Scenario: Production Incident Agent
 * Task: Investigate why checkout traffic is failing
 *
 * Core reveal:
 *   "Every control can be valid and the consequential choice can still be unproven."
 *   "Permission is not delegation."
 *
 * @version sample-1.0.0
 */

import type {
  TopologyProjectionResult,
  TopologyNode,
  TopologyEdge,
} from './types';
import { SUPPORTED_MAP_LENSES } from './types';
import { SUPPORTED_SEMANTIC_ZOOM_LEVELS } from './types';

// ─── Fixed sample node IDs (clearly synthetic, never collide with production) ─

const SN = {
  githubRepo: 'sample-node:connected_asset:github-repo',
  vercelHost: 'sample-node:connected_asset:vercel-host',
  apiLayer: 'sample-node:connected_asset:api-layer',
  aiProvider: 'sample-node:connected_asset:ai-provider',
  cloudInfra: 'sample-node:connected_asset:cloud-infra',
  database: 'sample-node:connected_asset:database-service',
  prodNetwork: 'sample-node:connected_asset:production-network',

  request: 'sample-node:identity:incident-request',
  incidentAgent: 'sample-node:ai_execution:production-incident-agent',
  toolRouter: 'sample-node:ai_execution:operations-tool-router',

  appAccess: 'sample-node:application_access:application-access',
  cloudCredential: 'sample-node:provider_iam:cloud-credential',
  networkTool: 'sample-node:action:production-network-tool',
  modifySecurityGroup: 'sample-node:action:modify-security-group',
  networkExposure: 'sample-node:consequence:production-network-exposure',

  serviceControlTool: 'sample-node:action:service-control-tool',
  restartService: 'sample-node:action:restart-production-service',
  stateChange: 'sample-node:consequence:production-state-change',

  policyEnvelope: 'sample-node:policy:operating-envelope',
} as const;

// ─── Shared sample context (the core reveal) ─────────────────────────────────

const SHARED_SAMPLE_CONTEXT = {
  isSample: true,
  sampleEvidenceStatus: 'Illustrative sample',
  sampleDelegation: 'Not established',
  sampleObservation: 'No runtime observation connected',
} as const;

// ─── Helper to build a sample node with optional context fields ───────────────

type SampleNodeOverrides = {
  sampleAuthorityContext?: string;
  sampleApplicationContext?: string;
  sampleConsequence?: string;
};

function sampleContext(overrides?: SampleNodeOverrides) {
  return {
    sampleContext: {
      ...SHARED_SAMPLE_CONTEXT,
      ...(overrides || {}),
    },
  };
}

// ─── Sample nodes ────────────────────────────────────────────────────────────

const SAMPLE_NODES: TopologyNode[] = [
  // ── Infrastructure context (connected_asset chain) ─────────────────────────
  {
    id: SN.githubRepo,
    label: 'GitHub Repository',
    kind: 'connected_asset',
    subType: 'source_repository',
    subTypeLabel: 'Source repository',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: [],
    assetProvider: 'GitHub',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.vercelHost,
    label: 'Vercel / Application Host',
    kind: 'connected_asset',
    subType: 'application_host',
    subTypeLabel: 'Application host',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: [],
    assetProvider: 'Vercel',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.apiLayer,
    label: 'Application / API Layer',
    kind: 'connected_asset',
    subType: 'application_layer',
    subTypeLabel: 'Application / API layer',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.aiProvider,
    label: 'AI Model / Provider',
    kind: 'connected_asset',
    subType: 'ai_provider',
    subTypeLabel: 'AI model / provider',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    assetProvider: 'Sample AI provider',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.cloudInfra,
    label: 'Cloud Infrastructure',
    kind: 'connected_asset',
    subType: 'cloud_infrastructure',
    subTypeLabel: 'Cloud infrastructure',
    aiReachable: 'UNKNOWN',
    availability: 'PARTIAL',
    limitations: ['Credential evidence — limited'],
    assetProvider: 'Sample cloud provider',
    assetEnvironment: 'Production (sample)',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.database,
    label: 'Database / Service',
    kind: 'connected_asset',
    subType: 'database_service',
    subTypeLabel: 'Database / service',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: ['Not yet established'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
  },
  {
    id: SN.prodNetwork,
    label: 'Production Network',
    kind: 'connected_asset',
    subType: 'production_network',
    subTypeLabel: 'Production network',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: ['Not yet established'],
    assetProvider: 'Sample cloud provider',
    assetEnvironment: 'Production (sample)',
    assetConnectionState: 'Illustrative',
  },

  // ── Action flow ────────────────────────────────────────────────────────────
  {
    id: SN.request,
    label: 'Investigate production incident',
    kind: 'identity',
    subType: 'agent_identity',
    subTypeLabel: 'Requested task',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({ sampleApplicationContext: 'Investigate why checkout traffic is failing' }),
  },
  {
    id: SN.incidentAgent,
    label: 'Production Incident Agent',
    kind: 'ai_execution',
    subType: 'agent',
    subTypeLabel: 'AI agent',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({ sampleApplicationContext: 'Operations agent' }),
  },
  {
    id: SN.toolRouter,
    label: 'Operations Tool Router',
    kind: 'ai_execution',
    subType: 'tool_router',
    subTypeLabel: 'Tool router',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({ sampleApplicationContext: 'Operations agent' }),
  },
  {
    id: SN.policyEnvelope,
    label: 'Operating Envelope (illustrative)',
    kind: 'policy',
    subType: 'operating_envelope',
    subTypeLabel: 'Illustrative policy state',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['Illustrative policy state — not a real approval'],
    ...sampleContext(),
  },

  // ── Branch 1: Network path ─────────────────────────────────────────────────
  {
    id: SN.appAccess,
    label: 'Application Access',
    kind: 'application_access',
    subType: 'service_identity',
    subTypeLabel: 'Application access',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({ sampleApplicationContext: 'Operations agent' }),
  },
  {
    id: SN.cloudCredential,
    label: 'Cloud Credential',
    kind: 'provider_iam',
    subType: 'OBSERVED_PARTIAL',
    subTypeLabel: 'Limited credential evidence',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: [
      'Credential evidence — limited',
      'Identity policy allows do not equal effective grants',
    ],
    ...sampleContext({ sampleAuthorityContext: 'Cloud credential' }),
  },
  {
    id: SN.networkTool,
    label: 'Production Network Tool',
    kind: 'action',
    subType: 'network_tool',
    subTypeLabel: 'Infrastructure tool',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({
      sampleApplicationContext: 'Operations agent',
      sampleAuthorityContext: 'Cloud credential',
    }),
    planeStatus: {
      requested: 'PRESENT',
      policyAuthorized: 'PRESENT',
      effectivelyGranted: 'PARTIAL',
      codeCapable: 'PRESENT',
      observed: 'NOT_PROVIDED',
    },
    planeStatusBasis: 'CURRENT_SOURCE',
  },
  {
    id: SN.modifySecurityGroup,
    label: 'Modify production network rule',
    kind: 'action',
    subType: 'security_group_modify',
    subTypeLabel: 'Modify security group',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [
      'Delegation not established',
      'No runtime observation connected',
    ],
    ...sampleContext({
      sampleApplicationContext: 'Operations agent',
      sampleAuthorityContext: 'Cloud credential',
      sampleConsequence: 'Production network exposure',
    }),
    effect: 'CONFIGURATION_CHANGE',
    effectLabel: 'Configuration change',
    planeStatus: {
      requested: 'PRESENT',
      policyAuthorized: 'PRESENT',
      effectivelyGranted: 'PARTIAL',
      codeCapable: 'PRESENT',
      observed: 'NOT_PROVIDED',
    },
    planeStatusBasis: 'CURRENT_SOURCE',
  },
  {
    id: SN.networkExposure,
    label: 'Production network exposure',
    kind: 'consequence',
    subType: 'network_exposure',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'Consequence not established — no runtime observation connected',
      'Delegation not established',
    ],
    effect: 'CONFIGURATION_CHANGE',
    effectLabel: 'Configuration change',
    ...sampleContext({ sampleConsequence: 'Production network exposure' }),
  },

  // ── Branch 2: Service path ─────────────────────────────────────────────────
  {
    id: SN.serviceControlTool,
    label: 'Service Control Tool',
    kind: 'action',
    subType: 'service_control',
    subTypeLabel: 'Service control tool',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({
      sampleApplicationContext: 'Operations agent',
      sampleAuthorityContext: 'Cloud credential',
    }),
    planeStatus: {
      requested: 'PRESENT',
      policyAuthorized: 'PRESENT',
      effectivelyGranted: 'PARTIAL',
      codeCapable: 'PRESENT',
      observed: 'NOT_PROVIDED',
    },
    planeStatusBasis: 'CURRENT_SOURCE',
  },
  {
    id: SN.restartService,
    label: 'Restart production service',
    kind: 'action',
    subType: 'service_restart',
    subTypeLabel: 'Restart production service',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [
      'Delegation not established',
      'No runtime observation connected',
    ],
    ...sampleContext({
      sampleApplicationContext: 'Operations agent',
      sampleAuthorityContext: 'Cloud credential',
      sampleConsequence: 'Production service state change',
    }),
    effect: 'CONFIGURATION_CHANGE',
    effectLabel: 'Configuration change',
    planeStatus: {
      requested: 'PRESENT',
      policyAuthorized: 'PRESENT',
      effectivelyGranted: 'PARTIAL',
      codeCapable: 'PRESENT',
      observed: 'NOT_PROVIDED',
    },
    planeStatusBasis: 'CURRENT_SOURCE',
  },
  {
    id: SN.stateChange,
    label: 'Production service state change',
    kind: 'consequence',
    subType: 'state_change',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'Consequence not established — no runtime observation connected',
      'Delegation not established',
    ],
    effect: 'CONFIGURATION_CHANGE',
    effectLabel: 'Configuration change',
    ...sampleContext({ sampleConsequence: 'Production service state change' }),
  },
];

// ─── Sample edges ────────────────────────────────────────────────────────────
// All structural edges are static (non-animated). The presentation layer
// enforces animated: false on all edges regardless.

const SAMPLE_EDGES: TopologyEdge[] = [
  // ── Infrastructure context chain ───────────────────────────────────────────
  {
    id: 'sample-edge:connected_to:github-to-vercel',
    source: SN.githubRepo,
    target: SN.vercelHost,
    label: 'deploys to',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:connected_to:vercel-to-api',
    source: SN.vercelHost,
    target: SN.apiLayer,
    label: 'hosts',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:connected_to:api-to-ai',
    source: SN.apiLayer,
    target: SN.aiProvider,
    label: 'calls',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:connected_to:ai-to-cloud',
    source: SN.aiProvider,
    target: SN.cloudInfra,
    label: 'reaches',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:cloud-to-db',
    source: SN.cloudInfra,
    target: SN.database,
    label: 'connects to',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:cloud-to-network',
    source: SN.cloudInfra,
    target: SN.prodNetwork,
    label: 'contains',
    kind: 'connected_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },

  // ── Action flow: request → agent → router ──────────────────────────────────
  {
    id: 'sample-edge:reaches:request-to-agent',
    source: SN.request,
    target: SN.incidentAgent,
    label: 'dispatches to',
    kind: 'reaches',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:routes_to:agent-to-router',
    source: SN.incidentAgent,
    target: SN.toolRouter,
    label: 'routes through',
    kind: 'routes_to',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:governed_by:router-to-policy',
    source: SN.toolRouter,
    target: SN.policyEnvelope,
    label: 'governed by',
    kind: 'governed_by',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },

  // ── Branch 1: network path ─────────────────────────────────────────────────
  {
    id: 'sample-edge:reaches:router-to-app-access',
    source: SN.toolRouter,
    target: SN.appAccess,
    label: 'uses',
    kind: 'reaches',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:uses_credential:app-access-to-credential',
    source: SN.appAccess,
    target: SN.cloudCredential,
    label: 'uses credential',
    kind: 'uses_credential',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },
  {
    id: 'sample-edge:reaches:credential-to-network-tool',
    source: SN.cloudCredential,
    target: SN.networkTool,
    label: 'reaches',
    kind: 'reaches',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },
  {
    id: 'sample-edge:can_reach:network-tool-to-modify-sg',
    source: SN.networkTool,
    target: SN.modifySecurityGroup,
    label: 'can reach',
    kind: 'can_reach',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:produces:modify-sg-to-exposure',
    source: SN.modifySecurityGroup,
    target: SN.networkExposure,
    label: 'produces',
    kind: 'produces',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:reaches:modify-sg-to-prod-network',
    source: SN.modifySecurityGroup,
    target: SN.prodNetwork,
    label: 'reaches',
    kind: 'reaches',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'dashed',
  },

  // ── Branch 2: service path ─────────────────────────────────────────────────
  {
    id: 'sample-edge:reaches:router-to-service-tool',
    source: SN.toolRouter,
    target: SN.serviceControlTool,
    label: 'uses',
    kind: 'reaches',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:can_reach:service-tool-to-restart',
    source: SN.serviceControlTool,
    target: SN.restartService,
    label: 'can reach',
    kind: 'can_reach',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
  {
    id: 'sample-edge:produces:restart-to-state-change',
    source: SN.restartService,
    target: SN.stateChange,
    label: 'produces',
    kind: 'produces',
    joinBasis: 'ILLUSTRATIVE_SAMPLE',
    style: 'solid',
  },
];

// ─── Fixed sample projection result ──────────────────────────────────────────

export const SAMPLE_PROJECTION: TopologyProjectionResult = {
  projectionSchemaVersion: 'topology-1.0.0',
  sourceVersion: 'sample-1.0.0',
  projectionScope: 'AI_SYSTEM',
  organizationId: 'sample-organization-illustrative',
  aiSystemId: 'sample-system-illustrative',
  aiSystemName: 'Production Incident Agent (Sample)',
  primaryTimeBasis: 'CURRENT',
  projectionHash: 'sample-projection-fixed-illustrative-hash-0001',
  coverage: 'PARTIAL',
  mapAvailability: 'AVAILABLE',
  limitations: [
    'Illustrative sample data — not evidence',
    'No runtime observation connected',
    'Delegation not established',
    'Credential evidence — limited',
  ],
  nodes: SAMPLE_NODES,
  edges: SAMPLE_EDGES,
  lenses: [...SUPPORTED_MAP_LENSES],
  zoomLevels: [...SUPPORTED_SEMANTIC_ZOOM_LEVELS],
  // No scanProvenance — this is not a real scan
  // No providerIam at projection level — credential evidence is shown on nodes
  // No currentPolicy — the policy node is illustrative
  // No evaluatedBasis — this is not an Assurance evaluation
};

// ─── Sample scenario metadata (for the page header) ──────────────────────────

export const SAMPLE_SCENARIO = {
  title: 'Explore a Sample AI Action & Access Map',
  subtitle:
    'See how identities, permissions, AI actions, APIs, infrastructure, data, and consequences connect—before you connect your own system.',
  bannerLabel: 'Sample environment — illustrative data',
  coreReveal: 'Every control can be valid and the consequential choice can still be unproven.',
  secondaryReveal: 'Permission is not delegation.',
  scenarioName: 'Production Incident Agent',
  scenarioTask: 'Investigate why checkout traffic is failing',
  delegationStateCopy: 'Not established',
  observedStateCopy: 'No runtime observation connected',
} as const;

// ─── Hard separation invariant ───────────────────────────────────────────────
// This constant proves the sample is not evidence. It is checked by tests.

export const SAMPLE_INVARIANTS = {
  IS_SAMPLE: true,
  IS_EVIDENCE: false,
  IS_ASSURANCE: false,
  IS_PERSISTED: false,
  CALLS_PRODUCTION_API: false,
  CREATES_AI_SYSTEM: false,
  CREATES_DECISION_RECEIPT: false,
  FABRICATES_RUNTIME_OBSERVATION: false,
} as const;
