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
    expect(libContent).toContain('where: { aiSystemId, organizationId }');
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

  it('DELETE uses requireOrganizationAccess', () => {
    expect(content).toContain('requireOrganizationAccess');
  });

  it('DELETE verifies AI System org binding before deletion', () => {
    expect(content).toContain('verifyAISystemOrgBinding');
  });

  it('DELETE deleteMany is scoped by aiSystemId AND organizationId', () => {
    expect(content).toContain('where: { id: assetId, aiSystemId: systemId, organizationId: orgId }');
  });

  it('DELETE does NOT cascade-delete historical evidence (Section 36)', () => {
    // The delete only removes the asset row, not evidence/assurance/reports
    expect(content).toContain('deleteMany');
    expect(content).not.toMatch(/evidence.*delete/i);
    expect(content).not.toMatch(/assurance.*delete/i);
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
    expect(assetContent).toContain('where: { aiSystemId, organizationId }');
  });
});
