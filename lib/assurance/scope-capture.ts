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
 * Gate 4A Fix D: Validate that a string is a valid immutable container digest.
 *
 * Supports the canonical OCI digest representation:
 *   sha256:<64 hexadecimal characters>
 *
 * MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
 * A Docker tag like "latest" or "my-image:v3" is NOT an immutable digest.
 * A malformed sha256 is NOT a valid digest.
 */
function isValidContainerDigestFormat(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value);
}

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

    // Gate 4A: Freeze canonical identity value from the Connected Asset.
    // Only freeze build/deployment identity dimensions when the asset was
    // VERIFIED at evaluation time. NOT_VERIFIED → identity not source-proven.
    // MANUAL_ASSET_REGISTRATION != VERIFIED_BUILD_IDENTITY.
    const isVerified = asset.identityState === 'VERIFIED';
    const canonicalId = (asset as any).canonicalId as string | null | undefined;

    // Map canonicalId to the appropriate build identity field based on asset type.
    // Only populate when VERIFIED — otherwise the dimension remains UNPROVEN.
    const snapshot: EvaluatedScopeAssetSnapshot = {
      connectedAssetId: asset.id,
      assetType: asset.assetType,
      displayName: asset.displayName,
      canonicalLocator: asset.externalId ?? undefined,
      identityStateAtEvaluation: asset.identityState,
      environment: asset.environment ?? undefined,
      provider: asset.provider ?? undefined,
      evaluationInclusionState: inclusionState,
      notEvaluatedReason: isRetired ? 'ASSET_RETIRED' : undefined,
    };

    // Freeze canonicalIdentity for schema 1.2+ (the actual value, not just hash).
    if (canonicalId) {
      snapshot.canonicalIdentity = canonicalId;
    }

    // Map canonicalId to typed build/deployment identity fields when VERIFIED.
    // VERIFIED + canonicalId = source-proven identity.
    // NOT_VERIFIED + canonicalId = caller-declaimeded (not source-proven).
    if (isVerified && canonicalId) {
      if (asset.assetType === 'CONTAINER_IMAGE') {
        // Fix D: Only freeze containerDigest when canonicalId is a valid
        // immutable digest representation (sha256:<64hex>).
        // MUTABLE_IMAGE_TAG != CONTAINER_DIGEST.
        // canonicalIdentity is still frozen (for traceability) even when the
        // digest format is invalid — but containerDigest is NOT set.
        if (isValidContainerDigestFormat(canonicalId)) {
          snapshot.containerDigest = canonicalId;
        }
      } else if (asset.assetType === 'DEPLOYMENT') {
        // Fix E: deploymentIdentity requires a real provider value.
        // 'unknown' is NOT a proven deployment provider.
        // DEPLOYMENT_URL != DEPLOYED_ARTIFACT_IDENTITY.
        const provider = asset.provider;
        if (provider && provider.trim() !== '' && provider !== 'unknown') {
          snapshot.deploymentIdentity = {
            deploymentProvider: provider,
            deploymentId: canonicalId,
            environment: asset.environment ?? undefined,
          };
        }
      }
      // packageDigest: no current asset type maps directly to package digest.
      // When a future producer provides package digest identity, it can be
      // frozen here. Currently truthfully NOT_PROVIDED.
    }

    return snapshot;
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
