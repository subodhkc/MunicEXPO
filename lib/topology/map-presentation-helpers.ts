/**
 * Map Presentation Helpers — Pure functions for testable presentation logic
 *
 * These are PRESENTATION-ONLY functions extracted from ActionAccessMapView
 * so that tests can invoke the actual production owner instead of
 * duplicating logic inside test files.
 *
 * LOCK: PRESENTATION_MODULE != TOPOLOGY_TRUTH
 * LOCK: PRESENTATION_REGION != TOPOLOGY_NODE
 * LOCK: ASSET_SUBTYPE MAY_DRIVE PRESENTATION_REGION
 * LOCK: DISPLAY_NAME_KEYWORD != ARCHITECTURE_ROLE_PROOF
 * LOCK: LAYOUT_PROFILE != TOPOLOGY_SEMANTIC
 * LOCK: ONE_UNIVERSAL_LAYOUT != HTML_REPLICA
 * LOCK: HTML_NODE_POSITION != CANONICAL_PRODUCTION_NODE_POSITION
 * LOCK: HTML_SPATIAL_GRAMMAR = PRODUCTION_LAYOUT_TEMPLATE
 *
 * @version presentation-helpers-2.0.0 — LayoutProfile + neutral region
 */

import type { TopologyNode, TopologyEdge, MapLens, SemanticZoom } from './types';
import { ARCHITECTURE_REGIONS, getRegionForKind } from './map-presentation';

// ─── Region ID type ──────────────────────────────────────────────────────────

export type RegionId =
  | 'source-deployment'
  | 'access-authority'
  | 'ai-execution'
  | 'action-surface'
  | 'state-consequence'
  | 'evidence-assurance'
  | 'unclassified-infrastructure'; // neutral — NOT source/build

// ─── Layout Profile ──────────────────────────────────────────────────────────
// Different customer stories require different presentation layouts.
// LOCK: ONE_UNIVERSAL_SIX_COLUMN_LAYOUT != HTML_REPLICA

export type LayoutProfile = 'SYSTEM_ARCHITECTURE' | 'ACTION_CONSEQUENCE' | 'ACCESS_AUTHORITY' | 'EVIDENCE_ASSURANCE';

/**
 * Map a customer lens to a layout profile.
 * The layout profile controls region placement, shape, guides, and boundary.
 */
export function lensToLayoutProfile(lens: MapLens): LayoutProfile {
  switch (lens) {
    case 'system':
      return 'SYSTEM_ARCHITECTURE';
    case 'action_consequence':
      return 'ACTION_CONSEQUENCE';
    case 'access_authority':
      return 'ACCESS_AUTHORITY';
    case 'evidence_coverage':
      return 'EVIDENCE_ASSURANCE';
    case 'overview':
    default:
      return 'SYSTEM_ARCHITECTURE';
  }
}

// ─── Connected Asset region classification by subType ────────────────────────
// LOCK: ASSET_SUBTYPE MAY_DRIVE PRESENTATION_REGION
// LOCK: DISPLAY_NAME_KEYWORD != ARCHITECTURE_ROLE_PROOF
// LOCK: UNKNOWN_ROLE != SOURCE_BUILD_ROLE
// LOCK: NEUTRAL != SOURCE_DEPLOYMENT

const ASSET_REGION_MAP: Record<string, RegionId> = {
  SOURCE_REPOSITORY: 'source-deployment',
  CONTAINER_IMAGE: 'source-deployment',
  DEPLOYMENT: 'source-deployment',
  MODEL_ENDPOINT: 'ai-execution',
  TOOL_SERVER: 'ai-execution',
  RUNTIME_ENDPOINT: 'action-surface',
  INTERFACE_SPECIFICATION: 'action-surface',
  KNOWLEDGE_BASE: 'state-consequence',
  POLICY_SOURCE: 'access-authority',
  PROVIDER_CREDENTIAL: 'access-authority',
  PROVIDER_PROJECT: 'unclassified-infrastructure', // neutral — NOT source/build
  OTHER: 'unclassified-infrastructure', // ambiguous — neutral, no fabricated semantic role
};

/**
 * Classify a node into a presentation region.
 *
 * For connected_asset nodes, uses source-established subType (assetType).
 * For other nodes, falls back to domain-based region.
 *
 * LOCK: DISPLAY_NAME_USED_TO_GUESS_REGION = NO
 * LOCK: CANVAS_REGION == INSPECTOR_REGION
 */
export function classifyNodeRegion(node: TopologyNode): RegionId {
  if (node.kind === 'connected_asset' && node.subType) {
    const region = ASSET_REGION_MAP[node.subType];
    if (region) return region;
    // Unknown asset type → neutral unclassified, NOT source/build
    return 'unclassified-infrastructure';
  }
  // Non-asset nodes: use domain-based region from map-presentation
  const regionKey = getRegionForKind(node.kind);
  if (regionKey && regionKey in ARCHITECTURE_REGIONS) {
    return regionKey as RegionId;
  }
  return 'unclassified-infrastructure'; // neutral fallback
}

// ─── Lens filtering (production owner) ───────────────────────────────────────

export function filterByLens(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  lens: MapLens,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  const visibleKinds = new Set<string>();
  switch (lens) {
    case 'overview':
      return { nodes, edges };
    case 'system':
      visibleKinds.add('ai_execution');
      visibleKinds.add('connected_asset');
      visibleKinds.add('policy');
      visibleKinds.add('provider_iam');
      break;
    case 'action_consequence':
      visibleKinds.add('ai_execution');
      visibleKinds.add('entrypoint');
      visibleKinds.add('action');
      visibleKinds.add('consequence');
      break;
    case 'access_authority':
      visibleKinds.add('identity');
      visibleKinds.add('application_access');
      visibleKinds.add('entrypoint');
      visibleKinds.add('action');
      visibleKinds.add('policy');
      visibleKinds.add('provider_iam');
      break;
    case 'evidence_coverage':
      visibleKinds.add('ai_execution');
      visibleKinds.add('evidence');
      visibleKinds.add('action');
      visibleKinds.add('connected_asset');
      break;
  }
  const filteredNodes = nodes.filter((n) => visibleKinds.has(n.kind));
  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  return { nodes: filteredNodes, edges: filteredEdges };
}

// ─── Semantic zoom filtering (production owner) ──────────────────────────────

export function filterByZoom(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  zoom: SemanticZoom,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  switch (zoom) {
    case 'summary': {
      const summaryKinds = new Set(['ai_execution', 'policy', 'provider_iam', 'evidence', 'connected_asset', 'consequence']);
      const filteredNodes = nodes.filter((n) => summaryKinds.has(n.kind));
      const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
      return { nodes: filteredNodes, edges: filteredEdges };
    }
    case 'standard': {
      const filteredNodes = nodes.map((n) => ({ ...n, sourceLocation: undefined }));
      return { nodes: filteredNodes, edges };
    }
    case 'detail':
      return { nodes, edges };
    default:
      return { nodes, edges };
  }
}

// ─── Focus neighborhood computation (production owner) ───────────────────────

export function computeNeighborhood(
  focusedNodeId: string | null,
  edges: TopologyEdge[],
): Set<string> | null {
  if (!focusedNodeId) return null;
  const neighbors = new Set<string>([focusedNodeId]);
  for (const edge of edges) {
    if (edge.source === focusedNodeId) neighbors.add(edge.target);
    if (edge.target === focusedNodeId) neighbors.add(edge.source);
  }
  return neighbors;
}

// ─── Region layout assignment ────────────────────────────────────────────────
// Assigns each node to a presentation region.
// The layout profile determines the spatial grammar.
//
// LOCK: REGION_LAYOUT != LINEAR_PIPELINE
// LOCK: DIRECTIONAL != ONE_STRAIGHT_LINE
// LOCK: DIFFERENT_CUSTOMER_STORY MAY_REQUIRE DIFFERENT_PRESENTATION_LAYOUT

export interface PresentationNodePosition {
  id: string;
  region: RegionId;
  layer: number;
  x: number;
  y: number;
}

// System Architecture: 5-column top row + semantic zoom area + assurance bottom
// Action→Consequence: 7 horizontal layers with effect boundary between layer 5 and 6
// Access Authority: identity/access/policy/provider_iam focused
// Evidence Assurance: evidence/ai_execution/action focused

export function getRegionLayer(region: RegionId, profile: LayoutProfile = 'SYSTEM_ARCHITECTURE'): number {
  if (profile === 'ACTION_CONSEQUENCE') {
    // Horizontal layers: top to bottom
    const layerMap: Record<RegionId, number> = {
      'source-deployment': 0, // Layer 1: input/context
      'access-authority': 1, // Layer 2-3: instruction authority + agent authority
      'ai-execution': 2, // Layer 3: agent core
      'action-surface': 3, // Layer 4-5: action construction + mediation
      'state-consequence': 5, // Layer 6: execution/consequence (AFTER effect boundary)
      'evidence-assurance': 6, // Layer 7: assurance
      'unclassified-infrastructure': 0,
    };
    return layerMap[region] ?? 0;
  }
  // System Architecture: left to right columns
  const layerMap: Record<RegionId, number> = {
    'source-deployment': 0,
    'access-authority': 1,
    'ai-execution': 2,
    'action-surface': 3,
    'state-consequence': 4,
    'evidence-assurance': 5,
    'unclassified-infrastructure': 2, // neutral — place near center
  };
  return layerMap[region] ?? 0;
}

export function assignRegionLayout(nodes: TopologyNode[], profile: LayoutProfile = 'SYSTEM_ARCHITECTURE'): Map<string, { region: RegionId; layer: number }> {
  const assignments = new Map<string, { region: RegionId; layer: number }>();
  for (const node of nodes) {
    const region = classifyNodeRegion(node);
    const layer = getRegionLayer(region, profile);
    assignments.set(node.id, { region, layer });
  }
  return assignments;
}

// ─── Effect commit boundary detection ────────────────────────────────────────
// In Action→Consequence layout, detect whether a consequence/effect boundary
// should be rendered HORIZONTALLY between pre-effect nodes and effect/consequence nodes.
//
// LOCK: EFFECT_BOUNDARY != VULNERABILITY_BOUNDARY
// LOCK: EFFECT_BOUNDARY != RUNTIME_OBSERVATION
// LOCK: PRESENTATION_BOUNDARY != NEW_GRAPH_TRUTH
// LOCK: HTML_EFFECT_BOUNDARY_DIRECTION = HORIZONTAL

export function shouldRenderEffectBoundary(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  lens: MapLens,
): boolean {
  if (lens !== 'action_consequence') return false;
  const hasConsequence = nodes.some((n) => n.kind === 'consequence');
  const hasPreEffect = nodes.some((n) => n.kind === 'action' || n.kind === 'entrypoint' || n.kind === 'ai_execution');
  const hasEdgeToConsequence = edges.some((e) => {
    const source = nodes.find((n) => n.id === e.source);
    const target = nodes.find((n) => n.id === e.target);
    return (source && (source.kind === 'action' || source.kind === 'entrypoint' || source.kind === 'ai_execution')) &&
           (target && target.kind === 'consequence');
  });
  return hasConsequence && hasPreEffect && hasEdgeToConsequence;
}

// ─── Dagre center → ReactFlow top-left conversion ────────────────────────────
// LOCK: DAGRE_CENTER != REACTFLOW_TOP_LEFT
// LOCK: MIXED_NODE_ORIGIN != VALID_GEOMETRY
//
// Dagre returns center coordinates. ReactFlow uses top-left by default.
// We use nodeOrigin={[0.5, 0.5]} so ReactFlow also uses center coordinates.
// This function is exported for testing the contract.

export const NODE_ORIGIN: [number, number] = [0.5, 0.5]; // center origin

/**
 * Convert Dagre center coordinates to ReactFlow position.
 * With nodeOrigin=[0.5, 0.5], positions are center-based, so no conversion needed.
 * This function exists to make the coordinate contract explicit and testable.
 */
export function dagreToReactFlowPosition(x: number, y: number): { x: number; y: number } {
  // With nodeOrigin=[0.5, 0.5], positions are center-based
  return { x, y };
}
