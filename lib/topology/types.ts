/**
 * AI Action & Access Map — Topology Projection Types
 *
 * Internal architecture name: Topology Projection
 * Customer-facing name: AI Action & Access Map
 *
 * This module defines the node/edge model for the map UI. It is a
 * DETERMINISTIC READ PROJECTION over persisted accepted-scan truth.
 *
 * @version topology-1.0.0
 */

// ─── Node Types ──────────────────────────────────────────────────────────────

export type TopologyNodeKind =
  | 'identity'
  | 'application_access'
  | 'entrypoint'
  | 'ai_execution'
  | 'action'
  | 'consequence'
  | 'connected_asset'
  | 'provider_iam'
  | 'evidence'
  | 'policy';

// ─── Customer-Friendly Plane Aliases ─────────────────────────────────────────
// Primary customer language for the five planes.
// Internal enum names appear only under Advanced/Technical details.

export const CUSTOMER_PLANE_ALIASES = {
  REQUESTED: 'What you intend the AI to do',
  POLICY_AUTHORIZED: 'What your policy allows',
  EFFECTIVELY_GRANTED: 'What its credentials actually allow',
  CODE_CAPABLE: 'What the application can technically do',
  OBSERVED: 'What HAIEC observed',
} as const;

// Technical aliases — for Advanced/Technical view only
export const TECHNICAL_PLANE_ALIASES = {
  REQUESTED: 'Requested',
  POLICY_AUTHORIZED: 'Policy Authorized',
  EFFECTIVELY_GRANTED: 'Effectively Granted',
  CODE_CAPABLE: 'Code Capable',
  OBSERVED: 'Observed',
} as const;

// ─── Map Lenses (customer-facing labels) ─────────────────────────────────────

export type MapLens = 'overview' | 'system' | 'action_consequence' | 'access_authority' | 'evidence_coverage';

export const SUPPORTED_MAP_LENSES: MapLens[] = ['overview', 'system', 'action_consequence', 'access_authority', 'evidence_coverage'];

export const LENS_LABELS: Record<MapLens, string> = {
  overview: 'Overview',
  system: 'System Map',
  action_consequence: 'Action → Consequence',
  access_authority: 'Access & Authority',
  evidence_coverage: 'Evidence & Coverage',
};

// ─── Semantic Zoom ───────────────────────────────────────────────────────────

export type SemanticZoom = 'summary' | 'standard' | 'detail';

export const SUPPORTED_SEMANTIC_ZOOM_LEVELS: SemanticZoom[] = ['summary', 'standard', 'detail'];

export const ZOOM_LABELS: Record<SemanticZoom, string> = {
  summary: 'Summary',
  standard: 'Standard',
  detail: 'Detail',
};

// ─── Node Availability (customer-friendly labels) ────────────────────────────

export type NodeAvailability =
  | 'AVAILABLE'
  | 'UNKNOWN'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'SOURCE_GAP';

export const AVAILABILITY_LABELS: Record<NodeAvailability, string> = {
  AVAILABLE: 'Source established',
  UNKNOWN: 'Not yet established',
  PARTIAL: 'Limited evidence',
  UNAVAILABLE: 'Unavailable',
  SOURCE_GAP: 'Evidence not available',
};

// ─── Customer-Friendly Subtype Labels ────────────────────────────────────────

export const SUBTYPE_LABELS: Record<string, string> = {
  // Subject kinds
  authenticated_user: 'Authenticated user',
  role: 'Role requirement',
  permission: 'Permission requirement',
  tenant: 'Tenant context',
  service_identity: 'Service identity',
  agent_identity: 'Agent identity',
  unknown: 'Unknown',
  // Guard types
  authentication: 'Authentication',
  role_check: 'Role requirement',
  permission_check: 'Permission requirement',
  tenant_filter: 'Tenant scoped',
  object_ownership: 'Object access',
  middleware: 'Middleware',
  decorator: 'Decorator',
  // Ordering
  BEFORE_SINK: 'guards before action',
  AFTER_SINK: 'guard occurs after action',
  AUTH_NOT_FOUND: 'authorization not established',
  AUTH_ORDER_UNKNOWN: 'authorization order unknown',
  // Provider IAM states
  OBSERVED_PARTIAL: 'Limited credential evidence',
  OBSERVED_NO_QUALIFIED: 'Credential evidence — no qualified grants',
  OBSERVATION_FAILED: 'Observation failed',
  NOT_OBSERVED: 'Not observed',
  // Policy states
  APPROVED: 'Approved policy',
  NOT_CONFIGURED: 'Policy not yet defined',
};

// ─── Plane Status Presentation Mapping (Part 3) ──────────────────────────────
// Maps raw native plane status values to customer-friendly labels.
// Raw values may appear under Technical details only.
// LOCK: CUSTOMER_LABEL != NATIVE_STATE_LOSS

export const PLANE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Source established',
  NOT_PROVIDED: 'Evidence not provided',
  NOT_EVALUATED: 'Not evaluated',
  EVALUATED_NO_QUALIFYING_FACTS: 'Evaluated — no qualifying evidence',
  NOT_SUPPORTED_BY_CURRENT_PRODUCER: 'Not supported by this evidence source',
  PARTIAL: 'Limited evidence',
  UNKNOWN: 'Not yet established',
  ABSENT: 'Evidence not available',
};

// ─── Capability Effect Labels (Part 7) ───────────────────────────────────────
// Source-backed effect vocabulary from canonical Capability semantics.

export const EFFECT_LABELS: Record<string, string> = {
  READ: 'Read',
  WRITE: 'Write / Update',
  CREATE: 'Persistence creation',
  UPDATE: 'Write / Update',
  DELETE: 'Delete',
  EXECUTE: 'Execute',
  EGRESS: 'External data transfer',
  NOTIFY: 'Notify',
  TRANSFER: 'External data transfer',
  FINANCIAL_MUTATION: 'Financial mutation',
  AUTHORITY_EXPANSION: 'Authority change',
  PERSISTENCE_CREATION: 'Persistence creation',
  CONFIGURATION_CHANGE: 'Configuration change',
  UNKNOWN: 'Consequence not established',
};

// ─── Sample-only inspector context (never set on production nodes) ───────────
// Optional display context for the sample Map demo. Production topology
// projectors never set this field, so it never appears in production.

export interface SampleNodeContext {
  /** True for all sample nodes — never set on production nodes */
  isSample: true;
  /** Authority context for the inspector (e.g. "Cloud credential") */
  sampleAuthorityContext?: string;
  /** Application context for the inspector (e.g. "Operations agent") */
  sampleApplicationContext?: string;
  /** Consequence context for the inspector (e.g. "Production network exposure") */
  sampleConsequence?: string;
  /** Evidence status copy (always "Illustrative sample") */
  sampleEvidenceStatus: string;
  /** Delegation state copy (always "Not established") */
  sampleDelegation: string;
  /** Observation state copy (always "No runtime observation connected") */
  sampleObservation: string;
  /** Illustrative five-plane status (sample-only, never on canonical planeStatus) */
  samplePlaneStatus?: PlaneStatusDisplay;
  /** Illustrative effect label (sample-only, never on canonical effect/effectLabel) */
  sampleEffectLabel?: string;
}

// ─── Node ────────────────────────────────────────────────────────────────────

export interface TopologyNode {
  id: string;
  label: string;
  kind: TopologyNodeKind;
  subType?: string;
  /** Customer-friendly subtype label */
  subTypeLabel?: string;
  aiReachable: boolean | 'UNKNOWN';
  availability: NodeAvailability;
  sourceLocation?: string;
  limitations: string[];
  /** Five-plane status for action nodes (ONLY when exact capability join exists) */
  planeStatus?: PlaneStatusDisplay;
  /** Whether five-plane status is from current source or historical evaluation */
  planeStatusBasis?: 'CURRENT_SOURCE' | 'EVALUATED_BASIS';
  /** Source-backed capability effect (ONLY when exact capability join exists) */
  effect?: string;
  /** Customer-friendly effect label */
  effectLabel?: string;
  /** Asset metadata for connected_asset nodes */
  assetProvider?: string;
  assetEnvironment?: string;
  assetConnectionState?: string;
  /** Scan/run provenance for detail zoom */
  scanId?: string;
  /** Sample-only inspector context (never set on production nodes) */
  sampleContext?: SampleNodeContext;
}

export interface PlaneStatusDisplay {
  requested: string;
  policyAuthorized: string;
  effectivelyGranted: string;
  codeCapable: string;
  observed: string;
}

// ─── Edge ────────────────────────────────────────────────────────────────────

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: TopologyEdgeKind;
  joinBasis: string;
  /** Visual style: solid (source-established), dashed (partial/structural), dotted (unresolved) */
  style: 'solid' | 'dashed' | 'dotted';
}

export type TopologyEdgeKind =
  | 'reaches'
  | 'guarded_by'
  | 'routes_to'
  | 'can_reach'
  | 'reachability_unknown'
  | 'not_ai_reachable'
  | 'produces'
  | 'connected_to'
  | 'uses_credential'
  | 'evidenced_by'
  | 'scoped_by'
  | 'governed_by';

// ─── Projection Result ───────────────────────────────────────────────────────

export interface TopologyProjectionResult {
  projectionSchemaVersion: string;
  sourceVersion: string;
  projectionScope: 'SCAN' | 'AI_SYSTEM' | 'ASSURANCE_EVALUATION';
  organizationId: string;
  aiSystemId: string;
  aiSystemName: string;
  scanId?: string;
  /** CURRENT — composite from current accepted sources (not historical snapshot) */
  primaryTimeBasis: 'CURRENT' | 'SCAN_RUN' | 'EVALUATED_SCOPE' | 'RUNTIME_OBSERVED';
  projectionHash: string;
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED';
  mapAvailability: NodeAvailability;
  limitations: string[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  scanProvenance?: {
    scanId: string;
    commitSha: string | null;
    scannerVersion: string | null;
    scannedAt: string | null;
  };
  providerIam?: {
    state: string;
    principalArn?: string;
    observedAt?: string;
    limitations: string[];
  };
  currentPolicy?: {
    state: string;
    envelopeId: string | null;
    version: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  /** Latest completed evaluation basis (historical, NOT current) */
  evaluatedBasis?: {
    state: string;
    evaluationId: string | null;
    evaluationSnapshotAt: string | null;
    disposition: string | null;
  };
  lenses: MapLens[];
  zoomLevels: SemanticZoom[];
}

export const TOPOLOGY_PROJECTION_SCHEMA_VERSION = 'topology-1.0.0' as const;
export const TOPOLOGY_PROJECTION_VERSION = 'topology-1.0.0' as const;
