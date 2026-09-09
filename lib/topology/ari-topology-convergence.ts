/**
 * ARI Topology Convergence — source-backed Action & Access Map projection.
 *
 * Converts the canonical Agent Reachability projection into existing topology
 * node/edge types. This is a READ projection over a single persisted operation-
 * coverage snapshot. It does not invent runtime evidence, authority, or Assurance.
 *
 * Invariants:
 *   MAP_EDGE != PROOF_EDGE
 *   TOPOLOGY_ADJACENCY != EVIDENCE
 *   SAME_SCAN_ONLY
 *   FULL_SCOPE_RESOURCE_IDENTITY
 *   NO_NAME_BASED_JOIN
 *   CREDENTIAL_REFERENCE != EFFECTIVE_PERMISSION
 *   HANDLER_ONLY_PERSISTENCE != AGENT_PERSISTENCE
 *
 * @version topology-1.1.0
 */

import type { TopologyNode, TopologyEdge, NodeAvailability } from './types';
import { stableNodeId, stableEdgeId, s } from './stable-ids';
import {
  buildAgentReachabilityProjection,
  resourceChannelKey,
  weakest,
  type AgentReachabilityProjection,
  type AgentResourcePath,
  type PotentialChannelGroup,
} from '@/lib/ai-inventory/agent-reachability-projection';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import type {
  AriRelationState,
  AriResourceIdentity,
  AriServiceCallRelation,
  ToolImplementationRelation,
  AgentCandidate,
  ToolCandidate,
} from '@/lib/ai-security/types';

const MAX_SHOWN_PARTICIPANTS = 50;

export interface AriTopologyResult {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  limitations: string[];
}

function stateToAvailability(state: AriRelationState | undefined): NodeAvailability {
  switch (state) {
    case 'ESTABLISHED':
      return 'AVAILABLE';
    case 'CONDITIONAL':
    case 'PARTIAL':
    case 'CANDIDATE':
      return 'PARTIAL';
    case 'UNKNOWN':
      return 'UNKNOWN';
    case 'NOT_ANALYZED':
    default:
      return 'SOURCE_GAP';
  }
}

function stateToStyle(state: AriRelationState | undefined): 'solid' | 'dashed' | 'dotted' {
  switch (state) {
    case 'ESTABLISHED':
      return 'solid';
    case 'CONDITIONAL':
    case 'PARTIAL':
    case 'CANDIDATE':
      return 'dashed';
    case 'UNKNOWN':
    case 'NOT_ANALYZED':
    default:
      return 'dotted';
  }
}

function locationString(loc: { file?: string; line?: number } | undefined | null): string | undefined {
  if (!loc || !loc.file) return undefined;
  return loc.line ? `${loc.file}:${loc.line}` : loc.file;
}

function resourceLabel(resource: AriResourceIdentity): string {
  const parts: string[] = [resource.resourceClass];
  if (resource.key) parts.push(resource.key);
  return parts.join(' ');
}

function scopeFields(resource: AriResourceIdentity): Partial<TopologyNode> {
  const scope = resource.scope;
  if (!scope) return {};
  return {
    resourceProvider: scope.provider,
    environment: scope.environment,
    cloudAccountOrProject: scope.cloudAccountOrProject,
    region: scope.region,
    tenant: scope.tenant,
    namespace: scope.namespace,
    workload: scope.workload,
    partition: scope.partition,
  };
}

function implLabel(impl: ToolImplementationRelation): string {
  return impl.implementationRef || impl.toolName || impl.id;
}

function implSourceLocation(impl: ToolImplementationRelation): string | undefined {
  return locationString(impl.implementationLocation) ?? locationString(impl.registrationLocation);
}

/**
 * Build ARI topology nodes and edges for the Action & Access Map.
 *
 * All IDs are stable semantic hashes. All source references are from the same
 * operation-coverage snapshot. No React-side name joins.
 */
export function buildAriTopologyProjection(
  data: PersistedOperationCoverageIntelligence,
  scanId: string,
  aiSystemNodeId: string,
): AriTopologyResult {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const limitations: string[] = [];

  // Defensive same-scan guard: never compose operation coverage from a different scan.
  // LOCK: CURRENT_MAP_SCAN_A + ARI_SCAN_B = NO_COMPOSITION
  if (data.scanId !== scanId) {
    limitations.push('Operation-coverage snapshot scan identity does not match the current accepted scan');
    return { nodes, edges, limitations };
  }

  const reachabilityProjection = buildAgentReachabilityProjection(data);

  const nodeById = new Map<string, TopologyNode>();
  const edgeById = new Map<string, TopologyEdge>();

  function addNode(n: TopologyNode) {
    if (!nodeById.has(n.id)) {
      nodeById.set(n.id, n);
      nodes.push(n);
    }
  }
  function addEdge(e: TopologyEdge) {
    if (!edgeById.has(e.id)) {
      edgeById.set(e.id, e);
      edges.push(e);
    }
  }

  const agents = data.agentCandidates || [];
  const agentNameById = new Map(agents.map((a) => [a.id, a.name || a.id]));

  // Pre-compute canonical resource node IDs and handler→resource mapping
  // for the exact Tool→Handler→Consequence→Resource chain.
  const resourceNodeIdsByKey = new Map<string, string>();
  const opToResourceNodeIds = new Map<string, Set<string>>();
  for (const arp of reachabilityProjection.agentResourcePaths) {
    const isService = arp.resource.resourceClass === 'EXTERNAL_SERVICE';
    const kind = isService ? 'service' : 'resource';
    const nodeId = stableNodeId(kind, [scanId, arp.resourceKey]);
    resourceNodeIdsByKey.set(arp.resourceKey, nodeId);
    if (arp.handlerOperationRelationId) {
      const set = opToResourceNodeIds.get(arp.handlerOperationRelationId) || new Set<string>();
      set.add(nodeId);
      opToResourceNodeIds.set(arp.handlerOperationRelationId, set);
    }
  }

  // ─── Agent definition nodes ───────────────────────────────────────────────
  for (const agent of agents) {
    const agentNodeId = stableNodeId('agent', [scanId, agent.id]);
    addNode({
      id: agentNodeId,
      label: agent.name || agent.id,
      kind: 'agent',
      subType: 'agent_identity',
      subTypeLabel: 'Agent identity',
      aiReachable: 'UNKNOWN',
      availability: 'PARTIAL',
      sourceLocation: locationString(agent.location),
      limitations: ['AGENT_DEFINITION != RUNTIME_INSTANCE'],
      scanId,
      agentName: agent.name,
    });
    addEdge({
      id: stableEdgeId(aiSystemNodeId, agentNodeId, 'connected_to'),
      source: aiSystemNodeId,
      target: agentNodeId,
      label: 'contains',
      kind: 'connected_to',
      joinBasis: 'STRUCTURAL_RELATION',
      style: 'dashed',
    });
  }

  // ─── Tool nodes ───────────────────────────────────────────────────────────
  const toolIdsUsed = new Set<string>();
  for (const rel of data.agentRelationshipRelations || []) {
    if (rel.kind === 'USES_TOOL' && rel.toToolCandidateId) {
      toolIdsUsed.add(rel.toToolCandidateId);
    }
  }
  for (const tool of data.toolCandidates || []) {
    if (!toolIdsUsed.has(tool.id)) continue;
    const toolNodeId = stableNodeId('tool', [scanId, tool.id]);
    addNode({
      id: toolNodeId,
      label: tool.name || tool.id,
      kind: 'tool',
      subType: 'tool_candidate',
      subTypeLabel: 'Tool candidate',
      aiReachable: 'UNKNOWN',
      availability: 'PARTIAL',
      sourceLocation: locationString(tool.location),
      limitations: ['TOOL_CANDIDATE != RUNTIME_REGISTRATION'],
      scanId,
      toolName: tool.name,
    });
  }
  for (const rel of data.agentRelationshipRelations || []) {
    if (rel.kind !== 'USES_TOOL' || !rel.toToolCandidateId) continue;
    const agentNodeId = stableNodeId('agent', [scanId, rel.fromAgentCandidateId]);
    const toolNodeId = stableNodeId('tool', [scanId, rel.toToolCandidateId]);
    if (!nodeById.has(agentNodeId) || !nodeById.has(toolNodeId)) continue;
    const style = stateToStyle(rel.state);
    addEdge({
      id: stableEdgeId(agentNodeId, toolNodeId, 'uses_tool'),
      source: agentNodeId,
      target: toolNodeId,
      label: 'uses tool',
      kind: 'uses_tool',
      joinBasis: 'STRUCTURAL_RELATION',
      style,
    });
  }

  // ─── Handler nodes ────────────────────────────────────────────────────────
  for (const impl of data.toolImplementationRelations || []) {
    if (!impl.toolCandidateId) continue;
    const handlerNodeId = stableNodeId('handler', [scanId, impl.id]);
    addNode({
      id: handlerNodeId,
      label: implLabel(impl),
      kind: 'handler',
      subType: impl.implementationKind || 'handler_function',
      subTypeLabel: 'Handler function',
      aiReachable: 'UNKNOWN',
      availability: 'PARTIAL',
      sourceLocation: implSourceLocation(impl),
      limitations: ['HANDLER_BINDING != RUNTIME_DISPATCH'],
      scanId,
      handlerRef: impl.implementationRef,
      toolName: impl.toolName,
    });
    const toolNodeId = stableNodeId('tool', [scanId, impl.toolCandidateId]);
    if (nodeById.has(toolNodeId)) {
      addEdge({
        id: stableEdgeId(toolNodeId, handlerNodeId, 'implements'),
        source: toolNodeId,
        target: handlerNodeId,
        label: 'implements',
        kind: 'implements',
        joinBasis: 'STRUCTURAL_RELATION',
        style: 'dashed',
      });
    }
  }

  // ─── Consequence nodes (Handler → Consequential Operation) ──────────────────
  // Exact canonical relation only. Consequence node identity = HandlerConsequentialOperationRelation.id.
  for (const op of data.handlerOperationRelations || []) {
    const handlerNodeId = stableNodeId('handler', [scanId, op.toolImplementationRelationId]);
    if (!nodeById.has(handlerNodeId)) continue;
    const consequenceNodeId = stableNodeId('consequence', [scanId, op.id]);
    addNode({
      id: consequenceNodeId,
      label: op.handlerRef || op.handlerFunctionId || op.id,
      kind: 'consequence',
      subType: op.targetKind || 'consequential_operation',
      subTypeLabel: 'Consequential operation',
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(op.state as AriRelationState),
      sourceLocation: op.callPath?.[0] ? `${op.callPath[0]}` : undefined,
      limitations: ['CONSEQUENTIAL_OPERATION != RUNTIME_EFFECT'],
      scanId,
      handlerRef: op.handlerRef,
    });
    addEdge({
      id: stableEdgeId(handlerNodeId, consequenceNodeId, 'handles'),
      source: handlerNodeId,
      target: consequenceNodeId,
      label: 'handles',
      kind: 'handles',
      joinBasis: 'STRUCTURAL_RELATION',
      style: stateToStyle(op.state as AriRelationState),
    });
    const downstreamResourceIds = opToResourceNodeIds.get(op.id);
    if (downstreamResourceIds) {
      for (const resourceNodeId of downstreamResourceIds) {
        addEdge({
          id: stableEdgeId(consequenceNodeId, resourceNodeId, 'reaches_resource'),
          source: consequenceNodeId,
          target: resourceNodeId,
          label: 'reaches resource',
          kind: 'reaches_resource',
          joinBasis: 'STATIC',
          style: stateToStyle(op.state as AriRelationState),
        });
      }
    }
  }

  // ─── Resource / Service nodes ─────────────────────────────────────────────
  // resourceNodeIdsByKey is already precomputed for exact consequence mapping.
  for (const arp of reachabilityProjection.agentResourcePaths) {
    const isService = arp.resource.resourceClass === 'EXTERNAL_SERVICE';
    const kind = isService ? 'service' : 'resource';
    const nodeId = stableNodeId(kind, [scanId, arp.resourceKey]);
    addNode({
      id: nodeId,
      label: resourceLabel(arp.resource),
      kind,
      subType: arp.resource.resourceClass,
      subTypeLabel: arp.resource.resourceClass,
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(arp.state),
      limitations: [isService ? 'SERVICE_CALL != RUNTIME_INVOCATION' : 'RESOURCE_ACCESS != RUNTIME_PERMISSION'],
      scanId,
      resourceKey: arp.resourceKey,
      resourceClass: arp.resource.resourceClass,
      ...scopeFields(arp.resource),
    });
    const agentNodeId = stableNodeId('agent', [scanId, arp.agentId]);
    if (nodeById.has(agentNodeId)) {
      const style = stateToStyle(arp.state);
      addEdge({
        id: stableEdgeId(agentNodeId, nodeId, 'reaches_resource'),
        source: agentNodeId,
        target: nodeId,
        label: isService ? 'reaches service' : 'reaches resource',
        kind: 'reaches_resource',
        joinBasis: 'STATIC',
        style,
      });
    }
  }

  // ─── Service-call service nodes (for services not in resource paths) ───────
  const serviceCallKeys = new Set<string>();
  for (const sc of data.serviceCallRelations || []) {
    const serviceResource = sc.resource;
    if (!serviceResource) continue;
    const key = resourceChannelKey(serviceResource);
    if (!key) continue;
    if (resourceNodeIdsByKey.has(key)) continue;
    if (serviceCallKeys.has(key)) continue;
    serviceCallKeys.add(key);
    const nodeId = stableNodeId('service', [scanId, key]);
    addNode({
      id: nodeId,
      label: serviceResource.displayName || serviceResource.key || sc.operation || 'service',
      kind: 'service',
      subType: 'EXTERNAL_SERVICE',
      subTypeLabel: 'External service',
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(sc.state),
      limitations: ['SERVICE_CALL != RUNTIME_INVOCATION'],
      scanId,
      resourceKey: key,
      resourceClass: 'EXTERNAL_SERVICE',
      serviceKey: serviceResource.key,
      ...scopeFields(serviceResource),
    });
    const sourceId = sc.subject.kind === 'AGENT' ? sc.subject.id : undefined;
    if (!sourceId) continue;
    const agentNodeId = stableNodeId('agent', [scanId, sourceId]);
    if (nodeById.has(agentNodeId)) {
      addEdge({
        id: stableEdgeId(agentNodeId, nodeId, 'reaches_resource'),
        source: agentNodeId,
        target: nodeId,
        label: 'reaches service',
        kind: 'reaches_resource',
        joinBasis: 'STATIC',
        style: stateToStyle(sc.state),
      });
    }
  }

  // ─── Shared resource hubs (co-access, not communication) ──────────────────
  const resourceToPaths = new Map<string, AgentResourcePath[]>();
  for (const arp of reachabilityProjection.agentResourcePaths) {
    const list = resourceToPaths.get(arp.resourceKey) || [];
    list.push(arp);
    resourceToPaths.set(arp.resourceKey, list);
  }

  const hubNodeIdsByKey = new Map<string, string>();
  for (const [resourceKey, paths] of resourceToPaths.entries()) {
    let participantIds = Array.from(new Set(paths.map((p) => p.agentId)));
    if (participantIds.length < 2) continue;

    participantIds.sort((a, b) => a.localeCompare(b));
    let hubState: AriRelationState = 'ESTABLISHED';
    for (const p of paths) {
      hubState = weakest(hubState, p.state);
    }
    const representative = paths[0];
    const shown = Math.min(participantIds.length, MAX_SHOWN_PARTICIPANTS);
    const hubNodeId = stableNodeId('shared_resource_hub', [scanId, resourceKey]);
    hubNodeIdsByKey.set(resourceKey, hubNodeId);
    addNode({
      id: hubNodeId,
      label: `${representative.resource.resourceClass} hub`,
      kind: 'shared_resource_hub',
      subType: 'shared_resource',
      subTypeLabel: 'Shared resource',
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(hubState),
      limitations: [
        'SHARED_SUBSTRATE != COMMUNICATION_CHANNEL',
        'CO_ACCESS != DIRECTIONAL_INFLUENCE',
      ],
      scanId,
      resourceKey,
      resourceClass: representative.resource.resourceClass,
      participantAgentIds: participantIds.slice(0, shown),
      fanoutMetadata: {
        total: participantIds.length,
        shown,
        truncated: participantIds.length > MAX_SHOWN_PARTICIPANTS,
      },
      ...scopeFields(representative.resource),
    });

    // Participant edges (co-access, not team membership)
    for (const pid of participantIds) {
      const agentNodeId = stableNodeId('agent', [scanId, pid]);
      if (nodeById.has(agentNodeId)) {
        addEdge({
          id: stableEdgeId(agentNodeId, hubNodeId, 'member_of'),
          source: agentNodeId,
          target: hubNodeId,
          label: 'accesses shared resource',
          kind: 'member_of',
          joinBasis: 'STATIC',
          style: 'dashed',
        });
      }
    }
  }

  // ─── Potential channel edges (write/read or publish/subscribe) ────────────
  // Writer --potential_channel--> Shared Resource --potential_channel--> Reader
  // Publisher --potential_channel--> Shared Resource --potential_channel--> Subscriber
  // No direct Agent→Agent edge. Pairing is evidence-limited, not observed communication.
  for (const group of reachabilityProjection.potentialChannelGroups) {
    const hubNodeId = hubNodeIdsByKey.get(group.resourceKey);
    if (!hubNodeId) continue;
    for (const writer of group.writers) {
      const writerNodeId = stableNodeId('agent', [scanId, writer.agentId]);
      if (!nodeById.has(writerNodeId)) continue;
      addEdge({
        id: stableEdgeId(writerNodeId, hubNodeId, 'potential_channel'),
        source: writerNodeId,
        target: hubNodeId,
        label: 'potential channel',
        kind: 'potential_channel',
        joinBasis: 'INFERRED',
        style: 'dashed',
      });
    }
    for (const reader of group.readers) {
      const readerNodeId = stableNodeId('agent', [scanId, reader.agentId]);
      if (!nodeById.has(readerNodeId)) continue;
      addEdge({
        id: stableEdgeId(hubNodeId, readerNodeId, 'potential_channel'),
        source: hubNodeId,
        target: readerNodeId,
        label: 'potential channel',
        kind: 'potential_channel',
        joinBasis: 'INFERRED',
        style: 'dashed',
      });
    }
    for (const publisher of group.publishers) {
      const publisherNodeId = stableNodeId('agent', [scanId, publisher.agentId]);
      if (!nodeById.has(publisherNodeId)) continue;
      addEdge({
        id: stableEdgeId(publisherNodeId, hubNodeId, 'potential_channel'),
        source: publisherNodeId,
        target: hubNodeId,
        label: 'potential channel',
        kind: 'potential_channel',
        joinBasis: 'INFERRED',
        style: 'dashed',
      });
    }
    for (const subscriber of group.subscribers) {
      const subscriberNodeId = stableNodeId('agent', [scanId, subscriber.agentId]);
      if (!nodeById.has(subscriberNodeId)) continue;
      addEdge({
        id: stableEdgeId(hubNodeId, subscriberNodeId, 'potential_channel'),
        source: hubNodeId,
        target: subscriberNodeId,
        label: 'potential channel',
        kind: 'potential_channel',
        joinBasis: 'INFERRED',
        style: 'dashed',
      });
    }
  }

  // ─── Persistence nodes (handler-only does not become agent persistence) ─────
  const handlerNodeIdsByImplId = new Map<string, string>();
  for (const impl of data.toolImplementationRelations || []) {
    handlerNodeIdsByImplId.set(impl.id, stableNodeId('handler', [scanId, impl.id]));
  }
  for (const p of data.persistenceCreationRelations || []) {
    const persistenceNodeId = stableNodeId('persistence', [scanId, p.id]);
    addNode({
      id: persistenceNodeId,
      label: p.targetRef || p.mechanism || 'persistence',
      kind: 'persistence',
      subType: p.mechanism || 'unknown',
      subTypeLabel: p.mechanism || 'Persistence',
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(p.state),
      limitations: ['PERSISTENCE_CREATION != RUNTIME_WRITE'],
      scanId,
      mechanismKind: p.mechanism,
    });
    if (p.subject.kind === 'HANDLER' && handlerNodeIdsByImplId.has(p.subject.id)) {
      const handlerNodeId = handlerNodeIdsByImplId.get(p.subject.id)!;
      if (nodeById.has(handlerNodeId)) {
        addEdge({
          id: stableEdgeId(handlerNodeId, persistenceNodeId, 'has_persistence'),
          source: handlerNodeId,
          target: persistenceNodeId,
          label: 'has persistence',
          kind: 'has_persistence',
          joinBasis: 'STATIC',
          style: stateToStyle(p.state),
        });
      }
    } else if (p.subject.kind === 'AGENT') {
      const agentNodeId = stableNodeId('agent', [scanId, p.subject.id]);
      if (nodeById.has(agentNodeId)) {
        addEdge({
          id: stableEdgeId(agentNodeId, persistenceNodeId, 'has_persistence'),
          source: agentNodeId,
          target: persistenceNodeId,
          label: 'has persistence',
          kind: 'has_persistence',
          joinBasis: 'STATIC',
          style: stateToStyle(p.state),
        });
      }
    }
  }

  // ─── Deferred path nodes ───────────────────────────────────────────────────
  for (const dp of reachabilityProjection.deferredPathFrontiers) {
    const deferredNodeId = stableNodeId('deferred', [scanId, dp.id]);
    addNode({
      id: deferredNodeId,
      label: `Deferred: ${agentNameById.get(dp.sourceAgentId) ?? dp.sourceAgentId}`,
      kind: 'deferred',
      subType: dp.closureState,
      subTypeLabel: `Deferred path (${dp.closureState.toLowerCase()})`,
      aiReachable: 'UNKNOWN',
      availability: dp.closureState === 'RESOLVED' ? 'AVAILABLE' : 'PARTIAL',
      limitations: dp.limitations,
      scanId,
    });
    const agentNodeId = stableNodeId('agent', [scanId, dp.sourceAgentId]);
    if (nodeById.has(agentNodeId)) {
      addEdge({
        id: stableEdgeId(agentNodeId, deferredNodeId, 'deferred_to'),
        source: agentNodeId,
        target: deferredNodeId,
        label: 'deferred to',
        kind: 'deferred_to',
        joinBasis: 'STATIC',
        style: 'dotted',
      });
    }
  }

  // ─── Evaluation surface nodes ──────────────────────────────────────────────
  for (const ei of reachabilityProjection.evaluationIntegrityExposures) {
    const evalNodeId = stableNodeId('evaluation_surface', [scanId, ei.id]);
    addNode({
      id: evalNodeId,
      label: ei.surfaceId ? `${ei.surfaceId} (${ei.accessType})` : 'evaluation surface',
      kind: 'evaluation_surface',
      subType: ei.exposureKind,
      subTypeLabel: ei.accessType,
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(ei.state),
      limitations: ['EVALUATION_SURFACE_ACCESS != RUNTIME_MANIPULATION'],
      scanId,
      surfaceKind: ei.accessType,
    });
    const agentNodeId = stableNodeId('agent', [scanId, ei.agentId]);
    if (nodeById.has(agentNodeId)) {
      const edgeLabel = (() => {
        switch (ei.accessType) {
          case 'INVOKABLE': return 'can invoke';
          case 'READABLE': return 'can read';
          case 'WRITABLE': return 'can write';
          case 'MUTABLE': return 'can mutate';
          case 'INTERRUPTIBLE': return 'can interrupt';
          default: return 'evaluation exposure';
        }
      })();
      addEdge({
        id: stableEdgeId(agentNodeId, evalNodeId, 'evaluates'),
        source: agentNodeId,
        target: evalNodeId,
        label: edgeLabel,
        kind: 'evaluates',
        joinBasis: 'STATIC',
        style: stateToStyle(ei.state),
      });
    }
  }

  // ─── Credential reference nodes ──────────────────────────────────────────
  for (const cc of reachabilityProjection.credentialServiceChains) {
    const credNodeId = stableNodeId('credential_reference', [scanId, cc.id]);
    addNode({
      id: credNodeId,
      label: cc.credentialReference || 'credential reference',
      kind: 'credential_reference',
      subType: 'credential_reference',
      subTypeLabel: 'Credential reference',
      aiReachable: 'UNKNOWN',
      availability: stateToAvailability(cc.state),
      limitations: [
        'CREDENTIAL_REFERENCE != EFFECTIVE_PERMISSION',
        'CREDENTIAL_EVIDENCE != AUTHORIZATION',
      ],
      scanId,
      credentialReference: cc.credentialReference,
    });
    const userKind = cc.usedBySubjectKind.toLowerCase();
    const usedByNodeId = stableNodeId(userKind, [scanId, cc.usedBySubjectId]);
    if (nodeById.has(usedByNodeId)) {
      // Dotted because a credential reference is evidence, not an authority grant
      addEdge({
        id: stableEdgeId(usedByNodeId, credNodeId, 'credential_reference'),
        source: usedByNodeId,
        target: credNodeId,
        label: 'credential reference',
        kind: 'credential_reference',
        joinBasis: 'CREDENTIAL',
        style: 'dotted',
      });
    }
    for (const resourceKey of cc.reachableResourceKeys || []) {
      const serviceNodeId = resourceNodeIdsByKey.get(resourceKey) || hubNodeIdsByKey.get(resourceKey);
      if (serviceNodeId) {
        addEdge({
          id: stableEdgeId(credNodeId, serviceNodeId, 'credential_reference'),
          source: credNodeId,
          target: serviceNodeId,
          label: 'may reach',
          kind: 'credential_reference',
          joinBasis: 'CREDENTIAL',
          style: 'dotted',
        });
      }
    }
  }

  // ─── Deterministic ordering (same as topology projector) ───────────────────
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges, limitations };
}
