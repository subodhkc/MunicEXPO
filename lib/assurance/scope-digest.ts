/**
 * PX1.2 — Evaluated Scope Digest (Sections 9-14, purified in PX1.2A-R2)
 *
 * Deterministic scope digest using EXISTING canonical serialization and
 * crypto/hash infrastructure. Does NOT invent another cryptographic
 * implementation.
 *
 * SCOPE DIGEST = semantic identity of evaluated boundary
 * EVIDENCE SET DIGEST = semantic identity of Evidence membership (distinct)
 * EVALUATION IDENTITY = which evaluation/run produced the result (distinct)
 *
 * scopeDigest = WHAT WAS IN SCOPE
 * evidenceSetDigest = WHICH EVIDENCE SUPPORTED THE EVALUATION
 *
 * Do not collapse scopeDigest and evidenceSetDigest.
 *
 * ─── Included in scopeDigest (scope-semantic) ───────────────────────────
 *
 *   aiSystemId              — which AI System was evaluated
 *   environment             — environment is part of scope boundary
 *   assetSnapshots[].scope-semantic fields:
 *     connectedAssetId      — canonical Connected Asset ID (ai_system_assets.id only)
 *     assetType             — what kind of asset
 *     canonicalLocator      — stable/canonical external locator identity
 *     identityStateAtEvaluation — identity state at evaluation time
 *     environment           — per-asset environment if part of scope
 *     provider              — asset provider (github, gitlab, etc.) — schema 1.1+
 *     canonicalIdentity     — actual canonical identity value — schema 1.2+
 *     gitCommit             — exact source identity
 *     containerDigest       — exact container identity
 *     packageDigest         — exact build identity
 *     deploymentIdentity    — exact deployment identity — schema 1.2+
 *     interfaceSpecDigest   — exact interface spec identity
 *     interfaceSpecVersion  — interface spec version
 *     endpoint              — exact endpoint identity
 *     evaluationInclusionState — was this asset included in scope?
 *     notEvaluatedReason    — why not (scope-relevant)
 *
 *   unresolvedIdentity      — scope identity dimensions unresolved
 *   scopeLimitations        — limitations defining the evaluated boundary ONLY
 *                             (SCOPE_LIMITATION != GENERIC_EVIDENCE_LIMITATION)
 *
 * ─── Excluded from scopeDigest (operational/evaluation identity) ────────
 *
 *   evaluationSnapshotAt    — wall-clock timestamp (evaluation identity)
 *   orchestratorRunId       — which run (evaluation identity)
 *   producerRunIds          — which producers ran (evidence identity)
 *   displayName             — display-only, not scope identity
 *   scopeSummary            — display-only, not scope identity
 *   scopeDigest             — would be circular
 *
 * Changing displayName or scopeSummary must NOT change scopeDigest.
 * Changing evaluationSnapshotAt, orchestratorRunId, or producerRunIds
 * must NOT change scopeDigest.
 * Changing gitCommit, containerDigest, endpoint, interfaceSpecDigest,
 * asset inclusion, or environment MUST change scopeDigest.
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
 * Build a deliberate scope-semantic projection from an asset snapshot.
 *
 * Only scope-semantic fields are included. Display-only fields (displayName)
 * and evaluation-identity fields (producerRunIds) are excluded.
 */
function projectAssetScopeSemantic(
  asset: EvaluatedScopeAssetSnapshot,
  schemaVersion?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    connectedAssetId: asset.connectedAssetId ?? '',
    assetType: asset.assetType ?? '',
    canonicalLocator: asset.canonicalLocator ?? '',
    identityStateAtEvaluation: asset.identityStateAtEvaluation ?? '',
    environment: asset.environment ?? '',
    gitCommit: asset.gitCommit ?? '',
    containerDigest: asset.containerDigest ?? '',
    packageDigest: asset.packageDigest ?? '',
    interfaceSpecDigest: asset.interfaceSpecDigest ?? '',
    interfaceSpecVersion: asset.interfaceSpecVersion ?? '',
    endpoint: asset.endpoint ?? '',
    evaluationInclusionState: asset.evaluationInclusionState ?? '',
    notEvaluatedReason: asset.notEvaluatedReason ?? '',
  };
  // Schema 1.1+: provider is scope-semantic (identifies which provider's
  // repository was evaluated). Included in digest for tamper detection.
  // Schema 1.0: provider not frozen — excluded for backward compatibility.
  if (schemaVersion && schemaVersion >= '1.1') {
    base.provider = asset.provider ?? '';
  }
  // Schema 1.2+: canonicalIdentity and deploymentIdentity are scope-semantic.
  // Included in digest for tamper detection of build/deployment identity.
  // Schema 1.1/1.0: not frozen — excluded for backward compatibility.
  if (schemaVersion && schemaVersion >= '1.2') {
    base.canonicalIdentity = asset.canonicalIdentity ?? '';
    base.deploymentIdentity = asset.deploymentIdentity ?? '';
  }
  return base;
}

/**
 * Compute a deterministic scope digest from scope-semantic fields ONLY.
 *
 * Excludes: evaluationSnapshotAt, orchestratorRunId, producerRunIds,
 * displayName, scopeSummary, scopeDigest (circular).
 *
 * Includes: aiSystemId, environment, assetSnapshots (scope-semantic
 * projection only), unresolvedIdentity, limitations.
 */
export function computeScopeDigest(
  snapshot: Omit<EvaluatedScopeSnapshot, 'scopeDigest' | 'scopeSummary'>
): string {
  // Deliberate scope-semantic projection — NOT hashing every property
  const scopeSemantic: Record<string, unknown> = {
    scopeSchemaVersion: snapshot.scopeSchemaVersion ?? EVALUATED_SCOPE_SCHEMA_VERSION,
    organizationId: snapshot.organizationId,
    aiSystemId: snapshot.aiSystemId,
    environment: snapshot.environment ?? '',
    // Project only scope-semantic fields from each asset snapshot
    // Pass schemaVersion for version-aware projection (provider included in 1.1+)
    assetSnapshots: (snapshot.assetSnapshots ?? []).map(a => projectAssetScopeSemantic(a, snapshot.scopeSchemaVersion)),
    unresolvedIdentity: (snapshot.unresolvedIdentity ?? []).slice().sort(),
    scopeLimitations: (snapshot.scopeLimitations ?? []).slice().sort(),
  };

  // NOTE: evaluationSnapshotAt, orchestratorRunId, producerRunIds are
  // deliberately EXCLUDED — they are evaluation/evidence identity, not
  // scope identity.
  const canonical = canonicalSerialize(scopeSemantic, SET_LIKE_SCOPE_FIELDS);
  return hashTextContent(canonical);
}

/**
 * Build a complete EvaluatedScopeSnapshot with computed scopeDigest.
 *
 * evaluationSnapshotAt and orchestratorRunId are stored on the snapshot
 * for historical record but do NOT affect scopeDigest.
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
 * Returns true ONLY when recomputing the digest from the snapshot's
 * scope-semantic content produces the same scopeDigest.
 */
export function verifyScopeDigest(snapshot: EvaluatedScopeSnapshot): boolean {
  const recomputed = computeScopeDigest(snapshot);
  return recomputed === snapshot.scopeDigest;
}

export type { EvaluatedScopeSnapshot, EvaluatedScopeAssetSnapshot };
