/**
 * PX1.2 — Evaluated Scope Digest (Sections 11-12, corrected in PX1.2A-R)
 *
 * Deterministic scope digest using EXISTING canonical serialization and
 * crypto/hash infrastructure. Does NOT invent another cryptographic
 * implementation.
 *
 * Required invariants:
 *   same semantic scope → same scopeDigest
 *   changed evaluated asset identity/scope → different scopeDigest
 *   array ordering must not create nondeterministic digest changes where
 *   order is semantically irrelevant
 *
 * scopeDigest = WHAT WAS IN SCOPE
 * evidenceSetDigest = WHICH EVIDENCE SUPPORTED THE EVALUATION (distinct)
 *
 * Do not collapse scopeDigest and evidenceSetDigest.
 */

import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import type { EvaluatedScopeSnapshot, EvaluatedScopeAssetSnapshot } from './u6-types';
import { EVALUATED_SCOPE_SCHEMA_VERSION } from './u6-types';

/**
 * Fields in EvaluatedScopeAssetSnapshot[] that make the array SET-LIKE.
 * assetSnapshots ordering is semantically irrelevant — sorted by semantic
 * key before serialization to ensure deterministic digest.
 */
const SET_LIKE_SCOPE_FIELDS = new Set<string>(['assetSnapshots']);

/**
 * Semantic sort key for asset snapshots — deterministic ordering by
 * stable identity fields.
 */
function assetSnapshotSortKey(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    return JSON.stringify(item);
  }
  const obj = item as Record<string, unknown>;
  return [
    String(obj.assetId ?? ''),
    String(obj.assetType ?? ''),
    String(obj.canonicalLocator ?? ''),
    String(obj.gitCommit ?? ''),
    String(obj.containerDigest ?? ''),
    String(obj.endpoint ?? ''),
    String(obj.interfaceSpecDigest ?? ''),
  ].join('\x1F');
}

/**
 * Compute a deterministic scope digest from an EvaluatedScopeSnapshot.
 *
 * Excludes the scopeDigest itself (would be circular) and scopeSummary
 * (display-derived, not authoritative). Includes all semantic identity:
 *   - scopeSchemaVersion, organizationId, aiSystemId, evaluationSnapshotAt
 *   - orchestratorRunId, environment
 *   - assetSnapshots (set-like: sorted by semantic key)
 *   - producerRunIds (set-like: sorted)
 *   - unresolvedIdentity, limitations
 */
export function computeScopeDigest(
  snapshot: Omit<EvaluatedScopeSnapshot, 'scopeDigest' | 'scopeSummary'>
): string {
  const semantic: Record<string, unknown> = {
    scopeSchemaVersion: snapshot.scopeSchemaVersion ?? EVALUATED_SCOPE_SCHEMA_VERSION,
    organizationId: snapshot.organizationId,
    aiSystemId: snapshot.aiSystemId,
    evaluationSnapshotAt: snapshot.evaluationSnapshotAt,
    orchestratorRunId: snapshot.orchestratorRunId ?? '',
    environment: snapshot.environment ?? '',
    assetSnapshots: snapshot.assetSnapshots ?? [],
    producerRunIds: (snapshot.producerRunIds ?? []).slice().sort(),
    unresolvedIdentity: (snapshot.unresolvedIdentity ?? []).slice().sort(),
    limitations: (snapshot.limitations ?? []).slice().sort(),
  };

  const canonical = canonicalSerialize(semantic, SET_LIKE_SCOPE_FIELDS);
  return hashTextContent(canonical);
}

/**
 * Build a complete EvaluatedScopeSnapshot with computed scopeDigest.
 */
export function buildEvaluatedScopeSnapshot(
  input: Omit<EvaluatedScopeSnapshot, 'scopeDigest' | 'scopeSummary'> & {
    scopeSummary?: string;
  }
): EvaluatedScopeSnapshot {
  const scopeDigest = computeScopeDigest(input);
  const scopeSummary =
    input.scopeSummary ??
    `Scope: ${input.assetSnapshots.length} asset(s), environment=${input.environment ?? 'unspecified'}`;

  return {
    ...input,
    scopeSchemaVersion: input.scopeSchemaVersion ?? EVALUATED_SCOPE_SCHEMA_VERSION,
    scopeDigest,
    scopeSummary,
  };
}

/**
 * Verify that a persisted EvaluatedScopeSnapshot has a valid scopeDigest.
 *
 * Receipt verification uses this to detect:
 *   - scope payload changed after issuance
 *   - scopeDigest mismatch
 *   - asset identity snapshot changed inside package
 *
 * Returns true ONLY when recomputing the digest from the snapshot's semantic
 * content produces the same scopeDigest.
 */
export function verifyScopeDigest(snapshot: EvaluatedScopeSnapshot): boolean {
  const recomputed = computeScopeDigest(snapshot);
  return recomputed === snapshot.scopeDigest;
}

// Re-export for test access
export { assetSnapshotSortKey };
export type { EvaluatedScopeSnapshot, EvaluatedScopeAssetSnapshot };
