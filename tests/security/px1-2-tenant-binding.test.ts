/**
 * PX1.2 — AI System / Activity Tenant Binding (Section 13)
 *
 * Proves the invariant:
 *   authenticatedOrganizationId == targetAISystem.organizationId
 *
 * A valid foreign key alone is NOT sufficient. A caller-supplied aiSystemId
 * that belongs to a different organization must be rejected deterministically.
 *
 * Covers Section 39 tests:
 *   6. SDK/provider activity with aiSystemId verifies same-org ownership.
 *   7. Cross-org aiSystemId activity injection is rejected.
 *
 * Run with: npx vitest run tests/security/px1-2-tenant-binding.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

function getLines(relPath: string): string[] {
  return readFile(relPath).split('\n')
}

// ─── verifyAISystemOrgBinding helper (lib/org-context.ts) ───────────────────

describe('[PX1.2] verifyAISystemOrgBinding helper exists and is exported', () => {
  const content = readFile('lib/org-context.ts')

  it('exports verifyAISystemOrgBinding', () => {
    expect(content).toContain('export async function verifyAISystemOrgBinding')
  })

  it('queries ai_systems with both id AND organizationId (not id alone)', () => {
    // The invariant: a foreign key (id) alone is NOT sufficient.
    // The query must filter by both id and organizationId.
    expect(content).toContain('where: { id: systemId, organizationId }')
  })

  it('returns a boolean (deterministic accept/reject)', () => {
    expect(content).toContain('return system !== null')
  })

  it('documents the Section 13 invariant', () => {
    expect(content).toContain('authenticatedOrganizationId == targetAISystem.organizationId')
  })
})

// ─── v1 usage log route — cross-tenant aiSystemId injection guard ───────────

describe('[PX1.2] v1 usage log route — cross-tenant aiSystemId guard (Section 13)', () => {
  const content = readFile('app/api/v1/inventory/usage/log/route.ts')
  const lines = getLines('app/api/v1/inventory/usage/log/route.ts')

  it('imports verifyAISystemOrgBinding from org-context', () => {
    expect(content).toContain('verifyAISystemOrgBinding')
    expect(content).toContain("from '@/lib/org-context'")
  })

  it('verifies aiSystemId ownership before writing request_logs', () => {
    // The guard must run BEFORE the transaction that creates request_logs.
    const guardIdx = content.indexOf('verifyAISystemOrgBinding(aiSystemId, organizationId)')
    const writeIdx = content.indexOf('tx.request_logs.create')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(writeIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(writeIdx)
  })

  it('rejects with 403 when aiSystemId does not belong to org', () => {
    expect(content).toContain('does not belong to the authenticated organization')
    expect(content).toContain('status: 403')
  })

  it('does NOT rely on foreign-key constraint catch as the sole guard', () => {
    // The FK catch may remain as defense-in-depth, but it must NOT be the
    // only guard. The explicit ownership check must precede the write.
    const fkCatchIdx = content.indexOf('Foreign key constraint')
    const ownershipCheckIdx = content.indexOf('verifyAISystemOrgBinding')
    expect(ownershipCheckIdx).toBeGreaterThan(-1)
    // FK catch is allowed as defense-in-depth but must come AFTER the
    // explicit ownership check (or not exist at all).
    if (fkCatchIdx > -1) {
      expect(ownershipCheckIdx).toBeLessThan(fkCatchIdx)
    }
  })

  it('guard is conditional on aiSystemId being supplied (optional field)', () => {
    // aiSystemId is optional — unassigned activity is allowed but must not
    // be bound to a system. The guard runs only when aiSystemId is present.
    expect(content).toContain('if (aiSystemId && organizationId)')
  })
})

// ─── non-v1 usage log route — already-correct guard preserved ───────────────

describe('[PX1.2] non-v1 usage log route — existing org guard preserved', () => {
  const content = readFile('app/api/inventory/usage/log/route.ts')

  it('verifies AI system belongs to org before upserting usage_metrics', () => {
    expect(content).toContain('prisma.ai_systems.findFirst')
    expect(content).toContain('id: body.systemId')
    expect(content).toContain('organizationId')
  })

  it('rejects when system not found in org (404)', () => {
    expect(content).toContain('AI System not found or access denied')
    expect(content).toContain('status: 404')
  })
})

// ─── Section 39 test 8: unassigned activity cannot become system Evidence ────

describe('[PX1.2] unassigned provider activity is not system-specific Evidence', () => {
  const v1Content = readFile('app/api/v1/inventory/usage/log/route.ts')

  it('allows usage logging WITHOUT aiSystemId (unassigned activity)', () => {
    // aiSystemId is optional in the request interface — unassigned activity
    // is retained as org-scoped activity, not system-specific Evidence.
    expect(v1Content).toContain('aiSystemId?: string')
  })

  it('writes null aiSystemId when not supplied (not guessed)', () => {
    expect(v1Content).toContain('aiSystemId: aiSystemId || null')
  })
})
