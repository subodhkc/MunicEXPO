/**
 * KESTREL-DEMO-PACK-1R — Sanitized public projection of the frozen Flagship-4
 * Kestrel evaluation.
 *
 * Loads the exact frozen evaluation through the canonical bundle owner
 * (getAssuranceBundleProduct) and writes a publication-safe projection:
 *
 *   data/kestrel-demo/kestrel-assurance.public.json   — sanitized bundle for the
 *                                                       public demo report page
 *   data/kestrel-demo/kestrel-assurance.machine.json  — sanitized machine export
 *   data/kestrel-demo/manifest.json                   — artifact manifest w/ SHA-256
 *
 * LOCKS honored:
 *   - No rescan. No re-evaluation. No fabricated data.
 *   - REDACTION != EVIDENCE_STATE_CHANGE — only identifiers/metadata are
 *     replaced; evidence states, counts, dispositions are never touched.
 *   - PUBLIC_DEMO != NEW_EVALUATION.
 */

import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

// ── Frozen evaluation identity ──────────────────────────────────────────────
const ORG_ID = '10231b6b-313a-44ec-83bc-058d8af6a6c6'
const EVALUATION_ID = 'e909995b-6d40-44ee-b949-c3c5373abc47:assurance:1.1'
const RUN_ID = 'e909995b-6d40-44ee-b949-c3c5373abc47'
const SCAN_ID = 'scan_PIaj73FxOQgS'
const AI_SYSTEM_ID = '6fb713f8-fe13-4d99-86c9-7c5d06d28f99'
const SOURCE_SHA = '5e65843fddfe5f907485b798e464ad37b3b3b2c7'
const SNAPSHOT = '2026-09-14T08:38:17.814Z'

// Public-safe identity shown on the artifact (no internal org/run UUIDs).
const PUBLIC_EVALUATION_REF = 'HAIEC-KESTREL-EVAL-5e65843'

const OUT_DIR = path.join('data', 'kestrel-demo')

// ── Sanitizer ───────────────────────────────────────────────────────────────
// Replaces private environment identifiers. Does NOT alter evidence state.
const INTERNAL_IDS = new Map<string, string>([
  [ORG_ID, '[demo-organization]'],
  [RUN_ID, PUBLIC_EVALUATION_REF],
  [EVALUATION_ID, PUBLIC_EVALUATION_REF],
  [AI_SYSTEM_ID, 'kestrel-ai-service-call-agent'],
  [SCAN_ID, 'kestrel-scan-ref'],
])

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const SECRETISH_RE = /(api[_-]?key|token|secret|password|bearer)\s*[:=]\s*\S+/gi
const PRIVATE_URL_RE = /https?:\/\/[^\s"']*(internal|localhost|127\.0\.0\.1|\.local)[^\s"']*/gi
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/gi

function sanitizeString(s: string): string {
  let out = s
  for (const [from, to] of INTERNAL_IDS) out = out.split(from).join(to)
  out = out.replace(UUID_RE, (m) => INTERNAL_IDS.get(m) ?? '[redacted-id]')
  out = out.replace(SECRETISH_RE, '$1: [redacted]')
  out = out.replace(PRIVATE_URL_RE, '[redacted-url]')
  out = out.replace(EMAIL_RE, '[redacted-email]')
  return out
}

function sanitize<T>(value: T): T {
  if (typeof value === 'string') return sanitizeString(value) as unknown as T
  if (Array.isArray(value)) return value.map(sanitize) as unknown as T
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) o[k] = sanitize(v)
    return o as unknown as T
  }
  return value
}

function sha256(buf: string | Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function main() {
  // Point the canonical loader at the dev DB (where Flagship-4 is persisted).
  const env = fs.readFileSync('.env.local', 'utf8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL'))!
  process.env.DATABASE_URL = line.split('=').slice(1).join('=').replace(/["]/g, '')

  const { getAssuranceBundleProduct } = await import('../lib/assurance/assurance-product-adapters')
  const { prisma } = await import('../lib/prisma')

  type EvalActionPath = { planes?: Record<string, string>; pathId: string; handlerRef?: string; sinkTargetIds?: string[] }
  type FrozenBundle = {
    schemaVersion: string
    disposition: string
    actionPaths: EvalActionPath[]
    actionProof?: { totalTraces?: number }
    evidenceFrontier?: unknown[]
    tenantBinding?: { contextBindingRelationCount?: number; pathsWithContextEvidence?: number }
    evaluationIdentity: Record<string, unknown>
    evidenceReferences?: unknown[]
    evaluationIntegrity?: unknown
    constellationAnchors?: unknown
    limitations?: unknown[]
    bundleDigest?: string
    [k: string]: unknown
  }
  type ProductResult = { evidenceBundle: FrozenBundle; availability: string } | { access: unknown }
  const product = (await getAssuranceBundleProduct(EVALUATION_ID, ORG_ID)) as ProductResult | null
  if (!product || 'access' in product) {
    throw new Error(`Frozen evaluation unavailable: ${JSON.stringify(product)}`)
  }
  const bundle = product.evidenceBundle
  const aiSystem = await prisma.ai_systems.findUnique({ where: { id: AI_SYSTEM_ID }, select: { name: true } })

  // ── Truth checks before publication projection ──
  const paths = bundle.actionPaths ?? []
  const codeCapable = paths.filter((p) => p.planes?.codeCapable === 'ESTABLISHED').length
  const badPlane = paths.filter(
    (p) =>
      p.planes?.requested !== 'NOT_ASSESSED' ||
      p.planes?.policyAuthorized !== 'NOT_ASSESSED' ||
      p.planes?.effectivelyGranted !== 'NOT_ASSESSED' ||
      p.planes?.observed !== 'NOT_ASSESSED',
  ).length
  console.log('FROZEN FACTS:')
  console.log('  disposition =', bundle.disposition)
  console.log('  actionPaths =', paths.length, '| codeCapable =', codeCapable, '| otherPlanes NOT_ASSESSED violations =', badPlane)
  console.log('  traces =', bundle.actionProof?.totalTraces, '| frontier =', bundle.evidenceFrontier?.length)
  console.log('  tenantRelations =', bundle.tenantBinding?.contextBindingRelationCount, '| pathsWithContextEvidence =', bundle.tenantBinding?.pathsWithContextEvidence)
  if (bundle.disposition !== 'REVIEW' || paths.length !== 44 || codeCapable !== 44 || badPlane !== 0) {
    throw new Error('Frozen-evaluation facts do not reconcile — refusing to generate public demo.')
  }

  // ── Sanitized projection ──
  const sanitizedBundle = sanitize(bundle)
  sanitizedBundle.evaluationIdentity = {
    publicEvaluationRef: PUBLIC_EVALUATION_REF,
    aiSystemRef: 'kestrel-ai-service-call-agent',
    aiSystemDisplayName: aiSystem?.name ?? 'Kestrel — AI Service Call Agent',
    sourceRepository: 'subodhkc/AI-Service-Call-Agent-',
    sourceCommitSha: SOURCE_SHA,
    sourceCommitShort: SOURCE_SHA.slice(0, 7),
    evaluationSnapshotAt: SNAPSHOT,
    publicationProfile: 'sanitized-real-repository-example',
  }

  const demo = {
    publicationProfile: 'sanitized-real-repository-example',
    publicationLabel: 'SANITIZED REAL-REPOSITORY EXAMPLE',
    generatedBy: 'HAIEC Evidence-Bound Assurance',
    availability: product.availability,
    aiSystemDisplayName: aiSystem?.name ?? 'Kestrel — AI Service Call Agent',
    bundle: sanitizedBundle,
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const publicJson = JSON.stringify(demo, null, 2)
  const machineJson = JSON.stringify(
    {
      artifactType: 'assurance-evidence-bundle-public-projection',
      publicationProfile: 'sanitized-real-repository-example',
      publicEvaluationRef: PUBLIC_EVALUATION_REF,
      sourceCommitSha: SOURCE_SHA,
      schemaVersion: sanitizedBundle.schemaVersion,
      disposition: sanitizedBundle.disposition,
      actionPaths: sanitizedBundle.actionPaths,
      evidenceFrontier: sanitizedBundle.evidenceFrontier,
      evidenceReferences: sanitizedBundle.evidenceReferences,
      evaluationIntegrity: sanitizedBundle.evaluationIntegrity,
      constellationAnchors: sanitizedBundle.constellationAnchors,
      limitations: sanitizedBundle.limitations,
      bundleDigest: sanitizedBundle.bundleDigest,
    },
    null,
    2,
  )

  const publicPath = path.join(OUT_DIR, 'kestrel-assurance.public.json')
  const machinePath = path.join(OUT_DIR, 'kestrel-assurance.machine.json')
  fs.writeFileSync(publicPath, publicJson)
  fs.writeFileSync(machinePath, machineJson)

  // ── Privacy scan on the emitted bytes ──
  const leftovers = [
    ORG_ID,
    RUN_ID,
    EVALUATION_ID,
    AI_SYSTEM_ID,
    SCAN_ID,
  ].filter((id) => publicJson.includes(id) || machineJson.includes(id))
  if (leftovers.length) throw new Error(`Sanitization incomplete — still present: ${leftovers.join(', ')}`)

  const manifest = {
    manifestVersion: 'kestrel-demo-manifest-1.0.0',
    generatedAt: new Date().toISOString(),
    publicationProfile: 'sanitized-real-repository-example',
    source: {
      repository: 'subodhkc/AI-Service-Call-Agent-',
      commitSha: SOURCE_SHA,
    },
    evaluation: {
      publicEvaluationRef: PUBLIC_EVALUATION_REF,
      evaluationSnapshotAt: SNAPSHOT,
      schemaVersion: sanitizedBundle.schemaVersion,
      bundleDigest: sanitizedBundle.bundleDigest,
      disposition: sanitizedBundle.disposition,
      actionPathCount: paths.length,
      codeCapableEstablished: codeCapable,
      totalEvidenceTraces: bundle.actionProof?.totalTraces,
      evidenceFrontierItems: bundle.evidenceFrontier?.length,
    },
    artifacts: [
      {
        name: 'kestrel-assurance.public.json',
        type: 'web-report-projection',
        schemaVersion: sanitizedBundle.schemaVersion,
        sha256: sha256(publicJson),
      },
      {
        name: 'kestrel-assurance.machine.json',
        type: 'machine-export',
        schemaVersion: sanitizedBundle.schemaVersion,
        sha256: sha256(machineJson),
      },
    ],
  }
  const manifestPath = path.join(OUT_DIR, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log('\nWROTE:', publicPath, machinePath, manifestPath)
  console.log('manifest artifacts:', manifest.artifacts.map((a) => `${a.name}=${a.sha256.slice(0, 12)}…`).join(' | '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
