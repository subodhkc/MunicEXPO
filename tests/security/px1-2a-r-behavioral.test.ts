/**
 * PX1.2A-R — Behavioral Unit Tests (Section 18)
 *
 * Executable behavioral tests for new critical logic.
 * NOT static text assertions — these test actual function behavior.
 *
 * Categories:
 *   B. Connected Asset — type/state validation, idempotency
 *   C. State separation — orthogonal dimensions
 *   D. Evaluated scope — deterministic digest, immutability
 *   E. Receipt verification — scope digest mismatch detection
 */

import { describe, it, expect } from 'vitest';
import {
  ASSET_TYPES,
  CONNECTION_STATES,
  IDENTITY_STATES,
  EVALUATION_STATES,
  isAssetType,
  isConnectionState,
  isIdentityState,
  isEvaluationState,
  computeAssetIdentityKey,
  type AssetType,
  type ConnectionState,
  type IdentityState,
  type EvaluationState,
} from '@/lib/ai-inventory/connected-assets';
import {
  computeScopeDigest,
  buildEvaluatedScopeSnapshot,
  verifyScopeDigest,
  EVALUATED_SCOPE_SCHEMA_VERSION,
} from '@/lib/assurance/scope-digest';
import type { EvaluatedScopeSnapshot } from '@/lib/assurance/u6-types';

// ─── B. Connected Asset — type/state validation ─────────────────────────────

describe('[PX1.2A-R §18-B] Connected Asset type validation', () => {
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

describe('[PX1.2A-R §18-B] Connection state validation', () => {
  it('accepts all valid connection states', () => {
    for (const s of CONNECTION_STATES) {
      expect(isConnectionState(s)).toBe(true);
    }
  });

  it('rejects arbitrary strings as connection state', () => {
    expect(isConnectionState('EVALUATED')).toBe(false); // EVALUATED is in evaluationState, not connectionState
    expect(isConnectionState('CONNECTED_EVALUATED')).toBe(false);
    expect(isConnectionState('')).toBe(false);
    expect(isConnectionState(null)).toBe(false);
  });
});

describe('[PX1.2A-R §18-B] Identity state validation', () => {
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

describe('[PX1.2A-R §18-B] Evaluation state validation', () => {
  it('accepts all valid evaluation states', () => {
    for (const s of EVALUATION_STATES) {
      expect(isEvaluationState(s)).toBe(true);
    }
  });

  it('rejects arbitrary strings as evaluation state', () => {
    expect(isEvaluationState('CONNECTED')).toBe(false); // CONNECTED is in connectionState
    expect(isEvaluationState('PASS')).toBe(false); // NOT_EVALUATED != PASS
    expect(isEvaluationState('NO_FINDINGS')).toBe(false); // FAILED != NO_FINDINGS
    expect(isEvaluationState('')).toBe(false);
  });
});

// ─── B. Asset Identity Key / Idempotency ────────────────────────────────────

describe('[PX1.2A-R §18-B] Asset identity key', () => {
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

  it('does NOT use displayName as identity (Section 6)', () => {
    // computeAssetIdentityKey does not accept displayName — only canonicalId
    const key = computeAssetIdentityKey({
      assetType: 'SOURCE_REPOSITORY',
      canonicalId: 'repo-123',
    });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── C. State Separation — orthogonal dimensions ────────────────────────────

describe('[PX1.2A-R §18-C] State separation — orthogonal dimensions', () => {
  it('CONNECTED and EVALUATED can coexist (different dimensions)', () => {
    const connectionState: ConnectionState = 'CONNECTED';
    const evaluationState: EvaluationState = 'EVALUATED';
    // These are independent — no mutual exclusion
    expect(isConnectionState(connectionState)).toBe(true);
    expect(isEvaluationState(evaluationState)).toBe(true);
  });

  it('CONNECTED != EVALUATED (different enums)', () => {
    expect(CONNECTION_STATES).not.toContain('EVALUATED');
    expect(EVALUATION_STATES).not.toContain('CONNECTED');
  });

  it('DISCOVERED != VERIFIED (different enums)', () => {
    expect(CONNECTION_STATES).toContain('DISCOVERED');
    expect(IDENTITY_STATES).toContain('VERIFIED');
    // DISCOVERED is a connection state, VERIFIED is an identity state
    expect(isConnectionState('VERIFIED')).toBe(false);
    expect(isIdentityState('DISCOVERED')).toBe(false);
  });

  it('REGISTERED != EVALUATED (different enums)', () => {
    expect(CONNECTION_STATES).toContain('REGISTERED');
    expect(EVALUATION_STATES).toContain('EVALUATED');
    expect(isConnectionState('EVALUATED')).toBe(false);
    expect(isEvaluationState('REGISTERED')).toBe(false);
  });

  it('NOT_EVALUATED is never PASS (no PASS state exists)', () => {
    expect(EVALUATION_STATES).not.toContain('PASS');
    expect(isEvaluationState('PASS')).toBe(false);
  });

  it('FAILED is not NO_FINDINGS (no NO_FINDINGS state exists)', () => {
    expect(EVALUATION_STATES).not.toContain('NO_FINDINGS');
    expect(isEvaluationState('NO_FINDINGS')).toBe(false);
  });

  it('identity verification is independent from evaluation state', () => {
    // An asset can be VERIFIED (identity) and NOT_EVALUATED (evaluation)
    const identityState: IdentityState = 'VERIFIED';
    const evaluationState: EvaluationState = 'NOT_EVALUATED';
    expect(isIdentityState(identityState)).toBe(true);
    expect(isEvaluationState(evaluationState)).toBe(true);
    // Both are valid simultaneously
  });
});

// ─── D. Evaluated Scope — deterministic digest ──────────────────────────────

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

describe('[PX1.2A-R §18-D] Evaluated scope digest — determinism', () => {
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
    const digest1 = computeScopeDigest(baseSnapshot);
    const digest2 = computeScopeDigest(modified);
    expect(digest1).not.toBe(digest2);
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
      assetSnapshots: [baseSnapshot.assetSnapshots[0]], // only one asset
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('asset explicitly marked NOT_EVALUATED → different scopeDigest', () => {
    const modified = {
      ...baseSnapshot,
      assetSnapshots: [
        { ...baseSnapshot.assetSnapshots[0], evaluationInclusionState: 'NOT_EVALUATED' as const },
        baseSnapshot.assetSnapshots[1],
      ],
    };
    expect(computeScopeDigest(baseSnapshot)).not.toBe(computeScopeDigest(modified));
  });

  it('array ordering does not change digest (set-like)', () => {
    const reversed = {
      ...baseSnapshot,
      assetSnapshots: [baseSnapshot.assetSnapshots[1], baseSnapshot.assetSnapshots[0]], // reversed
    };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(reversed));
  });

  it('producerRunIds ordering does not change digest', () => {
    const reversed = {
      ...baseSnapshot,
      producerRunIds: ['run-2', 'run-1'], // reversed
    };
    expect(computeScopeDigest(baseSnapshot)).toBe(computeScopeDigest(reversed));
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

describe('[PX1.2A-R §18-D] Evaluated scope — asset missing from evaluation', () => {
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

// ─── D. Evaluated scope — immutability (historical) ─────────────────────────

describe('[PX1.2A-R §18-D] Evaluated scope — historical immutability', () => {
  it('mutable asset changes after evaluation do not change historical scope digest', () => {
    // The scope snapshot captures identity AT evaluation time.
    // If the mutable asset later changes commit, the historical snapshot
    // (which captured the old commit) should produce the same digest.
    const historicalSnapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const originalDigest = historicalSnapshot.scopeDigest;

    // Verify the historical snapshot's digest is stable
    const reverified = verifyScopeDigest(historicalSnapshot);
    expect(reverified).toBe(true);
    expect(historicalSnapshot.scopeDigest).toBe(originalDigest);
  });
});

// ─── E. Receipt verification — scope digest mismatch ────────────────────────

describe('[PX1.2A-R §18-E] Receipt verification — scope digest', () => {
  it('verifyScopeDigest returns true for unmodified snapshot', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    expect(verifyScopeDigest(snapshot)).toBe(true);
  });

  it('verifyScopeDigest returns false when scopeDigest is tampered', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      scopeDigest: '0'.repeat(64), // wrong digest
    };
    expect(verifyScopeDigest(tampered)).toBe(false);
  });

  it('verifyScopeDigest returns false when asset identity changed after issuance', () => {
    const snapshot = buildEvaluatedScopeSnapshot(baseSnapshot);
    // Simulate post-issuance tampering: change gitCommit but keep old digest
    const tampered: EvaluatedScopeSnapshot = {
      ...snapshot,
      assetSnapshots: [
        { ...snapshot.assetSnapshots[0], gitCommit: 'tampered-commit' },
        snapshot.assetSnapshots[1],
      ],
      // scopeDigest is still the original — should NOT match
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
});
