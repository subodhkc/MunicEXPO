'use client'

/**
 * CVR-1 — Public System Constellation for the Kestrel demo.
 *
 * The connected-node graph is the PRIMARY visual: it renders the sanitized
 * canonical evaluated-topology projection (kestrel-constellation.public.json),
 * produced from the exact frozen Flagship-4 evaluation through
 * buildEvaluatedActionMapProjection — the SAME owner as the authenticated
 * /api/inventory/systems/[id]/action-map?basis=evaluation view.
 *
 *   ONE_EVALUATION -> ONE_CANONICAL_TOPOLOGY_TRUTH -> MANY_PRESENTATIONS
 *
 * Locks honored:
 *   - CURRENT_SYSTEM_VIEW != EVALUATION_SNAPSHOT — frozen snapshot only.
 *   - MISSING_BRIDGE -> FRONTIER — no visual edge is drawn where the canonical
 *     projection does not establish one.
 *   - REDACTION != TOPOLOGY_CHANGE — sanitization replaced identifiers only.
 *   - CONSTELLATION != ACTION_LIST — the action list below is a secondary
 *     investigation panel; it does not replace the graph.
 *   - PATH_DEEP_LINK -> GRAPH_FOCUS + DETAIL_PANEL_FOCUS — the same canonical
 *     path identity drives both; matching is by canonical handlerRef field,
 *     never label/string heuristics.
 *   - NOT_ASSESSED is shown as an evidence state, never as failure.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { consequenceLabelFor } from '@/data/kestrel-demo/consequence-labels'
import {
  consequenceNodeForPath as boundConsequenceNodeForPath,
  pathForGraphNode as boundPathForGraphNode,
} from '@/lib/kestrel-demo/path-binding'
import { AlertTriangle, ArrowLeft, FileText, Loader2 } from 'lucide-react'
import ConstellationMapView from '@/components/ai-inventory/ConstellationMapView'
import { ConsequenceFlowView, type FlowMode } from '@/components/ai-inventory/ConsequenceFlowView'
import type { TopologyProjectionResult } from '@/lib/topology/types'

type Plane = 'requested' | 'policyAuthorized' | 'effectivelyGranted' | 'codeCapable' | 'observed'

type ActionPath = {
  pathId: string
  toolCandidateId?: string
  handlerRef?: string
  consequenceRelationId?: string
  downstreamOperationIds?: string[]
  sinkTargetIds?: string[]
  planes?: Record<Plane, string>
  contextBindings?: { state: string; contextKind: string; tenantFilterBound?: boolean }[]
  limitations?: string[]
}

type GraphNode = TopologyProjectionResult['nodes'][number] & {
  handlerRef?: string
  consequenceRelationId?: string
}

function businessAction(p: ActionPath): string {
  return consequenceLabelFor(p).label
}

/**
 * Public presentation scope: the consequential subgraph.
 *
 * The canonical evaluated projection carries every cataloged handler
 * (723), persistence and service node. For the public hero the graph shows
 * the AI system, every node incident to a canonical edge, and the
 * cataloged persistence/service context. No edge is added or removed —
 * relation membership is exactly canonical. Non-consequential cataloged
 * handlers (no canonical edge) are not rendered; their existence is
 * reported in the scope note below the graph.
 */
function scopedPublicProjection(p: TopologyProjectionResult): TopologyProjectionResult {
  const endpointIds = new Set<string>()
  for (const e of p.edges) {
    endpointIds.add(e.source)
    endpointIds.add(e.target)
  }
  const nodes = p.nodes.filter(
    (n) => endpointIds.has(n.id) || n.kind === 'ai_execution' || n.kind === 'persistence' || n.kind === 'service',
  )
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = p.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  const elided = p.nodes.length - nodes.length
  return {
    ...p,
    nodes,
    edges,
    limitations: [
      ...p.limitations,
      `PUBLIC_PRESENTATION_SCOPE: ${elided} cataloged objects with no canonical consequence edge are not drawn. Their existence is not denied; no relation was added or removed.`,
    ],
  }
}

export default function KestrelConstellationPage() {
  const params = useSearchParams()
  const pathname = usePathname()
  const [data, setData] = useState<{
    aiSystemDisplayName: string
    availability: string
    bundle: {
      disposition: string
      actionPaths: ActionPath[]
      evaluationIdentity?: { sourceCommitShort?: string }
    }
  } | null>(null)
  const [graphData, setGraphData] = useState<{
    publicEvaluationRef: string
    evaluationSnapshotAt: string
    projection: TopologyProjectionResult
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(params.get('path'))
  // CONSTELLATION-VISUAL-1: consequence-first presentation modes. A ?path=
  // deep link lands on the focused Action Path view.
  const [viewMode, setViewMode] = useState<FlowMode | 'map'>(params.get('path') ? 'path' : 'overview')

  // focusPathId drives the graph camera/highlight — only set by deep links
  // and explicit card/list picks. Graph node clicks update selection (detail
  // panel) without re-centering the camera on a different node.
  const [focusPathId, setFocusPathId] = useState<string | null>(params.get('path'))
  // Direct node focus for ambiguous picks (a handler reaching multiple
  // consequential operations focuses the handler — never a first-match path).
  const [focusNodeDirect, setFocusNodeDirect] = useState<{ nodeId: string; direction: 'upstream' | 'downstream' } | null>(null)
  // Ambiguous-handler selection: the user must pick the exact consequence.
  const [ambiguousNode, setAmbiguousNode] = useState<GraphNode | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/demo/kestrel/kestrel-assurance.public.json').then((r) => {
        if (!r.ok) throw new Error(`assurance bundle HTTP ${r.status}`)
        return r.json()
      }),
      fetch('/demo/kestrel/kestrel-constellation.public.json').then((r) => {
        if (!r.ok) throw new Error(`constellation projection HTTP ${r.status}`)
        return r.json()
      }),
    ])
      .then(([assurance, constellation]) => {
        setData(assurance)
        setGraphData(constellation)
      })
      .catch((e) => setError(String(e?.message || e)))
  }, [])

  const paths: ActionPath[] = useMemo(() => data?.bundle?.actionPaths ?? [], [data])
  const selected = paths.find((p) => p.pathId === selectedPathId) ?? null

  // Canonical path → canonical graph node: exact handlerRef field match —
  // handlerRef is the topology binding field, not a display string.
  const scopedProjection = useMemo(() => {
    if (!graphData?.projection) return null
    const scoped = scopedPublicProjection(graphData.projection)
    // Public consequence display labels: exact relation id → existing
    // deterministic consequenceLabelFor() mapping (ORDER RECORD WRITE etc.).
    // Presentation only — node identity and membership unchanged.
    const labelByRelation = new Map(
      paths
        .filter((p) => p.consequenceRelationId)
        .map((p) => [p.consequenceRelationId as string, consequenceLabelFor(p).label]),
    )
    return {
      ...scoped,
      nodes: scoped.nodes.map((n) =>
        n.kind === 'consequence' && n.consequenceRelationId && labelByRelation.has(n.consequenceRelationId)
          ? { ...n, label: labelByRelation.get(n.consequenceRelationId) as string }
          : n,
      ),
    }
  }, [graphData, paths])
  const graphNodes: GraphNode[] = useMemo(() => scopedProjection?.nodes ?? [], [scopedProjection])

  // EXACT PATH IDENTITY (lib/kestrel-demo/path-binding.ts):
  // path → consequence node via consequenceRelationId; handler → path only
  // when handlerRef maps to exactly one path (ambiguous → fail closed).
  const consequenceNodeForPath = (p: ActionPath | null): GraphNode | undefined =>
    boundConsequenceNodeForPath(graphNodes, p)

  // ?path= (and card/list picks) → focus the exact consequence node
  // upstream so the established handler → consequence relation dominates.
  const focusRequest = useMemo(() => {
    if (focusNodeDirect) return focusNodeDirect
    const node = consequenceNodeForPath(paths.find((p) => p.pathId === focusPathId) ?? null)
    return node ? { nodeId: node.id, direction: 'upstream' as const } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPathId, focusNodeDirect, graphNodes, paths])

  // Bidirectional URL: explicit path selection writes ?path= (preserving
  // unrelated query params); refresh/share restores via the params sync
  // effect below. history.replaceState is used instead of router.push —
  // an App Router navigation remounts the page and would reset the
  // active view mode back to the deep-link default.
  const updateUrl = (pathId: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (pathId) q.set('path', pathId)
    else q.delete('path')
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }

  useEffect(() => {
    const p = params.get('path')
    if (p === focusPathId) return
    setSelectedPathId(p)
    setFocusPathId(p)
    setFocusNodeDirect(null)
    setAmbiguousNode(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const pickPath = (pathId: string) => {
    setSelectedPathId(pathId)
    setFocusPathId(pathId)
    setFocusNodeDirect(null)
    setAmbiguousNode(null)
    // Graph-side auto-selection (focusRequest echo) must not pull the user
    // out of the System Map — only jump to the path view from elsewhere.
    setViewMode((v) => (v === 'map' ? 'map' : 'path'))
    updateUrl(pathId)
  }

  const handleGraphSelect = (canonicalNodeId: string) => {
    const n = graphNodes.find((g) => g.id === canonicalNodeId)
    const p = boundPathForGraphNode(graphNodes, paths, canonicalNodeId)
    if (p === 'AMBIGUOUS') {
      if (!n) return
      // Same handler, multiple consequence relations — focus the handler and
      // require the user to pick the exact consequence. No first match.
      setSelectedPathId(null)
      setFocusPathId(null)
      setFocusNodeDirect({ nodeId: n.id, direction: 'downstream' })
      setAmbiguousNode(n)
      updateUrl(null)
      return
    }
    setAmbiguousNode(null)
    if (p) pickPath(p.pathId)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-6">
          <Link href="/sample-reports/kestrel" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Kestrel Assurance Decision
          </Link>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold tracking-wide uppercase">
              Evaluation Snapshot
            </span>
            <span className="text-[11px] text-slate-500">
              Frozen evaluation · Kestrel · evaluated commit {data?.bundle?.evaluationIdentity?.sourceCommitShort ?? '5e65843'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            How Kestrel can act
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl leading-relaxed">
            Follow evaluated paths from AI-facing capabilities to application code, resources
            and consequential effects in the frozen Kestrel evaluation. HAIEC shows what the
            evidence establishes and where additional proof is still needed — connections are
            drawn only where evidence establishes them; gaps stay open as frontier.
          </p>
        </div>
      </div>

      {error && (
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            The evaluation snapshot is unavailable. {error}
          </div>
        </div>
      )}
      {!error && (!data || !graphData) && (
        <div className="max-w-4xl mx-auto px-4 py-16 flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading evaluation snapshot…
        </div>
      )}

      {data && graphData && scopedProjection && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 pt-6">
          {/* What HAIEC established — the answer before the diagram */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 mb-6 flex flex-wrap items-center gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Assurance Decision</div>
              <div className="text-3xl font-extrabold text-amber-300">{data.bundle.disposition}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Consequential paths</div>
              <div className="text-3xl font-extrabold text-white">{paths.length}</div>
              <div className="text-[11px] text-slate-500">Code Capable established</div>
            </div>
            <div className="text-[11px] text-slate-400 max-w-sm leading-relaxed">
              HAIEC established application paths capable of consequential effects, including
              durable record writes. Runtime, policy and observed evidence remain separate
              questions — which is why the decision is {data.bundle.disposition}.
            </div>
          </div>

          {/* Consequence-first view modes */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 mb-4 w-fit">
            {([
              ['overview', 'Overview'],
              ['path', 'Action Paths'],
              ['authority', 'Authority'],
              ['proof', 'Proof'],
              ['map', 'System Map'],
            ] as const).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                  viewMode === m ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* PRIMARY: consequence flows, paths, authority, proof */}
          {viewMode !== 'map' && (
            <div className="rounded-2xl bg-slate-50 p-4 sm:p-5 mb-6" data-testid="consequence-flow">
              <ConsequenceFlowView
                aiSystemName={data.aiSystemDisplayName}
                projection={scopedProjection}
                paths={paths}
                mode={viewMode}
                selectedPathId={selectedPathId}
                onSelectPath={(id) => { setSelectedPathId(id); setFocusPathId(id); setFocusNodeDirect(null); setAmbiguousNode(null); updateUrl(id) }}
                consequenceLabelFor={consequenceLabelFor}
                firstGroupLabel="ORDER RECORD WRITE"
                evaluationIdentity={{ sourceCommitShort: data.bundle?.evaluationIdentity?.sourceCommitShort }}
                disposition={data.bundle.disposition}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/sample-reports/kestrel" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                  <FileText className="w-3.5 h-3.5" /> Open in Assurance Report
                </Link>
              </div>
            </div>
          )}

          {/* ADVANCED: full canonical System Constellation (evaluation snapshot) */}
          {viewMode === 'map' && (
            <div data-testid="public-constellation-graph" className="mb-8">
              <ConstellationMapView
                projection={scopedProjection}
                initialScale="agent"
                initialLens="overview"
                flattenCombos
                focusRequest={focusRequest}
                onSelectNode={handleGraphSelect}
                onFocusUpstream={() => {}}
                onFocusDownstream={() => {}}
                onExplainPath={() => {}}
              />
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                Advanced full-system exploration of the evaluation snapshot. Diamond-shaped nodes
                mark the consequential operations the evaluation established; a line is drawn only
                where evidence establishes a connection — gaps stay open as frontier.
              </p>
              <p className="mt-1 text-[10px] text-slate-600 sm:hidden">
                Open on desktop to explore the full System Map.
              </p>
            </div>
          )}

          {/* Ambiguous-handler resolution — graph picks reaching >1 consequence */}
          {ambiguousNode && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="ambiguous-handler">
              <div className="text-[11px] font-semibold text-amber-200/90 mb-2">
                {ambiguousNode.label} reaches {paths.filter((p) => p.handlerRef === ambiguousNode.handlerRef).length} distinct consequential operations — pick the exact one:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {paths
                  .filter((p) => p.handlerRef === ambiguousNode.handlerRef)
                  .map((p) => (
                    <button
                      key={p.pathId}
                      type="button"
                      onClick={() => pickPath(p.pathId)}
                      className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-emerald-500/50"
                    >
                      {businessAction(p)}
                    </button>
                  ))}
              </div>
            </div>
          )}
          {!selected && params.get('path') && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/80">
              The linked path is not part of this evaluation snapshot. Pick a consequential action instead.
            </div>
          )}

          {/* How to read this view — demoted semantic guidance */}
          <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">How to read this view</summary>
            <div className="mt-3 grid sm:grid-cols-2 gap-4 text-[10.5px] text-slate-400 leading-relaxed">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Stages &amp; evidence states</div>
                <p>Each workflow reads AI system → capability → handler → resource → consequence. Solid connectors are established relations; dotted breaks mark evidence frontiers where no canonical relation exists. NOT ASSESSED means the evidence was not present for that plane — it is not a failure and not a pass.</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-200/80">
                  Missing runtime, policy and permission evidence is an open question — not proof of
                  non-occurrence. Code capability does not imply authorization or observation.
                </p>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
