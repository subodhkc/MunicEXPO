/**
 * U3-B — AI Inventory + Wizard + Regulatory Producer Activation Tests
 *
 * Tests for:
 * 1. Inventory adapter: tenant-scoped, coverage UNKNOWN, snapshot lifecycle, no security inference
 * 2. Wizard adapter: SELF_REPORTED, encrypted path, decryption failure, all assessment types
 * 3. Regulatory adapter: tenant-scoped via join, DERIVED evidence, jurisdiction/version, outcome mapping
 * 4. Activation hooks: all three producers, retry/recovery, producer independence
 * 5. Cross-tenant isolation
 * 6. Producer registry corrections
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    evidence: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    ai_systems: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    compliance_assessments: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    audit_orchestrator_runs: {
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

vi.mock('@/lib/encryption/crypto', () => ({
  decryptJSON: vi.fn((ciphertext: string) => {
    if (ciphertext === 'ENCRYPTED_VALID') {
      return [{ questionId: 'q1', answer: 'yes' }, { questionId: 'q2', answer: 'no' }];
    }
    throw new Error('Decryption failed');
  }),
}));

import { prisma } from '@/lib/prisma';
import { InventoryAdapter } from '@/lib/evidence/adapters/inventory-adapter';
import { WizardAdapter } from '@/lib/evidence/adapters/wizard-adapter';
import { RegulatoryAdapter } from '@/lib/evidence/adapters/regulatory-adapter';
import { PRODUCER_IDS, PRODUCER_REGISTRY } from '@/lib/engine-registry/producer-registry';
import { persistAdapterEnvelopes } from '@/lib/evidence/evidence-persistence-service';
import { computeEnvelopeDigest, withDigest } from '@/lib/evidence/deterministic-serialization';
import type { EvidenceEnvelope } from '@/lib/evidence/evidence-contract';

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInventoryEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return withDigest({
    contractVersion: '1.0.0',
    producerId: PRODUCER_IDS.SAAS_INVENTORY,
    producerRunId: 'sys-001:snapshot:2026-08-15T10:00:00.000Z',
    organizationId: 'org-A',
    aiSystemId: 'sys-001',
    target: { type: 'AI_SYSTEM' as const, id: 'sys-001', name: 'ChatBot' },
    sourceType: 'ai_inventory',
    evidenceType: 'system_configuration',
    observedAt: '2026-08-15T10:00:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'UNKNOWN', ratio: null, producerSpecific: { provider: 'openai' } },
    limitations: [{ code: 'INVENTORY_NOT_VERIFICATION', description: 'Inventory is not verification', affectsCoverage: false }],
    artifactRefs: [{ storeType: 'producer_native', artifactId: 'sys-001', storageClass: 'PRIVATE' }],
    provenanceRefs: [{ type: 'RUN_RECEIPT', runId: 'sys-001:snapshot:2026-08-15T10:00:00.000Z', runType: 'inventory_observation' }],
    ...overrides,
  });
}

function makeWizardEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return withDigest({
    contractVersion: '1.0.0',
    producerId: PRODUCER_IDS.SAAS_WIZARD,
    producerRunId: 'assessment-001',
    organizationId: 'org-A',
    target: { type: 'ASSESSMENT' as const, id: 'assessment-001', name: 'SOC2 Assessment' },
    sourceType: 'wizard',
    evidenceType: 'self_reported_attestation',
    observedAt: '2026-08-15T10:00:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'UNKNOWN', ratio: null, producerSpecific: { assessmentType: 'SOC2' } },
    limitations: [{ code: 'SELF_REPORTED', description: 'Self-reported', affectsCoverage: false }],
    findingRefs: [{ findingId: 'q1', producerId: PRODUCER_IDS.SAAS_WIZARD, producerRunId: 'assessment-001', findingType: 'ATTESTATION' as const }],
    artifactRefs: [{ storeType: 'producer_native', artifactId: 'assessment-001', storageClass: 'PRIVATE' }],
    provenanceRefs: [{ type: 'RUN_RECEIPT', runId: 'assessment-001', runType: 'wizard_assessment' }],
    ...overrides,
  });
}

function makeRegulatoryEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return withDigest({
    contractVersion: '1.0.0',
    producerId: PRODUCER_IDS.SAAS_REGULATORY,
    producerVersion: '1.0.0',
    producerRunId: 'run-001:nyc_ll144:1.0.0',
    organizationId: 'org-A',
    target: { type: 'ASSESSMENT' as const, id: 'run-001', name: 'Regulatory evaluation: nyc_ll144' },
    sourceType: 'regulatory',
    evidenceType: 'regulatory_applicability_result',
    observedAt: '2026-08-15T10:00:00.000Z',
    producerOutcome: 'COMPLETE',
    coverage: { status: 'UNKNOWN', ratio: null, producerSpecific: { jurisdiction: 'nyc_ll144', rulePackVersion: '1.0.0' } },
    limitations: [{ code: 'REGULATORY_NOT_SECURITY', description: 'Regulatory is not security', affectsCoverage: false }],
    artifactRefs: [{ storeType: 'producer_native', artifactId: 'er-001', storageClass: 'PRIVATE' }],
    provenanceRefs: [{ type: 'RUN_RECEIPT', runId: 'run-001:nyc_ll144:1.0.0', runType: 'regulatory_engine' }],
    ...overrides,
  });
}

// ─── 1. Inventory Adapter ──────────────────────────────────────────────────

describe('U3-B: Inventory adapter', () => {
  it('queries ai_systems with organizationId filter', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([]);

    const adapter = new InventoryAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.ai_systems.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
  });

  it('returns NO_DATA when no systems for org', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('NO_DATA');
    expect(result.envelopes).toHaveLength(0);
  });

  it('produces envelope with UNKNOWN coverage (inventory presence != coverage)', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      {
        id: 'sys-001', organizationId: 'org-A', name: 'ChatBot',
        systemType: 'chatbot', provider: 'openai', model: 'gpt-4',
        version: '1.0', useCase: 'customer support', environment: 'production',
        isProduction: true, isCustomerFacing: true, hasMonitoring: false,
        discoveryMethod: 'manual', discoveredAt: new Date(),
        createdAt: new Date('2026-08-15T10:00:00Z'),
        updatedAt: new Date('2026-08-15T10:00:00Z'),
      },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].coverage.status).toBe('UNKNOWN');
    expect(result.envelopes[0].coverage.ratio).toBeNull();
  });

  it('producerRunId includes snapshot timestamp (ENTITY-STATE-BASED)', async () => {
    const updatedAt = new Date('2026-08-15T10:00:00Z');
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      {
        id: 'sys-001', organizationId: 'org-A', name: 'ChatBot',
        updatedAt, createdAt: new Date(),
      },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].producerRunId).toContain('sys-001:snapshot:');
    expect(result.envelopes[0].producerRunId).toContain('2026-08-15T10:00:00');
  });

  it('includes INVENTORY_NOT_VERIFICATION limitation', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      { id: 'sys-001', organizationId: 'org-A', name: 'ChatBot', updatedAt: new Date(), createdAt: new Date() },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'INVENTORY_NOT_VERIFICATION'
    );
    expect(hasLimitation).toBe(true);
  });

  it('includes INVENTORY_PRESENCE_NOT_CONTROL_EFFECTIVENESS limitation', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      { id: 'sys-001', organizationId: 'org-A', name: 'ChatBot', updatedAt: new Date(), createdAt: new Date() },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'INVENTORY_PRESENCE_NOT_CONTROL_EFFECTIVENESS'
    );
    expect(hasLimitation).toBe(true);
  });

  it('includes artifactRefs to producer-native record', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      { id: 'sys-001', organizationId: 'org-A', name: 'ChatBot', updatedAt: new Date(), createdAt: new Date() },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].artifactRefs).toBeDefined();
    expect(result.envelopes[0].artifactRefs).toHaveLength(1);
    expect(result.envelopes[0].artifactRefs![0].artifactId).toBe('sys-001');
  });

  it('different updatedAt produces different producerRunId (snapshot lifecycle)', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      {
        id: 'sys-001', organizationId: 'org-A', name: 'ChatBot',
        updatedAt: new Date('2026-08-15T10:00:00Z'), createdAt: new Date(),
      },
    ]);

    const adapter = new InventoryAdapter();
    const result1 = await adapter.adapt({ organizationId: 'org-A' } as any);

    mockPrisma.ai_systems.findMany.mockResolvedValue([
      {
        id: 'sys-001', organizationId: 'org-A', name: 'ChatBot',
        updatedAt: new Date('2026-08-16T12:00:00Z'), createdAt: new Date(),
      },
    ]);

    const result2 = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result1.envelopes[0].producerRunId).not.toBe(result2.envelopes[0].producerRunId);
  });
});

// ─── 2. Wizard Adapter ─────────────────────────────────────────────────────

describe('U3-B: Wizard adapter', () => {
  it('queries compliance_assessments with organizationId filter (not SOC2-only)', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([]);

    const adapter = new WizardAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.compliance_assessments.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
    // U3-B: No longer restricted to SOC2
    expect(callArgs.where.assessmentType).toBeUndefined();
  });

  it('produces SELF_REPORTED envelope with UNKNOWN coverage', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 85, level: 'A',
        createdAt: new Date('2026-08-15T10:00:00Z'), completedAt: new Date('2026-08-15T10:00:00Z'),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    expect(result.envelopes[0].evidenceType).toBe('self_reported_attestation');
    expect(result.envelopes[0].coverage.status).toBe('UNKNOWN');
    expect(result.envelopes[0].producerOutcome).toBe('COMPLETE');
  });

  it('includes SELF_REPORTED limitation', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'GDPR', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 90, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasSelfReported = result.envelopes[0].limitations?.some(
      (l) => l.code === 'SELF_REPORTED'
    );
    expect(hasSelfReported).toBe(true);
  });

  it('includes QUESTIONNAIRE_COMPLETION_NOT_CONTROL_VERIFICATION limitation', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 100, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'QUESTIONNAIRE_COMPLETION_NOT_CONTROL_VERIFICATION'
    );
    expect(hasLimitation).toBe(true);
  });

  it('decryption failure produces adapter ERROR (not producer FAILED) — U3-B2 correction', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-002', organizationId: 'org-A', assessmentId: 'asmt-002',
        assessmentType: 'SOC2', responsesEncrypted: 'CORRUPTED_DATA',
        assessmentStatus: 'completed', score: 0, level: 'F',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    // U3-B2: ADAPTER ERROR, not PRODUCER FAILED
    // The assessment itself did not fail — the adapter cannot decrypt.
    // No canonical self_reported_attestation is persisted for the adapter failure.
    expect(result.status).toBe('ERROR');
    expect(result.envelopes).toHaveLength(0);
    expect(result.message).toContain('WIZARD_EVIDENCE_DECRYPTION_FAILED');
  });

  it('handles all assessment types (not just SOC2)', async () => {
    for (const type of ['SOC2', 'GDPR', 'HIPAA', 'ISO27001', 'ISO42001', 'NIST_CSF']) {
      mockPrisma.compliance_assessments.findMany.mockResolvedValue([
        {
          id: `assess-${type}`, organizationId: 'org-A', assessmentId: `asmt-${type}`,
          assessmentType: type, responsesEncrypted: 'ENCRYPTED_VALID',
          assessmentStatus: 'completed', score: 80, level: 'B',
          createdAt: new Date(), completedAt: new Date(),
        },
      ]);

      const adapter = new WizardAdapter();
      const result = await adapter.adapt({ organizationId: 'org-A' } as any);

      expect(result.status).toBe('OK');
      expect(result.envelopes[0].producerOutcome).toBe('COMPLETE');
    }
  });

  it('findingRefs use ATTESTATION type (not VULNERABILITY)', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 85, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].findingRefs).toBeDefined();
    expect(result.envelopes[0].findingRefs!.length).toBeGreaterThan(0);
    expect(result.envelopes[0].findingRefs![0].findingType).toBe('ATTESTATION');
  });

  it('includes artifactRefs to producer-native assessment record', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 85, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].artifactRefs).toBeDefined();
    expect(result.envelopes[0].artifactRefs![0].artifactId).toBe('assessment-001');
  });
});

// ─── 3. Regulatory Adapter ─────────────────────────────────────────────────

describe('U3-B: Regulatory adapter', () => {
  it('queries audit_orchestrator_runs with organizationId filter (tenant join)', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([]);

    const adapter = new RegulatoryAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.audit_orchestrator_runs.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
  });

  it('returns NO_DATA when no runs for org', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('NO_DATA');
  });

  it('produces envelope with UNKNOWN coverage (applicability != coverage)', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: { jurisdictionPolicyVersion: '1.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'completed', summaryJson: { evidenceStatus: 'EVIDENCE_PARTIAL' },
            completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    expect(result.envelopes[0].coverage.status).toBe('UNKNOWN');
    expect(result.envelopes[0].coverage.ratio).toBeNull();
  });

  it('producerRunId includes jurisdiction and rulePackVersion', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: { jurisdictionPolicyVersion: '1.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'completed', summaryJson: {},
            completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].producerRunId).toContain('nyc_ll144');
    expect(result.envelopes[0].producerRunId).toContain('1.0.0');
  });

  it('includes APPLICABILITY_NOT_COMPLIANCE limitation', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'eu_ai_act',
        runConfigSnapshot: { jurisdictionPolicyVersion: '0.1.0' },
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'completed', summaryJson: {},
            completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'APPLICABILITY_NOT_COMPLIANCE'
    );
    expect(hasLimitation).toBe(true);
  });

  it('includes DERIVED_EVIDENCE limitation', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'colorado_ai',
        runConfigSnapshot: { jurisdictionPolicyVersion: '1.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'completed', summaryJson: {},
            completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    const hasLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'DERIVED_EVIDENCE'
    );
    expect(hasLimitation).toBe(true);
  });

  it('maps engine status to producer outcome (completed → COMPLETE)', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: {},
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'completed', summaryJson: {},
            completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].producerOutcome).toBe('COMPLETE');
  });

  it('maps engine status to producer outcome (failed → FAILED)', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: {},
        createdAt: new Date(),
        audit_engine_results: [
          {
            id: 'er-001', runId: 'run-001', engineId: 'regulatory',
            status: 'failed', errorMessage: 'Rule evaluation error',
            summaryJson: {}, completedAt: new Date(), createdAt: new Date(),
          },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].producerOutcome).toBe('FAILED');
    const hasFailedLimitation = result.envelopes[0].limitations?.some(
      (l) => l.code === 'REGULATORY_EVALUATION_FAILED'
    );
    expect(hasFailedLimitation).toBe(true);
  });

  it('different rule pack versions produce different producerRunIds', async () => {
    // Version 1.0.0
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: { jurisdictionPolicyVersion: '1.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          { id: 'er-001', runId: 'run-001', engineId: 'regulatory', status: 'completed', summaryJson: {}, createdAt: new Date() },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result1 = await adapter.adapt({ organizationId: 'org-A' } as any);

    // Version 2.0.0
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: { jurisdictionPolicyVersion: '2.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          { id: 'er-001', runId: 'run-001', engineId: 'regulatory', status: 'completed', summaryJson: {}, createdAt: new Date() },
        ],
      },
    ]);

    const result2 = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result1.envelopes[0].producerRunId).not.toBe(result2.envelopes[0].producerRunId);
  });

  it('evidence type is regulatory_applicability_result (not compliance_result)', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: {},
        createdAt: new Date(),
        audit_engine_results: [
          { id: 'er-001', runId: 'run-001', engineId: 'regulatory', status: 'completed', summaryJson: {}, createdAt: new Date() },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.envelopes[0].evidenceType).toBe('regulatory_applicability_result');
  });
});

// ─── 4. Activation Hooks ───────────────────────────────────────────────────

describe('U3-B: Activation hooks', () => {
  it('inventory activation: null orgId system is quarantined', async () => {
    mockPrisma.ai_systems.findFirst.mockResolvedValue(null);

    const { activateInventoryEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateInventoryEvidence('sys-001', 'org-A');

    expect(result.evidencePersistenceStatus).toBe('SKIPPED');
    expect(result.evidenceAdaptationStatus).toBe('NO_DATA');
  });

  it('wizard activation: null orgId assessment is quarantined', async () => {
    mockPrisma.compliance_assessments.findFirst.mockResolvedValue(null);

    const { activateWizardEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateWizardEvidence('assessment-001', 'org-A');

    expect(result.evidencePersistenceStatus).toBe('SKIPPED');
    expect(result.evidenceAdaptationStatus).toBe('NO_DATA');
  });

  it('regulatory activation: run not found for org is quarantined', async () => {
    mockPrisma.audit_orchestrator_runs.findFirst.mockResolvedValue(null);

    const { activateRegulatoryEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateRegulatoryEvidence('run-001', 'org-A');

    expect(result.evidencePersistenceStatus).toBe('SKIPPED');
    expect(result.evidenceAdaptationStatus).toBe('NO_DATA');
  });

  it('inventory activation: creates evidence for valid system', async () => {
    mockPrisma.ai_systems.findFirst.mockResolvedValue({
      id: 'sys-001', organizationId: 'org-A', updatedAt: new Date(),
    });
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      { id: 'sys-001', organizationId: 'org-A', name: 'ChatBot', updatedAt: new Date('2026-08-15T10:00:00Z'), createdAt: new Date() },
    ]);
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const { activateInventoryEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateInventoryEvidence('sys-001', 'org-A');

    expect(result.evidenceAdaptationStatus).toBe('OK');
    expect(result.evidencePersistenceStatus).toBe('CREATED');
  });

  it('wizard activation: creates evidence for valid assessment', async () => {
    mockPrisma.compliance_assessments.findFirst.mockResolvedValue({
      id: 'assessment-001', organizationId: 'org-A', assessmentStatus: 'completed',
    });
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 85, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const { activateWizardEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateWizardEvidence('assessment-001', 'org-A');

    expect(result.evidenceAdaptationStatus).toBe('OK');
    expect(result.evidencePersistenceStatus).toBe('CREATED');
  });

  it('regulatory activation: creates evidence for valid run', async () => {
    mockPrisma.audit_orchestrator_runs.findFirst.mockResolvedValue({
      id: 'run-001', organizationId: 'org-A', status: 'regulatory_complete', jurisdiction: 'nyc_ll144',
    });
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: { jurisdictionPolicyVersion: '1.0.0' },
        createdAt: new Date(),
        audit_engine_results: [
          { id: 'er-001', runId: 'run-001', engineId: 'regulatory', status: 'completed', summaryJson: {}, createdAt: new Date() },
        ],
      },
    ]);
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const { activateRegulatoryEvidence } = await import('@/lib/evidence/producer-activation-hooks');
    const result = await activateRegulatoryEvidence('run-001', 'org-A');

    expect(result.evidenceAdaptationStatus).toBe('OK');
    expect(result.evidencePersistenceStatus).toBe('CREATED');
  });
});

// ─── 5. Cross-Tenant Isolation ─────────────────────────────────────────────

describe('U3-B: Cross-tenant isolation', () => {
  it('inventory adapter filters by organizationId (Org A never sees Org B)', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([]);

    const adapter = new InventoryAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.ai_systems.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
    expect(callArgs.where.organizationId).not.toBe('org-B');
  });

  it('wizard adapter filters by organizationId', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([]);

    const adapter = new WizardAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.compliance_assessments.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
  });

  it('regulatory adapter filters by organizationId via run join', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([]);

    const adapter = new RegulatoryAdapter();
    await adapter.adapt({ organizationId: 'org-A' } as any);

    const callArgs = mockPrisma.audit_orchestrator_runs.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe('org-A');
  });
});

// ─── 6. Producer Independence ──────────────────────────────────────────────

describe('U3-B: Producer independence', () => {
  it('inventory works without wizard/regulatory', async () => {
    mockPrisma.ai_systems.findMany.mockResolvedValue([
      { id: 'sys-001', organizationId: 'org-A', name: 'ChatBot', updatedAt: new Date(), createdAt: new Date() },
    ]);

    const adapter = new InventoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    // Wizard and regulatory were NOT queried
    expect(mockPrisma.compliance_assessments.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.audit_orchestrator_runs.findMany).not.toHaveBeenCalled();
  });

  it('wizard works without inventory/regulatory', async () => {
    mockPrisma.compliance_assessments.findMany.mockResolvedValue([
      {
        id: 'assessment-001', organizationId: 'org-A', assessmentId: 'asmt-001',
        assessmentType: 'SOC2', responsesEncrypted: 'ENCRYPTED_VALID',
        assessmentStatus: 'completed', score: 85, level: 'A',
        createdAt: new Date(), completedAt: new Date(),
      },
    ]);

    const adapter = new WizardAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    expect(mockPrisma.ai_systems.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.audit_orchestrator_runs.findMany).not.toHaveBeenCalled();
  });

  it('regulatory works without inventory/wizard', async () => {
    mockPrisma.audit_orchestrator_runs.findMany.mockResolvedValue([
      {
        id: 'run-001', organizationId: 'org-A', jurisdiction: 'nyc_ll144',
        runConfigSnapshot: {}, createdAt: new Date(),
        audit_engine_results: [
          { id: 'er-001', runId: 'run-001', engineId: 'regulatory', status: 'completed', summaryJson: {}, createdAt: new Date() },
        ],
      },
    ]);

    const adapter = new RegulatoryAdapter();
    const result = await adapter.adapt({ organizationId: 'org-A' } as any);

    expect(result.status).toBe('OK');
    expect(mockPrisma.ai_systems.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.compliance_assessments.findMany).not.toHaveBeenCalled();
  });
});

// ─── 7. Producer Registry Corrections ──────────────────────────────────────

describe('U3-B: Producer registry corrections', () => {
  it('saas-inventory has evidenceCoreActivated = true', () => {
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_INVENTORY].evidenceCoreActivated).toBe(true);
  });

  it('saas-wizard has evidenceCoreActivated = true', () => {
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_WIZARD].evidenceCoreActivated).toBe(true);
  });

  it('saas-regulatory has evidenceCoreActivated = true', () => {
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_REGULATORY].evidenceCoreActivated).toBe(true);
  });

  it('saas-inventory persistenceTables includes ai_systems', () => {
    const tables = PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_INVENTORY].persistenceTables;
    expect(tables).toContain('ai_systems');
    // U3-B: removed non-existent 'ai_inventory_entries'
    expect(tables).not.toContain('ai_inventory_entries');
  });

  it('saas-wizard persistenceTables includes compliance_assessments', () => {
    const tables = PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_WIZARD].persistenceTables;
    expect(tables).toContain('compliance_assessments');
  });

  it('saas-regulatory persistenceTables includes audit_engine_results and audit_orchestrator_runs', () => {
    const tables = PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_REGULATORY].persistenceTables;
    expect(tables).toContain('audit_engine_results');
    expect(tables).toContain('audit_orchestrator_runs');
  });

  it('saas-regulatory implementationModule is lib/audit-orchestrator/ (not non-existent regulatory subdir)', () => {
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_REGULATORY].implementationModule).toBe('lib/audit-orchestrator/');
  });

  it('all three producers have evidence-core in consumers', () => {
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_INVENTORY].consumers).toContain('evidence-core');
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_WIZARD].consumers).toContain('evidence-core');
    expect(PRODUCER_REGISTRY[PRODUCER_IDS.SAAS_REGULATORY].consumers).toContain('evidence-core');
  });
});

// ─── 8. Canonical Persistence Reuse ────────────────────────────────────────

describe('U3-B: Canonical persistence reuse (no bypass)', () => {
  it('inventory envelope persists through shared persistence service', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeInventoryEnvelope();
    const result = await persistAdapterEnvelopes([envelope]);

    expect(result.created).toBe(1);
    // Verify canonicalKey was used
    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.canonicalKey).toBeDefined();
  });

  it('wizard envelope persists through shared persistence service', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeWizardEnvelope();
    const result = await persistAdapterEnvelopes([envelope]);

    expect(result.created).toBe(1);
    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.canonicalKey).toBeDefined();
  });

  it('regulatory envelope persists through shared persistence service', async () => {
    mockPrisma.evidence.create.mockResolvedValue({ id: 'ev-001' });

    const envelope = makeRegulatoryEnvelope();
    const result = await persistAdapterEnvelopes([envelope]);

    expect(result.created).toBe(1);
    const createArgs = mockPrisma.evidence.create.mock.calls[0][0];
    expect(createArgs.data.canonicalKey).toBeDefined();
  });

  it('cross-producer same run ID does not collide', async () => {
    const inventoryEnv = makeInventoryEnvelope({ producerRunId: 'run-001' });
    const wizardEnv = makeWizardEnvelope({ producerRunId: 'run-001' });
    const regulatoryEnv = makeRegulatoryEnvelope({ producerRunId: 'run-001' });

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-1' })
      .mockResolvedValueOnce({ id: 'ev-2' })
      .mockResolvedValueOnce({ id: 'ev-3' });

    const result = await persistAdapterEnvelopes([inventoryEnv, wizardEnv, regulatoryEnv]);

    expect(result.created).toBe(3);
    expect(result.conflicts).toBe(0);

    // All three should have different canonicalKeys
    const keys = mockPrisma.evidence.create.mock.calls.map(c => c[0].data.canonicalKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).not.toBe(keys[2]);
    expect(keys[0]).not.toBe(keys[2]);
  });
});

// ─── 9. Idempotency / Retry ────────────────────────────────────────────────

describe('U3-B: Idempotency and retry', () => {
  it('inventory: same snapshot retry is idempotent', async () => {
    const envelope = makeInventoryEnvelope();
    const digest = computeEnvelopeDigest(envelope);

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-001',
      contentHash: digest,
      metadata: { envelopeSemanticDigest: digest },
    });

    const result1 = await persistAdapterEnvelopes([envelope]);
    const result2 = await persistAdapterEnvelopes([envelope]);

    expect(result1.created).toBe(1);
    expect(result2.idempotent).toBe(1);
  });

  it('wizard: same assessment retry is idempotent', async () => {
    const envelope = makeWizardEnvelope();
    const digest = computeEnvelopeDigest(envelope);

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-001',
      contentHash: digest,
      metadata: { envelopeSemanticDigest: digest },
    });

    const result1 = await persistAdapterEnvelopes([envelope]);
    const result2 = await persistAdapterEnvelopes([envelope]);

    expect(result1.created).toBe(1);
    expect(result2.idempotent).toBe(1);
  });

  it('regulatory: same run + same rule pack retry is idempotent', async () => {
    const envelope = makeRegulatoryEnvelope();
    const digest = computeEnvelopeDigest(envelope);

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockRejectedValueOnce(((): any => {
        const err: any = new Error('Unique');
        err.code = 'P2002';
        err.meta = { target: ['canonicalKey'] };
        return err;
      })());

    mockPrisma.evidence.findFirst.mockResolvedValue({
      id: 'ev-001',
      contentHash: digest,
      metadata: { envelopeSemanticDigest: digest },
    });

    const result1 = await persistAdapterEnvelopes([envelope]);
    const result2 = await persistAdapterEnvelopes([envelope]);

    expect(result1.created).toBe(1);
    expect(result2.idempotent).toBe(1);
  });

  it('regulatory: different rule pack version creates new evidence (not conflict)', async () => {
    const env1 = makeRegulatoryEnvelope({ producerRunId: 'run-001:nyc_ll144:1.0.0' });
    const env2 = makeRegulatoryEnvelope({ producerRunId: 'run-001:nyc_ll144:2.0.0' });

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockResolvedValueOnce({ id: 'ev-002' });

    const result = await persistAdapterEnvelopes([env1, env2]);

    expect(result.created).toBe(2);
    expect(result.conflicts).toBe(0);
  });

  it('inventory: different snapshot creates new evidence (not conflict)', async () => {
    const env1 = makeInventoryEnvelope({ producerRunId: 'sys-001:snapshot:2026-08-15T10:00:00.000Z' });
    const env2 = makeInventoryEnvelope({ producerRunId: 'sys-001:snapshot:2026-08-16T12:00:00.000Z' });

    mockPrisma.evidence.create
      .mockResolvedValueOnce({ id: 'ev-001' })
      .mockResolvedValueOnce({ id: 'ev-002' });

    const result = await persistAdapterEnvelopes([env1, env2]);

    expect(result.created).toBe(2);
    expect(result.conflicts).toBe(0);
  });
});
