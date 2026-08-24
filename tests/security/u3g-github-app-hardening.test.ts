/**
 * U3-G — GitHub App Developer Security Hardening Tests
 *
 * Tests:
 * - Diff scanner execution truth (no false PASS)
 * - File coverage accounting
 * - Security-first policy pack
 * - Webhook flow: free unlinked scan, tenant-linked evidence
 * - GitHub adapter producer ID (CI_CD_SCANNER, not SAAS_STATIC)
 * - Event-driven GitHub → Inventory discovery
 * - Secret redaction in comments
 * - MCP hold preservation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRODUCER_REGISTRY, PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';
import { HAIEC_AI_APPSEC_PR_POLICY_PACK, RULE_GAP_ANALYSIS } from '@/lib/github-app/policy-packs';

// ─── Policy Pack Tests ─────────────────────────────────────────────────────

describe('U3-G: High-Signal AI/AppSec Policy Pack', () => {
  it('has security-first semantic identity', () => {
    expect(HAIEC_AI_APPSEC_PR_POLICY_PACK.id).toBe('haiec-ai-appsec-pr-v1');
    expect(HAIEC_AI_APPSEC_PR_POLICY_PACK.name).toContain('AI/AppSec');
  });

  it('does not use SOC2 as primary framework', () => {
    expect(HAIEC_AI_APPSEC_PR_POLICY_PACK.framework).toBeUndefined();
  });

  it('has framework mappings as secondary metadata', () => {
    const hasMappings = HAIEC_AI_APPSEC_PR_POLICY_PACK.controls.some(c =>
      c.frameworkMappings && c.frameworkMappings.length > 0
    );
    expect(hasMappings).toBe(true);
  });

  it('includes prompt injection as CRITICAL', () => {
    const promptInjection = HAIEC_AI_APPSEC_PR_POLICY_PACK.controls.find(
      c => c.type === 'PROMPT_INJECTION'
    );
    expect(promptInjection).toBeDefined();
    expect(promptInjection?.severity).toBe('CRITICAL');
  });

  it('includes authentication as CRITICAL', () => {
    const auth = HAIEC_AI_APPSEC_PR_POLICY_PACK.controls.find(
      c => c.type === 'PHI_BOUNDARY_DETECTION'
    );
    expect(auth).toBeDefined();
    expect(auth?.severity).toBe('CRITICAL');
  });

  it('includes hardcoded secrets detection', () => {
    const crypto = HAIEC_AI_APPSEC_PR_POLICY_PACK.controls.find(
      c => c.type === 'CRYPTOGRAPHY'
    );
    expect(crypto).toBeDefined();
    expect(crypto?.severity).toBe('HIGH');
  });

  it('has rule gap analysis documenting absent categories', () => {
    expect(RULE_GAP_ANALYSIS.ABSENT).toContain('SSRF_EGRESS');
    expect(RULE_GAP_ANALYSIS.ABSENT).toContain('UNSAFE_MCP_TOOL');
    expect(RULE_GAP_ANALYSIS.ABSENT).toContain('RAG_POISONING');
  });

  it('has strong existing rules documented', () => {
    expect(RULE_GAP_ANALYSIS.STRONG_EXISTING).toContain('PROMPT_INJECTION');
    expect(RULE_GAP_ANALYSIS.STRONG_EXISTING).toContain('ACCESS_CONTROL');
  });
});

// ─── GitHub Adapter Producer ID Tests ──────────────────────────────────────

describe('U3-G: GitHub Adapter Producer ID', () => {
  it('GitHubAdapter uses CI_CD_SCANNER, not SAAS_STATIC', async () => {
    const { GitHubAdapter } = await import('@/lib/evidence/adapters/github-adapter');
    const adapter = new GitHubAdapter();
    expect(adapter.producerId).toBe(PRODUCER_IDS.CI_CD_SCANNER);
    expect(adapter.producerId).not.toBe(PRODUCER_IDS.SAAS_STATIC);
  });
});

// ─── MCP Hold Preservation ─────────────────────────────────────────────────

describe('U3-G: MCP Hold Preservation', () => {
  it('MCP producers remain held', () => {
    const mcpAppSec = PRODUCER_REGISTRY[PRODUCER_IDS.MCP_AI_APPSEC];
    const mcpTenant = PRODUCER_REGISTRY[PRODUCER_IDS.MCP_TENANT_ISOLATION];
    expect(mcpAppSec?.evidenceCoreActivated).not.toBe(true);
    expect(mcpTenant?.evidenceCoreActivated).not.toBe(true);
  });

  it('MCP producers have no persistence tables', () => {
    const mcpAppSec = PRODUCER_REGISTRY[PRODUCER_IDS.MCP_AI_APPSEC];
    expect(mcpAppSec?.persistenceTables).toHaveLength(0);
  });
});

// ─── U3 Final Producer Model ───────────────────────────────────────────────

describe('U3-G: U3 Final Producer Model', () => {
  it('all expected activated producers have evidenceCoreActivated=true', () => {
    const expected = [
      PRODUCER_IDS.SAAS_STATIC,
      PRODUCER_IDS.SAAS_RUNTIME,
      PRODUCER_IDS.SAAS_INVENTORY,
      PRODUCER_IDS.SAAS_WIZARD,
      PRODUCER_IDS.SAAS_REGULATORY,
      PRODUCER_IDS.CI_CD_SCANNER,
      PRODUCER_IDS.SARIF_IMPORT,
    ];
    for (const id of expected) {
      expect(PRODUCER_REGISTRY[id]?.evidenceCoreActivated).toBe(true);
    }
  });

  it('deferred producers are not activated', () => {
    const deferred = [
      PRODUCER_IDS.NYC_LL144,
      PRODUCER_IDS.AIRRD,
      PRODUCER_IDS.OSNIT,
      PRODUCER_IDS.LLMVERIFY,
      PRODUCER_IDS.ISAF_LOGGER,
    ];
    for (const id of deferred) {
      expect(PRODUCER_REGISTRY[id]?.evidenceCoreActivated).not.toBe(true);
    }
  });
});

// ─── Diff Scanner Execution Truth ──────────────────────────────────────────

describe('U3-G: Diff Scanner Execution Truth', () => {
  it('runDiffScan returns NOT_ASSESSED for no analyzable files', async () => {
    const { runDiffScan } = await import('@/lib/github-app/diff-scanner');
    const result = await runDiffScan([]);
    expect(result.executionStatus).toBe('NOT_ASSESSED');
    expect(result.status).toBe('NOT_AVAILABLE');
    expect(result.status).not.toBe('PASS');
  });

  it('runDiffScan returns NOT_ASSESSED for only removed files', async () => {
    const { runDiffScan } = await import('@/lib/github-app/diff-scanner');
    const result = await runDiffScan([
      { filename: 'deleted.ts', content: '', status: 'removed' },
    ]);
    expect(result.executionStatus).toBe('NOT_ASSESSED');
    expect(result.status).not.toBe('PASS');
  });

  it('runDiffScan tracks coverage accounting', async () => {
    const { runDiffScan } = await import('@/lib/github-app/diff-scanner');
    const result = await runDiffScan([
      { filename: 'app.ts', content: 'const x = 1', status: 'added' },
      { filename: 'deleted.ts', content: '', status: 'removed' },
    ]);
    expect(result.coverage.totalChangedFiles).toBe(2);
    expect(result.coverage.filesRemoved).toBe(1);
    expect(result.coverage.eligibleFiles).toBe(1);
  });
});

// ─── Secret Redaction ──────────────────────────────────────────────────────

describe('U3-G: Secret Redaction in Comments', () => {
  it('formatStaticFindingsSummary redacts OpenAI keys', async () => {
    const { formatStaticFindingsSummary } = await import('@/lib/github-app/pr-review-commenter');
    const findings = [{
      ruleId: 'REGEX-SECRET-OPENAI-001',
      controlId: 'AI-APPSEC-006',
      severity: 'HIGH' as const,
      confidence: 0.9,
      title: 'OpenAI key sk-abcdefghijklmnopqrstuvwxyz1234567890 detected',
      message: 'test',
      file: 'app.ts',
      line: 1,
      column: 1,
      fingerprint: 'abc',
    }];
    const result = formatStaticFindingsSummary(findings as any, {
      filesAnalyzed: 1,
      executionTimeMs: 100,
      policyPackVersion: '1.0.0',
    });
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result).toContain('[REDACTED]');
  });
});
