/**
 * Gate 3 — Evaluated Scope Persistence Service
 *
 * ONE canonical service for persisting and retrieving immutable Evaluated Scope
 * snapshots. Uses existing computeScopeDigest() and buildEvaluatedScopeSnapshot()
 * from the scope-digest contract.
 *
 * INVARIANTS:
 * - ONE completed/attempted Assurance evaluation → ONE immutable scope snapshot
 * - Scope is captured at evaluation start (after target/system authorization,
 *   before U5 consumes evaluation Evidence)
 * - IMMUTABLE after creation — no PATCH, no update, no regeneration
 *   (also enforced at DB level via trigger in G3-R1 migration)
 * - Legacy pre-Gate-3 evaluations have no scope row (LEGACY_SCOPE_NOT_RECORDED)
 * - Tenant bound (organizationId required)
 * - AI System bound (aiSystemId required)
 *
 * G3-R1: The 1:1 relation is owned by evaluated_scope_snapshots.assuranceEvaluationId.
 * assurance_evaluations no longer has an evaluatedScopeId scalar.
 *
 * Lock: POST_HOC_CURRENT_ASSET_QUERY != HISTORICAL_SCOPE
 */

import { prisma } from '@/lib/prisma';
import {
  EvaluatedScopeSnapshot,
  EVALUATED_SCOPE_SCHEMA_VERSION,
  EVALUATED_SCOPE_NOT_CAPTURED,
} from './u6-types';
import { buildEvaluatedScopeSnapshot, verifyScopeDigest } from './scope-digest';

/**
 * Persist an immutable Evaluated Scope snapshot for an Assurance evaluation.
 *
 * G3-R1: Supports transaction-scoped creation via optional `tx` parameter.
 * When `tx` is provided, the scope row is created within the caller's transaction,
 * ensuring atomicity with the evaluation record.
 *
 * This is called ONCE at the start of a new evaluation, after target/system
 * authorization succeeds and before U5 consumes evaluation Evidence.
 *
 * The snapshot is immutable after creation. No updates are allowed.
 * DB-level trigger (G3-R1 migration) also prevents UPDATE.
 */
export async function persistEvaluatedScope(
  scopeInput: Omit<EvaluatedScopeSnapshot, 'scopeDigest' | 'scopeSummary'> & {
    scopeSummary?: string;
  },
  assuranceEvaluationId: string,
  tx?: any, // G3-R1: optional transaction client for atomic creation
): Promise<{ id: string; scopeDigest: string; snapshot: EvaluatedScopeSnapshot }> {
  // Build the complete snapshot with computed scopeDigest
  const snapshot = buildEvaluatedScopeSnapshot(scopeInput);

  // Verify the digest immediately (defensive — should always pass)
  if (!verifyScopeDigest(snapshot)) {
    throw new Error('EVALUATED_SCOPE_DIGEST_VERIFICATION_FAILED');
  }

  const client = tx ?? prisma;

  // Check for existing scope for this evaluation (idempotency)
  const existing = await client.evaluated_scope_snapshots.findUnique({
    where: { assuranceEvaluationId },
    select: { id: true, scopeDigest: true },
  });

  if (existing) {
    // Idempotent: return existing scope. Do NOT overwrite.
    if (existing.scopeDigest !== snapshot.scopeDigest) {
      // CONFLICT: same evaluation but different scope digest.
      // This should never happen for a deterministic capture. Fail closed.
      throw new Error('EVALUATED_SCOPE_CONFLICT_DIFFERENT_DIGEST');
    }
    return { id: existing.id, scopeDigest: existing.scopeDigest, snapshot };
  }

  // Persist the immutable scope snapshot
  const record = await client.evaluated_scope_snapshots.create({
    data: {
      organizationId: snapshot.organizationId,
      aiSystemId: snapshot.aiSystemId,
      assuranceEvaluationId,
      orchestratorRunId: snapshot.orchestratorRunId ?? null,
      scopeSchemaVersion: snapshot.scopeSchemaVersion,
      scopeDigest: snapshot.scopeDigest,
      evaluationSnapshotAt: new Date(snapshot.evaluationSnapshotAt),
      snapshotJson: snapshot as any,
    },
  });

  // G3-R1: No separate update on assurance_evaluations — the relation is owned
  // by evaluated_scope_snapshots.assuranceEvaluationId. The evaluation row already
  // exists (created in the same transaction).

  return { id: record.id, scopeDigest: snapshot.scopeDigest, snapshot };
}

/**
 * Retrieve an Evaluated Scope snapshot by evaluation ID.
 * Returns null for legacy pre-Gate-3 evaluations (LEGACY_SCOPE_NOT_RECORDED).
 */
export async function getEvaluatedScopeByEvaluationId(
  assuranceEvaluationId: string,
  organizationId: string,
): Promise<EvaluatedScopeSnapshot | null> {
  const record = await prisma.evaluated_scope_snapshots.findUnique({
    where: { assuranceEvaluationId },
    select: {
      snapshotJson: true,
      scopeDigest: true,
      organizationId: true,
    },
  });

  if (!record) return null;

  // Tenant safety: verify organization ownership
  if (record.organizationId !== organizationId) {
    return null; // fail closed — cross-tenant access denied
  }

  const snapshot = record.snapshotJson as unknown as EvaluatedScopeSnapshot;

  // Verify the persisted digest matches the persisted payload (tamper detection)
  if (!verifyScopeDigest(snapshot)) {
    throw new Error('EVALUATED_SCOPE_TAMPER_DETECTED_DIGEST_MISMATCH');
  }

  return snapshot;
}

/**
 * Retrieve an Evaluated Scope snapshot by scope ID.
 */
export async function getEvaluatedScopeById(
  scopeId: string,
  organizationId: string,
): Promise<EvaluatedScopeSnapshot | null> {
  const record = await prisma.evaluated_scope_snapshots.findUnique({
    where: { id: scopeId },
    select: {
      snapshotJson: true,
      organizationId: true,
    },
  });

  if (!record) return null;

  // Tenant safety
  if (record.organizationId !== organizationId) {
    return null;
  }

  const snapshot = record.snapshotJson as unknown as EvaluatedScopeSnapshot;

  if (!verifyScopeDigest(snapshot)) {
    throw new Error('EVALUATED_SCOPE_TAMPER_DETECTED_DIGEST_MISMATCH');
  }

  return snapshot;
}

/**
 * Legacy marker for pre-Gate-3 evaluations without persisted scope.
 * Do NOT fabricate historical scopes from current Connected Assets.
 */
export { EVALUATED_SCOPE_NOT_CAPTURED, EVALUATED_SCOPE_SCHEMA_VERSION };

/**
 * Get the scope ID for an evaluation (for U6 package binding).
 * Returns null for legacy evaluations without persisted scope.
 */
export async function getScopeIdByEvaluationId(
  assuranceEvaluationId: string,
): Promise<string | null> {
  const record = await prisma.evaluated_scope_snapshots.findUnique({
    where: { assuranceEvaluationId },
    select: { id: true },
  });
  return record?.id ?? null;
}

/**
 * Get the scope digest for an evaluation (for U6 package binding).
 * Returns null for legacy evaluations without persisted scope.
 */
export async function getScopeDigestByEvaluationId(
  assuranceEvaluationId: string,
  organizationId: string,
): Promise<string | null> {
  const record = await prisma.evaluated_scope_snapshots.findUnique({
    where: { assuranceEvaluationId },
    select: { scopeDigest: true, organizationId: true },
  });
  if (!record) return null;
  if (record.organizationId !== organizationId) return null; // tenant safety
  return record.scopeDigest;
}
