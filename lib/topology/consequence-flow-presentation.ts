/**
 * CONSTELLATION-VISUAL-1 — Consequence-flow presentation grouping.
 *
 * Pure, deterministic presentation projection over existing evaluated
 * action paths. This file holds NO topology truth:
 *
 *   GROUPING != NEW_ANALYSIS
 *   PATH_STAGE_ADJACENCY != CANONICAL_EDGE
 *   PRESENTATION != TOPOLOGY_TRUTH
 *
 * It groups paths by the EXACT canonical consequence identity already
 * carried on each path (consequenceRelationId → sink target → handler
 * fallback). No path is dropped, merged, or invented; no relation is
 * inferred. Ordering is the existing deterministic presentation order:
 * state-changing effects first, then path count, then label.
 */

export interface FlowActionPath {
  pathId: string;
  toolCandidateId?: string;
  registrationRelationId?: string;
  modelExposureRelationId?: string;
  dispatchRelationId?: string;
  toolImplementationRelationId?: string;
  handlerFunctionId?: string;
  handlerRef?: string;
  consequenceRelationId?: string;
  contextBindings?: { state: string; contextKind: string; tenantFilterBound?: boolean }[];
  downstreamOperationIds?: string[];
  sinkTargetIds?: string[];
  planes?: {
    requested: string;
    policyAuthorized: string;
    effectivelyGranted: string;
    codeCapable: string;
    observed: string;
  };
  planeJoin?: string;
  adverseEvidence?: { relationId?: string; description?: string }[];
  protectiveControls?: { relationId?: string; description?: string }[];
  limitations?: string[];
}

export interface ConsequenceLabelLike {
  label: string;
  effect?: string;
  technical?: string;
  resource?: string;
}

/**
 * LEVEL A — display family identity. Groups by the existing deterministic
 * presentation label (label + effect + resource), NOT the canonical
 * relation id: Kestrel has 44 unique consequenceRelationIds but ~8
 * meaningful consequence families. DISPLAY_GROUP != CANONICAL_CONSEQUENCE_IDENTITY;
 * SAME_DISPLAY_LABEL != SAME_RELATION. Level B (exact path/relation
 * identities) is preserved inside each group — nothing is merged or lost.
 */
export interface ConsequenceGroup {
  /** Display-family key — presentation grouping only. */
  key: string;
  label: string;
  effect?: string;
  technical?: string;
  resource: string;
  paths: FlowActionPath[];
  /** Exact canonical consequence relation ids present in this family. */
  relationIds: string[];
}

const STATE_CHANGING = new Set(['WRITE', 'CREATE', 'SEND', 'DELETE', 'UPDATE']);

function sinkResource(p: FlowActionPath): string {
  const s = p.sinkTargetIds?.[0] ?? '';
  return s.split('/').slice(-1)[0]?.split(':')[0] || s || '—';
}

/** Deterministic ordering key: state-changing effects first, then path count, then label. */
function groupSortValue(g: ConsequenceGroup): [number, number, string] {
  return [g.effect && STATE_CHANGING.has(g.effect) ? 0 : 1, -g.paths.length, g.label];
}

export function groupPathsByConsequence(
  paths: FlowActionPath[],
  labelFor: (p: FlowActionPath) => ConsequenceLabelLike,
): ConsequenceGroup[] {
  const m = new Map<string, ConsequenceGroup>();
  const sorted = [...paths].sort((a, b) => a.pathId.localeCompare(b.pathId));
  for (const p of sorted) {
    const l = labelFor(p);
    const resource = l.resource ?? sinkResource(p);
    const key = `${l.label}|${l.effect ?? ''}|${resource}`;
    const g =
      m.get(key) ?? {
        key,
        label: l.label,
        effect: l.effect,
        technical: l.technical,
        resource,
        paths: [],
        relationIds: [],
      };
    g.paths.push(p);
    // PATH_COUNT != UNIQUE_RELATION_COUNT — multiple paths may share one
    // exact consequenceRelationId; keep deterministic unique identity.
    if (p.consequenceRelationId && !g.relationIds.includes(p.consequenceRelationId)) {
      g.relationIds.push(p.consequenceRelationId);
    }
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => {
    const av = groupSortValue(a);
    const bv = groupSortValue(b);
    return av[0] - bv[0] || av[1] - bv[1] || av[2].localeCompare(bv[2]);
  });
}
