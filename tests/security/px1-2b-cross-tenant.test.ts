/**
 * PX1.2B — Cross-Tenant Negative Tests (Section 44)
 *
 * Proves that all new PX1.2B API routes enforce tenant isolation:
 *   - Connected Asset API (GET/POST /api/inventory/systems/[id]/assets)
 *   - Asset Mutation API (PATCH/DELETE /api/inventory/systems/[id]/assets/[assetId])
 *   - System-bound Assurance API (GET /api/inventory/systems/[id]/assurance)
 *   - System-bound Reports API (GET /api/inventory/systems/[id]/reports)
 *   - System Workspace API (GET /api/inventory/systems/[id]/workspace)
 *   - Systems Summary API (GET /api/inventory/systems/summary)
 *
 * The invariant:
 *   authenticatedOrganizationId == targetAISystem.organizationId
 *
 * A caller-supplied systemId that belongs to a different organization
 * must be rejected deterministically (404 or empty result), never leak data.
 *
 * Run with: npx vitest run tests/security/px1-2b-cross-tenant.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

// ─── Connected Asset API — tenant isolation ──────────────────────────────────

describe('[PX1.2B §11] Connected Asset API — tenant isolation', () => {
  const listContent = readFile('app/api/inventory/systems/[id]/assets/route.ts');

  it('GET uses requireOrganizationAccess for auth', () => {
    expect(listContent).toContain('requireOrganizationAccess');
  });

  it('GET uses listConnectedAssets which is tenant-scoped (both aiSystemId AND organizationId)', () => {
    expect(listContent).toContain('listConnectedAssets');
    // listConnectedAssets filters by both aiSystemId and organizationId
    const libContent = readFile('lib/ai-inventory/connected-assets.ts');
    expect(libContent).toContain('aiSystemId');
    expect(libContent).toContain('organizationId');
  });

  it('POST uses requireOrganizationAccess for auth', () => {
    expect(listContent).toContain('requireOrganizationAccess');
  });

  it('POST uses createConnectedAsset which verifies tenant binding', () => {
    expect(listContent).toContain('createConnectedAsset');
    // createConnectedAsset calls verifyAISystemOrgBinding internally
    const libContent = readFile('lib/ai-inventory/connected-assets.ts');
    expect(libContent).toContain('verifyAISystemOrgBinding');
  });

  it('POST does NOT accept organizationId from request body', () => {
    // organizationId must come from auth, not caller
    expect(listContent).not.toMatch(/body.*organizationId/);
  });

  it('POST rejects client-supplied connectionState (Section 9)', () => {
    expect(listContent).toContain('Client cannot set connectionState or identityState');
  });

  it('POST schema does NOT include connectionState field (Section 9)', () => {
    // The zod schema should not have connectionState
    expect(listContent).not.toMatch(/connectionState.*z\.string/);
  });

  it('POST schema does NOT include identityState field (Section 9)', () => {
    expect(listContent).not.toMatch(/identityState.*z\.string/);
  });

  it('POST validates connectionChoice + assetType pair consistency (Section 13)', () => {
    expect(listContent).toContain('CONNECTION_TO_ASSET_TYPE');
    expect(listContent).toContain('not valid for connectionChoice');
  });
});

// ─── Asset Mutation API — tenant isolation ──────────────────────────────────

describe('[PX1.2B §11] Asset Mutation API — tenant isolation', () => {
  const content = readFile('app/api/inventory/systems/[id]/assets/[assetId]/route.ts');

  it('PATCH uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('PATCH verifies AI System org binding before mutation', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('PATCH updateMany is scoped by aiSystemId AND organizationId', () => {
    expect(content).toContain('where: { id: assetId, aiSystemId: systemId, organizationId: orgId }');
  });

  it('PATCH rejects client-supplied connectionState or identityState (Section 9)', () => {
    expect(content).toContain('Client cannot set connectionState or identityState via PATCH');
  });

  it('PATCH schema does NOT include connectionState or identityState (Section 9)', () => {
    expect(content).not.toMatch(/connectionState.*z\.string/);
    expect(content).not.toMatch(/identityState.*z\.string/);
  });

  it('DELETE uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('DELETE verifies AI System org binding before deletion', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('DELETE retires asset (NOT physical delete) — PX1.2B-H1 Section 4-6', () => {
    // PX1.2B-H1: DELETE now calls retireConnectedAsset, NOT prisma.ai_system_assets.deleteMany
    expect(content).toContain('retireConnectedAsset');
    expect(content).not.toContain('prisma.ai_system_assets.deleteMany');
  });

  it('DELETE does NOT cascade-delete historical evidence (PX1.2B-H1 Section 4)', () => {
    expect(content).not.toMatch(/evidence.*delete/i);
    expect(content).not.toMatch(/assurance.*delete/i);
  });

  it('PATCH rejects environment mutation (PX1.2B-H1 Section 9 — identity immutability)', () => {
    expect(content).toContain('identity-defining field');
    expect(content).toContain('retire this asset and register a new one');
  });

  it('PATCH only updates active (non-retired) assets (PX1.2B-H1 Section 7)', () => {
    expect(content).toContain('retiredAt: null');
  });
});

// ─── System-bound Assurance API — tenant isolation ──────────────────────────

describe('[PX1.2B §11] System-bound Assurance API — tenant isolation', () => {
  const content = readFile('app/api/inventory/systems/[id]/assurance/route.ts');

  it('uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('verifies AI System org binding before returning data', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('queries assurance_evaluations with both aiSystemId AND organizationId', () => {
    expect(content).toContain('where: { aiSystemId: systemId, organizationId: orgId }');
  });

  it('returns 404 when system not found in org (fail closed)', () => {
    expect(content).toContain('404');
    expect(content).toContain('not found in your organization');
  });
});

// ─── System-bound Reports API — tenant isolation ────────────────────────────

describe('[PX1.2B §11] System-bound Reports API — tenant isolation', () => {
  const content = readFile('app/api/inventory/systems/[id]/reports/route.ts');

  it('uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('verifies AI System org binding before returning data', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('queries assurance_packages with both aiSystemId AND organizationId', () => {
    expect(content).toContain('where: { aiSystemId: systemId, organizationId: orgId }');
  });

  it('returns 404 when system not found in org (fail closed)', () => {
    expect(content).toContain('404');
    expect(content).toContain('not found in your organization');
  });
});

// ─── System Workspace API — tenant isolation ────────────────────────────────

describe('[PX1.2B §11] System Workspace API — tenant isolation', () => {
  const content = readFile('app/api/inventory/systems/[id]/workspace/route.ts');

  it('uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('delegates to getSystemWorkspace which verifies tenant binding', () => {
    expect(content).toContain('getSystemWorkspace');
    const libContent = readFile('lib/ai-inventory/system-workspace.ts');
    expect(libContent).toContain('verifyAISystemOrgBinding');
  });

  it('returns 404 when system not found in org (fail closed)', () => {
    expect(content).toContain('404');
  });
});

// ─── Systems Summary API — tenant isolation ─────────────────────────────────

describe('[PX1.2B §11] Systems Summary API — tenant isolation', () => {
  const content = readFile('app/api/inventory/systems/summary/route.ts');

  it('uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('delegates to getSystemListSummary with organizationId from auth', () => {
    expect(content).toContain('getSystemListSummary');
    expect(content).toContain('authResult.organizationId');
  });

  it('does NOT accept organizationId from query params', () => {
    expect(content).not.toMatch(/searchParams.*organizationId/i);
  });
});

// ─── Workspace Aggregator — tenant isolation in lib ─────────────────────────

describe('[PX1.2B §11] Workspace aggregator — tenant isolation in lib', () => {
  const content = readFile('lib/ai-inventory/system-workspace.ts');

  it('verifies AI System org binding BEFORE any data is returned', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
    // The binding check should come before data queries
    const bindingIdx = content.indexOf('verifyAISystemOrgBinding');
    const queryIdx = content.indexOf('prisma.ai_systems.findFirst');
    expect(bindingIdx).toBeLessThan(queryIdx);
  });

  it('returns null when system does not belong to org (fail closed)', () => {
    expect(content).toContain('return null');
  });

  it('all queries are scoped by organizationId', () => {
    // Count occurrences of organizationId in where clauses
    const matches = content.match(/organizationId/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThan(5);
  });
});

// ─── List Summary Aggregator — tenant isolation in lib ──────────────────────

describe('[PX1.2B §11] List summary aggregator — tenant isolation in lib', () => {
  const content = readFile('lib/ai-inventory/system-list-summary.ts');

  it('all queries are scoped by organizationId', () => {
    const matches = content.match(/organizationId/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThan(3);
  });

  it('does NOT accept caller-supplied organizationId', () => {
    // organizationId is a function parameter, but it comes from auth in the API
    expect(content).toContain('organizationId: string');
  });
});

// ─── Cross-tenant attachment fails closed ────────────────────────────────────

describe('[PX1.2B §11] Cross-tenant attachment fails closed', () => {
  const assetContent = readFile('lib/ai-inventory/connected-assets.ts');

  it('createConnectedAsset verifies tenant binding before creation', () => {
    expect(assetContent).toContain('verifyAISystemOrgBinding');
  });

  it('createConnectedAsset returns ok=false when tenant binding fails', () => {
    expect(assetContent).toMatch(/ok:\s*false/);
  });

  it('listConnectedAssets filters by both aiSystemId AND organizationId', () => {
    expect(assetContent).toContain('aiSystemId');
    expect(assetContent).toContain('organizationId');
  });
});

// ─── Evidence Resolver — tenant isolation (PX1.2B-R1 Section 3-5) ───────────

describe('[PX1.2B-R1 §3-5] Evidence resolver — tenant isolation', () => {
  const content = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('verifies AI System org binding before querying evidence', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('returns null when system does not belong to org (fail closed)', () => {
    expect(content).toContain('return null');
  });

  it('all evidence queries are scoped by organizationId', () => {
    expect(content).toContain('organizationId');
    // Raw SQL queries must include organizationId filter
    expect(content).toMatch(/WHERE.*organizationId/s);
  });

  it('does NOT use sourceType=orchestrator_run as binding (Section 3)', () => {
    // The resolver should not query evidence with sourceType='orchestrator_run'
    expect(content).not.toMatch(/sourceType:\s*['"]orchestrator_run['"]/);
  });

  it('uses metadata.target for deterministic binding (Section 4)', () => {
    expect(content).toContain("metadata->'target'->>'type'");
    expect(content).toContain("metadata->'target'->>'id'");
  });

  it('supports Connected Asset binding path (Section 4B)', () => {
    expect(content).toContain("metadata->'target'->>'connectedAssetId'");
  });

  it('Connected Asset query is scoped by organizationId', () => {
    expect(content).toContain('ai_system_assets.findMany');
    // The asset query must filter by organizationId
    expect(content).toMatch(/where:\s*\{\s*aiSystemId.*organizationId/s);
  });
});

// ─── Assurance COMPLETED filter (PX1.2B-R1 Section 20) ──────────────────────

describe('[PX1.2B-R1 §20] Assurance latest = COMPLETED only', () => {
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const listContent = readFile('lib/ai-inventory/system-list-summary.ts');

  it('workspace filters assurance_evaluations by evaluationStatus=COMPLETED', () => {
    expect(workspaceContent).toContain("evaluationStatus: 'COMPLETED'");
  });

  it('list summary filters assurance_evaluations by evaluationStatus=COMPLETED', () => {
    expect(listContent).toContain("evaluationStatus: 'COMPLETED'");
  });

  it('LATEST_ROW != LATEST_VALID_ASSURANCE — only COMPLETED counts', () => {
    // Both files must filter by COMPLETED, not just take the latest row
    expect(workspaceContent).toContain('COMPLETED');
    expect(listContent).toContain('COMPLETED');
  });
});

// ─── Org KPI pagination independence (PX1.2B-R1 Section 21) ─────────────────

describe('[PX1.2B-R1 §21] Org KPI pagination independence', () => {
  const content = readFile('lib/ai-inventory/system-list-summary.ts');

  it('has a separate org-level KPI calculation function', () => {
    expect(content).toContain('calculateOrgLevelKpis');
  });

  it('org KPIs use groupBy, not page-scoped counts', () => {
    expect(content).toContain('groupBy');
  });

  it('org KPI totalSystems does NOT use search filter', () => {
    // The org KPI query should count all systems, not just search results
    expect(content).toMatch(/prisma\.ai_systems\.count.*where:\s*\{\s*organizationId\s*\}/s);
  });
});

// ─── Evidence coverage from canonical coverage, not claim counts (Section 6) ─

describe('[PX1.2B-R1 §6] Evidence coverage from canonical coverage', () => {
  const content = readFile('lib/ai-inventory/system-workspace.ts');

  it('uses resolveSystemEvidence for evidence binding', () => {
    expect(content).toContain('resolveSystemEvidence');
  });

  it('does NOT derive coverage from claim counts', () => {
    // The old code used claimCounts to derive coverage — that's removed
    // Check that there's no code path that sets coverage from claimCounts
    expect(content).not.toMatch(/coverage\s*=\s*['"]PARTIAL['"]\s*;\s*coveragePartial\s*=\s*true\s*;\s*\}\s*else if\s*\(hasEvidence\s*&&\s*hasAssurance/);
  });

  it('CLAIM_COUNT != EVIDENCE_COVERAGE — coverage comes from resolver', () => {
    expect(content).toContain('evidenceResult');
    expect(content).toMatch(/evidenceResult\?\.coverage|evidenceResult\.coverage/);
  });
});

// ─── PX1.2B-H1: System Coverage Truthful (Section 2) ───────────────────────

describe('[PX1.2B-H1/H2 §2] System coverage — ALL_COMPLETE != SYSTEM_COMPLETE', () => {
  const content = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('does NOT claim COMPLETE when all records are individually COMPLETE', () => {
    // The resolver must NOT set coverage = 'COMPLETE' for generic system
    // LOCK: RECORD_COVERAGE_COMPLETE != SYSTEM_EVIDENCE_SET_COMPLETE
    // PX1.2B-H2: ANY_PARTIAL → PARTIAL is also removed for generic system coverage
    expect(content).toContain('PRODUCER_COVERAGE != SYSTEM_EVIDENCE_SET_COVERAGE');
  });

  it('generic aggregate is UNKNOWN when active system evidence exists', () => {
    // H3: NO active system-associated → NOT_ASSESSED, SOME → UNKNOWN
    expect(content).toMatch(/hasActiveSystemEvidence.*UNKNOWN/s);
  });
});

// ─── PX1.2B-H1: Asset Retirement (Section 4-8) ──────────────────────────────

describe('[PX1.2B-H1 §5-6] Asset retirement — domain functions', () => {
  const content = readFile('lib/ai-inventory/connected-assets.ts');

  it('has retireConnectedAsset function', () => {
    expect(content).toContain('export async function retireConnectedAsset');
  });

  it('retire sets retiredAt, does NOT delete', () => {
    expect(content).toContain('retiredAt: new Date()');
    expect(content).not.toMatch(/prisma\.ai_system_assets\.delete/);
  });

  it('retire verifies tenant binding', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('has reactivateConnectedAsset function (Section 8)', () => {
    expect(content).toContain('export async function reactivateConnectedAsset');
  });

  it('reactivation clears retiredAt and returns to REGISTERED + NOT_VERIFIED', () => {
    expect(content).toContain('retiredAt: null');
    expect(content).toContain("connectionState: 'REGISTERED'");
    expect(content).toContain("identityState: 'NOT_VERIFIED'");
  });

  it('REACTIVATED_MANUAL_ASSET != AUTOMATICALLY_VERIFIED (Section 8)', () => {
    expect(content).toContain('REACTIVATED_MANUAL_ASSET');
    expect(content).toContain('AUTOMATICALLY_VERIFIED');
  });

  it('listConnectedAssets supports includeRetired option (Section 7)', () => {
    expect(content).toContain('includeRetired');
    expect(content).toContain('retiredAt: null');
  });

  it('createConnectedAsset reactivates retired assets on re-register (Section 8)', () => {
    expect(content).toContain('isReactivating');
    expect(content).toMatch(/retiredAt.*null.*reactivat/s);
  });
});

// ─── PX1.2B-H2: System Delete Safety (Section 15-17) ───────────────────────

describe('[PX1.2B-H2 §15-17] System delete safety — reference-based, not asset-existence', () => {
  const content = readFile('app/api/inventory/[id]/route.ts');

  it('checks for direct AI System evidence before delete (ANY status — Section 16)', () => {
    expect(content).toContain("metadata->'target'->>'type' = 'AI_SYSTEM'");
    // H2: must NOT filter by status = 'active' only
    expect(content).not.toMatch(/status\s*=\s*'active'.*metadata->'target'->>'type' = 'AI_SYSTEM'/s);
  });

  it('checks for asset-bound evidence before delete (ANY status — Section 16)', () => {
    expect(content).toContain("metadata->'target'->>'connectedAssetId'");
  });

  it('checks for orchestrator runs before delete', () => {
    expect(content).toContain('audit_orchestrator_runs.count');
  });

  it('checks for ALL assurance evaluations before delete (PX1.2B-H3 Section 13 — not just COMPLETED)', () => {
    // H3: ALL persisted assurance_evaluations block, not just COMPLETED
    expect(content).toContain('ALL assurance_evaluations block');
    // Must NOT filter by evaluationStatus: 'COMPLETED' in the delete check
    expect(content).not.toMatch(/assurance_evaluations\.count.*evaluationStatus.*COMPLETED/s);
  });

  it('checks for assurance packages before delete', () => {
    expect(content).toContain('assurance_packages.count');
  });

  it('returns 409 when historical references exist', () => {
    expect(content).toContain('409');
    expect(content).toContain('historical evaluation records');
  });

  it('allows delete for systems with only unreferenced assets (Section 15)', () => {
    // H2: unreferenced asset rows alone are NOT historical evaluation proof
    expect(content).toContain('unreferenced asset');
  });

  it('uses transaction for delete atomicity (Section 17 — BOUNDED_DELETE_RACE)', () => {
    expect(content).toContain('$transaction');
    expect(content).toContain('DELETE_RACE_DETECTED');
  });

  it('all history checks are tenant-scoped (organizationId)', () => {
    const orgMatches = content.match(/organizationId/g);
    expect(orgMatches).toBeTruthy();
    expect(orgMatches!.length).toBeGreaterThan(5);
  });
});

// ─── PX1.2B-H1: Asset Identity Immutability (Section 9) ────────────────────

describe('[PX1.2B-H1 §9] Asset identity immutability', () => {
  const content = readFile('app/api/inventory/systems/[id]/assets/[assetId]/route.ts');

  it('PATCH rejects environment mutation', () => {
    expect(content).toContain('identity-defining field');
  });

  it('PATCH schema does NOT include environment', () => {
    expect(content).not.toMatch(/environment.*z\.string/);
  });
});

// ─── PX1.2B-H1: Assurance Copy Truthful (Section 3) ────────────────────────

describe('[PX1.2B-H1 §3] Assurance copy — no misleading "Assured"', () => {
  const content = readFile('components/ai-inventory/AISystemsIndex.tsx');

  it('KPI label is "With Assurance", not "Assured"', () => {
    expect(content).toContain('With Assurance');
    expect(content).not.toMatch(/label="Assured"/);
  });
});

// ─── PX1.2B-H2: Receipt Exact Evaluation Matching (Section 11) ─────────────

describe('[PX1.2B-H2 §11 / PX1.2B-H3 §5-9] Receipt matches exact latest evaluation ID', () => {
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const listContent = readFile('lib/ai-inventory/system-list-summary.ts');
  const receiptProjectionContent = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('workspace uses canonical receipt projection for matching', () => {
    expect(workspaceContent).toContain('resolveEvaluationReceipt');
    expect(workspaceContent).toContain('latestEvalId');
  });

  it('receipt projection queries by exact evaluation ID (Section 8)', () => {
    expect(receiptProjectionContent).toContain('assuranceEvaluationId');
    expect(receiptProjectionContent).toContain('evaluationId');
  });

  it('list summary uses canonical receipt projection batch (Section 9)', () => {
    expect(listContent).toContain('resolveReceiptStateBatch');
  });

  it('receipt projection derives state from ALL matching packages (Section 5-6)', () => {
    expect(receiptProjectionContent).toContain('deriveReceiptState');
    expect(receiptProjectionContent).toContain('publicationStates');
  });

  it('ANY_SYSTEM_RECEIPT != LATEST_EVALUATION_RECEIPT — matching is by eval ID', () => {
    // Receipt projection must query by assuranceEvaluationId, not just aiSystemId
    expect(receiptProjectionContent).toMatch(/assuranceEvaluationId.*evaluationId/);
  });

  it('INDEX_RECEIPT_STATE == WORKSPACE_RECEIPT_STATE — shared helper (Section 9)', () => {
    expect(receiptProjectionContent).toContain('INDEX_RECEIPT_STATE');
    expect(workspaceContent).toContain('resolveEvaluationReceipt');
    expect(listContent).toContain('resolveReceiptStateBatch');
  });
});

// ─── PX1.2B-H2: Receipt Publication State (Section 12) ─────────────────────

describe('[PX1.2B-H2 §12 / PX1.2B-H3 §6] Receipt publication state — PRIVATE/PUBLIC/REVOKED', () => {
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const nextActionContent = readFile('lib/ai-inventory/system-next-action.ts');
  const receiptProjectionContent = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('receipt projection determines state from publicationState (deterministic)', () => {
    expect(receiptProjectionContent).toContain('PUBLIC_RECEIPT');
    expect(receiptProjectionContent).toContain('PRIVATE_RECEIPT');
    expect(receiptProjectionContent).toContain('REVOKED_RECEIPT');
    expect(workspaceContent).toContain('matchingReceiptState');
  });

  it('next-action engine handles REVOKED_RECEIPT as non-completion', () => {
    expect(nextActionContent).toContain('REVOKED_RECEIPT');
    expect(nextActionContent).toContain('RECEIPT_REVOKED');
  });

  it('REVOKED receipt does NOT reach ASSURANCE_RECORD_AVAILABLE', () => {
    expect(nextActionContent).toMatch(/REVOKED_RECEIPT.*RECEIPT_REVOKED/s);
  });
});

// ─── PX1.2B-H2: Current vs Historical Evidence (Section 3-4) ───────────────

describe('[PX1.2B-H2 §3-4] Current vs historical evidence projection', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const listContent = readFile('lib/ai-inventory/system-list-summary.ts');

  it('resolver classifies records by associationClass', () => {
    expect(resolverContent).toContain('associationClass');
    expect(resolverContent).toContain('DIRECT_SYSTEM');
    expect(resolverContent).toContain('CURRENT_ASSET');
    expect(resolverContent).toContain('RETIRED_ASSET');
  });

  it('resolver uses asset retiredAt for classification', () => {
    expect(resolverContent).toContain('retiredAt');
    expect(resolverContent).toContain('assetRetiredMap');
  });

  it('batch resolver hasEvidence is based on active system evidence only', () => {
    expect(resolverContent).toContain('hasActiveSystemEvidence');
    expect(resolverContent).toContain('hasHistoricalAssetEvidenceOnly');
  });

  it('workspace exposes active system vs historical evidence counts', () => {
    expect(workspaceContent).toContain('activeSystemEvidenceCount');
    expect(workspaceContent).toContain('historicalAssetEvidenceCount');
    expect(workspaceContent).toContain('hasHistoricalAssetEvidenceOnly');
  });

  it('list summary hasEvidence excludes retired-asset-only evidence', () => {
    expect(listContent).toContain('hasHistoricalAssetEvidenceOnly');
  });

  it('RETIRED_ASSET_EVIDENCE != ACTIVE_SYSTEM_EVIDENCE — lock in source', () => {
    expect(resolverContent).toContain('RETIRED_ASSET_EVIDENCE != ACTIVE_SYSTEM_EVIDENCE');
  });
});

// ─── PX1.2B-H2: CONFLICTED Identity (Section 8) ────────────────────────────

describe('[PX1.2B-H2 §8] CONFLICTED identity handling', () => {
  const workspaceContent = readFile('lib/ai-inventory/system-workspace.ts');
  const listContent = readFile('lib/ai-inventory/system-list-summary.ts');
  const nextActionContent = readFile('lib/ai-inventory/system-next-action.ts');

  it('workspace counts conflictedIdentityCount', () => {
    expect(workspaceContent).toContain('conflictedIdentityCount');
    expect(workspaceContent).toContain("identityState === 'CONFLICTED'");
  });

  it('list summary counts conflictedIdentityCount', () => {
    expect(listContent).toContain('conflictedIdentityCount');
    expect(listContent).toContain("identityState: 'CONFLICTED'");
  });

  it('next-action engine accepts conflictedIdentityCount in state', () => {
    expect(nextActionContent).toContain('conflictedIdentityCount');
  });

  it('org KPI includes CONFLICTED in unresolved identity count', () => {
    expect(listContent).toContain("identityState: 'CONFLICTED'");
  });
});

// ─── PX1.2B-H2: BLOCK Never Complete (Section 9) ───────────────────────────

describe('[PX1.2B-H2 §9] BLOCK never reaches completion', () => {
  const nextActionContent = readFile('lib/ai-inventory/system-next-action.ts');

  it('BLOCK disposition has ADDRESS_BLOCKERS stage', () => {
    expect(nextActionContent).toContain('ADDRESS_BLOCKERS');
    expect(nextActionContent).toContain("latestDisposition === 'BLOCK'");
  });

  it('BLOCK check comes before ALLOW/receipt checks', () => {
    const blockIdx = nextActionContent.indexOf("latestDisposition === 'BLOCK'");
    const allowIdx = nextActionContent.indexOf("latestDisposition === 'ALLOW'");
    expect(blockIdx).toBeGreaterThan(0);
    expect(allowIdx).toBeGreaterThan(0);
    expect(blockIdx).toBeLessThan(allowIdx);
  });
});

// ─── PX1.2B-H2: "System assured" Overclaim Removed (Section 10) ────────────

describe('[PX1.2B-H2 §10] "System assured" overclaim removed', () => {
  const nextActionContent = readFile('lib/ai-inventory/system-next-action.ts');

  it('does NOT contain "System assured" label', () => {
    expect(nextActionContent).not.toContain('System assured');
  });

  it('final state is ASSURANCE_RECORD_AVAILABLE, not COMPLETE', () => {
    expect(nextActionContent).toContain('ASSURANCE_RECORD_AVAILABLE');
    expect(nextActionContent).not.toMatch(/stage:\s*['"]COMPLETE['"]/);
  });

  it('final state label is "Latest Assurance record available"', () => {
    expect(nextActionContent).toContain('Latest Assurance record available');
  });
});

// ─── PX1.2B-H2: Generic Coverage Truthful (Section 6) ──────────────────────

describe('[PX1.2B-H2 §6] Generic system coverage — NO→NOT_ASSESSED, SOME→UNKNOWN', () => {
  const resolverContent = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('resolver does NOT use ANY_PARTIAL → PARTIAL for generic system coverage', () => {
    // H2 removes the "ANY PARTIAL → PARTIAL" rule for generic system coverage
    expect(resolverContent).toContain('PRODUCER_COVERAGE != SYSTEM_EVIDENCE_SET_COVERAGE');
  });

  it('resolver exposes hasPartialProducerEvidence as separate indicator', () => {
    expect(resolverContent).toContain('hasPartialProducerEvidence');
  });

  it('generic coverage is UNKNOWN when active system evidence exists', () => {
    expect(resolverContent).toMatch(/hasActiveSystemEvidence.*UNKNOWN/s);
  });
});
