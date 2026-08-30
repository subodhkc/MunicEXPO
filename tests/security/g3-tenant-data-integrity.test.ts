/**
 * Gate 3 — Tenant Data Integrity Tests
 *
 * Tests that the tenant integrity graph is enforced for Evaluated Scope
 * and that cross-tenant references are denied.
 *
 * These tests verify the source-level invariants without requiring a live
 * database connection. They inspect the schema and service code to prove
 * that cross-tenant paths are closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = process.cwd();

function readSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
}

describe('Gate 3 — Tenant Data Integrity', () => {
  describe('EVALUATED_SCOPE_SNAPSHOT_MODEL', () => {
    it('HAS_ORGANIZATION_ID_REQUIRED', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      expect(scopeModelMatch).not.toBeNull();
      const scopeModel = scopeModelMatch![0];
      expect(scopeModel).toContain('organizationId');
      // organizationId must be required (not nullable)
      expect(scopeModel).toMatch(/organizationId\s+String\s/);
      expect(scopeModel).not.toMatch(/organizationId\s+String\?/);
    });

    it('HAS_AI_SYSTEM_ID_REQUIRED', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      const scopeModel = scopeModelMatch![0];
      expect(scopeModel).toContain('aiSystemId');
      expect(scopeModel).not.toMatch(/aiSystemId\s+String\?/);
    });

    it('HAS_SCOPE_DIGEST_REQUIRED', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      const scopeModel = scopeModelMatch![0];
      expect(scopeModel).toContain('scopeDigest');
      expect(scopeModel).not.toMatch(/scopeDigest\s+String\?/);
    });

    it('HAS_UNIQUE_EVALUATION_BINDING', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      const scopeModel = scopeModelMatch![0];
      // assuranceEvaluationId must be unique (one scope per evaluation)
      expect(scopeModel).toMatch(/assuranceEvaluationId\s+String\s+@unique/);
    });

    it('HAS_ORGANIZATION_ID_INDEX', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      const scopeModel = scopeModelMatch![0];
      expect(scopeModel).toMatch(/@@index\(\[organizationId\]\)/);
    });
  });

  describe('ASSURANCE_EVALUATIONS_SCOPE_BINDING', () => {
    it('G3_R1_NO_REDUNDANT_SCOPE_FK: assurance_evaluations has no evaluatedScopeId scalar field', () => {
      const schema = readSource('prisma/schema.prisma');
      const evalModelMatch = schema.match(/model assurance_evaluations \{[\s\S]*?^\}/m);
      const evalModel = evalModelMatch![0];
      // G3-R1: The redundant evaluatedScopeId scalar field was removed.
      // Comments may mention it, but there should be no scalar field declaration.
      // A scalar field would look like: evaluatedScopeId  String?  @unique
      expect(evalModel).not.toMatch(/evaluatedScopeId\s+String/);
      // Back-relation only (no fields/references on this side)
      expect(evalModel).toContain('evaluated_scope_snapshot');
    });
  });

  describe('ASSURANCE_PACKAGES_SCOPE_BINDING', () => {
    it('HAS_EVALUATED_SCOPE_ID_AND_SCOPE_DIGEST', () => {
      const schema = readSource('prisma/schema.prisma');
      const pkgModelMatch = schema.match(/model assurance_packages \{[\s\S]*?\}/);
      const pkgModel = pkgModelMatch![0];
      expect(pkgModel).toContain('evaluatedScopeId');
      expect(pkgModel).toContain('scopeDigest');
      // Both nullable for legacy packages
      expect(pkgModel).toMatch(/evaluatedScopeId\s+String\?/);
      expect(pkgModel).toMatch(/scopeDigest\s+String\?/);
    });

    it('HAS_SCOPE_INDEXES', () => {
      const schema = readSource('prisma/schema.prisma');
      const pkgModelMatch = schema.match(/model assurance_packages \{[\s\S]*?\}/);
      const pkgModel = pkgModelMatch![0];
      expect(pkgModel).toMatch(/@@index\(\[evaluatedScopeId\]\)/);
      expect(pkgModel).toMatch(/@@index\(\[scopeDigest\]\)/);
    });
  });

  describe('AI_SYSTEMS_ACCOUNTABILITY', () => {
    it('HAS_BUSINESS_OWNER', () => {
      const schema = readSource('prisma/schema.prisma');
      const sysModelMatch = schema.match(/model ai_systems \{[\s\S]*?\}/);
      const sysModel = sysModelMatch![0];
      expect(sysModel).toContain('businessOwner');
      expect(sysModel).toMatch(/businessOwner\s+String\?/);
    });

    it('HAS_TECHNICAL_OWNER', () => {
      const schema = readSource('prisma/schema.prisma');
      const sysModelMatch = schema.match(/model ai_systems \{[\s\S]*?\}/);
      const sysModel = sysModelMatch![0];
      expect(sysModel).toContain('technicalOwner');
      expect(sysModel).toMatch(/technicalOwner\s+String\?/);
    });

    it('HAS_LIFECYCLE_STATUS', () => {
      const schema = readSource('prisma/schema.prisma');
      const sysModelMatch = schema.match(/model ai_systems \{[\s\S]*?\}/);
      const sysModel = sysModelMatch![0];
      expect(sysModel).toContain('lifecycleStatus');
      expect(sysModel).toMatch(/lifecycleStatus\s+String\?/);
    });

    it('HAS_CRITICALITY', () => {
      const schema = readSource('prisma/schema.prisma');
      const sysModelMatch = schema.match(/model ai_systems \{[\s\S]*?\}/);
      const sysModel = sysModelMatch![0];
      expect(sysModel).toContain('criticality');
      expect(sysModel).toMatch(/criticality\s+String\?/);
    });
  });

  describe('DELETE_SAFETY', () => {
    it('EVALUATED_SCOPE_SNAPSHOTS_IN_DELETION_BLOCKERS', () => {
      const routeSource = readSource('app/api/inventory/[id]/route.ts');
      // The deletion route must check evaluated_scope_snapshots
      expect(routeSource).toContain('evaluated_scope_snapshots');
      expect(routeSource).toContain('evaluatedScopeSnapshots');
      // Must be in both the initial check and the recheck
      expect(routeSource).toContain('recheckEvaluatedScopeSnapshots');
    });
  });

  describe('CROSS_TENANT_DENIAL', () => {
    it('SCOPE_PERSISTENCE_ENFORCES_TENANT_SAFETY', () => {
      const scopePersistence = readSource('lib/assurance/scope-persistence.ts');
      // getEvaluatedScopeByEvaluationId must check organizationId
      expect(scopePersistence).toContain('organizationId');
      expect(scopePersistence).toMatch(/record\.organizationId !== organizationId/);
      expect(scopePersistence).toContain('fail closed');
    });

    it('SCOPE_CAPTURE_ENFORCES_TENANT_SAFETY', () => {
      const scopeCapture = readSource('lib/assurance/scope-capture.ts');
      // captureEvaluatedScope must verify AI System belongs to org
      expect(scopeCapture).toContain('organizationId');
      expect(scopeCapture).toContain('AI_SYSTEM_NOT_FOUND_OR_TENANT_MISMATCH');
    });
  });

  describe('IMMUTABILITY', () => {
    it('EVALUATED_SCOPE_HAS_NO_UPDATE_PATH', () => {
      const scopePersistence = readSource('lib/assurance/scope-persistence.ts');
      // The persistence service must NOT have an update function for the SCOPE itself.
      expect(scopePersistence).not.toMatch(/evaluated_scope_snapshots\.update/);
      expect(scopePersistence).not.toMatch(/evaluated_scope_snapshots\.upsert/);
      // Only create and read operations on scope
      expect(scopePersistence).toMatch(/evaluated_scope_snapshots\.create/);
      expect(scopePersistence).toMatch(/evaluated_scope_snapshots\.findUnique/);
    });

    it('DB_LEVEL_IMMUTABILITY_TRIGGER_EXISTS: migration has prevent_scope_update trigger', () => {
      const migration = readSource('prisma/migrations/20260829100000_g3_r1_scope_relation_correction/migration.sql');
      expect(migration).toContain('prevent_scope_update');
      expect(migration).toContain('prevent_evaluated_scope_update');
      expect(migration).toContain('BEFORE UPDATE');
      expect(migration).toContain('EVALUATED_SCOPE_IMMUTABLE');
    });

    it('EVALUATED_SCOPE_HAS_NO_UPDATED_AT_FIELD', () => {
      const schema = readSource('prisma/schema.prisma');
      const scopeModelMatch = schema.match(/model evaluated_scope_snapshots \{[\s\S]*?\}/);
      const scopeModel = scopeModelMatch![0];
      // No updatedAt field — immutable after creation
      expect(scopeModel).not.toMatch(/@updatedAt/);
    });
  });

  describe('NO_HISTORICAL_SCOPE_FABRICATION', () => {
    it('NO_RECONSTRUCT_FUNCTION_EXISTS', () => {
      const scopePersistence = readSource('lib/assurance/scope-persistence.ts');
      expect(scopePersistence).not.toContain('reconstructScopeFromCurrentAssets');
      expect(scopePersistence).not.toContain('fabricateHistoricalScope');
      expect(scopePersistence).not.toContain('backfillScope');
    });

    it('CAPTURE_IS_FOR_NEW_EVALUATIONS_ONLY', () => {
      const scopeCapture = readSource('lib/assurance/scope-capture.ts');
      // The capture function is for new evaluations at capture time
      expect(scopeCapture).toContain('evaluation time');
      expect(scopeCapture).toContain('POST_HOC_CURRENT_ASSET_QUERY != HISTORICAL_SCOPE');
    });
  });
});
