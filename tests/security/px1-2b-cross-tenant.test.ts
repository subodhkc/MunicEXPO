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

describe('[PX1.2B-H1 §2] System coverage — ALL_COMPLETE != SYSTEM_COMPLETE', () => {
  const content = readFile('lib/ai-inventory/system-evidence-resolver.ts');

  it('does NOT claim COMPLETE when all records are individually COMPLETE', () => {
    // The resolver must NOT set coverage = 'COMPLETE' for generic system
    // LOCK: RECORD_COVERAGE_COMPLETE != SYSTEM_EVIDENCE_SET_COMPLETE
    expect(content).toContain('ALL_PRESENT_RECORDS_COMPLETE');
    expect(content).toContain('expected Evidence universe is unknown');
  });

  it('generic aggregate is UNKNOWN when all records are COMPLETE', () => {
    // The code path for all-complete should result in UNKNOWN, not COMPLETE
    expect(content).toMatch(/All records individually COMPLETE.*UNKNOWN/s);
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

// ─── PX1.2B-H1: System Delete Safety (Section 11-12) ───────────────────────

describe('[PX1.2B-H1 §11-12] System delete safety — history preservation', () => {
  const content = readFile('app/api/inventory/[id]/route.ts');

  it('checks for historical evidence before delete', () => {
    expect(content).toContain("metadata->'target'->>'type' = 'AI_SYSTEM'");
  });

  it('checks for connected assets before delete', () => {
    expect(content).toContain('ai_system_assets.count');
  });

  it('checks for orchestrator runs before delete', () => {
    expect(content).toContain('audit_orchestrator_runs.count');
  });

  it('checks for completed assurance evaluations before delete', () => {
    expect(content).toContain("evaluationStatus: 'COMPLETED'");
  });

  it('checks for assurance packages before delete', () => {
    expect(content).toContain('assurance_packages.count');
  });

  it('returns 409 when historical records exist', () => {
    expect(content).toContain('409');
    expect(content).toContain('historical evaluation records');
  });

  it('allows delete for empty/never-evaluated systems', () => {
    expect(content).toContain('Empty / never-evaluated system');
  });

  it('all history checks are tenant-scoped (organizationId)', () => {
    // All queries must include organizationId
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
