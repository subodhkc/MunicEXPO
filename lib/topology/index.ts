/**
 * AI Action & Access Map — Topology Projection barrel
 */

export { buildTopologyProjection } from './topology-projector';
export {
  buildConstellationProjection,
  filterByScale,
  filterByLens,
  inferConstellationRole,
  isConstellationFrontierAvailability,
} from './constellation-presentation-projection';

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
  ConstellationScale,
  ConstellationLens,
  ConstellationNodeRole,
  ConstellationNode,
  ConstellationEdge,
  ConstellationCombo,
  ConstellationFrontier,
  ConstellationProjection,
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
  SUPPORTED_CONSTELLATION_SCALES,
  SUPPORTED_CONSTELLATION_LENSES,
  CONSTELLATION_SCALE_LABELS,
  CONSTELLATION_LENS_LABELS,
} from './types';

export { stableNodeId, stableEdgeId, s } from './stable-ids';
export { buildAssuranceVisualSnapshot } from './assurance-visual-snapshot';
export type { AssuranceVisualSnapshot } from './assurance-visual-snapshot';

export type {
  LayoutProfile,
  RegionId,
  ActionPresentationStage,
  RegionOrientation,
  PresentationRegionDescriptor,
  PresentationNodePosition,
} from './map-presentation-helpers';

export {
  lensToLayoutProfile,
  classifyNodeRegion,
  filterByZoom,
  computeNeighborhood,
  assignRegionLayout,
  assignActionStages,
  mapNodeToActionStage,
  buildPresentationRegions,
  getEffectBoundaryRow,
  shouldRenderEffectBoundary,
  getRegionLayer,
  NODE_ORIGIN,
  dagreToReactFlowPosition,
  ACTION_PRESENTATION_STAGES,
  ACTION_STAGE_LABELS,
} from './map-presentation-helpers';
