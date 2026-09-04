/**
 * AI Action & Access Map — Stable ID Generation
 *
 * Deterministic node/edge IDs based on semantic identity.
 * IDs are stable across re-projections of the same source data.
 * IDs do NOT depend on array order or insertion sequence.
 *
 * @version topology-1.0.0
 */

/**
 * Generate a stable node ID from kind + semantic key.
 */
export function stableNodeId(kind: string, semanticKey: string): string {
  return `node:${kind}:${semanticKey}`;
}

/**
 * Generate a stable edge ID from source + target + kind.
 */
export function stableEdgeId(source: string, target: string, kind: string): string {
  return `edge:${kind}:${source}->${target}`;
}

/**
 * Sanitize a string for use as a semantic key.
 * Replaces characters that could break ID parsing.
 */
export function sanitizeSemanticKey(input: string): string {
  return input
    .replace(/[\s<>]/g, '_')
    .replace(/[^a-zA-Z0-9_:\-\.\/]/g, '')
    .slice(0, 200) || 'unknown';
}
