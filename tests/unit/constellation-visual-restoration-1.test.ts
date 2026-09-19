/**
 * CVR-1 — Constellation Visual Restoration: projection parity, privacy,
 * and structural locks for the public Kestrel constellation.
 *
 * These tests verify the emitted public artifact is a sanitized projection
 * of the EXACT frozen evaluation — not a second topology engine, not a
 * heuristic re-graph of the action list.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const DEMO_DIR = path.join(process.cwd(), 'data', 'kestrel-demo')
const CONSTELLATION = JSON.parse(
  fs.readFileSync(path.join(DEMO_DIR, 'kestrel-constellation.public.json'), 'utf8'),
)
const ASSURANCE = JSON.parse(
  fs.readFileSync(path.join(DEMO_DIR, 'kestrel-assurance.public.json'), 'utf8'),
)
const PAGE_SRC = fs.readFileSync(
  path.join(process.cwd(), 'app', 'sample-reports', 'kestrel', 'constellation', 'page.tsx'),
  'utf8',
)
const VIEW_SRC = fs.readFileSync(
  path.join(process.cwd(), 'components', 'ai-inventory', 'ConstellationMapView.tsx'),
  'utf8',
)

const FROZEN = {
  SOURCE_SHA: '5e65843fddfe5f907485b798e464ad37b3b3b2c7',
  PUBLIC_EVAL_REF: 'HAIEC-KESTREL-EVAL-5e65843',
  // Private identifiers that must never survive into the artifact.
  PRIVATE_IDS: [
    '10231b6b-313a-44ec-83bc-058d8af6a6c6',
    'e909995b-6d40-44ee-b949-c3c5373abc47',
    '6fb713f8-fe13-4d99-86c9-7c5d06d28f99',
    'scan_PIaj73FxOQgS',
  ],
}

describe('CVR-1 projection parity', () => {
  it('artifact identity matches the frozen evaluation', () => {
    expect(CONSTELLATION.publicEvaluationRef).toBe(FROZEN.PUBLIC_EVAL_REF)
    expect(CONSTELLATION.artifactType).toBe('system-constellation-public-projection')
    expect(CONSTELLATION.projection.projectionScope).toBe('ASSURANCE_EVALUATION')
    expect(CONSTELLATION.projection.scanProvenance.commitSha).toBe(FROZEN.SOURCE_SHA)
    expect(CONSTELLATION.evaluationSnapshotAt).toBe(
      ASSURANCE.bundle.evaluationIdentity.evaluationSnapshotAt,
    )
  })

  it('system identity is the sanitized Kestrel alias', () => {
    expect(CONSTELLATION.projection.aiSystemId).toBe('kestrel-ai-service-call-agent')
    expect(CONSTELLATION.projection.aiSystemName).toContain('Kestrel')
    expect(CONSTELLATION.projection.organizationId).toBe('[demo-organization]')
  })

  it('consequence nodes reconcile 1:1 with evaluated action paths', () => {
    const paths = ASSURANCE.bundle.actionPaths
    expect(paths).toHaveLength(44)
    const consequences = CONSTELLATION.projection.nodes.filter(
      (n: { kind: string }) => n.kind === 'consequence',
    )
    expect(consequences).toHaveLength(44)
    // Every action path's canonical consequence is represented exactly once.
    const handlerRefs = new Set(consequences.map((n: { handlerRef?: string }) => n.handlerRef))
    for (const p of paths) expect(handlerRefs.has(p.handlerRef)).toBe(true)
    // Every edge is a canonical handles relation — none invented.
    expect(CONSTELLATION.projection.edges).toHaveLength(44)
    for (const e of CONSTELLATION.projection.edges) {
      expect(e.kind).toBe('handles')
      const src = CONSTELLATION.projection.nodes.find((n: { id: string }) => n.id === e.source)
      const tgt = CONSTELLATION.projection.nodes.find((n: { id: string }) => n.id === e.target)
      expect(src?.kind).toBe('handler')
      expect(tgt?.kind).toBe('consequence')
    }
  })

  it('frontier/evidence state preserved — no certainty upgrades', () => {
    const kinds = new Set(CONSTELLATION.projection.nodes.map((n: { kind: string }) => n.kind))
    expect(kinds.has('persistence')).toBe(true)
    const nodes = CONSTELLATION.projection.nodes
    expect(nodes.every((n: { availability?: string }) => n.availability !== 'ESTABLISHED')).toBe(true)
    // The AI-system node carries the identity-vs-runtime limitation.
    const ai = nodes.find((n: { kind: string }) => n.kind === 'ai_execution')
    expect(ai.limitations.join(' ')).toMatch(/AI_SYSTEM_IDENTITY != EVALUATED_AGENT_RUNTIME/)
    // No node was upgraded to OBSERVED semantics.
    for (const n of nodes) {
      expect(JSON.stringify(n)).not.toMatch(/RUNTIME_OBSERVED|OBSERVED_EXECUTION/)
    }
  })

  it('no private identifiers in the artifact', () => {
    const raw = JSON.stringify(CONSTELLATION)
    for (const id of FROZEN.PRIVATE_IDS) expect(raw).not.toContain(id)
    expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it('snapshot time is the frozen evaluation snapshot — not re-evaluation time', () => {
    expect(CONSTELLATION.evaluationSnapshotAt).toBe('2026-09-14T08:38:17.814Z')
    expect(CONSTELLATION.projection.evaluatedBasis?.evaluationId).toBe(`${FROZEN.PUBLIC_EVAL_REF}:assurance:1.1`)
    expect(CONSTELLATION.projection.evaluatedBasis?.disposition).toBe('REVIEW')
  })
})

describe('CVR-1 renderer reuse + deep link', () => {
  it('public page reuses the canonical constellation renderer, not a fork', () => {
    expect(PAGE_SRC).toContain("import ConstellationMapView from '@/components/ai-inventory/ConstellationMapView'")
    expect(PAGE_SRC).toContain('kestrel-constellation.public.json')
    // No heuristic graph construction from actionPaths.
    expect(PAGE_SRC).not.toMatch(/actionPaths.*\.map\(.*=>.*\{[^}]*source[^}]*target/)
    // Canonical ID binding for path focus — exact consequenceRelationId,
    // never first-match on handlerRef (a handler can reach several
    // consequential operations).
    expect(PAGE_SRC).toContain("boundConsequenceNodeForPath")
    expect(PAGE_SRC).toContain("consequenceRelationId")
    expect(PAGE_SRC).not.toContain("n.kind === 'handler' && n.handlerRef === p.handlerRef")
  })

  it('focusRequest drives both graph focus and selection', () => {
    expect(VIEW_SRC).toContain('focusRequest?: { nodeId: string')
    expect(VIEW_SRC).toContain('setFocusNodeId(focusRequest.nodeId)')
    expect(VIEW_SRC).toContain('setFocusDirection(focusRequest.direction)')
    expect(VIEW_SRC).toContain('handleSelectNode(focusRequest.nodeId)')
  })

  it('public page presents consequence-first views over the exact evaluated paths', () => {
    // CONSTELLATION-VISUAL-1: the action-list investigation panel is the
    // shared ConsequenceFlowView — consequence grouping, focused Action
    // Path, Authority planes and Proof modes over the same frozen paths.
    expect(PAGE_SRC).toContain('ConsequenceFlowView')
    expect(PAGE_SRC).toContain("'Action Paths'")
    expect(PAGE_SRC).toContain("'Authority'")
    expect(PAGE_SRC).toContain("'Proof'")
    expect(PAGE_SRC).toContain("'System Map'")
    expect(PAGE_SRC).toContain('Back to Kestrel Assurance Decision')
  })
})
