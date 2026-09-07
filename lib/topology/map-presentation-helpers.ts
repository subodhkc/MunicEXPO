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
 *
 * @version presentation-helpers-1.0.0
 */

import type { TopologyNode, TopologyEdge, MapLens, SemanticZoom } from './types';
import { ARCHITECTURE_REGIONS, getRegionForKind } from './map-presentation';

// ─── Region ID type ──────────────────────────────────────────────────────────

export type RegionId = 'source-deployment' | 'access-authority' | 'ai-execution' | 'action-surface' | 'state-consequence' | 'evidence-assurance';

// ─── Connected Asset region classification by subType ────────────────────────
// LOCK: ASSET_SUBTYPE MAY_DRIVE PRESENTATION_REGION
// LOCK: DISPLAY_NAME_KEYWORD != ARCHITECTURE_ROLE_PROOF
// LOCK: PRESENTATION_REGION != TOPOLOGY_TRUTH

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
  PROVIDER_PROJECT: 'source-deployment', // neutral infrastructure — nearest neutral region
  OTHER: 'source-deployment', // ambiguous — neutral, no fabricated semantic role
};

/**
 * Classify a connected_asset node into a presentation region using its
 * source-established subType (canonical Connected Asset assetType).
 *
 * For non-connected_asset nodes, falls back to the domain-based region.
 *
 * LOCK: DISPLAY_NAME_USED_TO_GUESS_REGION = NO
 */
export function classifyNodeRegion(node: TopologyNode): RegionId {
  if (node.kind === 'connected_asset' && node.subType) {
    const region = ASSET_REGION_MAP[node.subType];
    if (region) return region;
    // Unknown asset type → neutral region, no fabricated semantic role
    return 'source-deployment';
  }
  // Non-asset nodes: use domain-based region from map-presentation
  const regionKey = getRegionForKind(node.kind);
  if (regionKey && regionKey in ARCHITECTURE_REGIONS) {
    return regionKey as RegionId;
  }
  return 'source-deployment'; // neutral fallback
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
// Assigns each node to a presentation region and a layer index within the
// directional architecture flow.
//
// LOCK: REGION_LAYOUT != LINEAR_PIPELINE
// LOCK: DIRECTIONAL != ONE_STRAIGHT_LINE

export interface PresentationNodePosition {
  id: string;
  region: RegionId;
  layer: number;
  x: number;
  y: number;
}

// Directional layer ordering (left to right)
const REGION_LAYER: Record<RegionId, number> = {
  'source-deployment': 0,
  'access-authority': 1,
  'ai-execution': 2,
  'action-surface': 3,
  'state-consequence': 4,
  'evidence-assurance': 5,
};

export function getRegionLayer(region: RegionId): number {
  return REGION_LAYER[region] ?? 0;
}

/**
 * Two-stage region-aware layout:
 *   Stage 1: classify each node into a presentation region
 *   Stage 2: layout nodes within their region (Dagre subgraph)
 *   Stage 3: place regions in directional architecture order
 *   Stage 4: route edges across regions
 *
 * This returns region assignments + layer indices that can be used
 * to constrain Dagre or any other layout engine.
 */
export function assignRegionLayout(nodes: TopologyNode[]): Map<string, { region: RegionId; layer: number }> {
  const assignments = new Map<string, { region: RegionId; layer: number }>();
  for (const node of nodes) {
    const region = classifyNodeRegion(node);
    const layer = getRegionLayer(region);
    assignments.set(node.id, { region, layer });
  }
  return assignments;
}

// ─── Effect commit boundary detection ────────────────────────────────────────
// In Action → Consequence lens, detect whether a consequence/effect boundary
// should be rendered between pre-effect nodes and effect/consequence nodes.
//
// LOCK: EFFECT_BOUNDARY != VULNERABILITY_BOUNDARY
// LOCK: EFFECT_BOUNDARY != RUNTIME_OBSERVATION
// LOCK: PRESENTATION_BOUNDARY != NEW_GRAPH_TRUTH

export function shouldRenderEffectBoundary(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  lens: MapLens,
): boolean {
  if (lens !== 'action_consequence') return false;
  const hasConsequence = nodes.some((n) => n.kind === 'consequence');
  const hasPreEffect = nodes.some((n) => n.kind === 'action' || n.kind === 'entrypoint' || n.kind === 'ai_execution');
  // Only render boundary if there are edges connecting pre-effect to consequence
  const hasEdgeToConsequence = edges.some((e) => {
    const source = nodes.find((n) => n.id === e.source);
    const target = nodes.find((n) => n.id === e.target);
    return (source && (source.kind === 'action' || source.kind === 'entrypoint' || source.kind === 'ai_execution')) &&
           (target && target.kind === 'consequence');
  });
  return hasConsequence && hasPreEffect && hasEdgeToConsequence;
}
