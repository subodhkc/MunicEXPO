/**
 * AI Action & Access Map — Topology Projection barrel
 */

export { buildTopologyProjection } from './topology-projector';

export type {
  TopologyProjectionResult,
  TopologyNode,
  TopologyEdge,
  TopologyNodeKind,
  TopologyEdgeKind,
  NodeAvailability,
  MapLens,
  SemanticZoom,
  PlaneStatusDisplay,
  SampleNodeContext,
} from './types';

export {
  TOPOLOGY_PROJECTION_SCHEMA_VERSION,
  TOPOLOGY_PROJECTION_VERSION,
  CUSTOMER_PLANE_ALIASES,
  TECHNICAL_PLANE_ALIASES,
  SUPPORTED_MAP_LENSES,
  SUPPORTED_SEMANTIC_ZOOM_LEVELS,
  LENS_LABELS,
  ZOOM_LABELS,
  AVAILABILITY_LABELS,
  SUBTYPE_LABELS,
  PLANE_STATUS_LABELS,
  EFFECT_LABELS,
} from './types';

export { stableNodeId, stableEdgeId, s } from './stable-ids';
