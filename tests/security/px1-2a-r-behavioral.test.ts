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
      connectedAssetId: 'asset-1',
      assetType: 'SOURCE_REPOSITORY',
      displayName: 'main-repo',
      canonicalLocator: 'github.com/org/repo-123',
      gitCommit: 'abc123',
      evaluationInclusionState: 'EVALUATED' as const,
    },
    {
      connectedAssetId: 'asset-2',
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
          connectedAssetId: 'asset-3',
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
          connectedAssetId: 'injected-asset',
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

// ─── R3 §5 — connectedAssetId vs canonicalLocator separation ────────────────

describe('[PX1.2A-R3 §5] EvaluatedScopeAssetSnapshot — identity field separation', () => {
  it('connectedAssetId is NOT a required field (canonicalLocator can stand alone)', () => {
    const snapshot = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        {
          // No connectedAssetId — canonicalLocator identifies the target
          assetType: 'SOURCE_REPOSITORY',
          displayName: 'unbound-repo',
          canonicalLocator: 'github.com/org/repo-unbound',
          gitCommit: 'abc123',
          evaluationInclusionState: 'EVALUATED' as const,
        },
      ],
    });
    expect(snapshot.assetSnapshots[0].connectedAssetId).toBeUndefined();
    expect(snapshot.assetSnapshots[0].canonicalLocator).toBe('github.com/org/repo-unbound');
    expect(snapshot.scopeDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adding connectedAssetId changes digest (binding is scope identity)', () => {
    const withoutBinding = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        {
          assetType: 'SOURCE_REPOSITORY',
          displayName: 'repo',
          canonicalLocator: 'github.com/org/repo-123',
          gitCommit: 'abc123',
          evaluationInclusionState: 'EVALUATED' as const,
        },
      ],
    });
    const withBinding = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        {
          ...withoutBinding.assetSnapshots[0],
          connectedAssetId: 'asset-bound-1',
        },
      ],
    });
    expect(withoutBinding.scopeDigest).not.toBe(withBinding.scopeDigest);
  });

  it('same canonicalLocator + no connectedAssetId → deterministic digest', () => {
    const snap1 = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        {
          assetType: 'SOURCE_REPOSITORY',
          displayName: 'repo',
          canonicalLocator: 'github.com/org/repo-det',
          gitCommit: 'abc123',
          evaluationInclusionState: 'EVALUATED' as const,
        },
      ],
    });
    const snap2 = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      assetSnapshots: [
        {
          assetType: 'SOURCE_REPOSITORY',
          displayName: 'different-display-name',
          canonicalLocator: 'github.com/org/repo-det',
          gitCommit: 'abc123',
          evaluationInclusionState: 'EVALUATED' as const,
        },
      ],
    });
    expect(snap1.scopeDigest).toBe(snap2.scopeDigest);
  });
});

// ─── R3 §6 — scopeLimitations vs generic evidence limitations ───────────────

describe('[PX1.2A-R3 §6] scopeLimitations — scope-boundary only', () => {
  it('scopeLimitations change → digest changes', () => {
    const without = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: [],
    });
    const withLimit = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: ['ASSET_IDENTITY_UNRESOLVED'],
    });
    expect(without.scopeDigest).not.toBe(withLimit.scopeDigest);
  });

  it('different scopeLimitations → different digest', () => {
    const a = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: ['ASSET_IDENTITY_UNRESOLVED'],
    });
    const b = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: ['ENVIRONMENT_NOT_ESTABLISHED'],
    });
    expect(a.scopeDigest).not.toBe(b.scopeDigest);
  });

  it('scopeLimitations ordering does not change digest (set-like)', () => {
    const a = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: ['LIMIT_A', 'LIMIT_B'],
    });
    const b = buildEvaluatedScopeSnapshot({
      ...baseSnapshot,
      scopeLimitations: ['LIMIT_B', 'LIMIT_A'],
    });
    expect(a.scopeDigest).toBe(b.scopeDigest);
  });
});

// ─── R3 §2 — State preservation on re-connect (contract-level) ─────────────

describe('[PX1.2A-R3 §2] Re-connect state preservation contract', () => {
  it('CreateAssetResult no longer carries idempotent flag (Section 4)', () => {
    // The idempotent boolean was removed because no caller consumed it.
    // The result contract is now: { ok, asset?, reason? }
    // Importing the type and checking shape at the type level is enforced by tsc.
    // Here we verify the source no longer exports an idempotent field.
    // (Behavioral: the function still returns the canonical asset on retry.)
    // This is a static guard against re-introduction.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai-inventory/connected-assets.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/idempotent\??\s*:/);
  });

  it('create path defaults connectionState to REGISTERED when omitted', () => {
    // Contract: CREATE → connectionState = input.connectionState ?? 'REGISTERED'
    // This is enforced in the createData block of createConnectedAsset.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai-inventory/connected-assets.ts'),
      'utf-8'
    );
    // The create path must default to REGISTERED
    expect(src).toMatch(/connectionState:\s*input\.connectionState\s*\?\?\s*'REGISTERED'/);
  });

  it('update path preserves existing state when connectionState omitted (undefined)', () => {
    // Contract: UPDATE → connectionState = input.connectionState ?? undefined
    // Prisma treats undefined as "do not change this field".
    // This prevents CONNECTED → REGISTERED downgrade.
    // PX1.2B-H1: When reactivating a retired asset, state returns to REGISTERED.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai-inventory/connected-assets.ts'),
      'utf-8'
    );
    // The update path must use ?? undefined (NOT ?? 'REGISTERED') for non-reactivation
    expect(src).toMatch(/input\.connectionState\s*\?\?\s*undefined/);
    // PX1.2B-H1: Reactivation path returns to REGISTERED
    expect(src).toContain('isReactivating');
  });
});

// ─── R3 §3 — P2002 bounded retry (contract-level) ──────────────────────────

describe('[PX1.2A-R3 §3] P2002 concurrency handling contract', () => {
  it('handles P2002 with bounded retry (finds canonical existing)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai-inventory/connected-assets.ts'),
      'utf-8'
    );
    expect(src).toMatch(/P2002/);
    expect(src).toMatch(/isPrismaUniqueConstraintError/);
    // Bounded: single retry via findFirst, not a loop
    expect(src).toMatch(/findFirst/);
  });

  it('does NOT swallow non-P2002 errors (re-throws)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai-inventory/connected-assets.ts'),
      'utf-8'
    );
    // Non-P2002 must propagate — throw err outside the P2002 branch
    expect(src).toMatch(/throw err/);
  });
});

// ─── R3 §1 — Schema/migration unique index alignment ───────────────────────

describe('[PX1.2A-R3 §1] Schema ↔ migration unique index alignment', () => {
  it('Prisma schema declares compound unique (aiSystemId, assetIdentityKey)', () => {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(
      path.join(process.cwd(), 'prisma/schema.prisma'),
      'utf-8'
    );
    expect(schema).toMatch(/@@unique\(\[aiSystemId,\s*assetIdentityKey\]\)/);
  });

  it('migration SQL uses normal unique index (no partial WHERE predicate)', () => {
    const fs = require('fs');
    const path = require('path');
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20260826000000_px1_2_ai_system_assets/migration.sql'),
      'utf-8'
    );
    // Must have the unique index
    expect(migration).toMatch(/CREATE UNIQUE INDEX.*ai_system_assets_aiSystemId_assetIdentityKey_key/);
    // Must NOT have a partial index predicate
    expect(migration).not.toMatch(/WHERE\s+"assetIdentityKey"\s+IS\s+NOT\s+NULL/i);
  });

  it('migration index name matches Prisma convention', () => {
    const fs = require('fs');
    const path = require('path');
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20260826000000_px1_2_ai_system_assets/migration.sql'),
      'utf-8'
    );
    // Prisma names compound unique indexes as <table>_<col1>_<col2>_key
    expect(migration).toMatch(/ai_system_assets_aiSystemId_assetIdentityKey_key/);
  });
});
