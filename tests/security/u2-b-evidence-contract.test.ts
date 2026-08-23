/**
 * U2-B — Evidence Core Contract Tests
 *
 * Tests for:
 * - EvidenceEnvelope validation (structural, fail-closed, legitimate UNKNOWN/PARTIAL accepted)
 * - Deterministic serialization (same inputs → same output regardless of key order)
 * - Envelope semantic digest (deterministic, excludes operational fields)
 * - Cross-producer independence (adapters work independently)
 */

import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_CONTRACT_VERSION,
  type EvidenceEnvelope,
  type CoverageContract,
  type ArtifactRef,
  type FindingRef,
} from '@/lib/evidence/evidence-contract';
import { validateEnvelope } from '@/lib/evidence/envelope-validation';
import {
  canonicalSerialize,
  computeEnvelopeDigest,
  verifyEnvelopeDigest,
  withDigest,
} from '@/lib/evidence/deterministic-serialization';
import { mapEnvelopeToEvidenceModel } from '@/lib/evidence/evidence-model-mapping';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeValidEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return {
    contractVersion: EVIDENCE_CONTRACT_VERSION,
    producerId: PRODUCER_IDS.SAAS_STATIC,
    producerVersion: '1.0',
    producerRunId: 'run-001',
    organizationId: 'org-001',
    target: { type: 'REPOSITORY', id: 'https://github.com/example/repo', name: 'example/repo' },
    sourceType: 'static_scanner',
    evidenceType: 'vulnerability_scan_reports',
    observedAt: '2026-01-15T10:30:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'COMPLETE', ratio: 1.0 },
    ...overrides,
  };
}

// ─── Envelope Validation Tests ──────────────────────────────────────────────

describe('U2-B: EvidenceEnvelope validation', () => {
  it('accepts a valid envelope', () => {
    const result = validateEnvelope(makeValidEnvelope());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts UNKNOWN coverage (legitimate incomplete evidence)', () => {
    const result = validateEnvelope(makeValidEnvelope({
      coverage: { status: 'UNKNOWN', ratio: null },
      producerOutcome: 'PARTIAL',
    }));
    expect(result.valid).toBe(true);
  });

  it('accepts NOT_ASSESSED coverage', () => {
    const result = validateEnvelope(makeValidEnvelope({
      coverage: { status: 'NOT_ASSESSED', ratio: null },
    }));
    expect(result.valid).toBe(true);
  });

  it('rejects UNKNOWN coverage with non-null ratio (inconsistent)', () => {
    const result = validateEnvelope(makeValidEnvelope({
      coverage: { status: 'UNKNOWN', ratio: 0.5 } as CoverageContract,
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INCONSISTENT_COVERAGE_RATIO')).toBe(true);
  });

  it('rejects missing contractVersion', () => {
    const result = validateEnvelope(makeValidEnvelope({ contractVersion: '' as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_CONTRACT_VERSION')).toBe(true);
  });

  it('rejects unsupported contractVersion', () => {
    const result = validateEnvelope(makeValidEnvelope({ contractVersion: '2.0.0' as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_CONTRACT_VERSION')).toBe(true);
  });

  it('rejects unknown producerId', () => {
    const result = validateEnvelope(makeValidEnvelope({ producerId: 'unknown-producer' as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_PRODUCER_ID')).toBe(true);
  });

  it('rejects missing organizationId', () => {
    const result = validateEnvelope(makeValidEnvelope({ organizationId: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ORGANIZATION_ID')).toBe(true);
  });

  it('rejects missing target', () => {
    const result = validateEnvelope(makeValidEnvelope({ target: undefined as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_TARGET')).toBe(true);
  });

  it('rejects invalid producerOutcome', () => {
    const result = validateEnvelope(makeValidEnvelope({ producerOutcome: 'INVALID' as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_PRODUCER_OUTCOME')).toBe(true);
  });

  it('rejects invalid coverage ratio (>1)', () => {
    const result = validateEnvelope(makeValidEnvelope({
      coverage: { status: 'PARTIAL', ratio: 1.5 } as CoverageContract,
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_COVERAGE_RATIO')).toBe(true);
  });

  it('warns on PARTIAL outcome without limitations', () => {
    const result = validateEnvelope(makeValidEnvelope({
      producerOutcome: 'PARTIAL',
      coverage: { status: 'PARTIAL', ratio: 0.5 },
      limitations: [],
    }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'PARTIAL_WITHOUT_LIMITATIONS')).toBe(true);
  });
});

// ─── Deterministic Serialization Tests ──────────────────────────────────────

describe('U2-B: Deterministic serialization', () => {
  it('produces same output regardless of key insertion order', () => {
    const obj1 = { a: 1, b: 2, c: { z: 26, a: 1 } };
    const obj2 = { c: { a: 1, z: 26 }, b: 2, a: 1 };

    expect(canonicalSerialize(obj1)).toBe(canonicalSerialize(obj2));
  });

  it('REVISED_BY_U2_B1: preserves array order by default (ordered arrays NOT sorted)', () => {
    // REVISED_BY_U2_B1: Array order is preserved by default.
    // Only set-like fields are sorted.
    const obj1 = { items: [{ b: 2 }, { a: 1 }] };
    const obj2 = { items: [{ a: 1 }, { b: 2 }] };

    // Non-set-like array — order preserved, so different
    expect(canonicalSerialize(obj1)).not.toBe(canonicalSerialize(obj2));
  });

  it('REVISED_BY_U2_B1: sorts set-like arrays by semantic key', () => {
    // Set-like fields (findingRefs, artifactRefs, limitations, provenanceRefs)
    // are sorted by semantic key when passed as set-like fields
    const obj1 = {
      findingRefs: [
        { findingId: 'f-003', producerId: 'saas-static' },
        { findingId: 'f-001', producerId: 'saas-static' },
      ],
    };
    const obj2 = {
      findingRefs: [
        { findingId: 'f-001', producerId: 'saas-static' },
        { findingId: 'f-003', producerId: 'saas-static' },
      ],
    };

    // findingRefs is a set-like field — sorted by semantic key
    expect(canonicalSerialize(obj1)).toBe(canonicalSerialize(obj2));
  });

  it('omits undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const serialized = canonicalSerialize(obj);

    expect(serialized).not.toContain('b');
    expect(JSON.parse(serialized)).toEqual({ a: 1, c: 3 });
  });
});

// ─── Envelope Semantic Digest Tests ─────────────────────────────────────────

describe('U2-B: Envelope semantic digest', () => {
  it('produces same digest for semantically identical envelopes', () => {
    const env1 = makeValidEnvelope();
    const env2 = makeValidEnvelope();

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });

  it('produces different digest when producerId changes', () => {
    const env1 = makeValidEnvelope({ producerId: PRODUCER_IDS.SAAS_STATIC });
    const env2 = makeValidEnvelope({ producerId: PRODUCER_IDS.SAAS_RUNTIME });

    expect(computeEnvelopeDigest(env1)).not.toBe(computeEnvelopeDigest(env2));
  });

  it('produces different digest when observedAt changes', () => {
    const env1 = makeValidEnvelope({ observedAt: '2026-01-15T10:30:00.000Z' });
    const env2 = makeValidEnvelope({ observedAt: '2026-01-16T10:30:00.000Z' });

    expect(computeEnvelopeDigest(env1)).not.toBe(computeEnvelopeDigest(env2));
  });

  it('excludes generatedAt from digest (non-deterministic)', () => {
    const env1 = makeValidEnvelope({ generatedAt: '2026-01-15T12:00:00.000Z' });
    const env2 = makeValidEnvelope({ generatedAt: '2026-01-15T14:00:00.000Z' });

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });

  it('excludes envelopeSemanticDigest from digest (circular)', () => {
    const env1 = makeValidEnvelope({ envelopeSemanticDigest: 'hash1' });
    const env2 = makeValidEnvelope({ envelopeSemanticDigest: 'hash2' });

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });

  it('withDigest attaches correct digest', () => {
    const env = makeValidEnvelope();
    const withDigestResult = withDigest(env);

    expect(withDigestResult.envelopeSemanticDigest).toBe(computeEnvelopeDigest(env));
  });

  it('verifyEnvelopeDigest returns true for correct digest', () => {
    const env = withDigest(makeValidEnvelope());

    expect(verifyEnvelopeDigest(env)).toBe(true);
  });

  it('verifyEnvelopeDigest returns false for incorrect digest', () => {
    const env = makeValidEnvelope({ envelopeSemanticDigest: 'wrong-hash' });

    expect(verifyEnvelopeDigest(env)).toBe(false);
  });
});

// ─── Evidence Model Mapping Tests ───────────────────────────────────────────

describe('U2-B: Evidence model mapping', () => {
  it('maps envelope to evidence model fields', () => {
    const env = makeValidEnvelope();
    const mapping = mapEnvelopeToEvidenceModel(env);

    expect(mapping.organizationId).toBe('org-001');
    expect(mapping.sourceType).toBe('static_scanner');
    expect(mapping.evidenceType).toBe('vulnerability_scan_reports');
    expect(mapping.evidenceDate).toBe('2026-01-15T10:30:00.000Z');
    expect(mapping.status).toBe('active');
    expect(mapping.metadata.producerId).toBe(PRODUCER_IDS.SAAS_STATIC);
    expect(mapping.metadata.producerOutcome).toBe('COMPLETE');
  });

  it('stores envelope-level fields in metadata JSON', () => {
    const env = makeValidEnvelope({
      artifactRefs: [{ storeType: 'producer_native', storageClass: 'PRIVATE' }],
    });
    const mapping = mapEnvelopeToEvidenceModel(env);

    expect(mapping.metadata.artifactRefs).toBeDefined();
    expect((mapping.metadata.artifactRefs as any[]).length).toBe(1);
  });
});

// ─── Cross-Producer Independence Tests ──────────────────────────────────────

describe('U2-B: Cross-producer independence', () => {
  it('static envelope does not require runtime fields', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_STATIC,
      sourceType: 'static_scanner',
      evidenceType: 'vulnerability_scan_reports',
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('runtime envelope does not require static fields', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_RUNTIME,
      sourceType: 'runtime_tests',
      evidenceType: 'runtime_test_results',
      target: { type: 'ENDPOINT', id: '/api/login', name: '/api/login' },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('wizard envelope does not require security engine fields', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_WIZARD,
      sourceType: 'wizard',
      evidenceType: 'self_reported_attestation',
      target: { type: 'ASSESSMENT', id: 'assessment-001', name: 'SOC2 Assessment' },
      limitations: [{
        code: 'SELF_REPORTED',
        description: 'Self-reported attestation',
        affectsCoverage: false,
      }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('inventory envelope does not require security engine fields', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_INVENTORY,
      sourceType: 'ai_inventory',
      evidenceType: 'system_configuration',
      target: { type: 'AI_SYSTEM', id: 'sys-001', name: 'ChatBot Pro' },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });
});

// ─── Provenance Reference Tests ─────────────────────────────────────────────

describe('U2-B: Provenance references', () => {
  it('accepts CONTENT_HASH provenance with valid SHA-256', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{ type: 'CONTENT_HASH', hash: 'a'.repeat(64), algorithm: 'sha256' }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('accepts HMAC provenance', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{ type: 'HMAC', signature: 'sig123', algorithm: 'hmac-sha256', keyId: 'key-1' }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('accepts MERKLE_SNAPSHOT provenance with valid SHA-256 root', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{
        type: 'MERKLE_SNAPSHOT',
        snapshotId: 'snap-001',
        merkleRoot: 'a'.repeat(64),
        algorithm: 'sha256',
        rule: 'pair-sort-concat',
        totalLeaves: 100,
      }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('accepts MERKLE_INCLUSION_PROOF provenance with valid SHA-256 hashes', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{
        type: 'MERKLE_INCLUSION_PROOF',
        snapshotId: 'snap-001',
        leaf: 'a'.repeat(64),
        root: 'b'.repeat(64),
        index: 5,
        totalLeaves: 100,
        path: [{ sibling: 'c'.repeat(64) }],
        algorithm: 'sha256',
        rule: 'pair-sort-concat',
      }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('accepts HASH_CHAIN_RECORD provenance (MARPP)', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{
        type: 'HASH_CHAIN_RECORD',
        chainId: 'chain-001',
        recordId: 'rec-001',
        recordHash: 'hash-001',
        chainSystem: 'marpp',
      }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('does NOT require every provenance type', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [{ type: 'CONTENT_HASH', hash: 'a'.repeat(64), algorithm: 'sha256' }],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    // Only one provenance type — that's fine
  });
});
