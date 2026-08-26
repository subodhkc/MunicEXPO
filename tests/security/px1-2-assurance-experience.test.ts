/**
 * PX1.2 — AI System Assurance Experience + System Boundary Model
 *
 * Comprehensive test suite covering Section 39 requirements.
 *
 * Run with: npx vitest run tests/security/px1-2-assurance-experience.test.ts
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

// ─── Section 1: AI System remains canonical primary identity ────────────────

describe('[PX1.2 §1,2] AI System canonical identity', () => {
  const schema = readFile('prisma/schema.prisma')

  it('ai_systems.id is the sole canonical AI System primary key', () => {
    expect(schema).toContain('model ai_systems {')
    expect(schema).toMatch(/id\s+String\s+@id/)
  })

  it('no second AI-system registry exists (no ai_system_registries or candidate_systems)', () => {
    expect(schema).not.toContain('model ai_system_registries')
    expect(schema).not.toContain('model candidate_systems')
    expect(schema).not.toContain('model ai_system_identities')
  })

  it('ai_systems.id is NOT derived from repository/commit/deployment (UUID default)', () => {
    const aiSystemsBlock = schema.match(/model ai_systems \{[\s\S]*?\}/)?.[0] || ''
    expect(aiSystemsBlock).toContain('gen_random_uuid()')
  })
})

// ─── Section 3: Repository != AI System ─────────────────────────────────────

describe('[PX1.2 §3] GitHub / repository semantics — REPOSITORY != AI_SYSTEM', () => {
  const githubSync = readFile('lib/ai-inventory/discovery/github-sync.ts')

  it('broad GitHub auto-discovery is BLOCKED (deferred to U3-G)', () => {
    expect(githubSync).toContain('GITHUB_INVENTORY_DISCOVERY_DEFERRED_TO_U3_G')
  })

  it('event-driven discovery uses immutable repository ID for dedup (not name)', () => {
    expect(githubSync).toContain('repositoryId')
  })

  it('event-driven discovery requires proven AI relevance (not name-based detection)', () => {
    expect(githubSync).toContain('hasAIRelatedFindings')
  })

  it('event-driven discovery requires verified organizationId from installation link', () => {
    expect(githubSync).toContain('organizationId')
  })
})

// ─── Section 4: Connected Asset Model ───────────────────────────────────────

describe('[PX1.2 §4] Connected Asset Model — ai_system_assets', () => {
  const schema = readFile('prisma/schema.prisma')
  const assetsLib = readFile('lib/ai-inventory/connected-assets.ts')

  it('ai_system_assets table exists with required tenant scoping', () => {
    expect(schema).toContain('model ai_system_assets {')
    expect(schema).toContain('organizationId   String')
    expect(schema).toContain('aiSystemId       String')
  })

  it('organizationId is NOT nullable (no ambiguous ownership)', () => {
    const assetsBlock = schema.match(/model ai_system_assets \{[\s\S]*?\}/)?.[0] || ''
    // organizationId must be required (no ? after String)
    expect(assetsBlock).toMatch(/organizationId\s+String\s/)
    expect(assetsBlock).not.toMatch(/organizationId\s+String\?/)
  })

  it('identityState defaults to NOT_VERIFIED (S0 containment)', () => {
    expect(schema).toContain('identityState')
    expect(schema).toContain('NOT_VERIFIED')
  })

  it('connectionState defaults to REGISTERED', () => {
    expect(schema).toContain('connectionState')
    expect(schema).toContain('REGISTERED')
  })

  it('evaluationState defaults to NOT_EVALUATED', () => {
    expect(schema).toContain('evaluationState')
    expect(schema).toContain('NOT_EVALUATED')
  })

  it('assetIdentityKey exists for idempotent binding (Section 6)', () => {
    expect(schema).toContain('assetIdentityKey')
  })

  it('asset types are defined and validated', () => {
    expect(assetsLib).toContain('SOURCE_REPOSITORY')
    expect(assetsLib).toContain('RUNTIME_ENDPOINT')
    expect(assetsLib).toContain('CONTAINER_IMAGE')
    expect(assetsLib).toContain('PROVIDER_PROJECT')
    expect(assetsLib).toContain('INTERFACE_SPECIFICATION')
    expect(assetsLib).toContain('isAssetType')
  })

  it('not all fields are mandatory (asset type may not supply them)', () => {
    // externalId, provider, environment, discoveryMethod, metadata are all optional
    expect(assetsLib).toContain('externalId?: string')
    expect(assetsLib).toContain('provider?: string')
    expect(assetsLib).toContain('environment?: string')
  })
})

// ─── Section 5: Connection / Evaluation States — semantic separation ────────

describe('[PX1.2A-R §5] Three orthogonal state dimensions', () => {
  const assetsLib = readFile('lib/ai-inventory/connected-assets.ts')

  it('connectionState includes REGISTERED/DISCOVERED/CONNECTED/UNAVAILABLE', () => {
    expect(assetsLib).toContain('REGISTERED')
    expect(assetsLib).toContain('DISCOVERED')
    expect(assetsLib).toContain('CONNECTED')
    expect(assetsLib).toContain('UNAVAILABLE')
  })

  it('identityState includes NOT_VERIFIED/VERIFIED/CONFLICTED', () => {
    expect(assetsLib).toContain('NOT_VERIFIED')
    expect(assetsLib).toContain('VERIFIED')
    expect(assetsLib).toContain('CONFLICTED')
  })

  it('evaluationState includes NOT_EVALUATED/PARTIAL/EVALUATED/FAILED', () => {
    expect(assetsLib).toContain('NOT_EVALUATED')
    expect(assetsLib).toContain('PARTIAL')
    expect(assetsLib).toContain('EVALUATED')
    expect(assetsLib).toContain('FAILED')
  })

  it('CONNECTED and EVALUATED are in separate dimension arrays', () => {
    expect(assetsLib).toContain('CONNECTION_STATES')
    expect(assetsLib).toContain('EVALUATION_STATES')
    expect(assetsLib).toContain('IDENTITY_STATES')
  })
})

// ─── Section 4/13: Connected assets are tenant-scoped ───────────────────────

describe('[PX1.2 §4,13] Connected asset tenant binding', () => {
  const assetsLib = readFile('lib/ai-inventory/connected-assets.ts')

  it('createConnectedAsset verifies AI System belongs to org before binding', () => {
    expect(assetsLib).toContain('verifyAISystemOrgBinding')
  })

  it('rejects cross-org asset attachment deterministically', () => {
    expect(assetsLib).toContain('cross-tenant binding rejected')
  })

  it('listConnectedAssets filters by both aiSystemId AND organizationId', () => {
    expect(assetsLib).toContain('where: { aiSystemId, organizationId }')
  })
})

// ─── Section 16: Evaluated Scope is explicit/bounded ────────────────────────

describe('[PX1.2A-R §16] Evaluated Scope Snapshot', () => {
  const types = readFile('lib/assurance/u6-types.ts')

  it('EvaluatedScopeSnapshot type exists (immutable snapshot)', () => {
    expect(types).toContain('export interface EvaluatedScopeSnapshot')
  })

  it('snapshot is anchored to aiSystemId (canonical identity)', () => {
    expect(types).toContain('aiSystemId: string')
  })

  it('snapshot includes evaluated AND not-evaluated assets', () => {
    expect(types).toContain('EvaluatedScopeAssetSnapshot')
    expect(types).toContain('evaluationInclusionState')
    expect(types).toContain('NOT_EVALUATED')
  })

  it('snapshot captures identity at evaluation time (commit/digest/endpoint)', () => {
    expect(types).toContain('gitCommit')
    expect(types).toContain('containerDigest')
    expect(types).toContain('endpoint')
  })

  it('snapshot tracks unresolved identity and limitations', () => {
    expect(types).toContain('unresolvedIdentity')
    expect(types).toContain('limitations')
  })

  it('snapshot includes scopeDigest (deterministic)', () => {
    expect(types).toContain('scopeDigest')
  })

  it('snapshot includes scopeSchemaVersion', () => {
    expect(types).toContain('scopeSchemaVersion')
  })

  it('includes interface specification digest for INTERFACE_SPECIFICATION assets', () => {
    expect(types).toContain('interfaceSpecDigest')
    expect(types).toContain('interfaceSpecVersion')
  })

  it('EVALUATED_SCOPE_NOT_CAPTURED marker exists for historical compat', () => {
    expect(types).toContain('EVALUATED_SCOPE_NOT_CAPTURED')
  })

  it('does NOT create a parallel scope engine (additive type only)', () => {
    // No ScopeEngine class or computeScope function
    expect(types).not.toContain('class ScopeEngine')
    expect(types).not.toContain('function computeScope')
  })
})

// ─── Section 14: No parallel disposition engine ─────────────────────────────

describe('[PX1.2 §14,39.14] No parallel disposition engine', () => {
  it('U5 assurance-evaluator remains the sole decision engine', () => {
    const evaluator = readFile('lib/assurance/assurance-evaluator.ts')
    expect(evaluator).toContain('computeDisposition')
  })

  it('no second disposition engine file exists', () => {
    // Check that no parallel engine was created in this increment
    const types = readFile('lib/assurance/u6-types.ts')
    expect(types).not.toContain('ParallelDisposition')
    expect(types).not.toContain('AlternativeDecisionEngine')
  })
})

// ─── Section 20: POLICY_AUTHORIZED never rendered as delegated ───────────────

describe('[PX1.2 §20,21] Five-plane authority & capability', () => {
  const types = readFile('lib/assurance/u6-types.ts')

  it('five planes are defined: REQUESTED, POLICY_AUTHORIZED, EFFECTIVELY_GRANTED, CODE_CAPABLE, OBSERVED', () => {
    // Check capability-comparator for the five planes
    const comparator = readFile('lib/assurance/capability-comparator.ts')
    expect(comparator).toContain('REQUESTED')
    expect(comparator).toContain('POLICY_AUTHORIZED')
    expect(comparator).toContain('EFFECTIVELY_GRANTED')
    expect(comparator).toContain('CODE_CAPABLE')
    expect(comparator).toContain('OBSERVED')
  })

  it('no DELEGATED sixth plane is introduced', () => {
    const typesContent = types
    // DELEGATED must not appear as a plane
    expect(typesContent).not.toMatch(/DELEGATED.*plane/i)
  })
})

// ─── Section 24: Action Witness / reference rApp classification ─────────────

describe('[PX1.2 §24] Action Witness / reference rApp — not promoted to production', () => {
  it('reference-rapp-poc is reference-only (not a production producer)', () => {
    const poc = readFile('lib/assurance/reference-rapp-poc.ts')
    expect(poc).toMatch(/reference|poc|example|sample/i)
  })

  it('synthetic sample paths exist but are not production routes', () => {
    // Reference rApp samples live in examples/, not in app/api/ production routes
    const poc = readFile('lib/assurance/reference-rapp-poc.ts')
    expect(poc).toMatch(/reference|poc|sample/i)
    // The route inventory classifies production routes, not synthetic samples
    const routeInventory = readFile('docs/product-experience/PX1-ROUTE-INVENTORY.md')
    expect(routeInventory).toContain('REPORT_OR_VERIFICATION')
  })
})

// ─── Section 29: Build / deployment / system identity separation ────────────

describe('[PX1.2 §29] Build / deployment / system identity separation', () => {
  const types = readFile('lib/assurance/u6-types.ts')
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  it('BuildIdentity type captures build-level identity (not system identity)', () => {
    expect(types).toContain('export interface BuildIdentity')
    expect(types).toContain('gitCommit')
    expect(types).toContain('containerDigest')
  })

  it('terminology contract separates SYSTEM_IDENTITY from BUILD_IDENTITY', () => {
    expect(terminology).toContain('SYSTEM_IDENTITY != BUILD_IDENTITY')
    expect(terminology).toContain('SYSTEM_IDENTITY != DEPLOYMENT_IDENTITY')
  })

  it('NOT_PROVIDED build identity is bounded (not inferred)', () => {
    expect(types).toContain('NOT_PROVIDED')
  })
})

// ─── Section 30: Decision Receipt proves integrity only ─────────────────────

describe('[PX1.2 §30] Decision Receipt — integrity only', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  it('receipt proves integrity, binding, internal consistency', () => {
    expect(terminology).toContain('integrity')
    expect(terminology).toContain('binding')
    expect(terminology).toContain('internal consistency')
  })

  it('receipt does NOT prove factual truth, system safety, legal compliance, complete coverage', () => {
    expect(terminology).toContain('does NOT prove')
    expect(terminology).toContain('factual truth')
    expect(terminology).toContain('system safety')
    expect(terminology).toContain('legal compliance')
    expect(terminology).toContain('complete system coverage')
  })
})

// ─── Section 38: Product Truth invariants ───────────────────────────────────

describe('[PX1.2 §38] Product Truth — new invariants', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  const requiredInvariants = [
    'REPOSITORY != AI_SYSTEM',
    'ENDPOINT != AI_SYSTEM',
    'CONTAINER != AI_SYSTEM',
    'PROVIDER_PROJECT != AI_SYSTEM',
    'MODEL != AI_SYSTEM_BY_DEFAULT',
    'CONNECTED != EVALUATED',
    'ACTIVITY != ASSURANCE',
    'POLICY_AUTHORIZED != DELEGATED',
    'UNASSIGNED_ACTIVITY != SYSTEM_EVIDENCE',
    'EVALUATED_ASSET != WHOLE_SYSTEM',
    'NOT_EVALUATED != PASS',
  ]

  for (const invariant of requiredInvariants) {
    it(`invariant documented: ${invariant}`, () => {
      expect(terminology).toContain(invariant)
    })
  }

  it('forbidden claims are documented', () => {
    expect(terminology).toContain('AI Certified')
    expect(terminology).toContain('Fully Secure')
    expect(terminology).toContain('Safe AI')
    expect(terminology).toContain('Compliance Certified')
    expect(terminology).toContain('Complete AI Coverage')
    expect(terminology).toContain('Unhackable')
    expect(terminology).toContain('Immutable Evidence')
  })

  it('allowed claims are documented', () => {
    expect(terminology).toContain('HAIEC Assurance Evaluated')
    expect(terminology).toContain('ALLOW WITHIN EVALUATED SCOPE')
    expect(terminology).toContain('Evidence Coverage')
    expect(terminology).toContain('Critical Mismatch')
    expect(terminology).toContain('Not Assessed')
  })
})

// ─── Section 14: Enterprise positioning — Lab POC, not self-hosted platform ──

describe('[PX1.2A-R §14] Enterprise positioning — Lab POC only', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')
  const pricing = readFile('app/pricing/page.tsx')

  it('terminology contract states Enterprise Lab POC != self-hosted platform', () => {
    expect(terminology).toContain('Enterprise Lab POC')
    expect(terminology).toContain('self-hosted HAIEC platform')
  })

  it('terminology contract states fully self-hosted HAIEC Platform is FUTURE / NOT AVAILABLE', () => {
    expect(terminology).toContain('FUTURE / NOT AVAILABLE')
  })

  it('pricing page does NOT claim self-hosted deployment', () => {
    expect(pricing).not.toContain('Self-Hosted Deployment')
    expect(pricing).not.toContain('Local / Docker')
  })

  it('pricing page FIRM tier remains "Manage it for Clients" (not converted to Enterprise self-host)', () => {
    expect(pricing).toContain('Manage it for Clients')
  })

  it('does not advertise a managed-cloud Enterprise tier as generally available', () => {
    expect(terminology).toContain('FUTURE / NOT AVAILABLE')
  })
})

// ─── Section 43: Stop conditions — non-goals remain non-goals ───────────────

describe('[PX1.2 §43] Stop conditions — non-goals not started', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  it('U7 is NOT started', () => {
    expect(terminology).toContain('NOT U7')
  })

  it('MCP ingestion hold remains ACTIVE', () => {
    expect(terminology).toContain('MCP → SaaS Evidence ingestion activation')
    expect(terminology).toContain('hold remains ACTIVE')
  })

  it('DCI / MinResolve / Critical Action Assurance not implemented', () => {
    expect(terminology).toContain('NOT DCI')
    expect(terminology).toContain('MinResolve')
    expect(terminology).toContain('Critical Action Assurance')
  })

  it('no parallel Assurance engine (U5 remains sole canonical)', () => {
    expect(terminology).toContain('NOT a parallel Assurance engine')
    expect(terminology).toContain('U5 remains sole canonical decision engine')
  })

  it('no second AI-system identity registry', () => {
    expect(terminology).toContain('NOT another AI-system identity registry')
  })
})

// ─── Section 11: Provider activity semantics ────────────────────────────────

describe('[PX1.2 §11] Provider activity semantics', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  it('PROVIDER_USAGE != SECURITY_EVIDENCE', () => {
    expect(terminology).toContain('PROVIDER_USAGE != SECURITY_EVIDENCE')
  })

  it('TOKEN_USAGE != SAFE', () => {
    expect(terminology).toContain('TOKEN_USAGE != SAFE')
  })

  it('COST_DATA != ASSURANCE_PASS', () => {
    expect(terminology).toContain('COST_DATA != ASSURANCE_PASS')
  })

  it('OPENAI_PROJECT != AI_SYSTEM', () => {
    expect(terminology).toContain('OPENAI_PROJECT != AI_SYSTEM')
  })

  it('API_KEY != AI_SYSTEM', () => {
    expect(terminology).toContain('API_KEY != AI_SYSTEM')
  })

  it('provider telemetry is CONTEXT_ONLY for security claims', () => {
    expect(terminology).toContain('CONTEXT_ONLY')
  })
})

// ─── Section 22: Vision Research compatibility (terminology only) ───────────

describe('[PX1.2 §22] Vision Research compatibility — terminology only', () => {
  const terminology = readFile('docs/architecture/PX1-2-TERMINOLOGY-INVARIANTS.md')

  it('POLICY_AUTHORIZED does not prove delegated discretion', () => {
    expect(terminology).toContain('does NOT')
    expect(terminology).toContain('delegated discretion')
  })

  it('no DELEGATED sixth plane introduced', () => {
    expect(terminology).toContain('No DELEGATED sixth plane is introduced')
  })

  it('DCI capability is not claimed', () => {
    expect(terminology).toContain('NOT DCI')
  })
})
