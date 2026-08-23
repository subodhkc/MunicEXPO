/**
 * U3-A1 — Producer Activation Correctness Closure Tests
 *
 * Tests for:
 * 1. Static identity model (scanId vs id)
 * 2. Static finding FK (ai_security_findings.scanId = ai_security_scans.id)
 * 3. Static real activation (end-to-end)
 * 4. Canonical persistence identity (producer-aware)
 * 5. Atomic idempotency (canonicalKey @unique)
 * 6. Cross-producer collision (same run ID, different producers)
 * 7. Concurrent retry (same canonical envelope)
 * 8. Runtime finding reference completeness (no truncation)
 * 9. Runtime trace identity reference
 * 10. Terminal FAILED/CANCELLED evidence (FAILED != ABSENT)
 * 11. Already-completed retry (recovery without rerun)
 * 12. Activation status priority (CONFLICT > ERROR > CREATED > IDEMPOTENT)
 * 13. Producer independence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    evidence: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    ai_security_scans: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    ai_security_findings: {
      findMany: vi.fn(),
    },
    runtime_tests: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import {
  persistValidatedEvidenceEnvelope,
  persistAdapterEnvelopes,
  computeCanonicalKey,
} from '@/lib/evidence/evidence-persistence-service';
import { RuntimeTestsAdapter } from '@/lib/evidence/adapters/runtime-tests-adapter';
import { StaticScannerAdapter } from '@/lib/evidence/adapters/static-scanner-adapter';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';
import { computeEnvelopeDigest, withDigest } from '@/lib/evidence/deterministic-serialization';
import type { EvidenceEnvelope } from '@/lib/evidence/evidence-contract';
import type { AdapterContext } from '@/lib/evidence/adapters/adapter-contract';

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStaticEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return withDigest({
    contractVersion: '1.0.0',
    producerId: PRODUCER_IDS.SAAS_STATIC,
    producerRunId: 'scan_test001',
    organizationId: 'org-A',
    target: { type: 'REPOSITORY', id: 'https://github.com/acme/repo', name: 'acme/repo' },
    sourceType: 'static_scanner',
    evidenceType: 'vulnerability_scan_reports',
    observedAt: '2026-08-15T10:00:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'UNKNOWN', ratio: null },
    limitations: [{ code: 'STATIC_ANALYSIS_SCOPE', description: 'Static analysis scope', affectsCoverage: true }],
    artifactRefs: [{ storeType: 'producer_native', artifactId: 'uuid-123', storageClass: 'PRIVATE' }],
    findingRefs: [{ findingId: 'finding-1', producerId: PRODUCER_IDS.SAAS_STATIC, producerRunId: 'scan_test001', findingType: 'VULNERABILITY', severity: 'HIGH' }],
    provenanceRefs: [{ type: 'RUN_RECEIPT', runId: 'scan_test001', runType: 'static_scan' }],
    ...overrides,
  });
}

function makeRuntimeEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return withDigest({
    contractVersion: '1.0.0',
    producerId: PRODUCER_IDS.SAAS_RUNTIME,
    producerRunId: 'rt_test001',
    organizationId: 'org-A',
    target: { type: 'ENDPOINT', id: 'https://api.acme.com/chat', name: 'chat endpoint' },
    sourceType: 'runtime_tests',
    evidenceType: 'runtime_test_results',
    observedAt: '2026-08-15T11:00:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'UNKNOWN', ratio: null },
    limitations: [{ code: 'RUNTIME_TEST_SCOPE', description: 'Runtime test scope', affectsCoverage: true }],
    artifactRefs: [{ storeType: 'producer_native', artifactId: 'rt_test001', storageClass: 'PRIVATE' }],
    findingRefs: [],
    provenanceRefs: [{ type: 'RUN_RECEIPT', runId: 'rt_test001', runType: 'runtime_test' }],
    ...overrides,
  });
}

// ─── 1. Static Identity Model ──────────────────────────────────────────────

describe('U3-A1: Static identity model (scanId vs id)', () => {
  it('adapter queries by scanId when context.runId is provided', async () => {
    mockPrisma.ai_security_scans.findMany.mockResolvedValue([]);
    mockPrisma.ai_security_findings.findMany.mockResolvedValue([]);

    const adapter = new StaticScannerAdapter();
    await adapter.adapt({ organizationId: 'org-A', runId: 'scan_prod_456' } as any);

    const callArgs = mockPrisma.ai_security_scans.findMany.mock.calls[0][0];
    // U3-A1: must filter by scanId (producer run identity), NOT id (DB UUID)
    expect(callArgs.where.scanId).toBe('scan_prod_456');
    expect(callArgs.where.id).toBeUndefined();
  });
});

// ─── 2. Static Finding FK ──────────────────────────────────────────────────

describe('U3-A1: Static finding FK uses scan.id (DB UUID)', () => {
  it('findings are loaded via scan.id, NOT scan.scanId', async () => {
    // Simulate: scan.id = "uuid-123", scan.scanId = "scan-prod-456"
    mockPrisma.ai_security_scans.findMany.mockResolvedValue([
      {
        id: 'uuid-123',
        scanId: 'scan-prod-456',
        organizationId: 'org-A',
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        errorMessage: null,
        totalFindings: 1,
        repositoryUrl: 'https://github.com/acme/repo',
        scannerVersion: '1.0',
        scanType: 'repository',
        createdAt: new Date(),
        combinedHash: null,
        outputHash: null,
      },
    ]);
    mockPrisma.ai_security_findings.findMany.mockResolvedValue([
      { id: 'finding-1', scanId: 'uuid-123', severity: 'HIGH', createdAt: new Date() },
    ]);

    const adapter = new StaticScannerAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A', runId: 'scan-prod-456' } as any);

    // U3-A1: findings query must use scan.id (uuid-123), NOT scan.scanId (scan-prod-456)
    const findingsCallArgs = mockPrisma.ai_security_findings.findMany.mock.calls[0][0];
    expect(findingsCallArgs.where.scanId).toBe('uuid-123');
    expect(findingsCallArgs.where.scanId).not.toBe('scan-prod-456');

    // Envelope must use scanId as producerRunId
    expect(result.envelopes[0].producerRunId).toBe('scan-prod-456');
    expect(result.envelopes[0].producerRunId).not.toBe('uuid-123');

    // FindingRef must use scanId as producerRunId
    expect(result.envelopes[0].findingRefs[0].producerRunId).toBe('scan-prod-456');

    // RUN_RECEIPT must use scanId as runId
    const runReceipt = result.envelopes[0].provenanceRefs?.find((p) => p.type === 'RUN_RECEIPT');
    expect(runReceipt?.runId).toBe('scan-prod-456');
  });

  it('regression: finding FK must not use scanId (producer identity)', async () => {
    mockPrisma.ai_security_scans.findMany.mockResolvedValue([
      {
        id: 'uuid-123',
        scanId: 'scan-prod-456',
        organizationId: 'org-A',
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        errorMessage: null,
        totalFindings: 0,
        repositoryUrl: 'https://github.com/acme/repo',
        scannerVersion: '1.0',
        scanType: 'repository',
        createdAt: new Date(),
        combinedHash: null,
        outputHash: null,
      },
    ]);
    mockPrisma.ai_security_findings.findMany.mockResolvedValue([]);

    const adapter = new StaticScannerAdapter();
    await adapter.adapt({ organizationId: 'org-A', runId: 'scan-prod-456' } as any);

    const findingsCallArgs = mockPrisma.ai_security_findings.findMany.mock.calls[0][0];
    // This test MUST fail if the FK is ever changed back to scan.scanId
    expect(findingsCallArgs.where.scanId).toBe('uuid-123');
  });
});

// ─── 3. Canonical Persistence Identity ─────────────────────────────────────

describe('U3-A1: Canonical persistence identity includes producer', () => {
  it('canonical key includes producerId', () => {
    const staticEnv = makeStaticEnvelope({ producerRunId: 'run-001' });
    const runtimeEnv = makeRuntimeEnvelope({ producerRunId: 'run-001' });

    const staticKey = computeCanonicalKey(staticEnv);
    const runtimeKey = computeCanonicalKey(runtimeEnv);

    // Same run ID but different producers → different canonical keys
    expect(staticKey).not.toBe(runtimeKey);
  });

  it('canonical key is deterministic for same identity', () => {
    const env1 = makeStaticEnvelope();
    const env2 = makeStaticEnvelope();

    expect(computeCanonicalKey(env1)).toBe(computeCanonicalKey(env2));
  });

  it('canonical key changes when producerRunId changes', () => {
    const env1 = makeStaticEnvelope({ producerRunId: 'run-001' });
    const env2 = makeStaticEnvelope({ producerRunId: 'run-002' });

    expect(computeCanonicalKey(env1)).not.toBe(computeCanonicalKey(env2));
  });
});

// ─── 4. Atomic Idempotency ─────────────────────────────────────────────────

describe('U3-A1: Atomic idempotency via canonicalKey', () => {
  it('creates evidence when no existing canonicalKey', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeStaticEnvelope();
    const result = await persistValidatedEvidenceEnvelope(envelope);

    expect(result.success).toBe(true);
    expect(result.status).toBe('CREATED');
    // Verify canonicalKey was passed to create
    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.canonicalKey).toBeDefined();
    expect(createArgs.data.canonicalKey).not.toBe('');
  });

  it('returns IDEMPOTENT_NOOP when unique constraint violation + same digest', async () => {
    const envelope = makeStaticEnvelope();
    const digest = computeEnvelopeDigest(envelope);

    // Simulate unique constraint violation
    const uniqueError: any = new Error('Unique constraint failed');
    uniqueError.code = 'P2002';
    uniqueError.meta = { target: ['canonicalKey'] };
    mockPrisma.evidence.create.mockRejectedValue(uniqueError);

    // Simulate existing row with same digest
    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-existing',
      contentHash: digest,
      metadata: { envelopeSemanticDigest: digest },
    });

    const result = await persistValidatedEvidenceEnvelope(envelope);

    expect(result.success).toBe(true);
    expect(result.status).toBe('IDEMPOTENT_NOOP');
    expect(result.evidenceId).toBe('ev-existing');
  });

  it('returns CONFLICT when unique constraint violation + different digest', async () => {
    const envelope = makeStaticEnvelope();

    const uniqueError: any = new Error('Unique constraint failed');
    uniqueError.code = 'P2002';
    uniqueError.meta = { target: ['canonicalKey'] };
    mockPrisma.evidence.create.mockRejectedValue(uniqueError);

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-existing',
      contentHash: 'different-digest',
      metadata: { envelopeSemanticDigest: 'different-digest' },
    });

    const result = await persistValidatedEvidenceEnvelope(envelope);

    expect(result.success).toBe(false);
    expect(result.status).toBe('CONFLICT');
    expect(result.message).toContain('EVIDENCE_CANONICAL_IDENTITY_CONFLICT');
  });
});

// ─── 5. Cross-Producer Collision ───────────────────────────────────────────

describe('U3-A1: Cross-producer same run ID collision', () => {
  it('Static and Runtime with same run-001 do not conflict', async () => {
    const staticEnv = makeStaticEnvelope({ producerRunId: 'run-001' });
    const runtimeEnv = makeRuntimeEnvelope({ producerRunId: 'run-001' });

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-static' })
      .mockResolvedValueOnce({ id: 'ev-runtime' });

    const result = await persistAdapterEnvelopes([staticEnv, runtimeEnv]);

    expect(result.created).toBe(2);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toBe(0);

    // Verify different canonicalKeys were used
    const create1 = mockPrisma.evidence.create.mock.calls[0][0];
    const create2 = mockPrisma.evidence.create.mock.calls[1][0];
    expect(create1.data.canonicalKey).not.toBe(create2.data.canonicalKey);
  });
});

// ─── 6. Concurrent Retry ───────────────────────────────────────────────────

describe('U3-A1: Concurrent retry produces one canonical row', () => {
  it('second concurrent attempt gets IDEMPOTENT_NOOP', async () => {
    const envelope = makeStaticEnvelope();
    const digest = computeEnvelopeDigest(envelope);

    // First attempt succeeds
    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      // Second attempt hits unique constraint
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique constraint');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-001',
      contentHash: digest,
      metadata: { envelopeSemanticDigest: digest },
    });

    const result1 = await persistValidatedEvidenceEnvelope(envelope);
    const result2 = await persistValidatedEvidenceEnvelope(envelope);

    expect(result1.status).toBe('CREATED');
    expect(result2.status).toBe('IDEMPOTENT_NOOP');
    expect(result2.evidenceId).toBe('ev-001');
  });
});

// ─── 7. Runtime Finding Reference Completeness ─────────────────────────────

describe('U3-A1: Runtime finding references not truncated', () => {
  it('loads ALL findings without take limit', async () => {
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_001', userId: 'u', organizationId: 'org-A',
        state: 'COMPLETED', status: 'completed', endpoints: [{ url: 'https://api.acme.com' }],
        attacksGenerated: 10, attacksExecuted: 10, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: 1.0, startedAt: new Date(), completedAt: new Date(), durationMs: 1000,
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: Array.from({ length: 3 }, (_, i) => ({
          id: `f-${i}`, attackId: `a-${i}`, endpoint: 'https://api.acme.com',
          severity: 'HIGH', attackCategory: 'prompt_injection', executionTraceId: `t-${i}`,
        })),
        runtime_execution_traces: Array.from({ length: 3 }, (_, i) => ({
          id: `t-${i}`, attackId: `a-${i}`, executedAt: new Date(),
          requestHash: null, responseHash: null, executionMode: 'safe', transportAdapter: 'http',
        })),
      },
    ]);

    const adapter = new RuntimeTestsAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    // Verify no take limit on runtime_findings select
    const callArgs = mockPrisma.runtime_tests.findMany.mock.calls[0][0];
    expect(callArgs.select.runtime_findings.take).toBeUndefined();

    // All 3 findings should be referenced
    expect(result.envelopes[0].findingRefs).toHaveLength(3);
  });
});

// ─── 8. Runtime Trace Identity ─────────────────────────────────────────────

describe('U3-A1: Runtime trace identity referenced', () => {
  it('trace IDs appear in artifactRefs', async () => {
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_001', userId: 'u', organizationId: 'org-A',
        state: 'COMPLETED', status: 'completed', endpoints: [{ url: 'https://api.acme.com' }],
        attacksGenerated: 10, attacksExecuted: 10, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: 1.0, startedAt: new Date(), completedAt: new Date(), durationMs: 1000,
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: [],
        runtime_execution_traces: [
          { id: 'trace-123', attackId: 'a-0', executedAt: new Date(), requestHash: 'h1', responseHash: 'h2', executionMode: 'safe', transportAdapter: 'http' },
        ],
      },
    ]);

    const adapter = new RuntimeTestsAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const artifactRefs = result.envelopes[0].artifactRefs;
    // First artifactRef is the test record, subsequent ones are traces
    const traceArtifacts = artifactRefs.filter((a) => a.artifactId === 'trace-123');
    expect(traceArtifacts).toHaveLength(1);
    // Trace content hashes should be referenced, not request/response bodies
    expect(traceArtifacts[0].contentHash).toBeDefined();
  });

  it('trace request/response bodies are NOT copied to evidence', async () => {
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_001', userId: 'u', organizationId: 'org-A',
        state: 'COMPLETED', status: 'completed', endpoints: [],
        attacksGenerated: 0, attacksExecuted: 0, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: null, startedAt: new Date(), completedAt: new Date(), durationMs: 1000,
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: [],
        runtime_execution_traces: [
          { id: 'trace-123', attackId: 'a-0', executedAt: new Date(), requestHash: null, responseHash: null, executionMode: 'safe', transportAdapter: 'http' },
        ],
      },
    ]);

    const adapter = new RuntimeTestsAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    // Envelope metadata should NOT contain request/response bodies
    const envelope = result.envelopes[0];
    const envelopeJson = JSON.stringify(envelope);
    expect(envelopeJson).not.toContain('requestJson');
    expect(envelopeJson).not.toContain('responseJson');
    expect(envelopeJson).not.toContain('requestBody');
    expect(envelopeJson).not.toContain('responseBody');
  });
});

// ─── 9. Terminal FAILED/CANCELLED Evidence ─────────────────────────────────

describe('U3-A1: Terminal FAILED/CANCELLED evidence (FAILED != ABSENT)', () => {
  it('Runtime FAILED test produces envelope with FAILED outcome', async () => {
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_failed', userId: 'u', organizationId: 'org-A',
        state: 'FAILED', status: 'failed', endpoints: [{ url: 'https://api.acme.com' }],
        attacksGenerated: 10, attacksExecuted: 3, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: null, startedAt: new Date(), completedAt: new Date(), durationMs: 5000,
        errorMessage: 'Connection refused', createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: [],
        runtime_execution_traces: [],
      },
    ]);

    const adapter = new RuntimeTestsAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].producerOutcome).toBe('FAILED');

    // Should have RUNTIME_TEST_FAILED limitation
    const hasFailedLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'RUNTIME_TEST_FAILED'
    );
    expect(hasFailedLimitation).toBe(true);
  });

  it('Runtime CANCELLED test produces envelope with CANCELLED outcome', async () => {
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_cancelled', userId: 'u', organizationId: 'org-A',
        state: 'CANCELLED', status: 'cancelled', endpoints: [],
        attacksGenerated: 0, attacksExecuted: 0, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: null, startedAt: new Date(), completedAt: null, durationMs: null,
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: [],
        runtime_execution_traces: [],
      },
    ]);

    const adapter = new RuntimeTestsAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].producerOutcome).toBe('CANCELLED');
  });

  it('Static FAILED scan produces envelope with FAILED outcome', async () => {
    mockPrisma.ai_security_scans.findMany.mockResolvedValue([
      {
        id: 'uuid-fail', scanId: 'scan_failed', organizationId: 'org-A',
        status: 'FAILED', progress: 50, completedAt: null,
        errorMessage: 'Scanner unavailable', totalFindings: 0,
        repositoryUrl: 'https://github.com/acme/repo', scannerVersion: '1.0',
        scanType: 'repository', createdAt: new Date(),
        combinedHash: null, outputHash: null,
      },
    ]);
    mockPrisma.ai_security_findings.findMany.mockResolvedValue([]);

    const adapter = new StaticScannerAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A', runId: 'scan_failed' } as any);

    expect(result.envelopes[0].producerOutcome).toBe('FAILED');
  });
});

// ─── 10. Activation Status Priority ────────────────────────────────────────

describe('U3-A1: Batch status priority (CONFLICT > ERROR > CREATED > IDEMPOTENT)', () => {
  it('CONFLICT takes priority over CREATED', async () => {
    const env1 = makeStaticEnvelope({ producerRunId: 'run-001' });
    const env2 = makeStaticEnvelope({ producerRunId: 'run-002' });

    // env1 succeeds, env2 conflicts
    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-existing',
      contentHash: 'different',
      metadata: { envelopeSemanticDigest: 'different' },
    });

    const result = await persistAdapterEnvelopes([env1, env2]);

    expect(result.created).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(result.aggregateStatus).toBe('CONFLICT');
  });

  it('ERROR takes priority over CREATED', async () => {
    const env1 = makeStaticEnvelope({ producerRunId: 'run-001' });
    const env2 = makeStaticEnvelope({ producerRunId: 'run-002', organizationId: '' as any });

    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const result = await persistAdapterEnvelopes([env1, env2]);

    expect(result.created).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.aggregateStatus).toBe('ERROR');
  });

  it('CREATED takes priority over IDEMPOTENT', async () => {
    const env1 = makeStaticEnvelope({ producerRunId: 'run-001' });
    const env2 = makeStaticEnvelope({ producerRunId: 'run-002' });

    // env1 created, env2 idempotent
    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    const digest2 = computeEnvelopeDigest(env2);
    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-002',
      contentHash: digest2,
      metadata: { envelopeSemanticDigest: digest2 },
    });

    const result = await persistAdapterEnvelopes([env1, env2]);

    expect(result.created).toBe(1);
    expect(result.idempotent).toBe(1);
    expect(result.aggregateStatus).toBe('CREATED');
  });
});

// ─── 11. Producer Independence ──────────────────────────────────────────────

describe('U3-A1: Producer independence', () => {
  it('Static activation does not require Runtime', async () => {
    mockPrisma.ai_security_scans.findFirst.mockResolvedValue({
      id: 'uuid-1', organizationId: 'org-A', status: 'COMPLETED',
    });
    mockPrisma.ai_security_scans.findMany.mockResolvedValue([
      {
        id: 'uuid-1', scanId: 'scan_001', organizationId: 'org-A',
        status: 'COMPLETED', progress: 100, completedAt: new Date(),
        errorMessage: null, totalFindings: 0,
        repositoryUrl: 'https://github.com/acme/repo', scannerVersion: '1.0',
        scanType: 'repository', createdAt: new Date(),
        combinedHash: null, outputHash: null,
      },
    ]);
    mockPrisma.ai_security_findings.findMany.mockResolvedValue([]);
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const { activateStaticScanEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateStaticScanEvidence('scan_001', 'org-A');

    expect(result.producerExecutionStatus).toBe('COMPLETE');
    expect(result.evidenceAdaptationStatus).toBe('OK');
    // Runtime was not queried at all
    expect(mockPrisma.runtime_tests.findFirst).not.toHaveBeenCalled();
  });

  it('Runtime activation does not require Static', async () => {
    mockPrisma.runtime_tests.findFirst.mockResolvedValue({
      id: 'rt-1', testId: 'rt_001', organizationId: 'org-A', state: 'COMPLETED',
    });
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_001', userId: 'u', organizationId: 'org-A',
        state: 'COMPLETED', status: 'completed', endpoints: [],
        attacksGenerated: 10, attacksExecuted: 10, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: 1.0, startedAt: new Date(), completedAt: new Date(), durationMs: 1000,
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
        runtime_findings: [], runtime_execution_traces: [],
      },
    ]);
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const { activateRuntimeTestEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateRuntimeTestEvidence('rt_001', 'org-A');

    expect(result.producerExecutionStatus).toBe('COMPLETE');
    expect(result.evidenceAdaptationStatus).toBe('OK');
    // Static was not queried at all
    expect(mockPrisma.ai_security_scans.findFirst).not.toHaveBeenCalled();
  });
});

// ─── 12. Recovery (Already-Completed Retry) ────────────────────────────────

describe('U3-A1: Recovery — already-completed retry without rerun', () => {
  it('Runtime activation can be retried for already-completed test', async () => {
    mockPrisma.runtime_tests.findFirst.mockResolvedValue({
      id: 'rt-1', testId: 'rt_001', organizationId: 'org-A', state: 'COMPLETED',
    });
    mockPrisma.runtime_tests.findMany.mockResolvedValue([
      {
        id: 'rt-1', testId: 'rt_001', userId: 'u', organizationId: 'org-A',
        state: 'COMPLETED', status: 'completed', endpoints: [],
        attacksGenerated: 10, attacksExecuted: 10, violationsFound: 0, successfulAttacks: 0,
        averageSafetyScore: 1.0, startedAt: new Date(), completedAt: new Date(), durationMs: 1000,
        errorMessage: null, createdAt: new Date('2026-08-15T10:00:00Z'), updatedAt: new Date(),
        runtime_findings: [], runtime_execution_traces: [],
      },
    ]);

    // Capture the envelope from the first create call to compute the real digest
    let capturedDigest: string | undefined;
    let capturedMetadata: any;

    // First call: creates evidence — capture the data
    mockPrisma.evidence.create
      .mockImplementationOnce(async (args: any) => {
        capturedDigest = args.data.contentHash;
        capturedMetadata = args.data.metadata;
        return { id: 'ev-001' };
      })
      // Second call: unique constraint violation (idempotent path)
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    // findFirst returns the captured digest from the first call
    mockPrisma.evidence.findFirst.mockImplementation(async () => ({
      id: 'ev-001',
      contentHash: capturedDigest,
      metadata: capturedMetadata,
    }));

    const { activateRuntimeTestEvidence } = await import('@/lib/evidence/producer-activation-hooks');

    // First activation
    const result1 = await activateRuntimeTestEvidence('rt_001', 'org-A');
    expect(result1.evidencePersistenceStatus).toBe('CREATED');

    // Second activation (retry) — should be IDEMPOTENT, not error
    const result2 = await activateRuntimeTestEvidence('rt_001', 'org-A');
    expect(result2.evidencePersistenceStatus).toBe('IDEMPOTENT');

    // Runtime test was NOT rerun — only read operations
    expect(mockPrisma.runtime_tests.findMany).toHaveBeenCalledTimes(2); // adapter read
    // No runtime attacks were created
  });
});

// ─── 13. contentHash Semantics ─────────────────────────────────────────────

describe('U3-A1: contentHash = ENVELOPE_SEMANTIC_DIGEST for producer evidence', () => {
  it('persists semantic digest as contentHash', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeStaticEnvelope();
    const digest = computeEnvelopeDigest(envelope);
    await persistValidatedEvidenceEnvelope(envelope);

    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.contentHash).toBe(digest);
  });

  it('also stores envelopeSemanticDigest in metadata', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeStaticEnvelope();
    const digest = computeEnvelopeDigest(envelope);
    await persistValidatedEvidenceEnvelope(envelope);

    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.metadata.envelopeSemanticDigest).toBe(digest);
  });
});
