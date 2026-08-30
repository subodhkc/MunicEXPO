/**
 * Gate 3 — Evaluated Scope Capture
 *
 * Builds an EvaluatedScopeSnapshot from the current Connected Asset topology
 * at evaluation time. This is called ONCE at the start of a new evaluation,
 * AFTER target/system authorization succeeds and BEFORE U5 consumes
 * evaluation Evidence.
 *
 * Lock: POST_HOC_CURRENT_ASSET_QUERY != HISTORICAL_SCOPE
 *   This function captures the CURRENT topology at evaluation start.
 *   It must NOT be called after the evaluation to "reconstruct" scope.
 *   Historical scope comes from the persisted snapshot, not from re-querying.
 */

import { prisma } from '@/lib/prisma';
import {
  EvaluatedScopeSnapshot,
  EvaluatedScopeAssetSnapshot,
} from './u6-types';
import { buildEvaluatedScopeSnapshot } from './scope-digest';
import { EVALUATED_SCOPE_SCHEMA_VERSION } from './u6-types';

/**
 * Capture the Evaluated Scope for an AI System at evaluation time.
 *
 * Reads the current Connected Assets (including retired ones for historical
 * completeness at capture time) and builds an immutable snapshot.
 *
 * @param organizationId - tenant boundary
 * @param aiSystemId - canonical AI System ID
 * @param orchestratorRunId - the orchestrator run that triggered this evaluation
 * @param evaluationSnapshotAt - when the snapshot is captured
 * @returns EvaluatedScopeSnapshot with computed scopeDigest
 */
export async function captureEvaluatedScope(
  organizationId: string,
  aiSystemId: string,
  orchestratorRunId: string,
  evaluationSnapshotAt: Date,
): Promise<EvaluatedScopeSnapshot> {
  // Read the AI System for environment and metadata
  const aiSystem = await prisma.ai_systems.findFirst({
    where: { id: aiSystemId, organizationId },
    select: {
      id: true,
      organizationId: true,
      environment: true,
      name: true,
    },
  });

  if (!aiSystem) {
    throw new Error('AI_SYSTEM_NOT_FOUND_OR_TENANT_MISMATCH');
  }

  // Read ALL Connected Assets at capture time (including retired — they may
  // be in scope if they were active at evaluation time)
  const assets = await prisma.ai_system_assets.findMany({
    where: { aiSystemId, organizationId },
    orderBy: { createdAt: 'asc' },
  });

  // Build asset snapshots with scope-semantic fields
  const assetSnapshots: EvaluatedScopeAssetSnapshot[] = assets.map(asset => {
    const isRetired = asset.retiredAt !== null;
    const inclusionState: 'EVALUATED' | 'NOT_EVALUATED' | 'UNAVAILABLE' =
      isRetired ? 'NOT_EVALUATED' : 'EVALUATED';

    return {
      connectedAssetId: asset.id,
      assetType: asset.assetType,
      displayName: asset.displayName,
      canonicalLocator: asset.externalId ?? undefined,
      identityStateAtEvaluation: asset.identityState,
      environment: asset.environment ?? undefined,
      evaluationInclusionState: inclusionState,
      notEvaluatedReason: isRetired ? 'ASSET_RETIRED' : undefined,
    };
  });

  // Build the complete scope snapshot with computed digest
  const snapshot = buildEvaluatedScopeSnapshot({
    scopeSchemaVersion: EVALUATED_SCOPE_SCHEMA_VERSION,
    organizationId,
    aiSystemId,
    evaluationSnapshotAt: evaluationSnapshotAt.toISOString(),
    orchestratorRunId,
    environment: aiSystem.environment ?? undefined,
    assetSnapshots,
    unresolvedIdentity: assetSnapshots.filter(a => a.identityStateAtEvaluation === 'NOT_VERIFIED').length > 0
      ? ['ASSET_IDENTITY_NOT_VERIFIED']
      : [],
    scopeLimitations: assetSnapshots.filter(a => a.evaluationInclusionState === 'NOT_EVALUATED').length > 0
      ? ['SCOPE_INCLUDES_RETIRED_ASSETS_EXCLUDED_FROM_EVALUATION']
      : [],
  });

  return snapshot;
}
