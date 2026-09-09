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
      visibleKinds.add('identity');
      visibleKinds.add('application_access');
      visibleKinds.add('action');
      visibleKinds.add('consequence');
      visibleKinds.add('evidence');
      visibleKinds.add('entrypoint');
      visibleKinds.add('agent');
      visibleKinds.add('tool');
      visibleKinds.add('handler');
      visibleKinds.add('resource');
      visibleKinds.add('service');
      visibleKinds.add('shared_resource_hub');
      visibleKinds.add('persistence');
      visibleKinds.add('deferred');
      visibleKinds.add('evaluation_surface');
      visibleKinds.add('credential_reference');
      break;
    case 'action_consequence':
      // Expanded: seed nodes + graph-relevant supporting neighbors
      // LOCK: ACTION_LENS_EXPANSION != NEW_TOPOLOGY_TRUTH
      // LOCK: NO_NEW_EDGES
      // LOCK: NO_SEMANTIC_PROMOTION
      return filterActionLensByGraphRelevance(nodes, edges);
    case 'access_authority':
      visibleKinds.add('identity');
      visibleKinds.add('application_access');
      visibleKinds.add('entrypoint');
      visibleKinds.add('action');
      visibleKinds.add('policy');
      visibleKinds.add('provider_iam');
      visibleKinds.add('ai_execution');
      visibleKinds.add('connected_asset');
      visibleKinds.add('consequence');
      visibleKinds.add('evidence');
      visibleKinds.add('agent');
      visibleKinds.add('tool');
      visibleKinds.add('handler');
      visibleKinds.add('resource');
      visibleKinds.add('service');
      visibleKinds.add('shared_resource_hub');
      visibleKinds.add('persistence');
      visibleKinds.add('deferred');
      visibleKinds.add('evaluation_surface');
      visibleKinds.add('credential_reference');
      break;
    case 'evidence_coverage':
      visibleKinds.add('ai_execution');
      visibleKinds.add('evidence');
      visibleKinds.add('action');
      visibleKinds.add('connected_asset');
      visibleKinds.add('consequence');
      visibleKinds.add('policy');
      visibleKinds.add('provider_iam');
      visibleKinds.add('identity');
      visibleKinds.add('application_access');
      visibleKinds.add('entrypoint');
      visibleKinds.add('agent');
      visibleKinds.add('tool');
      visibleKinds.add('handler');
      visibleKinds.add('resource');
      visibleKinds.add('service');
      visibleKinds.add('shared_resource_hub');
      visibleKinds.add('persistence');
      visibleKinds.add('deferred');
      visibleKinds.add('evaluation_surface');
      visibleKinds.add('credential_reference');
      break;
  }
  const filteredNodes = nodes.filter((n) => visibleKinds.has(n.kind));
  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  return { nodes: filteredNodes, edges: filteredEdges };
}

/**
 * Action lens graph-relevance filter.
 *
 * Starts from seed nodes (ai_execution, entrypoint, action, consequence)
 * and includes connected first/qualified supporting neighbors:
 * identity, application_access, policy, provider_iam, connected_asset, evidence.
 *
 * LOCK: ACTION_LENS_EXPANSION != NEW_TOPOLOGY_TRUTH
 * LOCK: NO_NEW_EDGES — only filters existing edges
 * LOCK: NO_SEMANTIC_PROMOTION — does not change node kinds or edge semantics
 * LOCK: GRAPH_RELEVANCE — only includes supporting nodes connected to seeds
 */
function filterActionLensByGraphRelevance(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  const seedKinds = new Set(['ai_execution', 'entrypoint', 'action', 'consequence', 'agent', 'tool', 'handler', 'resource', 'service', 'shared_resource_hub']);
  const supportingKinds = new Set([
    'identity', 'application_access', 'policy', 'provider_iam',
    'connected_asset', 'evidence', 'agent', 'tool', 'handler', 'resource',
    'service', 'shared_resource_hub', 'persistence', 'deferred',
    'evaluation_surface', 'credential_reference',
  ]);

  // Step 1: seed nodes are always visible
  const seedNodes = nodes.filter((n) => seedKinds.has(n.kind));
  const seedNodeIds = new Set(seedNodes.map((n) => n.id));

  // Step 2: supporting nodes that are directly connected to at least one seed
  const supportingNodes = nodes.filter((n) => {
    if (!supportingKinds.has(n.kind)) return false;
    // Check if this node has an edge to/from any seed node
    return edges.some((e) =>
      (e.source === n.id && seedNodeIds.has(e.target)) ||
      (e.target === n.id && seedNodeIds.has(e.source))
    );
  });

  const allVisibleNodes = [...seedNodes, ...supportingNodes];
  const visibleNodeIds = new Set(allVisibleNodes.map((n) => n.id));

  // Step 3: keep only edges between visible nodes
  const filteredEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  return { nodes: allVisibleNodes, edges: filteredEdges };
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
// LOCK: DIFFERENT_LAYOUT_PROFILE = DIFFERENT_RENDERED_COMPOSITION
// LOCK: PRESENTATION_STAGE != TOPOLOGY_NODE_KIND
// LOCK: STAGE_MAPPER_USES_ONLY_CANONICAL_FACTS
// LOCK: NO_DISPLAY_NAME_KEYWORD_INFERENCE
// LOCK: UNKNOWN_STAGE_DETAIL != FABRICATED_STAGE_DETAIL

export interface PresentationNodePosition {
  id: string;
  region: RegionId;
  layer: number;
  x: number;
  y: number;
}

// ─── Action Presentation Stage Taxonomy ──────────────────────────────────────
// PRESENTATION-ONLY stages for the Action→Consequence layout profile.
// These are NOT topology node kinds. They are visual composition stages
// derived from the approved HTML reference's 7-layer / 11-stage grammar.
//
// The mapper uses ONLY canonical node attributes (kind, subType).
// NO display-name keyword inference. NO fabricated facts.
// If current projection cannot establish a distinction, the broader safe stage is used.

export type ActionPresentationStage =
  | 'CONTEXT_SURFACE'
  | 'RUNTIME_CONFIGURATION'
  | 'INSTRUCTION_AUTHORITY'
  | 'EVALUATION_BINDING'
  | 'AGENT_CORE'
  | 'RUNTIME_AUTHORITY'
  | 'ACTION_CONTRACT'
  | 'CONTROL_TOPOLOGY'
  | 'COMMIT_MEDIATION'
  | 'EXECUTION_CONSEQUENCE'
  | 'EVIDENCE_ASSURANCE';

export const ACTION_PRESENTATION_STAGES: ActionPresentationStage[] = [
  'CONTEXT_SURFACE',
  'RUNTIME_CONFIGURATION',
  'INSTRUCTION_AUTHORITY',
  'EVALUATION_BINDING',
  'AGENT_CORE',
  'RUNTIME_AUTHORITY',
  'ACTION_CONTRACT',
  'CONTROL_TOPOLOGY',
  'COMMIT_MEDIATION',
  'EXECUTION_CONSEQUENCE',
  'EVIDENCE_ASSURANCE',
];

export const ACTION_STAGE_LABELS: Record<ActionPresentationStage, string> = {
  CONTEXT_SURFACE: 'Context / injection surface',
  RUNTIME_CONFIGURATION: 'Runtime configuration / supply chain',
  INSTRUCTION_AUTHORITY: 'Instruction authority & precedence',
  EVALUATION_BINDING: 'Version / evaluation binding',
  AGENT_CORE: 'Agent core',
  RUNTIME_AUTHORITY: 'Runtime authority vs approved operating envelope',
  ACTION_CONTRACT: 'Action contract — fixed, bounded, model-selected, or unknown',
  CONTROL_TOPOLOGY: 'Control topology / guard placement',
  COMMIT_MEDIATION: 'Every consequential path must cross equivalent controls before commit',
  EXECUTION_CONSEQUENCE: 'Execution and consequence surface',
  EVIDENCE_ASSURANCE: 'Evidence → projection → Assurance Decision → Package → Receipt → verification',
};

/**
 * Map a canonical node to an Action presentation stage.
 *
 * Uses ONLY kind + subType. NO display-name keyword inference.
 * If a distinction cannot be established, the broader safe stage is used.
 *
 * LOCK: STAGE_MAPPER_USES_ONLY_CANONICAL_FACTS
 * LOCK: NO_DISPLAY_NAME_KEYWORD_INFERENCE
 * LOCK: UNKNOWN_STAGE_DETAIL != FABRICATED_STAGE_DETAIL
 */
export function mapNodeToActionStage(node: TopologyNode): ActionPresentationStage {
  // Evidence nodes → always EVIDENCE_ASSURANCE
  if (node.kind === 'evidence') return 'EVIDENCE_ASSURANCE';

  // Consequence nodes → always EXECUTION_CONSEQUENCE
  if (node.kind === 'consequence') return 'EXECUTION_CONSEQUENCE';

  // Policy nodes → CONTROL_TOPOLOGY (mediation controls)
  // Exception: system/repo instruction subtypes → INSTRUCTION_AUTHORITY
  if (node.kind === 'policy') {
    if (node.subType === 'system_instruction' || node.subType === 'repo_instruction' || node.subType === 'tool_schema') {
      return 'INSTRUCTION_AUTHORITY';
    }
    return 'CONTROL_TOPOLOGY';
  }

  // Provider IAM → RUNTIME_AUTHORITY (effective grants)
  if (node.kind === 'provider_iam') return 'RUNTIME_AUTHORITY';

  // Identity → RUNTIME_AUTHORITY (execution identity / delegation)
  if (node.kind === 'identity') return 'RUNTIME_AUTHORITY';

  // Application access → RUNTIME_AUTHORITY (guards)
  if (node.kind === 'application_access') return 'RUNTIME_AUTHORITY';

  // Entrypoint → CONTEXT_SURFACE
  if (node.kind === 'entrypoint') return 'CONTEXT_SURFACE';

  // AI execution → AGENT_CORE (default) or INSTRUCTION_AUTHORITY (merge/optimizer)
  if (node.kind === 'ai_execution') {
    if (node.subType === 'instruction_merge' || node.subType === 'optimizer_rewrite') {
      return 'INSTRUCTION_AUTHORITY';
    }
    if (node.subType === 'version_binding' || node.subType === 'config_binding') {
      return 'EVALUATION_BINDING';
    }
    return 'AGENT_CORE';
  }

  // Action nodes → ACTION_CONTRACT
  if (node.kind === 'action') return 'ACTION_CONTRACT';

  // Connected assets → CONTEXT_SURFACE (default) or RUNTIME_CONFIGURATION (supply chain)
  if (node.kind === 'connected_asset') {
    const supplyChainSubtypes = new Set([
      'MODEL_ENDPOINT', 'PROVIDER_PROJECT', 'TOOL_SERVER',
      'RUNTIME_OVERRIDE', 'PROVIDER_SDK', 'MCP_TOOL_PACKAGE',
      'model_endpoint', 'provider_project', 'tool_server',
      'runtime_override', 'provider_sdk', 'mcp_tool_package',
    ]);
    if (node.subType && supplyChainSubtypes.has(node.subType)) {
      return 'RUNTIME_CONFIGURATION';
    }
    // Secrets/credentials → RUNTIME_AUTHORITY
    if (node.subType === 'PROVIDER_CREDENTIAL' || node.subType === 'secrets_credentials') {
      return 'RUNTIME_AUTHORITY';
    }
    // Knowledge base, memory, tool output, peer agent → CONTEXT_SURFACE
    return 'CONTEXT_SURFACE';
  }

  // Fallback: broadest safe stage
  return 'CONTEXT_SURFACE';
}

// ─── Presentation Region Descriptor ──────────────────────────────────────────
// Deterministic description of how a layout profile composes its regions.
// This is what tests verify — not enum names, but actual rendered composition.

export type RegionOrientation = 'horizontal-row' | 'vertical-layer' | 'full-width-band';

export interface PresentationRegionDescriptor {
  id: string;
  orientation: RegionOrientation;
  row: number;          // vertical band index (0 = top)
  column: number;       // horizontal column index (0 = left)
  span: number;         // column span (1 = single column, 5 = full width)
  stage?: ActionPresentationStage;
  region: RegionId;
}

/**
 * Build deterministic presentation region descriptors for a layout profile.
 *
 * SYSTEM_ARCHITECTURE:
 *   Row 0: 5 top architecture columns (source, access, ai, action, state)
 *   Row 1: full-width semantic detail band
 *   Row 2: full-width assurance band
 *   Evidence/assurance is NOT a sixth top column.
 *
 * ACTION_CONSEQUENCE:
 *   11 vertical layers (stages) top to bottom
 *   Effect boundary is HORIZONTAL between COMMIT_MEDIATION and EXECUTION_CONSEQUENCE
 *   Authority/action mediation ABOVE boundary
 *   Execution/consequence BELOW boundary
 *   Assurance AFTER consequence
 *
 * ACCESS_AUTHORITY:
 *   Row 0: Identity / execution subject (left)
 *   Row 1: Application access / guards
 *   Row 2: Policy / approved envelope
 *   Row 3: Provider credential context
 *   Row 4: Action surface
 *   Distinct from System (vertical hierarchy, not 5-column)
 *
 * EVIDENCE_ASSURANCE:
 *   Row 0: Source / producer context (left)
 *   Row 1: Evidence
 *   Row 2: Evaluated plane/fact context
 *   Row 3: Assurance / verification context
 *   Distinct from System (evidence-first, not topology-first)
 */
export function buildPresentationRegions(
  profile: LayoutProfile,
): PresentationRegionDescriptor[] {
  switch (profile) {
    case 'SYSTEM_ARCHITECTURE':
      return [
        // Row 0: 5 top architecture columns
        { id: 'sys-build', orientation: 'horizontal-row', row: 0, column: 0, span: 1, region: 'source-deployment' },
        { id: 'sys-identity', orientation: 'horizontal-row', row: 0, column: 1, span: 1, region: 'access-authority' },
        { id: 'sys-ai', orientation: 'horizontal-row', row: 0, column: 2, span: 1, region: 'ai-execution' },
        { id: 'sys-app', orientation: 'horizontal-row', row: 0, column: 3, span: 1, region: 'action-surface' },
        { id: 'sys-state', orientation: 'horizontal-row', row: 0, column: 4, span: 1, region: 'state-consequence' },
        // Row 1: full-width semantic detail band
        { id: 'sys-semantic', orientation: 'full-width-band', row: 1, column: 0, span: 5, region: 'unclassified-infrastructure' },
        // Row 2: full-width assurance band (NOT a sixth top column)
        { id: 'sys-assurance', orientation: 'full-width-band', row: 2, column: 0, span: 5, region: 'evidence-assurance' },
      ];

    case 'ACTION_CONSEQUENCE':
      return ACTION_PRESENTATION_STAGES.map((stage, index) => ({
        id: `action-stage-${stage}`,
        orientation: 'vertical-layer' as RegionOrientation,
        row: index,
        column: 0,
        span: 5,
        stage,
        region: actionStageToRegion(stage),
      }));

    case 'ACCESS_AUTHORITY':
      return [
        { id: 'access-identity', orientation: 'vertical-layer', row: 0, column: 0, span: 5, region: 'access-authority' },
        { id: 'access-guards', orientation: 'vertical-layer', row: 1, column: 0, span: 5, region: 'action-surface' },
        { id: 'access-policy', orientation: 'vertical-layer', row: 2, column: 0, span: 5, region: 'access-authority' },
        { id: 'access-credential', orientation: 'vertical-layer', row: 3, column: 0, span: 5, region: 'access-authority' },
        { id: 'access-action', orientation: 'vertical-layer', row: 4, column: 0, span: 5, region: 'action-surface' },
      ];

    case 'EVIDENCE_ASSURANCE':
      return [
        { id: 'evidence-source', orientation: 'vertical-layer', row: 0, column: 0, span: 5, region: 'source-deployment' },
        { id: 'evidence-core', orientation: 'vertical-layer', row: 1, column: 0, span: 5, region: 'evidence-assurance' },
        { id: 'evidence-evaluated', orientation: 'vertical-layer', row: 2, column: 0, span: 5, region: 'evidence-assurance' },
        { id: 'evidence-assurance', orientation: 'vertical-layer', row: 3, column: 0, span: 5, region: 'evidence-assurance' },
      ];

    default:
      return [];
  }
}

function actionStageToRegion(stage: ActionPresentationStage): RegionId {
  switch (stage) {
    case 'CONTEXT_SURFACE':
    case 'RUNTIME_CONFIGURATION':
      return 'source-deployment';
    case 'INSTRUCTION_AUTHORITY':
    case 'EVALUATION_BINDING':
      return 'access-authority';
    case 'AGENT_CORE':
      return 'ai-execution';
    case 'RUNTIME_AUTHORITY':
      return 'access-authority';
    case 'ACTION_CONTRACT':
      return 'action-surface';
    case 'CONTROL_TOPOLOGY':
    case 'COMMIT_MEDIATION':
      return 'access-authority';
    case 'EXECUTION_CONSEQUENCE':
      return 'state-consequence';
    case 'EVIDENCE_ASSURANCE':
      return 'evidence-assurance';
    default:
      return 'unclassified-infrastructure';
  }
}

/**
 * Get the effect boundary placement for a layout profile.
 * Returns the row index after which the horizontal effect boundary is drawn,
 * or null if no boundary for this profile.
 *
 * ACTION_CONSEQUENCE: boundary between COMMIT_MEDIATION (row 8) and EXECUTION_CONSEQUENCE (row 9)
 * Other profiles: no boundary
 */
export function getEffectBoundaryRow(profile: LayoutProfile): number | null {
  if (profile === 'ACTION_CONSEQUENCE') {
    // COMMIT_MEDIATION is index 8, EXECUTION_CONSEQUENCE is index 9
    // Boundary is drawn after row 8
    return 8;
  }
  return null;
}

// ─── Region layer assignment (legacy, kept for backward compat) ──────────────

export function getRegionLayer(region: RegionId, profile: LayoutProfile = 'SYSTEM_ARCHITECTURE'): number {
  if (profile === 'ACTION_CONSEQUENCE') {
    const layerMap: Record<RegionId, number> = {
      'source-deployment': 0,
      'access-authority': 1,
      'ai-execution': 2,
      'action-surface': 3,
      'state-consequence': 5,
      'evidence-assurance': 6,
      'unclassified-infrastructure': 0,
    };
    return layerMap[region] ?? 0;
  }
  if (profile === 'ACCESS_AUTHORITY') {
    // Vertical hierarchy: identity → guards → policy → credential → action
    const layerMap: Record<RegionId, number> = {
      'access-authority': 0,
      'action-surface': 1,
      'ai-execution': 2,
      'source-deployment': 3,
      'state-consequence': 4,
      'evidence-assurance': 5,
      'unclassified-infrastructure': 3,
    };
    return layerMap[region] ?? 0;
  }
  if (profile === 'EVIDENCE_ASSURANCE') {
    // Evidence-first: source → evidence → evaluated → assurance
    const layerMap: Record<RegionId, number> = {
      'evidence-assurance': 1,
      'source-deployment': 0,
      'ai-execution': 2,
      'action-surface': 2,
      'access-authority': 2,
      'state-consequence': 2,
      'unclassified-infrastructure': 0,
    };
    return layerMap[region] ?? 0;
  }
  // SYSTEM_ARCHITECTURE: left to right columns (5 top + assurance below)
  const layerMap: Record<RegionId, number> = {
    'source-deployment': 0,
    'access-authority': 1,
    'ai-execution': 2,
    'action-surface': 3,
    'state-consequence': 4,
    'evidence-assurance': 5,
    'unclassified-infrastructure': 2,
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

/**
 * Assign nodes to action presentation stages.
 * Returns a map of nodeId → ActionPresentationStage.
 */
export function assignActionStages(nodes: TopologyNode[]): Map<string, ActionPresentationStage> {
  const assignments = new Map<string, ActionPresentationStage>();
  for (const node of nodes) {
    assignments.set(node.id, mapNodeToActionStage(node));
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
