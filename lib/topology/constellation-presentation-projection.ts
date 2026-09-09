/**
 * UX-3 Constellation / Landscape presentation projection.
 *
 * PRESENTATION-ONLY adapter. It reads canonical TopologyProjectionResult
 * (and optionally AgentReachabilityReadModel) and produces a constellation
 * projection for the @antv/g6 renderer.
 *
 * Invariants:
 *   - Never invents topology truth.
 *   - Preserves canonical node/edge IDs.
 *   - Keeps shared-resource hubs outside agent clusters.
 *   - Records documented producer gaps as frontiers, not as fabricated nodes/edges.
 *   - Deterministic: same input always produces same output.
 */

import type {
  TopologyProjectionResult,
  TopologyNode,
  TopologyEdge,
  TopologyNodeKind,
  NodeAvailability,
  ConstellationScale,
  ConstellationLens,
  ConstellationNodeRole,
  ConstellationNode,
  ConstellationEdge,
  ConstellationCombo,
  ConstellationFrontier,
  ConstellationProjection,
} from './types';
import { AVAILABILITY_LABELS } from './types';
import type { AgentReachabilityReadModel } from '@/lib/ai-inventory/agent-reachability-read-model';

const SHARED_SENTINEL = '___shared___';

/**
 * Canonical producer frontiers from ux3-temp.md.
 * These are presentation annotations only; they do not create topology nodes
 * or edges when the relevant source producers are not yet bound.
 */
const UX3_PRODUCER_FRONTIER_REASONS: string[] = [
  'Business/agent goal and goal provenance',
  'System/developer/framework instruction discovery and precedence',
  'Prompt-template composition/context assembly',
  'RAG ingestion/index/retriever/retrieval continuity',
  'Knowledge-write → later retrieval influence',
  'Memory read/write lifecycle and cross-session identity',
  'MCP client/session/server + tools/resources/prompts distinction',
  'Inbound vs outbound API role',
  'Data sensitivity/classification propagation',
  'Exact human approval visibility/commit mediation',
  'Self-modification/control-plane mutation',
  'Supply-chain version/provenance/digest at agent/action scope',
  'Runtime network reachability and egress confirmation',
  'Exact runtime agent instances and dynamic identities',
];

const AVAILABILITY_STRENGTH: Record<NodeAvailability, number> = {
  AVAILABLE: 0,
  PARTIAL: 1,
  UNKNOWN: 2,
  SOURCE_GAP: 3,
  UNAVAILABLE: 4,
};

function weakestAvailability(a: NodeAvailability, b: NodeAvailability): NodeAvailability {
  return AVAILABILITY_STRENGTH[a] >= AVAILABILITY_STRENGTH[b] ? a : b;
}

function normalizeToken(value?: string): string {
  if (!value) return '';
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function inferConstellationRole(node: TopologyNode): ConstellationNodeRole {
  const subType = normalizeToken(node.subType);
  const resourceClass = normalizeToken(node.resourceClass);

  switch (node.kind) {
    case 'ai_execution':
      return 'ai_system';
    case 'agent':
      return 'agent';
    case 'tool':
      return 'tool';
    case 'handler':
      return 'handler';
    case 'action':
      return 'action_implementation';
    case 'consequence':
      return 'consequence';
    case 'shared_resource_hub':
      return 'shared_resource_hub';
    case 'persistence':
      if (subType.includes('QUEUE') || subType.includes('TOPIC')) return 'queue_topic';
      return 'state_resource';
    case 'deferred':
      return 'temporal_context';
    case 'evaluation_surface':
      return 'evaluation_surface';
    case 'credential_reference':
      return 'credential';
    case 'provider_iam':
      return 'authority_context';
    case 'identity':
    case 'application_access':
      return 'authority_context';
    case 'policy':
      return 'policy_authority';
    case 'evidence':
      return 'evidence';
    case 'entrypoint':
      return 'context_source';
    case 'resource':
      if (resourceClass.includes('QUEUE') || resourceClass.includes('TOPIC')) return 'queue_topic';
      if (resourceClass.includes('EXTERNAL_SERVICE')) return 'external_effect';
      if (resourceClass.includes('EVALUATION_SURFACE')) return 'evaluation_surface';
      return 'state_resource';
    case 'service':
      return 'external_effect';
    case 'connected_asset':
      if (subType.includes('MODEL_ENDPOINT')) return 'model';
      if (subType.includes('MCP_TOOL_PACKAGE') || subType.includes('TOOL_SERVER')) return 'capability_gateway';
      if (subType.includes('TOOL_SCHEMA_DESCRIPTION')) return 'instruction_source';
      if (
        subType.includes('RAG_KNOWLEDGE_BASE') ||
        subType.includes('KNOWLEDGE_BASE') ||
        subType.includes('TOOL_API_OUTPUT') ||
        subType.includes('PEER_AGENT_MCP') ||
        subType.includes('RUNTIME_OVERRIDE') ||
        subType.includes('PROVIDER_SDK')
      )
        return 'context_source';
      if (subType.includes('POLICY_SOURCE')) return 'policy_authority';
      if (subType.includes('PROVIDER_CREDENTIAL') || subType.includes('SECRETS_CREDENTIALS')) return 'credential';
      if (subType.includes('INTERFACE_SPECIFICATION')) return 'api';
      if (subType.includes('RUNTIME_ENDPOINT') || subType.includes('SOURCE_REPOSITORY') || subType.includes('CONTAINER_IMAGE') || subType.includes('DEPLOYMENT') || subType.includes('PROVIDER_PROJECT') || subType.includes('OTHER'))
        return 'unclassified';
      return 'unclassified';
    case 'workload':
      return 'unclassified';
    default:
      return 'unclassified';
  }
}

export function isConstellationFrontierAvailability(availability: NodeAvailability): boolean {
  return availability === 'UNKNOWN' || availability === 'SOURCE_GAP' || availability === 'UNAVAILABLE' || availability === 'PARTIAL';
}

function isFrontierNode(node: TopologyNode): boolean {
  if (isConstellationFrontierAvailability(node.availability)) return true;
  if (node.kind === 'deferred') return true;
  if (node.limitations.some((l) => /frontier|not.*assessed|unresolved/i.test(l))) return true;
  return false;
}

function frontierReason(node: TopologyNode): string {
  const availabilityLabel = AVAILABILITY_LABELS[node.availability] ?? node.availability;
  if (node.limitations.length > 0) {
    return `${availabilityLabel}: ${node.limitations[0]}`;
  }
  if (node.kind === 'deferred') {
    return `${availabilityLabel}: deferred execution path; consumer identity may not be resolved`;
  }
  return availabilityLabel;
}

function reachabilityMetricsForAgent(
  node: TopologyNode,
  reachability?: AgentReachabilityReadModel | null,
): { directReach?: number; transitiveReach?: number } {
  if (!reachability) return {};
  const agent = reachability.agents.items.find((a) => a.id === node.id);
  if (!agent) return {};
  return {
    directReach: agent.reachableResourceKeys.length,
    transitiveReach: agent.reachableServiceIds.length,
  };
}

function sharedHubAccess(
  node: TopologyNode,
  reachability?: AgentReachabilityReadModel | null,
): { participantAgentIds?: string[]; accessTypes?: string[] } {
  if (!reachability || node.kind !== 'shared_resource_hub' || !node.resourceKey) return {};
  const hub = reachability.sharedResourceHubs.items.find((h) => h.resourceKey === node.resourceKey);
  if (!hub) return {};
  return {
    participantAgentIds: hub.participantAgentIds,
    accessTypes: hub.accessTypes,
  };
}

/**
 * Build the canonical UX-3 ConstellationProjection from a topology projection.
 */
export function buildConstellationProjection(
  projection: TopologyProjectionResult,
  reachability?: AgentReachabilityReadModel | null,
): ConstellationProjection {
  const nodes: ConstellationNode[] = [];
  const edges: ConstellationEdge[] = [];
  const combos: ConstellationCombo[] = [];
  const frontiers: ConstellationFrontier[] = [];

  const systemComboId = `constellation:combo:ai_system:${projection.aiSystemId}`;

  const systemCombo: ConstellationCombo = {
    id: systemComboId,
    label: projection.aiSystemName,
    role: 'ai_system',
    kind: 'ai_execution',
    children: [],
    canonicalNodeId: projection.aiSystemId,
    combo: null,
    sourceNodeIds: [projection.aiSystemId],
    relationIds: [],
    count: 1,
    shown: 1,
    total: 1,
    truncated: false,
    weakestAvailability: 'AVAILABLE',
    collapsed: false,
    participantAgentIds: [],
    accessTypes: [],
  };
  combos.push(systemCombo);

  const aiExecutionNodes = projection.nodes.filter((n) => n.kind === 'ai_execution');
  for (const aiNode of aiExecutionNodes) {
    systemCombo.children.push(aiNode.id);
    systemCombo.sourceNodeIds.push(aiNode.id);
  }

  const agentNodes = projection.nodes.filter((n) => n.kind === 'agent');
  const agentComboByNodeId = new Map<string, ConstellationCombo>();

  for (const agentNode of agentNodes) {
    const agentComboId = `constellation:combo:agent:${agentNode.id}`;
    const metrics = reachabilityMetricsForAgent(agentNode, reachability);
    const combo: ConstellationCombo = {
      id: agentComboId,
      label: agentNode.label,
      role: 'agent',
      kind: 'agent',
      children: [agentNode.id],
      canonicalNodeId: agentNode.id,
      combo: systemComboId,
      sourceNodeIds: [agentNode.id],
      relationIds: [],
      count: 1,
      shown: 1,
      total: 1,
      truncated: false,
      weakestAvailability: agentNode.availability,
      collapsed: false,
      ...metrics,
    };
    combos.push(combo);
    agentComboByNodeId.set(agentNode.id, combo);
    systemCombo.children.push(combo.id);
  }

  // Build outgoing adjacency for agent-owned child discovery.
  const outgoingById = new Map<string, TopologyEdge[]>();
  for (const edge of projection.edges) {
    const list = outgoingById.get(edge.source) ?? [];
    list.push(edge);
    outgoingById.set(edge.source, list);
  }

  // Agent-combo child kinds that are rendered inside the agent cluster.
  const agentChildKinds: Set<TopologyNodeKind> = new Set([
    'tool',
    'handler',
    'consequence',
    'credential_reference',
    'action',
  ]);

  // Map from topology node id to the agent combo that owns it.
  const nodeToAgentCombo = new Map<string, string>();

  for (const [agentId, combo] of agentComboByNodeId) {
    const visited = new Set<string>();
    const queue: string[] = [agentId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of outgoingById.get(current) ?? []) {
        const targetId = edge.target;
        if (targetId === systemCombo.canonicalNodeId || targetId === agentId) continue;
        const targetNode = projection.nodes.find((n) => n.id === targetId);
        if (!targetNode) continue;

        if (targetNode.kind === 'shared_resource_hub' || targetNode.kind === 'resource' || targetNode.kind === 'service') {
          continue;
        }

        if (agentChildKinds.has(targetNode.kind)) {
          const existing = nodeToAgentCombo.get(targetId);
          if (!existing) {
            nodeToAgentCombo.set(targetId, combo.id);
          } else if (existing !== combo.id) {
            nodeToAgentCombo.set(targetId, SHARED_SENTINEL);
          }
          queue.push(targetId);
        }
      }
    }
  }

  // Nodes that should not be put inside the AI system combo.
  const outsideSystemKinds: Set<TopologyNodeKind> = new Set(['shared_resource_hub', 'resource', 'service', 'workload']);

  for (const node of projection.nodes) {
    const role = inferConstellationRole(node);
    const frontier = isFrontierNode(node);

    let comboId: string | null = null;
    if (node.kind === 'agent') {
      comboId = agentComboByNodeId.get(node.id)?.id ?? null;
    } else if (node.kind === 'ai_execution') {
      comboId = systemComboId;
    } else if (node.kind === 'shared_resource_hub') {
      comboId = null;
    } else {
      const agentAssignment = nodeToAgentCombo.get(node.id);
      if (agentAssignment && agentAssignment !== SHARED_SENTINEL) {
        comboId = agentAssignment;
      } else if (!outsideSystemKinds.has(node.kind)) {
        comboId = systemComboId;
      }
    }

    const metrics = node.kind === 'agent' ? reachabilityMetricsForAgent(node, reachability) : {};
    const hubAccess = node.kind === 'shared_resource_hub' ? sharedHubAccess(node, reachability) : {};

    const cNode: ConstellationNode = {
      id: node.id,
      label: node.label,
      role,
      kind: node.kind,
      availability: node.availability,
      aiReachable: node.aiReachable,
      sourceProvenance: node.sourceLocation ?? node.scanId,
      canonicalNodeId: node.id,
      combo: comboId,
      isFrontier: frontier,
      frontierReason: frontier ? frontierReason(node) : undefined,
      ...metrics,
      ...hubAccess,
    };

    nodes.push(cNode);

    // Register node as child of its combo and update combo metadata.
    if (comboId) {
      const combo = combos.find((c) => c.id === comboId);
      if (combo) {
        combo.children.push(cNode.id);
        combo.sourceNodeIds.push(cNode.id);
        combo.count += 1;
        combo.shown += 1;
        combo.total += 1;
        combo.weakestAvailability = weakestAvailability(combo.weakestAvailability, cNode.availability);
      }
    }
  }

  for (const edge of projection.edges) {
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      kind: edge.kind,
      joinBasis: edge.joinBasis,
      style: edge.style,
      canonicalEdgeId: edge.id,
    });

    // If the edge is fully contained inside an agent combo, record the
    // relation id on the combo for collapse metadata.
    const sourceCombo = nodes.find((n) => n.id === edge.source)?.combo;
    const targetCombo = nodes.find((n) => n.id === edge.target)?.combo;
    if (sourceCombo && sourceCombo === targetCombo && agentComboByNodeId.has(sourceCombo.split(':').pop() ?? '')) {
      const combo = combos.find((c) => c.id === sourceCombo);
      if (combo) combo.relationIds.push(edge.id);
    }
  }

  // Finalize combo counts and labels.
  for (const combo of combos) {
    combo.total = combo.children.length;
    combo.count = combo.children.length;
    combo.shown = combo.children.length;
    if (combo.children.length > 1) {
      combo.label = `${combo.label} (${combo.children.length})`;
    }
  }

  // Frontier annotations.
  if (reachability?.frontiers?.items) {
    for (const f of reachability.frontiers.items) {
      frontiers.push({
        id: f.id,
        dimension: f.dimension,
        reason: f.reason,
      });
    }
  }

  // If the read model has no frontiers, preserve the explicit UX-3 producer
  // gaps as a single source-truthful annotation set. They are never converted
  // to graph nodes/edges.
  if (frontiers.length === 0) {
    for (let i = 0; i < UX3_PRODUCER_FRONTIER_REASONS.length; i++) {
      frontiers.push({
        id: `ux3-producer-gap:${projection.aiSystemId}:${i}`,
        reason: UX3_PRODUCER_FRONTIER_REASONS[i],
        sourceId: projection.aiSystemId,
      });
    }
  }

  return {
    projectionSchemaVersion: 'constellation-1.0.0',
    sourceVersion: projection.sourceVersion,
    aiSystemId: projection.aiSystemId,
    aiSystemName: projection.aiSystemName,
    projectionHash: projection.projectionHash,
    nodes,
    edges,
    combos,
    frontiers,
    limitations: [...projection.limitations],
  };
}

const LANDSCAPE_ROLES: Set<ConstellationNodeRole> = new Set([
  'ai_system',
  'agent',
  'shared_resource_hub',
  'external_effect',
  'evaluation_surface',
  'state_resource',
  'queue_topic',
  'temporal_context',
  'frontier',
  'evidence',
  'model',
]);

const SYSTEM_ROLES: Set<ConstellationNodeRole> = new Set([
  'ai_system',
  'agent',
  'context_source',
  'instruction_source',
  'model',
  'api',
  'capability_gateway',
  'mcp_gateway',
  'authority_context',
  'policy_authority',
  'credential',
  'external_effect',
  'shared_resource_hub',
  'evaluation_surface',
  'temporal_context',
  'state_resource',
  'queue_topic',
  'action_implementation',
  'consequence',
  'evidence',
  'frontier',
  'unclassified',
]);

const AGENT_ROLES: Set<ConstellationNodeRole> = new Set([
  'ai_system',
  'agent',
  'context_source',
  'instruction_source',
  'model',
  'tool',
  'mcp_gateway',
  'api',
  'capability_gateway',
  'handler',
  'action_implementation',
  'consequence',
  'state_resource',
  'queue_topic',
  'shared_resource_hub',
  'external_effect',
  'credential',
  'policy_authority',
  'authority_context',
  'temporal_context',
  'state_resource',
  'queue_topic',
  'evaluation_surface',
  'evidence',
  'frontier',
  'unclassified',
]);

const ACTION_PATH_START_ROLES: Set<ConstellationNodeRole> = new Set([
  'ai_system',
  'agent',
  'context_source',
  'instruction_source',
  'authority_context',
  'policy_authority',
  'credential',
  'api',
  'capability_gateway',
  'mcp_gateway',
  'model',
]);

const ACTION_PATH_END_ROLES: Set<ConstellationNodeRole> = new Set([
  'consequence',
  'state_resource',
  'queue_topic',
  'external_effect',
  'shared_resource_hub',
  'evaluation_surface',
  'frontier',
]);

const ACTION_PATH_ALLOWED_ROLES: Set<ConstellationNodeRole> = new Set([
  ...ACTION_PATH_START_ROLES,
  ...ACTION_PATH_END_ROLES,
  'tool',
  'handler',
  'action_implementation',
  'evidence',
]);

function setScaleCollapsed(scale: ConstellationScale, combo: ConstellationCombo): boolean {
  if (scale === 'landscape') return combo.role === 'agent';
  if (scale === 'system') return combo.role === 'agent';
  // agent and action_path expand everything
  return false;
}

function scaleRoleFilter(scale: ConstellationScale, role: ConstellationNodeRole): boolean {
  switch (scale) {
    case 'landscape':
      return LANDSCAPE_ROLES.has(role);
    case 'system':
      return SYSTEM_ROLES.has(role);
    case 'agent':
      return AGENT_ROLES.has(role);
    case 'action_path':
      return ACTION_PATH_ALLOWED_ROLES.has(role);
    default:
      return true;
  }
}

function filterByScaleInternal(
  projection: ConstellationProjection,
  scale: ConstellationScale,
): ConstellationProjection {
  const allowedNodeIds = new Set<string>();
  for (const node of projection.nodes) {
    if (scaleRoleFilter(scale, node.role)) allowedNodeIds.add(node.id);
  }
  for (const combo of projection.combos) {
    if (scaleRoleFilter(scale, combo.role)) allowedNodeIds.add(combo.id);
  }

  if (scale === 'action_path') {
    const nodesById = new Map<string, ConstellationNode | ConstellationCombo>();
    for (const n of projection.nodes) nodesById.set(n.id, n);
    for (const c of projection.combos) nodesById.set(c.id, c);

    const outEdges = new Map<string, ConstellationEdge[]>();
    const inEdges = new Map<string, ConstellationEdge[]>();
    for (const edge of projection.edges) {
      const outList = outEdges.get(edge.source) ?? [];
      outList.push(edge);
      outEdges.set(edge.source, outList);

      const inList = inEdges.get(edge.target) ?? [];
      inList.push(edge);
      inEdges.set(edge.target, inList);
    }

    const startIds = new Set<string>();
    const endIds = new Set<string>();
    for (const item of [...projection.nodes, ...projection.combos]) {
      if (ACTION_PATH_START_ROLES.has(item.role)) startIds.add(item.id);
      if (ACTION_PATH_END_ROLES.has(item.role)) endIds.add(item.id);
    }

    const forward = new Set<string>();
    const queue = Array.from(startIds);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (forward.has(id)) continue;
      forward.add(id);
      for (const edge of outEdges.get(id) ?? []) {
        const target = nodesById.get(edge.target);
        if (target && ACTION_PATH_ALLOWED_ROLES.has(target.role) && !forward.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    const backward = new Set<string>();
    const backQueue = Array.from(endIds);
    while (backQueue.length > 0) {
      const id = backQueue.shift()!;
      if (backward.has(id)) continue;
      backward.add(id);
      for (const edge of inEdges.get(id) ?? []) {
        const source = nodesById.get(edge.source);
        if (source && ACTION_PATH_ALLOWED_ROLES.has(source.role) && !backward.has(edge.source)) {
          backQueue.push(edge.source);
        }
      }
    }

    allowedNodeIds.clear();
    for (const id of forward) {
      if (backward.has(id)) allowedNodeIds.add(id);
    }
  }

  const combos = projection.combos.map((combo) => ({
    ...combo,
    collapsed: setScaleCollapsed(scale, combo),
    children: combo.children.filter((id) => allowedNodeIds.has(id)),
  }));

  const nodes = projection.nodes.filter((n) => allowedNodeIds.has(n.id));
  const nodeAndComboIds = new Set([...nodes.map((n) => n.id), ...combos.map((c) => c.id)]);
  const edges = projection.edges.filter((e) => nodeAndComboIds.has(e.source) && nodeAndComboIds.has(e.target));

  return {
    ...projection,
    nodes,
    edges,
    combos,
  };
}

const LENS_ROLE_FILTERS: Record<ConstellationLens, ConstellationNodeRole[]> = {
  architecture: [],
  context_influence: ['ai_system', 'agent', 'model', 'context_source', 'instruction_source', 'evidence', 'frontier', 'authority_context'],
  actions_effects: ['ai_system', 'agent', 'tool', 'mcp_gateway', 'api', 'capability_gateway', 'handler', 'action_implementation', 'consequence', 'state_resource', 'queue_topic', 'shared_resource_hub', 'external_effect', 'credential', 'temporal_context', 'evaluation_surface', 'frontier', 'unclassified'],
  authority_bounds: ['ai_system', 'agent', 'authority_context', 'policy_authority', 'credential', 'capability_gateway', 'api', 'frontier'],
  exposure_paths: ['ai_system', 'agent', 'tool', 'mcp_gateway', 'api', 'capability_gateway', 'handler', 'shared_resource_hub', 'external_effect', 'state_resource', 'queue_topic', 'temporal_context', 'evaluation_surface', 'frontier', 'consequence', 'credential', 'context_source'],
  evidence_proof: ['ai_system', 'agent', 'evidence', 'evaluation_surface', 'frontier', 'context_source', 'instruction_source', 'state_resource', 'external_effect', 'credential', 'policy_authority', 'authority_context'],
  change_drift: ['ai_system', 'agent', 'context_source', 'instruction_source', 'tool', 'handler', 'consequence', 'state_resource', 'shared_resource_hub', 'external_effect', 'credential', 'policy_authority', 'evaluation_surface', 'evidence', 'frontier'],
};

function filterByLensInternal(
  projection: ConstellationProjection,
  lens: ConstellationLens,
): ConstellationProjection {
  const allowed = new Set<ConstellationNodeRole>(LENS_ROLE_FILTERS[lens]);
  if (lens === 'architecture') {
    // Architecture shows every role.
    return { ...projection };
  }

  const include = (item: ConstellationNode | ConstellationCombo): boolean => {
    if (allowed.has(item.role)) return true;
    if ('isFrontier' in item && item.isFrontier) return true;
    return false;
  };

  const nodes = projection.nodes.filter(include);
  const combos = projection.combos.filter(include);
  const allowedIds = new Set([...nodes.map((n) => n.id), ...combos.map((c) => c.id)]);
  const edges = projection.edges.filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target));

  return {
    ...projection,
    nodes,
    edges,
    combos,
  };
}

/**
 * Deterministically select nodes/edges for a UX-3 scale.
 * Never invents new graph truth.
 */
export function filterByScale(
  projection: ConstellationProjection,
  scale: ConstellationScale,
): ConstellationProjection {
  return filterByScaleInternal(projection, scale);
}

/**
 * Deterministically select nodes/edges for a UX-3 lens.
 * Never invents new graph truth.
 */
export function filterByLens(
  projection: ConstellationProjection,
  lens: ConstellationLens,
): ConstellationProjection {
  return filterByLensInternal(projection, lens);
}
