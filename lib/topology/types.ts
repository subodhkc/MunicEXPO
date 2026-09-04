/**
 * AI Action & Access Map — Topology Projection Types
 *
 * Internal architecture name: Topology Projection
 * Customer-facing name: AI Action & Access Map
 *
 * This module defines the node/edge model for the map UI. It is a
 * DETERMINISTIC READ PROJECTION over persisted accepted-scan truth.
 *
 * It does NOT:
 *   - rerun static analysis
 *   - create a new graph database
 *   - create a new Evidence store
 *   - create a new Assurance engine
 *   - create a new Capability engine
 *   - create a new risk-score engine
 *   - inject synthetic user/role/action facts
 *
 * LOCK: MAP_REQUEST != STATIC_REANALYSIS
 * LOCK: RENDERER != ANALYZER
 * LOCK: GRAPH_PRESENTATION != GRAPH_TRUTH
 * LOCK: TOPOLOGY_EDGE != NEW_EVIDENCE
 * LOCK: CODE_RBAC != EFFECTIVELY_GRANTED
 * LOCK: PARTIAL_AWS_OBSERVATION != EFFECTIVELY_GRANTED
 * LOCK: FIELD_ABSENT != FIELD_PRESENT_EMPTY
 *
 * @version topology-1.0.0
 */

// ─── Node Types ──────────────────────────────────────────────────────────────

/**
 * Customer-friendly node categories.
 * These map to the five-plane authority model without exposing internal IDs.
 */
export type TopologyNodeKind =
  | 'identity'           // User, Admin, Member, Service identity, Agent
  | 'application_access' // Authentication, Role guard, Permission guard, Tenant boundary
  | 'ai_execution'       // AI System, Agent, Model, Tool selection
  | 'action'             // API, MCP/tool, DB, queue, external provider
  | 'consequence'        // read data, write data, delete, send externally, financial mutation
  | 'provider_iam'       // Provider credential/IAM (separate branch)
  | 'evidence'           // Evidence (separate overlay)
  | 'runtime'            // Runtime observation (separate overlay)
  | 'policy';            // Organizational policy (separate overlay)

/**
 * Customer-friendly plane aliases for the five internal authority planes.
 * Internal plane names are NOT exposed in customer UI.
 */
export const PLANE_ALIAS = {
  REQUESTED: 'Requested',
  POLICY_AUTHORIZED: 'Policy Authorized',
  EFFECTIVELY_GRANTED: 'Effectively Granted',
  CODE_CAPABLE: 'Code Capable',
  OBSERVED: 'Observed',
} as const;

/**
 * Map lens — customer-facing view modes.
 */
export type MapLens = 'access' | 'actions' | 'consequences' | 'authority' | 'evidence';

export const SUPPORTED_MAP_LENSES: MapLens[] = ['access', 'actions', 'consequences', 'authority', 'evidence'];

/**
 * Semantic zoom level — controls detail shown in the map.
 */
export type SemanticZoom = 'summary' | 'standard' | 'detail';

export const SUPPORTED_SEMANTIC_ZOOM_LEVELS: SemanticZoom[] = ['summary', 'standard', 'detail'];

// ─── Node ────────────────────────────────────────────────────────────────────

export interface TopologyNode {
  /** Stable node ID (deterministic — based on semantic identity, not array index) */
  id: string;
  /** Customer-friendly label */
  label: string;
  /** Node kind/category */
  kind: TopologyNodeKind;
  /** Sub-type for finer classification */
  subType?: string;
  /** Plane alias if this node represents a plane */
  planeAlias?: string;
  /** Whether this node is AI-reachable */
  aiReachable: boolean | 'UNKNOWN';
  /** Availability status — preserves unavailable/partial/unknown/source-gap */
  availability: NodeAvailability;
  /** Source location if applicable */
  sourceLocation?: string;
  /** Limitations specific to this node */
  limitations: string[];
}

/**
 * Node availability — preserves unknown/partial/unavailable/source-gap semantics.
 * NEVER silently becomes 'available'.
 */
export type NodeAvailability =
  | 'AVAILABLE'
  | 'UNKNOWN'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'SOURCE_GAP';

// ─── Edge ────────────────────────────────────────────────────────────────────

export interface TopologyEdge {
  /** Stable edge ID (deterministic) */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Customer-friendly edge label */
  label: string;
  /** Edge kind */
  kind: TopologyEdgeKind;
  /** Join basis — reuses wave0 JoinBasis vocabulary */
  joinBasis: string;
}

export type TopologyEdgeKind =
  | 'reaches'           // identity → application_access → action
  | 'guarded_by'        // action → application_access
  | 'executes'          // ai_execution → action
  | 'produces'          // action → consequence
  | 'observed_by'       // node → evidence/runtime overlay
  | 'authorized_by'     // node → provider_iam / policy overlay
  | 'contains';         // parent → child (e.g., AI System contains Agent)

// ─── Projection Result ───────────────────────────────────────────────────────

/**
 * The full topology projection result for the map.
 *
 * This extends the wave0 TopologyProjectionEnvelope with presentation nodes/edges
 * for the graph UI. The canonical hash is computed from the wave0 envelope
 * (relations/sourceRefs/evidenceRefs), NOT from presentation state.
 *
 * LOCK: GRAPH_PRESENTATION != GRAPH_TRUTH
 */
export interface TopologyProjectionResult {
  /** Projection schema version */
  projectionSchemaVersion: string;
  /** Source version (scanner/projection version) */
  sourceVersion: string;
  /** Projection scope — reuses wave0 */
  projectionScope: 'SCAN' | 'AI_SYSTEM' | 'ASSURANCE_EVALUATION';
  /** Organization identity */
  organizationId: string;
  /** AI System identity */
  aiSystemId: string;
  /** AI System name (for display) */
  aiSystemName: string;
  /** Scan identity */
  scanId?: string;
  /** Primary time basis — reuses wave0 */
  primaryTimeBasis: 'CURRENT' | 'SCAN_RUN' | 'EVALUATED_SCOPE' | 'RUNTIME_OBSERVED';
  /** Deterministic projection hash (from wave0 canonical payload) */
  projectionHash: string;
  /** Coverage — reuses wave0 Gate4CCoverageStatus */
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED';
  /** Overall availability of the map */
  mapAvailability: NodeAvailability;
  /** Limitations affecting this projection */
  limitations: string[];
  /** Nodes for the graph UI */
  nodes: TopologyNode[];
  /** Edges for the graph UI */
  edges: TopologyEdge[];
  /** Scan provenance */
  scanProvenance?: {
    scanId: string;
    commitSha: string | null;
    scannerVersion: string | null;
    scannedAt: string | null;
  };
  /** Provider IAM observation (partial — separate branch) */
  providerIam?: {
    state: string;
    principalArn?: string;
    observedAt?: string;
    limitations: string[];
  };
  /** Supported lenses */
  lenses: MapLens[];
  /** Supported zoom levels */
  zoomLevels: SemanticZoom[];
}

export const TOPOLOGY_PROJECTION_SCHEMA_VERSION = 'topology-1.0.0' as const;
export const TOPOLOGY_PROJECTION_VERSION = 'topology-1.0.0' as const;
