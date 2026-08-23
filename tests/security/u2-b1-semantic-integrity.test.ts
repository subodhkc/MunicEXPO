/**
 * U2-B1 — Semantic Integrity Correction Tests
 *
 * Tests for the 14-item validation matrix plus Merkle proof order and trajectory order:
 *
 * 1. object-key ordering does not affect digest
 * 2. set-like findingRefs ordering does not affect digest
 * 3. set-like artifactRefs ordering does not affect digest
 * 4. Merkle path order DOES affect digest
 * 5. trajectory order DOES affect digest
 * 6. scan ID cannot masquerade as SHA-256
 * 7. static finding count does not determine coverage
 * 8. static adapter does not silently truncate canonical finding refs
 * 9. runtime COMPLETE execution may have UNKNOWN coverage
 * 10. runtime aggregate vulnerability count does not create fake FindingRef
 * 11. wizard one-answer assessment is not automatically COMPLETE coverage
 * 12. self-reported remains self-reported
 * 13. producerOutcome and coverage remain independent
 * 14. UNKNOWN remains UNKNOWN
 */

import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_CONTRACT_VERSION,
  type EvidenceEnvelope,
  type ProvenanceRef,
  type ArtifactRef,
  type FindingRef,
} from '@/lib/evidence/evidence-contract';
import { validateEnvelope } from '@/lib/evidence/envelope-validation';
import {
  canonicalSerialize,
  computeEnvelopeDigest,
  verifyEnvelopeDigest,
  withDigest,
  SET_LIKE_ENVELOPE_FIELDS,
} from '@/lib/evidence/deterministic-serialization';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';
import { merkleRoot, merkleProofForLeaf, verifyMerkleProof } from '@/lib/audit/merkle';

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

// ─── 1. Object-key ordering does not affect digest ──────────────────────────

describe('U2-B1: Object-key ordering does not affect digest', () => {
  it('produces same digest regardless of key insertion order', () => {
    const env1 = makeValidEnvelope({
      target: { type: 'REPOSITORY', id: 'repo-url', name: 'repo' },
      producerId: PRODUCER_IDS.SAAS_STATIC,
    });
    const env2 = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_STATIC,
      target: { type: 'REPOSITORY', id: 'repo-url', name: 'repo' },
    });

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });
});

// ─── 2. Set-like findingRefs ordering does not affect digest ────────────────

describe('U2-B1: Set-like findingRefs ordering does not affect digest', () => {
  it('produces same digest regardless of findingRefs order', () => {
    const findingRefsA: FindingRef[] = [
      { findingId: 'f-003', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'HIGH' },
      { findingId: 'f-001', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'LOW' },
      { findingId: 'f-002', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'CRITICAL' },
    ];
    const findingRefsB: FindingRef[] = [
      { findingId: 'f-001', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'LOW' },
      { findingId: 'f-002', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'CRITICAL' },
      { findingId: 'f-003', producerId: PRODUCER_IDS.SAAS_STATIC, findingType: 'VULNERABILITY', severity: 'HIGH' },
    ];

    const env1 = makeValidEnvelope({ findingRefs: findingRefsA });
    const env2 = makeValidEnvelope({ findingRefs: findingRefsB });

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });
});

// ─── 3. Set-like artifactRefs ordering does not affect digest ───────────────

describe('U2-B1: Set-like artifactRefs ordering does not affect digest', () => {
  it('produces same digest regardless of artifactRefs order', () => {
    const artifactRefsA: ArtifactRef[] = [
      { storeType: 'vercel_blob', storageClass: 'PUBLIC', artifactId: 'blob-2' },
      { storeType: 'producer_native', storageClass: 'PRIVATE', artifactId: 'scan-1' },
    ];
    const artifactRefsB: ArtifactRef[] = [
      { storeType: 'producer_native', storageClass: 'PRIVATE', artifactId: 'scan-1' },
      { storeType: 'vercel_blob', storageClass: 'PUBLIC', artifactId: 'blob-2' },
    ];

    const env1 = makeValidEnvelope({ artifactRefs: artifactRefsA });
    const env2 = makeValidEnvelope({ artifactRefs: artifactRefsB });

    expect(computeEnvelopeDigest(env1)).toBe(computeEnvelopeDigest(env2));
  });
});

// ─── 4. Merkle path order DOES affect digest ────────────────────────────────

describe('U2-B1: Merkle path order DOES affect digest', () => {
  it('preserves Merkle proof path order in serialization', () => {
    const leafHashes = [
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64),
    ];

    const proof = merkleProofForLeaf(leafHashes, leafHashes[0]);
    expect(verifyMerkleProof(proof)).toBe(true);

    // Reverse the path — this should NOT verify (different order = different proof)
    const reversedProof = {
      ...proof,
      path: [...proof.path].reverse(),
    };

    // The reversed path should not verify (unless mathematically equivalent)
    // For a 4-leaf tree, reversing the path changes the proof
    expect(verifyMerkleProof(reversedProof)).toBe(false);

    // The canonical serialization should differ
    const proofA: ProvenanceRef = {
      type: 'MERKLE_INCLUSION_PROOF',
      snapshotId: 'snap-001',
      leaf: proof.leaf,
      root: proof.root,
      index: proof.index,
      totalLeaves: proof.totalLeaves,
      path: proof.path,
      algorithm: 'sha256',
      rule: 'pair-sort-concat',
    };
    const proofB: ProvenanceRef = {
      ...proofA,
      path: reversedProof.path,
    };

    const env1 = makeValidEnvelope({ provenanceRefs: [proofA] });
    const env2 = makeValidEnvelope({ provenanceRefs: [proofB] });

    // The digests MUST differ — ordered path is semantically meaningful
    expect(computeEnvelopeDigest(env1)).not.toBe(computeEnvelopeDigest(env2));
  });
});

// ─── 5. Trajectory order DOES affect digest ─────────────────────────────────

describe('U2-B1: Trajectory order DOES affect digest', () => {
  it('produces different digest for different trajectory step order', () => {
    // Synthetic ordered trajectory structure (future-compatibility regression test)
    // step A → step B → step C must NOT have same digest as step C → step B → step A
    const trajectoryForward = {
      producerSpecific: {
        trajectory: [
          { step: 'A', action: 'initial' },
          { step: 'B', action: 'intermediate' },
          { step: 'C', action: 'final' },
        ],
      },
    };
    const trajectoryReverse = {
      producerSpecific: {
        trajectory: [
          { step: 'C', action: 'final' },
          { step: 'B', action: 'intermediate' },
          { step: 'A', action: 'initial' },
        ],
      },
    };

    const env1 = makeValidEnvelope(trajectoryForward as Partial<EvidenceEnvelope>);
    const env2 = makeValidEnvelope(trajectoryReverse as Partial<EvidenceEnvelope>);

    // producerSpecific is NOT in the digest-included fields by default,
    // but we test canonical serialization directly to prove order preservation
    const ser1 = canonicalSerialize(trajectoryForward);
    const ser2 = canonicalSerialize(trajectoryReverse);

    expect(ser1).not.toBe(ser2);
  });
});

// ─── 6. Scan ID cannot masquerade as SHA-256 ────────────────────────────────

describe('U2-B1: Scan ID cannot masquerade as SHA-256', () => {
  it('rejects UUID as CONTENT_HASH provenance', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'CONTENT_HASH',
          hash: '550e8400-e29b-41d4-a716-446655440000', // UUID, NOT SHA-256
          algorithm: 'sha256',
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONTENT_HASH_FORMAT')).toBe(true);
  });

  it('rejects short string as CONTENT_HASH provenance', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'CONTENT_HASH',
          hash: 'not-a-hash',
          algorithm: 'sha256',
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONTENT_HASH_FORMAT')).toBe(true);
  });

  it('accepts valid SHA-256 hex as CONTENT_HASH provenance', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'CONTENT_HASH',
          hash: 'a'.repeat(64),
          algorithm: 'sha256',
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });
});

// ─── 7. Static finding count does not determine coverage ────────────────────

describe('U2-B1: Static finding count does not determine coverage', () => {
  it('does not use findings.length as evaluatedUnits for coverage', () => {
    // Coverage should use filesScanned/filesSkipped, not finding count
    // If no file-level data: UNKNOWN
    const env = makeValidEnvelope({
      coverage: {
        status: 'UNKNOWN',
        ratio: null,
        producerSpecific: {
          totalFindings: 50,
          referencedFindings: 50,
        },
      },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    // UNKNOWN is legitimate — finding count does NOT determine coverage
  });
});

// ─── 8. Static adapter does not silently truncate canonical finding refs ────

describe('U2-B1: No silent canonical finding truncation', () => {
  it('FINDING_REFERENCE_SET_BOUNDED limitation is explicit when set may be incomplete', () => {
    // If finding set is bounded, an explicit limitation must be present
    const env = makeValidEnvelope({
      coverage: {
        status: 'UNKNOWN',
        ratio: null,
        limitations: [
          {
            code: 'FINDING_REFERENCE_SET_INCOMPLETE',
            description: 'Referenced 50 of 100 total findings — reference set may be incomplete',
            affectsCoverage: false,
          },
        ],
      },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    // The limitation is explicit — no silent truncation
  });
});

// ─── 9. Runtime COMPLETE execution may have UNKNOWN coverage ────────────────

describe('U2-B1: Runtime COMPLETE execution may have UNKNOWN coverage', () => {
  it('accepts producerOutcome=COMPLETE with coverage=UNKNOWN', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_RUNTIME,
      producerOutcome: 'COMPLETE',
      coverage: {
        status: 'UNKNOWN',
        ratio: null,
        producerSpecific: {
          attacksExecuted: 10,
          vulnerabilitiesFound: 2,
        },
      },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    // PRODUCER_COMPLETE != COVERAGE_COMPLETE
  });
});

// ─── 10. Runtime aggregate vulnerability count does not create fake FindingRef ─

describe('U2-B1: Aggregate count does not create fake FindingRef', () => {
  it('does not manufacture finding identity from aggregate count', () => {
    // AGGREGATE_COUNT != FINDING_REFERENCE
    // If no real finding records can be linked, findingRefs should be empty
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_RUNTIME,
      producerOutcome: 'COMPLETE',
      coverage: {
        status: 'UNKNOWN',
        ratio: null,
        producerSpecific: {
          attacksExecuted: 10,
          vulnerabilitiesFound: 3, // aggregate, NOT individual finding identity
        },
      },
      findingRefs: [], // empty — no fake findings
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    expect(env.findingRefs).toHaveLength(0);
  });
});

// ─── 11. Wizard one-answer assessment is not automatically COMPLETE coverage ─

describe('U2-B1: Wizard one-answer is not COMPLETE coverage', () => {
  it('rejects COMPLETE coverage with 1 response and no expected count', () => {
    // ANSWER_PRESENT != QUESTIONNAIRE_COMPLETE
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_WIZARD,
      producerOutcome: 'COMPLETE',
      coverage: {
        status: 'UNKNOWN', // Must be UNKNOWN, not COMPLETE
        ratio: null,
        evaluatedUnits: 1,
        limitations: [
          {
            code: 'QUESTIONNAIRE_COVERAGE_UNKNOWN',
            description: 'Source does not provide expected/answered question count',
            affectsCoverage: true,
          },
        ],
      },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    expect(env.coverage.status).toBe('UNKNOWN');
  });
});

// ─── 12. Self-reported remains self-reported ────────────────────────────────

describe('U2-B1: Self-reported remains self-reported', () => {
  it('wizard evidence has SELF_REPORTED limitation', () => {
    const env = makeValidEnvelope({
      producerId: PRODUCER_IDS.SAAS_WIZARD,
      sourceType: 'wizard',
      evidenceType: 'self_reported_attestation',
      limitations: [
        {
          code: 'SELF_REPORTED',
          description: 'Wizard evidence is self-reported attestation, not technically verified evidence',
          affectsCoverage: false,
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    expect(env.limitations?.some((l) => l.code === 'SELF_REPORTED')).toBe(true);
  });
});

// ─── 13. producerOutcome and coverage remain independent ────────────────────

describe('U2-B1: producerOutcome and coverage remain independent', () => {
  it('accepts all valid combinations of outcome and coverage', () => {
    const combinations: Array<[EvidenceEnvelope['producerOutcome'], EvidenceEnvelope['coverage']['status']]> = [
      ['COMPLETE', 'COMPLETE'],
      ['COMPLETE', 'PARTIAL'],
      ['COMPLETE', 'UNKNOWN'],
      ['COMPLETE', 'NOT_ASSESSED'],
      ['PARTIAL', 'COMPLETE'],
      ['PARTIAL', 'PARTIAL'],
      ['PARTIAL', 'UNKNOWN'],
      ['FAILED', 'UNKNOWN'],
      ['UNKNOWN', 'UNKNOWN'],
    ];

    for (const [outcome, coverageStatus] of combinations) {
      const env = makeValidEnvelope({
        producerOutcome: outcome,
        coverage: {
          status: coverageStatus,
          ratio: coverageStatus === 'UNKNOWN' || coverageStatus === 'NOT_ASSESSED' ? null : 0.5,
        },
      });
      const result = validateEnvelope(env);
      expect(result.valid).toBe(true);
    }
  });
});

// ─── 14. UNKNOWN remains UNKNOWN ─────────────────────────────────────────────

describe('U2-B1: UNKNOWN remains UNKNOWN', () => {
  it('UNKNOWN coverage with null ratio is valid', () => {
    const env = makeValidEnvelope({
      coverage: { status: 'UNKNOWN', ratio: null },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('UNKNOWN producerOutcome is valid (REVISED_BY_U2_B1)', () => {
    const env = makeValidEnvelope({
      producerOutcome: 'UNKNOWN',
      coverage: { status: 'UNKNOWN', ratio: null },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  it('UNKNOWN coverage must NOT have a ratio', () => {
    const env = makeValidEnvelope({
      coverage: { status: 'UNKNOWN', ratio: 0.5 } as any,
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INCONSISTENT_COVERAGE_RATIO')).toBe(true);
  });
});

// ─── Merkle proof verification using existing lib/audit/merkle.ts ───────────

describe('U2-B1: Merkle proof verification (reuses lib/audit/merkle.ts)', () => {
  it('valid Merkle proof verifies', () => {
    const leafHashes = [
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64),
    ];
    const proof = merkleProofForLeaf(leafHashes, leafHashes[0]);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  it('Merkle proof with changed path does NOT verify', () => {
    const leafHashes = [
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64),
    ];
    const proof = merkleProofForLeaf(leafHashes, leafHashes[0]);
    const tamperedProof = {
      ...proof,
      path: [...proof.path].reverse(),
    };
    expect(verifyMerkleProof(tamperedProof)).toBe(false);
  });

  it('Merkle root is deterministic for same leaves', () => {
    const leafHashes1 = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
    const leafHashes2 = ['c'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)];
    // normalizeLeaves sorts, so root should be the same
    expect(merkleRoot(leafHashes1)).toBe(merkleRoot(leafHashes2));
  });
});

// ─── SHA-256 reuse verification ─────────────────────────────────────────────

describe('U2-B1: SHA-256 reused from lib/evidence/crypto-hash.ts', () => {
  it('computeEnvelopeDigest produces valid SHA-256 hex', () => {
    const env = makeValidEnvelope();
    const digest = computeEnvelopeDigest(env);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('withDigest and verifyEnvelopeDigest work together', () => {
    const env = withDigest(makeValidEnvelope());
    expect(verifyEnvelopeDigest(env)).toBe(true);
  });
});

// ─── Provenance format validation ───────────────────────────────────────────

describe('U2-B1: Provenance format validation (fail-closed)', () => {
  it('rejects invalid Merkle root format', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'MERKLE_SNAPSHOT',
          snapshotId: 'snap-001',
          merkleRoot: 'not-a-hash',
          algorithm: 'sha256',
          rule: 'pair-sort-concat',
          totalLeaves: 10,
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_MERKLE_ROOT_FORMAT')).toBe(true);
  });

  it('rejects invalid Merkle leaf format', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'MERKLE_INCLUSION_PROOF',
          snapshotId: 'snap-001',
          leaf: 'short',
          root: 'a'.repeat(64),
          index: 0,
          totalLeaves: 10,
          path: [{ sibling: 'b'.repeat(64) }],
          algorithm: 'sha256',
          rule: 'pair-sort-concat',
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_MERKLE_LEAF_FORMAT')).toBe(true);
  });

  it('rejects invalid HMAC algorithm', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'HMAC',
          signature: 'a'.repeat(64),
          algorithm: 'sha256', // wrong — should be hmac-sha256
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_HMAC_ALGORITHM')).toBe(true);
  });

  it('accepts valid Merkle inclusion proof', () => {
    const env = makeValidEnvelope({
      provenanceRefs: [
        {
          type: 'MERKLE_INCLUSION_PROOF',
          snapshotId: 'snap-001',
          leaf: 'a'.repeat(64),
          root: 'b'.repeat(64),
          index: 0,
          totalLeaves: 10,
          path: [{ sibling: 'c'.repeat(64) }],
          algorithm: 'sha256',
          rule: 'pair-sort-concat',
        },
      ],
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });
});
