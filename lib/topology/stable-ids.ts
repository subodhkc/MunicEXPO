/**
 * AI Action & Access Map — Stable Semantic Identity
 *
 * Node/edge IDs are built from explicit semantic tuples and hashed using
 * the existing HAIEC deterministic hash owner (hashTextContent).
 *
 * LOCK: DISPLAY_LABEL != NODE_IDENTITY
 * LOCK: SAME_ACTION_LABEL != SAME_EXECUTION_PATH
 *
 * @version topology-1.0.0
 */

import { hashTextContent } from '@/lib/evidence/crypto-hash';

/**
 * Build a stable node ID from a semantic identity tuple.
 *
 * The tuple is an array of strings representing the canonical semantic identity.
 * It is joined with a unit separator and SHA-256 hashed.
 *
 * Example: action occurrence = [scanId, entrypointId, sinkId, protectedAction]
 * Example: role guard = [scanId, entrypointId, guardType, token]
 * Example: connected asset = [connectedAssetId]
 *
 * The human label is separate from this identity.
 */
export function stableNodeId(kind: string, semanticTuple: string[]): string {
  const canonical = [kind, ...semanticTuple].join('\x1F');
  const hash = hashTextContent(canonical);
  return `node:${kind}:${hash.slice(0, 24)}`;
}

/**
 * Build a stable edge ID from source + target + kind.
 */
export function stableEdgeId(source: string, target: string, kind: string): string {
  const canonical = [kind, source, target].join('\x1F');
  const hash = hashTextContent(canonical);
  return `edge:${kind}:${hash.slice(0, 24)}`;
}

/**
 * Safely convert a value to a string for semantic tuple inclusion.
 * Returns empty string for null/undefined.
 */
export function s(value: string | undefined | null): string {
  return value ?? '';
}
