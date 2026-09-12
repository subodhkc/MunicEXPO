/**
 * Constellation Delta overlay — read-side derived presentation.
 *
 * Maps a canonical ConsequenceDelta onto the EXISTING Constellation/Topology
 * projection for the candidate scan. The overlay annotates the current
 * (candidate) graph only — it never renders baseline topology as if current,
 * never mutates canonical node/edge identity, and never fabricates visual
 * objects for unmapped items.
 *
 * LOCKS:
 *   BASE_GRAPH_MUTATED = NO
 *   CONSTELLATION_DELTA_IS_DERIVED_PRESENTATION = YES
 *   CANDIDATE_SCAN != MAP_SCAN => NO_ANNOTATION (textual delta only)
 *   BASELINE_REFS_NEVER_MAP_TO_CANDIDATE_GRAPH = YES
 *   UNMAPPED_DELTA_ITEM -> stays textual (unmappedDeltaItemIds)
 *   UNKNOWN_TARGET != REMOVED_EDGE
 */

import type {
  ConstellationProjection,
} from './types';
import { stableNodeId } from './stable-ids';
import type {
  ConsequenceDelta,
  ConsequenceDeltaItem,
  DeltaKind,
} from '@/lib/assurance/consequence-delta';

export type ConstellationDeltaOverlayAvailability =
  | 'ESTABLISHED'
  | 'PARTIAL'
  | 'NOT_AVAILABLE';

export type ConstellationDeltaOverlayUnavailableReason =
  | 'CANDIDATE_SCAN_NOT_CURRENT_MAP'
  | 'DELTA_NOT_AVAILABLE'
  | 'NO_MATCHING_CURRENT_RELATIONS'
  | 'IDENTITY_MISMATCH';

export interface ConstellationDeltaNodeAnnotation {
  /** Canonical TopologyNode id (= ConstellationNode.canonicalNodeId). */
  canonicalNodeId: string;
  deltaItemIds: string[];
  kinds: DeltaKind[];
}

export interface ConstellationDeltaEdgeAnnotation {
  canonicalEdgeId: string;
  deltaItemIds: string[];
  kinds: DeltaKind[];
}

export interface ConstellationDeltaOverlay {
  availability: ConstellationDeltaOverlayAvailability;
  unavailableReason?: ConstellationDeltaOverlayUnavailableReason;
  baseline?: {
    evaluationId: string;
    scanId: string;
    commitSha: string | null;
  };
  candidate?: {
    evaluationId: string;
    scanId: string;
    commitSha: string | null;
  };
  summary?: ConsequenceDelta['summary'];
  nodeAnnotations: ConstellationDeltaNodeAnnotation[];
  edgeAnnotations: ConstellationDeltaEdgeAnnotation[];
  unmappedDeltaItemIds: string[];
  limitations: string[];
}

/** Node-id templates whose tuple is [scanId, relationId]. */
const RELATION_NODE_KINDS = [
  'consequence',
  'persistence',
  'deferred',
  'evaluation_surface',
  'credential_reference',
] as const;

/** Node-id templates whose tuple is [scanId, resourceKey]. */
const RESOURCE_NODE_KINDS = ['resource', 'service', 'shared_resource_hub'] as const;

function notAvailable(
  reason: ConstellationDeltaOverlayUnavailableReason,
  delta?: ConsequenceDelta,
): ConstellationDeltaOverlay {
  return {
    availability: 'NOT_AVAILABLE',
    unavailableReason: reason,
    baseline: delta?.baseline
      ? {
          evaluationId: delta.baseline.evaluationId,
          scanId: delta.baseline.scanId,
          commitSha: delta.baseline.commitSha,
        }
      : undefined,
    candidate: delta?.candidate
      ? {
          evaluationId: delta.candidate.evaluationId,
          scanId: delta.candidate.scanId,
          commitSha: delta.candidate.commitSha,
        }
      : undefined,
    summary: delta?.summary,
    nodeAnnotations: [],
    edgeAnnotations: [],
    unmappedDeltaItemIds: delta?.items.map((i) => i.id) ?? [],
    limitations: [
      'Consequence Delta remains available as a textual comparison; the current map cannot carry graph annotations.',
    ],
  };
}

/**
 * Candidate node ids an item may map to — only ids that can be re-derived
 * exactly from the candidate scan's relation/resource refs.
 */
function candidateNodeIdsForItem(
  item: ConsequenceDeltaItem,
  candidateScanId: string,
): string[] {
  const ids: string[] = [];
  for (const relId of item.candidateRelationRefs) {
    for (const kind of RELATION_NODE_KINDS) {
      ids.push(stableNodeId(kind, [candidateScanId, relId]));
    }
  }
  for (const ref of item.candidateResourceRefs) {
    for (const kind of RESOURCE_NODE_KINDS) {
      ids.push(stableNodeId(kind, [candidateScanId, ref]));
    }
  }
  return ids;
}

/**
 * Build the read-side delta overlay for an existing ConstellationProjection.
 *
 * @param constellation the current map's ConstellationProjection
 * @param topologyIdentity identity context of the projected topology —
 *        { scanId, organizationId, aiSystemId } from TopologyProjectionResult
 * @param delta the canonical ConsequenceDelta (baseline → candidate)
 */
export function buildConstellationDeltaOverlay(
  constellation: ConstellationProjection,
  topologyIdentity: { scanId?: string; organizationId?: string; aiSystemId?: string },
  delta: ConsequenceDelta,
): ConstellationDeltaOverlay {
  if (delta.availability === 'NOT_AVAILABLE') {
    return notAvailable('DELTA_NOT_AVAILABLE', delta);
  }

  const candidateScanId = delta.candidate?.scanId;
  if (
    !candidateScanId ||
    !topologyIdentity.scanId ||
    candidateScanId !== topologyIdentity.scanId
  ) {
    return notAvailable('CANDIDATE_SCAN_NOT_CURRENT_MAP', delta);
  }
  if (
    delta.candidate &&
    (delta.candidate.organizationId !== topologyIdentity.organizationId ||
      delta.candidate.aiSystemId !== topologyIdentity.aiSystemId)
  ) {
    return notAvailable('IDENTITY_MISMATCH', delta);
  }

  const nodeIdSet = new Set([
    ...constellation.nodes.map((n) => n.canonicalNodeId),
    ...constellation.combos.map((c) => c.canonicalNodeId),
  ]);
  // Constellation presentation nodes share the canonical topology id for
  // non-combo nodes; also index presentation ids so annotations can target
  // the rendered element directly.
  const presentationIds = new Set([
    ...constellation.nodes.map((n) => n.id),
    ...constellation.combos.map((c) => c.id),
  ]);

  const nodeAnnotations = new Map<string, { deltaItemIds: Set<string>; kinds: Set<DeltaKind> }>();
  const unmappedDeltaItemIds: string[] = [];

  for (const item of delta.items) {
    if (item.candidateRelationRefs.length === 0 && item.candidateResourceRefs.length === 0) {
      // Baseline-only / coverage items have no candidate graph presence.
      unmappedDeltaItemIds.push(item.id);
      continue;
    }
    const matched = candidateNodeIdsForItem(item, candidateScanId).filter(
      (id) => nodeIdSet.has(id) || presentationIds.has(id),
    );
    if (matched.length === 0) {
      unmappedDeltaItemIds.push(item.id);
      continue;
    }
    for (const nodeId of matched) {
      const entry = nodeAnnotations.get(nodeId) ?? {
        deltaItemIds: new Set<string>(),
        kinds: new Set<DeltaKind>(),
      };
      entry.deltaItemIds.add(item.id);
      entry.kinds.add(item.kind);
      nodeAnnotations.set(nodeId, entry);
    }
  }

  // P0: CHANGED_NODE != CHANGED_EDGE. Endpoint propagation would visually
  // claim a specific relationship/path changed when the Delta only
  // established that a neighboring node changed. The canonical Delta item
  // does not carry an edge-joinable semantic identity (stableEdgeId needs
  // exact source+target+kind identity which delta refs do not provide), and
  // no fuzzy/adjacent-edge inference is permitted.
  //   ENDPOINT_CHANGED != EDGE_CHANGED
  //   NO_FABRICATED_PATH_CHANGE = YES
  // v1 behavior: NODE_ANNOTATIONS = YES, EDGE_ANNOTATIONS = NONE; path-level
  // change detail remains in the textual Consequence Delta panel.
  const edgeAnnotations: ConstellationDeltaEdgeAnnotation[] = [];

  const annotations: ConstellationDeltaNodeAnnotation[] = [...nodeAnnotations.entries()]
    .map(([canonicalNodeId, ann]) => ({
      canonicalNodeId,
      deltaItemIds: [...ann.deltaItemIds].sort(),
      kinds: [...ann.kinds].sort(),
    }))
    .sort((a, b) => a.canonicalNodeId.localeCompare(b.canonicalNodeId));

  const limitations = [
    ...delta.limitations,
    'Edge annotations are disabled: node-level change evidence does not prove an adjacent relationship changed.',
  ];
  if (unmappedDeltaItemIds.length > 0) {
    limitations.push(
      `${unmappedDeltaItemIds.length} delta item(s) have no exact match on the current map and remain textual only.`,
    );
  }

  return {
    availability: annotations.length === 0 ? 'PARTIAL' : delta.availability === 'ESTABLISHED' ? 'ESTABLISHED' : 'PARTIAL',
    ...(annotations.length === 0
      ? { unavailableReason: 'NO_MATCHING_CURRENT_RELATIONS' as const }
      : {}),
    baseline: delta.baseline
      ? {
          evaluationId: delta.baseline.evaluationId,
          scanId: delta.baseline.scanId,
          commitSha: delta.baseline.commitSha,
        }
      : undefined,
    candidate: delta.candidate
      ? {
          evaluationId: delta.candidate.evaluationId,
          scanId: delta.candidate.scanId,
          commitSha: delta.candidate.commitSha,
        }
      : undefined,
    summary: delta.summary,
    nodeAnnotations: annotations,
    edgeAnnotations,
    unmappedDeltaItemIds,
    limitations: [...new Set(limitations)].sort(),
  };
}
