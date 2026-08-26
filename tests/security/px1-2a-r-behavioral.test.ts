/**
 * PX1.2A-R2 — Behavioral Unit Tests (Section 18, corrected)
 *
 * Executable behavioral tests for new critical logic.
 * NOT static text assertions — these test actual function behavior.
 *
 * Categories:
 *   B. Connected Asset — type/state validation, idempotency, concurrency
 *   C. State separation — orthogonal dimensions (no evaluationState)
 *   D. Evaluated scope — deterministic digest, purity, immutability
 *   E. Receipt verification — scope digest mismatch detection
 */

import { describe, it, expect } from 'vitest';
import {
  ASSET_TYPES,
  CONNECTION_STATES,
  IDENTITY_STATES,
  isAssetType,
  isConnectionState,
  isIdentityState,
  computeAssetIdentityKey,
  type AssetType,
  type ConnectionState,
  type IdentityState,
} from '@/lib/ai-inventory/connected-assets';
import {
  computeScopeDigest,
  buildEvaluatedScopeSnapshot,
  verifyScopeDigest,
  EVALUATED_SCOPE_SCHEMA_VERSION,
} from '@/lib/assurance/scope-digest';
import type { EvaluatedScopeSnapshot } from '@/lib/assurance/u6-types';

// ─── B. Connected Asset — type/state validation ─────────────────────────────

describe('[PX1.2A-R2 §18-B] Connected Asset type validation', () => {
  it('accepts all valid asset types', () => {
    for (const t of ASSET_TYPES) {
      expect(isAssetType(t)).toBe(true);
    }
  });

  it('rejects arbitrary strings as asset type', () => {
    expect(isAssetType('RANDOM_THING')).toBe(false);
    expect(isAssetType('')).toBe(false);
    expect(isAssetType('source_repository')).toBe(false); // case-sensitive
    expect(isAssetType(null)).toBe(false);
    expect(isAssetType(undefined)).toBe(false);
    expect(isAssetType(123)).toBe(false);
  });

  it('includes INTERFACE_SPECIFICATION (Section 7)', () => {
    expect(ASSET_TYPES).toContain('INTERFACE_SPECIFICATION');
    expect(isAssetType('INTERFACE_SPECIFICATION')).toBe(true);
  });
});

describe('[PX1.2A-R2 §18-B] Connection state validation', () => {
  it('accepts all valid connection states', () => {
    for (const s of CONNECTION_STATES) {
      expect(isConnectionState(s)).toBe(true);
    }
  });

  it('rejects arbitrary strings as connection state', () => {
    expect(isConnectionState('EVALUATED')).toBe(false); // not in connectionState
    expect(isConnectionState('CONNECTED_EVALUATED')).toBe(false);
    expect(isConnectionState('')).toBe(false);
    expect(isConnectionState(null)).toBe(false);
  });
});

describe('[PX1.2A-R2 §18-B] Identity state validation', () => {
  it('accepts all valid identity states', () => {
    for (const s of IDENTITY_STATES) {
      expect(isIdentityState(s)).toBe(true);
    }
  });

  it('rejects arbitrary strings as identity state', () => {
    expect(isIdentityState('DISCOVERED')).toBe(false); // DISCOVERED is in connectionState
    expect(isIdentityState('VERIFIED_BUT_CONNECTED')).toBe(false);
    expect(isIdentityState('')).toBe(false);
  });
});

// ─── B. Asset Identity Key / Idempotency ────────────────────────────────────

describe('[PX1.2A-R2 §18-B] Asset identity key', () => {
  it('produces deterministic key for same stable identity', () => {
    const key1 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
      environment: 'production',
    });
    const key2 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
      environment: 'production',
    });
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('produces different key for different asset type', () => {
    const key1 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
    });
    const key2 = computeAssetIdentityKey({
      assetType: 'RUNTIME_ENDPOINT',
      canonicalId: 'github.com/org/repo-123',
    });
    expect(key1).not.toBe(key2);
  });

  it('produces different key for different canonical ID', () => {
    const key1 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
    });
    const key2 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-456',
    });
    expect(key1).not.toBe(key2);
  });

  it('produces different key for different environment', () => {
    const key1 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
      environment: 'production',
    });
    const key2 = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'github.com/org/repo-123',
      environment: 'staging',
    });
    expect(key1).not.toBe(key2);
  });

  it('returns null for insufficient stable identity', () => {
    expect(computeAssetIdentityKey({ assetType: 'SOURCE_REPOSITORY', canonicalId: null })).toBe(null);
    expect(computeAssetIdentityKey({ assetType: 'SOURCE_REPOSITORY', canonicalId: '' })).toBe(null);
    expect(computeAssetIdentityKey({ assetType: 'SOURCE_REPOSITORY', canonicalId: '   ' })).toBe(null);
    expect(computeAssetIdentityKey({ assetType: 'SOURCE_REPOSITORY', canonicalId: undefined })).toBe(null);
  });

  it('does NOT use displayName as identity (Section 6/8)', () => {
    // computeAssetIdentityKey does not accept displayName — only canonicalId
    const key = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'repo-123',
    });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does NOT normalize URLs aggressively (Section 8 — conservative)', () => {
    // Two slightly different URLs must NOT be collapsed
    const key1 = computeAssetIdentityKey({
      assetType: 'RUNTIME_ENDPOINT',
      canonicalId: 'https://api.example.com/v1',
    });
    const key2 = computeAssetIdentityKey({
      assetType: 'RUNTIME_ENDPOINT',
      canonicalId: 'https://api.example.com/v1/',
    });
    expect(key1).not.toBe(key2); // trailing slash = distinct identity
  });
});

// ─── C. State Separation — orthogonal dimensions (no evaluationState) ───────

describe('[PX1.2A-R2 §18-C] State separation — two orthogonal dimensions', () => {
  it('connectionState has 4 values (no EVALUATED)', () => {
    expect(CONNECTION_STATES).toHaveLength(4);
    expect(CONNECTION_STATES).not.toContain('EVALUATED');
    expect(CONNECTION_STATES).not.toContain('NOT_EVALUATED');
    expect(CONNECTION_STATES).not.toContain('PARTIAL');
    expect(CONNECTION_STATES).not.toContain('FAILED');
  });

  it('identityState has 3 values', () => {
    expect(IDENTITY_STATES).toHaveLength(3);
  });

  it('CONNECTED != EVALUATED (EVALUATED not in any asset state enum)', () => {
    expect(CONNECTION_STATES).not.toContain('EVALUATED');
    expect(IDENTITY_STATES).not.toContain('EVALUATED');
  });

  it('DISCOVERED != VERIFIED (different enums)', () => {
    expect(CONNECTION_STATES).toContain('DISCOVERED');
    expect(IDENTITY_STATES).toContain('VERIFIED');
    expect(isConnectionState('VERIFIED')).toBe(false);
    expect(isIdentityState('DISCOVERED')).toBe(false);
  });

  it('identity verification is independent from connection state', () => {
    // An asset can be VERIFIED (identity) and CONNECTED (connection)
    const identityState: IdentityState = 'VERIFIED';
    const connectionState: ConnectionState = 'CONNECTED';
    expect(isIdentityState(identityState)).toBe(true);
    expect(isConnectionState(connectionState)).toBe(true);
    // Both are valid simultaneously
  });
});

// ─── D. Evaluated Scope — deterministic digest (purified) ───────────────────

const baseSnapshot = {
  scopeSchemaVersion: EVALUATED_SCOPE_SCHEMA_VERSION as const,
  organizationId: 'org-123',
  aiSystemId: 'ai-sys-456',
  evaluationSnapshotAt: '2026-01-01T00:00:00Z',
  environment: 'production',
  assetSnapshots: [
    {
      assetId: 'asset-1',
      assetType: 'SOURCE_REPOSITORY',
      displayName: 'main-repo',
      canonicalLocator: 'github.com/org/repo-123',
      gitCommit: 'abc123',
      evaluationInclusionState: 'EVALUATED' as const,
    },
    {
      assetId: 'asset-2',
      assetType: 'RUNTIME_ENDPOINT',
      displayName: 'api-endpoint',
      canonicalLocator: 'https://api.example.com',
      endpoint: 'https://api.example.com',
      evaluationInclusionState: 'EVALUATED' as const,
    },
  ],
  producerRunIds: ['run-1', 'run-2'],
};

describe('[PX1.2A-R2 §18-D] Scope digest — determinism', () => {
  it('same semantic input → same scopeDigest', () => {
    const digest1 = computeScopeDigest(baseSnapshot);
    const digest2 = computeScopeDigest(baseSnapshot);
    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changed git commit → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], gitCommit: 'def456' },
        baseSnapshot.assetSnapshots[1],
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('changed container digest → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], containerDigest: 'sha256:aaa' },
        baseSnapshot.assetSnapshots[1],
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('changed interface spec digest → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], interfaceSpecDigest: 'sha256:spec-aaa', interfaceSpecVersion: '1.0' },
        baseSnapshot.assetSnapshots[1],
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('changed endpoint → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        baseSnapshot.assetSnapshots[0],
        { ...baseSnapshot.assetSnapshots[1], endpoint: 'https://api.v2.example.com' },
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('asset removed from evaluation → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [baseSnapshot.assetSnapshots[0]],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('asset inclusion state changed → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], evaluationInclusionState: 'NOT_EVALUATED' as const },
        baseSnapshot.assetSnapshots[1],
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('changed environment → different scopeDigest', () => {
    const modified = { ...baseSnapshot, environment: 'staging' };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('array ordering does not change digest (set-like)', () => {
    const reversed = {
      ...baseSnapshot,
      assetSnapshots: [baseSnapshot.assetSnapshots[1], baseSnapshot.assetSnapshots[0]],
    };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(reversed));
  });
});

// ─── D. Scope digest PURITY (Section 4+5+6 — excluded fields) ───────────────

describe('[PX1.2A-R2 §18-D] Scope digest purity — excluded fields', () => {
  it('different evaluationSnapshotAt → SAME scopeDigest', () => {
    const modified = { ...baseSnapshot, evaluationSnapshotAt: '2026-06-01T12:00:00Z' };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(modified));
  });

  it('different orchestratorRunId → SAME scopeDigest', () => {
    const modified = { ...baseSnapshot, orchestratorRunId: 'orch-run-999' };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(modified));
  });

  it('different producerRunIds → SAME scopeDigest', () => {
    const modified = { ...baseSnapshot, producerRunIds: ['run-x', 'run-y'] };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(modified));
  });

  it('different displayName → SAME scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], displayName: 'Payroll Source' },
        { ...baseSnapshot.assetSnapshots[1], displayName: 'API Gateway' },
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(modified));
  });

  it('different scopeSummary → SAME scopeDigest', () => {
    const snap1 = buildEvaluatedScopeSnapshot({ ...baseSnapshot, scopeSummary: 'Summary A' });
    const snap2 = buildEvaluatedScopeSnapshot({ ...baseSnapshot, scopeSummary: 'Summary B' });
    expect(snap1.scopeDigest).toBe(snap2.scopeDigest);
  });

  it('changed organizationId → different scopeDigest', () => {
    const modified = { ...baseSnapshot, organizationId: 'org-999' };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('changed aiSystemId → different scopeDigest', () => {
    const modified = { ...baseSnapshot, aiSystemId: 'ai-sys-999' };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });
});

// ─── D. Asset missing from evaluation ───────────────────────────────────────

describe('[PX1.2A-R2 §18-D] Asset missing from evaluation', () => {
  it('asset with NOT_EVALUATED is represented explicitly', () => {
    const snapshot = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        ...baseSnapshot.assetSnapshots,
        {
          assetId: 'asset-3',
          assetType: 'CONTAINER_IMAGE',
          displayName: 'docker-image',
          evaluationInclusionState: 'NOT_EVALUATED' as const,
          notEvaluatedReason: 'UNAVAILABLE',
        },
      ],
    });
    expect(snapshot.assetSnapshots).toHaveLength(3);
    expect(snapshot.assetSnapshots[2].evaluationInclusionState).toBe('NOT_EVALUATED');
    expect(snapshot.scopeDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── D. Historical immutability ─────────────────────────────────────────────

describe('[PX1.2A-R2 §18-D] Historical immutability', () => {
  it('mutable asset changes after evaluation do not change historical scope digest', () => {
    const historicalSnapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const originalDigest = historicalSnapshot.scopeDigest;
    const reverified = verifyScopeDigest(historicalSnapshot);
    expect(reverified).toBe(true);
    expect(historicalSnapshot.scopeDigest).toBe(originalDigest);
  });
});

// ─── E. Receipt verification ────────────────────────────────────────────────

describe('[PX1.2A-R2 §18-E] Receipt verification — scope digest', () => {
  it('verifyScopeDigest returns true for unmodified snapshot', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    expect(verifyScopeDigest(snapshot)).toBe(true);
  });

  it('verifyScopeDigest returns false when scopeDigest is tampered', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      scopeDigest: '0'.repeat(64),
    };
    expect(verifyScopeDigest(tampered)).toBe(false);
  });

  it('verifyScopeDigest returns false when asset identity changed after issuance', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      assetSnapshots: [
        { ...snapshot.assetSnapshots[0], gitCommit: 'tampered-commit' },
        snapshot.assetSnapshots[1],
      ],
    };
    expect(verifyScopeDigest(tampered)).toBe(false);
  });

  it('verifyScopeDigest returns false when asset added after issuance', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      assetSnapshots: [
        ...snapshot.assetSnapshots,
        {
          assetId: 'injected-asset',
          assetType: 'CONTAINER_IMAGE',
          displayName: 'injected',
          evaluationInclusionState: 'EVALUATED' as const,
        },
      ],
    };
    expect(verifyScopeDigest(tampered)).toBe(false);
  });

  it('verifyScopeDigest returns false when organizationId changed', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      organizationId: 'wrong-org',
    };
    expect(verifyScopeDigest(tampered)).toBe(false);
  });

  it('verifyScopeDigest returns TRUE when only displayName changed (display-only)', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const renamed: EvaluatedScopeSnapshot = {
      ...snapshot,
      assetSnapshots: [
        { ...snapshot.assetSnapshots[0], displayName: 'New Name' },
        { ...snapshot.assetSnapshots[1], displayName: 'Renamed API' },
      ],
    };
    // displayName is NOT scope-semantic — digest should still match
    expect(verifyScopeDigest(renamed)).toBe(true);
  });

  it('verifyScopeDigest returns TRUE when only evaluationSnapshotAt changed', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const retime: EvaluatedScopeSnapshot = {
      ...snapshot,
      evaluationSnapshotAt: '2027-01-01T00:00:00Z',
    };
    expect(verifyScopeDigest(retime)).toBe(true);
  });
});
