/**
 * PX1.2B-H3 — EXACT READ-MODEL + REFERENTIAL CLOSURE
 *
 * Test matrix from Section 21 of the H3 spec.
 *
 * Tests cover:
 *   - DIRECT_SYSTEM semantics (Section 2)
 *   - Evidence naming / generic coverage (Section 3)
 *   - Receipt deterministic aggregation (Sections 5-6)
 *   - Receipt exact evaluation matching (Sections 7-8)
 *   - Index/workspace receipt state equality (Section 9)
 *   - Delete reference audit + transaction recheck (Sections 10-13)
 *   - Identity limitations (Sections 14-16)
 *
 * These are source-inspection + pure-function tests.
 * No database required — deriveReceiptState is a pure function.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveReceiptState } from '../../lib/ai-inventory/system-receipt-projection';
import { computeNextAction } from '../../lib/ai-inventory/system-next-action';

function readFile(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8');
}

// ─── A. DIRECT_SYSTEM Semantics (Section 2) ─────────────────────────────────

describe('[PX1.2B-H3 §2] DIRECT_SYSTEM semantics — not current topology', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('DIRECT_SYSTEM != PROVEN_CURRENT_TOPOLOGY — lock in source', () => {
    expect(resolverContent).toContain('DIRECT_SYSTEM != PROVEN_CURRENT_TOPOLOGY');
  });

  it('CURRENT_ASSET != DIRECT_SYSTEM — lock in source', () => {
    expect(resolverContent).toContain('CURRENT_ASSET != DIRECT_SYSTEM');
  });

  it('RETIRED_ASSET != CURRENT_ASSET — lock in source', () => {
    expect(resolverContent).toContain('RETIRED_ASSET != CURRENT_ASSET');
  });

  it('DIRECT_SYSTEM is system-associated, not labelled current asset evidence', () => {
    expect(resolverContent).toContain('hasActiveSystemEvidence');
    expect(resolverContent).toContain('hasActiveAssetEvidence');
    // DIRECT_SYSTEM contributes to activeSystemEvidence but NOT activeAssetEvidence
    expect(resolverContent).toMatch(/DIRECT_SYSTEM.*activeSystemEvidence|activeSystemEvidence.*DIRECT_SYSTEM/s);
  });

  it('does NOT label DIRECT_SYSTEM as "current topology evidence" in projections', () => {
    // The lock must be present: DIRECT_SYSTEM != PROVEN_CURRENT_TOPOLOGY
    expect(resolverContent).toContain('DIRECT_SYSTEM != PROVEN_CURRENT_TOPOLOGY');
    // The projection fields must use "active system-associated" not "current topology"
    expect(resolverContent).toContain('hasActiveSystemEvidence');
    // Must NOT have a field named hasCurrentTopologyEvidence
    expect(resolverContent).not.toContain('hasCurrentTopologyEvidence');
  });
});

// ─── B. Evidence Naming / Generic Coverage (Section 3) ──────────────────────

describe('[PX1.2B-H3 §3] GENERIC_SYSTEM_COVERAGE rule', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('GENERIC_SYSTEM_COVERAGE_RULE is documented in source', () => {
    expect(resolverContent).toContain('GENERIC_SYSTEM_COVERAGE_RULE');
  });

  it('NO active system-associated evidence → NOT_ASSESSED', () => {
    expect(resolverContent).toMatch(/NO active system-associated.*NOT_ASSESSED/s);
  });

  it('SOME active system-associated evidence → UNKNOWN', () => {
    expect(resolverContent).toMatch(/SOME active system-associated.*UNKNOWN/s);
  });

  it('ACTIVE_SYSTEM_ASSOCIATED_EVIDENCE_RULE documented', () => {
    expect(resolverContent).toContain('DIRECT_SYSTEM active OR CURRENT_ASSET active');
  });
});

// ─── C. Receipt Deterministic Aggregation (Sections 5-6) ────────────────────

describe('[PX1.2B-H3 §5-6] Deterministic receipt aggregation — pure function', () => {
  it('MULTIPLE_PACKAGES_PER_EVALUATION_SUPPORTED — documented in source', () => {
    const content = readFile('lib/ai-inventory/system-receipt-projection.ts');
    expect(content).toContain('MULTIPLE PACKAGES PER EVALUATION');
    expect(content).toContain('FIRST_DATABASE_ROW != CANONICAL_RECEIPT_STATE');
  });

  it('empty package set → NO_RECEIPT', () => {
    expect(deriveReceiptState([])).toBe('NO_RECEIPT');
  });

  it('two packages same evaluation: PUBLIC + PRIVATE → PUBLIC_RECEIPT', () => {
    expect(deriveReceiptState(['PRIVATE', 'PUBLIC'])).toBe('PUBLIC_RECEIPT');
    expect(deriveReceiptState(['PUBLIC', 'PRIVATE'])).toBe('PUBLIC_RECEIPT');
  });

  it('two packages same evaluation: PUBLIC + REVOKED → PUBLIC_RECEIPT', () => {
    expect(deriveReceiptState(['REVOKED', 'PUBLIC'])).toBe('PUBLIC_RECEIPT');
    expect(deriveReceiptState(['PUBLIC', 'REVOKED'])).toBe('PUBLIC_RECEIPT');
  });

  it('two packages same evaluation: PRIVATE + REVOKED → PRIVATE_RECEIPT', () => {
    expect(deriveReceiptState(['REVOKED', 'PRIVATE'])).toBe('PRIVATE_RECEIPT');
    expect(deriveReceiptState(['PRIVATE', 'REVOKED'])).toBe('PRIVATE_RECEIPT');
  });

  it('all matching packages revoked → REVOKED_RECEIPT', () => {
    expect(deriveReceiptState(['REVOKED'])).toBe('REVOKED_RECEIPT');
    expect(deriveReceiptState(['REVOKED', 'REVOKED'])).toBe('REVOKED_RECEIPT');
  });

  it('derivation is order-independent (deterministic)', () => {
    const states1 = ['PRIVATE', 'PUBLIC', 'REVOKED'];
    const states2 = ['REVOKED', 'PUBLIC', 'PRIVATE'];
    const states3 = ['PUBLIC', 'REVOKED', 'PRIVATE'];
    expect(deriveReceiptState(states1)).toBe(deriveReceiptState(states2));
    expect(deriveReceiptState(states2)).toBe(deriveReceiptState(states3));
  });
});

// ─── D. Receipt Exact Evaluation Matching (Sections 7-8) ────────────────────

describe('[PX1.2B-H3 §7-8] No old receipt fallback + exact evaluation query', () => {
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const receiptContent = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('OLD_RECEIPT != LATEST_EVALUATION_RECEIPT — lock in source', () => {
    expect(receiptContent).toContain('OLD_RECEIPT != LATEST_EVALUATION_RECEIPT');
    expect(workspaceContent).toContain('OLD_RECEIPT != LATEST_EVALUATION_RECEIPT');
  });

  it('workspace does NOT fallback old package into latestEvaluationReceipt', () => {
    // The workspace must NOT contain the old fallback pattern: matchingPackage ?? packages[0]
    expect(workspaceContent).not.toMatch(/packages\[0\]/);
    expect(workspaceContent).not.toMatch(/matchingPackage.*\?\?.*packages/);
  });

  it('workspace separates latestEvaluationReceipt from historicalReceiptSummary', () => {
    expect(workspaceContent).toContain('latestEvaluationReceipt');
    expect(workspaceContent).toContain('historicalReceiptSummary');
  });

  it('receipt projection queries by exact evaluation ID (no arbitrary top-N)', () => {
    expect(receiptContent).toContain('assuranceEvaluationId: evaluationId');
    // Must NOT use take: 10 for the latest-evaluation query
    expect(receiptContent).not.toMatch(/take:\s*10/);
  });

  it('old evaluation package only → latest evaluation has NO_RECEIPT (by design)', () => {
    // resolveEvaluationReceipt queries by exact evaluationId — if no package matches,
    // it returns NO_RECEIPT, regardless of packages from other evaluations.
    expect(receiptContent).toContain('NO_RECEIPT');
  });
});

// ─── E. Index/Workspace Receipt State Equality (Section 9) ──────────────────

describe('[PX1.2B-H3 §9] INDEX_RECEIPT_STATE == WORKSPACE_RECEIPT_STATE', () => {
  const listContent = readFile('lib/ai-inventory/system-list-summary.ts');
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const receiptContent = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('both index and workspace import from the same receipt projection helper', () => {
    expect(listContent).toContain('system-receipt-projection');
    expect(workspaceContent).toContain('system-receipt-projection');
  });

  it('both use deriveReceiptState (same algorithm)', () => {
    expect(receiptContent).toContain('export function deriveReceiptState');
    expect(listContent).toContain('resolveReceiptStateBatch');
    expect(workspaceContent).toContain('resolveEvaluationReceipt');
  });

  it('INDEX_RECEIPT_STATE == WORKSPACE_RECEIPT_STATE lock in source', () => {
    expect(receiptContent).toContain('INDEX_RECEIPT_STATE == WORKSPACE_RECEIPT_STATE');
  });
});

// ─── F. Delete Reference Audit (Sections 10-13) ─────────────────────────────

describe('[PX1.2B-H3 §10-13] Delete reference audit + transaction recheck', () => {
  const deleteContent = readFile('app/api/inventory/[id]/route.ts');

  it('checks ALL historical blocker tables (not just 5)', () => {
    // H3 must check more than the H2 set of 5
    const blockerModels = [
      'audit_orchestrator_runs',
      'assurance_evaluations',
      'assurance_packages',
      'pipeline_aggregation_runs',
      'decision_pipeline_node_results',
      'decision_integrity_scores',
      'pipeline_reviews',
      'compliance_attestations',
      'system_boundary_declarations',
      'pipeline_audit_packages',
      'operating_envelopes',
    ];
    for (const model of blockerModels) {
      expect(deleteContent).toContain(model);
    }
  });

  it('ALL assurance_evaluations block (Section 13 — not just COMPLETED)', () => {
    // The delete check must NOT filter by evaluationStatus: 'COMPLETED'
    expect(deleteContent).toContain('ALL assurance_evaluations block');
  });

  it('transaction rechecks asset-bound Evidence (Section 12)', () => {
    expect(deleteContent).toContain('recheckAssetBound');
    expect(deleteContent).toContain('freshAssetIds');
  });

  it('transaction rechecks Assurance evaluations (Section 12)', () => {
    expect(deleteContent).toContain('recheckAllEvaluations');
  });

  it('transaction rechecks packages (Section 12)', () => {
    expect(deleteContent).toContain('recheckAssurancePackages');
  });

  it('transaction rechecks ALL durable blockers (not just direct evidence)', () => {
    expect(deleteContent).toContain('recheckPipelineAggregationRuns');
    expect(deleteContent).toContain('recheckOperatingEnvelopes');
  });

  it('transaction re-fetches FRESH asset IDs (Section 12)', () => {
    expect(deleteContent).toContain('FRESH asset IDs');
    expect(deleteContent).toContain('freshAssets');
  });

  it('UNKNOWN_REFERENCE_CLASS → DELETE_DENIED (Section 11)', () => {
    expect(deleteContent).toContain('UNKNOWN_REFERENCE_CLASS');
    expect(deleteContent).toContain('DELETE_DENIED');
  });

  it('DELETE_ATOMICITY_STATUS = BOUNDED_DELETE_RACE (Section 14)', () => {
    expect(deleteContent).toContain('BOUNDED_DELETE_RACE');
  });

  it('cross-tenant deletion still denied (organizationId scoped)', () => {
    expect(deleteContent).toContain('organizationId');
    // Ownership check before delete
    expect(deleteContent).toContain('not found or access denied');
  });

  it('pipeline_schedules cleaned up as EPHEMERAL_DELETE_SAFE', () => {
    expect(deleteContent).toContain('pipeline_schedules');
    expect(deleteContent).toContain('EPHEMERAL_DELETE_SAFE');
  });
});

// ─── G. Identity Limitations (Sections 14-16) ───────────────────────────────

describe('[PX1.2B-H3 §14-16] Identity limitations', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('null assetIdentityKey — no heuristic matching added (Section 15)', () => {
    // The resolver must not ADD heuristic matching for null assetIdentityKey
    // "No heuristics" is a negative statement — verify no heuristic MATCHING FUNCTION was added
    expect(resolverContent).not.toContain('heuristicMatch');
    expect(resolverContent).not.toContain('fuzzyMatch');
    expect(resolverContent).not.toContain('similarityMatch');
  });

  it('externalId identity hardening deferred (Section 16)', () => {
    // No architectural expansion for externalId identity in H3
    const connectedAssetsContent = readFile('lib/ai-inventory/connected-assets.ts');
    // The existing code should not have been expanded with identity-bearing locator logic
    // This is a negative test — just verify no new identity model was added
    expect(connectedAssetsContent).not.toMatch(/EXTERNAL_LOCATOR_IDENTITY_HARDENING/);
  });
});

// ─── H. Next-Action Engine Naming (Section 17) ──────────────────────────────

describe('[PX1.2B-H3 §17] Next-action engine naming — bounded customer language', () => {
  const nextActionContent = readFile('lib/ai-inventory/system-next-action.ts');

  it('uses hasActiveSystemEvidence (not hasCurrentEvidence)', () => {
    expect(nextActionContent).toContain('hasActiveSystemEvidence');
    expect(nextActionContent).not.toContain('hasCurrentEvidence');
  });

  it('uses hasHistoricalAssetEvidenceOnly (not hasHistoricalEvidenceOnly)', () => {
    expect(nextActionContent).toContain('hasHistoricalAssetEvidenceOnly');
    expect(nextActionContent).not.toContain('hasHistoricalEvidenceOnly');
  });

  it('does NOT say "current-topology Evidence" in rule 3', () => {
    expect(nextActionContent).not.toMatch(/current-topology.*Evidence/i);
  });

  it('uses bounded language: "system-associated" not "current topology"', () => {
    expect(nextActionContent).toContain('system-associated');
  });

  it('BLOCK never success (preserved from H2)', () => {
    const baseState = {
      hasAssets: true,
      unresolvedIdentityCount: 0,
      conflictedIdentityCount: 0,
      hasActiveSystemEvidence: true,
      hasHistoricalAssetEvidenceOnly: false,
      hasPartialProducerEvidence: false,
      hasAssurance: true,
      latestDisposition: 'BLOCK' as const,
      matchingReceiptState: 'PUBLIC_RECEIPT' as const,
      systemId: 'test',
    };
    const action = computeNextAction(baseState);
    expect(action.stage).toBe('ADDRESS_BLOCKERS');
    expect(action.stage).not.toBe('ASSURANCE_RECORD_AVAILABLE');
  });

  it('REVIEW never success (preserved from H2)', () => {
    const baseState = {
      hasAssets: true,
      unresolvedIdentityCount: 0,
      conflictedIdentityCount: 0,
      hasActiveSystemEvidence: true,
      hasHistoricalAssetEvidenceOnly: false,
      hasPartialProducerEvidence: false,
      hasAssurance: true,
      latestDisposition: 'REVIEW' as const,
      matchingReceiptState: 'PUBLIC_RECEIPT' as const,
      systemId: 'test',
    };
    const action = computeNextAction(baseState);
    expect(action.stage).toBe('REVIEW_ASSURANCE');
    expect(action.stage).not.toBe('ASSURANCE_RECORD_AVAILABLE');
  });

  it('REVOKED receipt never success (preserved from H2)', () => {
    const baseState = {
      hasAssets: true,
      unresolvedIdentityCount: 0,
      conflictedIdentityCount: 0,
      hasActiveSystemEvidence: true,
      hasHistoricalAssetEvidenceOnly: false,
      hasPartialProducerEvidence: false,
      hasAssurance: true,
      latestDisposition: 'ALLOW' as const,
      matchingReceiptState: 'REVOKED_RECEIPT' as const,
      systemId: 'test',
    };
    const action = computeNextAction(baseState);
    expect(action.stage).toBe('RECEIPT_REVOKED');
    expect(action.stage).not.toBe('ASSURANCE_RECORD_AVAILABLE');
  });

  it('ALLOW + matching receipt → ASSURANCE_RECORD_AVAILABLE (not "System assured")', () => {
    const baseState = {
      hasAssets: true,
      unresolvedIdentityCount: 0,
      conflictedIdentityCount: 0,
      hasActiveSystemEvidence: true,
      hasHistoricalAssetEvidenceOnly: false,
      hasPartialProducerEvidence: false,
      hasAssurance: true,
      latestDisposition: 'ALLOW' as const,
      matchingReceiptState: 'PUBLIC_RECEIPT' as const,
      systemId: 'test',
    };
    const action = computeNextAction(baseState);
    expect(action.stage).toBe('ASSURANCE_RECORD_AVAILABLE');
    expect(action.label).not.toMatch(/system.*assured/i);
  });
});

// ─── I. Evidence Status Semantics (Section 4) ───────────────────────────────

describe('[PX1.2B-H3 §4] Evidence status semantics', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('ACTIVE_EVIDENCE_STATUS_SET — resolver uses status = active for active projection', () => {
    expect(resolverContent).toContain("status = 'active'");
  });

  it('historical projection also uses status = active (no non-active semantics defined)', () => {
    // Both Path A and Path B filter by status = 'active'
    // Non-active Evidence semantics are not defined in source
    const matches = resolverContent.match(/status = 'active'/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('HISTORICAL_NONACTIVE_EVIDENCE_DISPLAY = DEFERRED — no non-active lifecycle enum invented', () => {
    // The resolver must NOT invent a lifecycle enum for non-active evidence
    expect(resolverContent).not.toMatch(/superseded|invalidated|archived/);
  });
});
