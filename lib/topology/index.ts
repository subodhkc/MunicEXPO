/**
 * AI Action & Access Map — Topology Projection barrel
 *
 * Internal architecture name: Topology Projection
 * Customer-facing name: AI Action & Access Map
 */

export {
  buildTopologyProjection,
} from './topology-projector';

export type {
  TopologyProjectionResult,
  TopologyNode,
  TopologyEdge,
  TopologyNodeKind,
  TopologyEdgeKind,
  NodeAvailability,
  MapLens,
  SemanticZoom,
} from './types';

export {
  TOPOLOGY_PROJECTION_SCHEMA_VERSION,
  TOPOLOGY_PROJECTION_VERSION,
  PLANE_ALIAS,
  SUPPORTED_MAP_LENSES,
  SUPPORTED_SEMANTIC_ZOOM_LEVELS,
} from './types';

export {
  stableNodeId,
  stableEdgeId,
  sanitizeSemanticKey,
} from './stable-ids';
