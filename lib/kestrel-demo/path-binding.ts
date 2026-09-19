/**
 * Kestrel public constellation — exact path ↔ graph-node binding.
 *
 * EXACT PATH IDENTITY chain:
 *   ActionPath.consequenceRelationId
 *   → HandlerConsequentialOperationRelation.id
 *   → consequence TopologyNode.consequenceRelationId
 *
 * HANDLER_REF != PATH_IDENTITY — a handler can reach several distinct
 * consequential operations. A handler node binds to a path only when its
 * handlerRef maps to exactly one path; ambiguous handlers fail closed and
 * the user must pick the exact consequence.
 */

export interface BoundGraphNode {
  id: string
  kind?: string
  label?: string
  handlerRef?: string
  consequenceRelationId?: string
}

export interface BoundPath {
  pathId: string
  handlerRef?: string
  consequenceRelationId?: string
}

export function consequenceNodeForPath<N extends BoundGraphNode, P extends BoundPath>(
  nodes: N[],
  p: P | null,
): N | undefined {
  if (!p?.consequenceRelationId) return undefined
  return nodes.find((n) => n.kind === 'consequence' && n.consequenceRelationId === p.consequenceRelationId)
}

/**
 * Node → path resolution.
 *  - consequence node: exact consequenceRelationId match (never first-match)
 *  - handler node: binds only when handlerRef maps to exactly one path;
 *    multiple matches return 'AMBIGUOUS' — caller must surface a chooser
 */
export function pathForGraphNode<N extends BoundGraphNode, P extends BoundPath>(
  nodes: N[],
  paths: P[],
  nodeId: string | null,
): P | 'AMBIGUOUS' | undefined {
  const n = nodeId ? nodes.find((g) => g.id === nodeId) : undefined
  if (!n) return undefined
  if (n.kind === 'consequence' && n.consequenceRelationId) {
    return paths.find((p) => p.consequenceRelationId === n.consequenceRelationId)
  }
  if (n.handlerRef) {
    const matches = paths.filter((p) => p.handlerRef === n.handlerRef)
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return 'AMBIGUOUS'
  }
  return undefined
}
