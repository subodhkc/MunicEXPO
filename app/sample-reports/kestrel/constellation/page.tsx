'use client'

/**
 * Consequence-first public System Constellation for the Kestrel demo.
 *
 * Renders the SAME canonical evaluation-snapshot projection (sanitized
 * actionPaths) as the demo report — it is a presentation layer over the frozen
 * evaluation, not a second topology or a new evaluation.
 *
 * Locks honored:
 *   - CURRENT_SYSTEM_VIEW != EVALUATION_SNAPSHOT — this view is the frozen
 *     evaluation snapshot; it never silently pretends to be current state.
 *   - No edge is drawn to complete a visual story — only paths the evidence
 *     establishes are rendered.
 *   - NOT_ASSESSED is shown as an evidence state, never as failure.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, FileText, Loader2 } from 'lucide-react'

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

const PLANE_LABEL: Record<Plane, string> = {
  requested: 'Requested',
  policyAuthorized: 'Policy Authorized',
  effectivelyGranted: 'Effectively Granted',
  codeCapable: 'Code Capable',
  observed: 'Observed',
}
const PLANE_ORDER: Plane[] = ['requested', 'policyAuthorized', 'effectivelyGranted', 'codeCapable', 'observed']

function businessAction(p: ActionPath): string {
  const h = p.handlerRef || ''
  const sink = (p.sinkTargetIds?.[0] || '').split('/').pop() || ''
  if (h.includes('place_order')) return 'PLACE ORDER'
  if (sink.includes('sms') || sink.includes('message')) return 'CUSTOMER MESSAGE SEND'
  if (sink.includes('lifecycle')) return 'CALL STATE CHANGE'
  if (h.includes('booking') || sink.includes('calendar')) return 'CREATE BOOKING'
  if (h.includes('menu')) return 'QUERY MENU ITEM'
  if (sink.includes('template')) return 'TEMPLATE WRITE'
  return 'INVOCABLE ACTION'
}

function sinkLabel(p: ActionPath): string {
  const s = p.sinkTargetIds?.[0] || ''
  return s.split('/').slice(-1)[0] || s
}

export default function KestrelConstellationPage() {
  const params = useSearchParams()
  const [data, setData] = useState<{
    aiSystemDisplayName: string
    availability: string
    bundle: {
      disposition: string
      actionPaths: ActionPath[]
      evaluationIdentity?: { sourceCommitShort?: string }
    }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(params.get('path'))

  useEffect(() => {
    fetch('/demo/kestrel/kestrel-assurance.public.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(String(e?.message || e)))
  }, [])

  const paths: ActionPath[] = useMemo(() => data?.bundle?.actionPaths ?? [], [data])
  const groups = useMemo(() => {
    const m = new Map<string, ActionPath[]>()
    for (const p of paths) {
      const b = businessAction(p)
      m.set(b, [...(m.get(b) ?? []), p])
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [paths])
  const selected = paths.find((p) => p.pathId === selectedPathId) ?? null

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-6">
          <Link href="/sample-reports/kestrel" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Kestrel Assurance Report
          </Link>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold tracking-wide uppercase">
              Evaluation Snapshot
            </span>
            <span className="text-[11px] text-slate-500">
              Frozen evaluation · Kestrel · commit {data?.bundle?.evaluationIdentity?.sourceCommitShort ?? '5e65843'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            System Constellation — Kestrel
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl leading-relaxed">
            System Constellation shows the evidence-backed paths around the AI system: what it can
            reach, what controls apply, and where HAIEC&apos;s evidence stops. This is the frozen
            evaluation snapshot bound to the demo report — not the current system view.
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
      {!error && !data && (
        <div className="max-w-4xl mx-auto px-4 py-16 flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading evaluation snapshot…
        </div>
      )}

      {data && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          {/* Top summary */}
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
              Runtime / policy / observed evidence is incomplete for all evaluated paths — shown
              explicitly below, not assumed.
            </div>
          </div>

          {/* Consequence cards */}
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Top consequential actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {groups.slice(0, 4).map(([label, group]) => (
              <button
                key={label}
                onClick={() => setSelectedPathId(group[0].pathId)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  selected && businessAction(selected) === label
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                }`}
              >
                <div className="text-[13px] font-extrabold text-white leading-snug">{label}</div>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  {group.length} path{group.length > 1 ? 's' : ''} · code capable
                </div>
                <div className="mt-2 text-[10px] text-emerald-400 font-semibold">● CODE CAPABLE ESTABLISHED</div>
              </button>
            ))}
          </div>

          {/* Focused path */}
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              {selected ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">{businessAction(selected)}</h3>
                    <span className="text-[10px] font-mono text-slate-500">path {selected.pathId.slice(0, 12)}…</span>
                  </div>
                  {/* Path chain — only what the evidence establishes */}
                  <div className="space-y-0">
                    {[
                      { role: 'AI AGENT', label: data.aiSystemDisplayName, sub: 'system under evaluation' },
                      { role: 'CAPABILITY', label: selected.toolCandidateId?.split(':')[1]?.split('/').pop() || selected.toolCandidateId || 'tool candidate', sub: 'model-visible capability (registered)' },
                      { role: 'HANDLER', label: selected.handlerRef, sub: 'invocable handler' },
                      { role: 'OPERATION / RESOURCE', label: sinkLabel(selected), sub: `downstream op · ${selected.consequenceRelationId?.split(':').slice(0, 2).join(':')}` },
                      { role: 'CONSEQUENCE', label: businessAction(selected), sub: 'effect the AI can cause', dominant: true },
                    ].map((n, i, arr) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full border-2 mt-1.5 ${n.dominant ? 'border-amber-400 bg-amber-400/20' : 'border-emerald-500 bg-emerald-500/20'}`} />
                          {i < arr.length - 1 && <div className="w-px flex-1 bg-slate-700 my-1" />}
                        </div>
                        <div className={`pb-5 ${n.dominant ? '' : ''}`}>
                          <div className="text-[9px] uppercase tracking-widest text-slate-500">{n.role}</div>
                          <div className={`${n.dominant ? 'text-base font-extrabold text-amber-200' : 'text-sm font-semibold text-slate-200'} break-all`}>
                            {n.label}
                          </div>
                          <div className="text-[10px] text-slate-500">{n.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Evidence planes */}
                  <div className="mt-2 border-t border-slate-800 pt-4">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Evidence planes — independent states</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {PLANE_ORDER.map((pl) => {
                        const st = selected.planes?.[pl] ?? 'UNKNOWN'
                        const est = st === 'ESTABLISHED'
                        return (
                          <div key={pl} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">{PLANE_LABEL[pl]}</span>
                            <span className={est ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                              {est ? '●' : '○'} {st === 'NOT_ASSESSED' ? 'NOT ASSESSED' : st}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
                      NOT ASSESSED means the evidence was not present for that plane — it is not a
                      failure and not a pass. The authority frontier between code capability and
                      observed execution is the remaining assurance question.
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/sample-reports/kestrel" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                      <FileText className="w-3.5 h-3.5" /> Open in Assurance Report
                    </Link>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Select a consequential action above to focus its evidence path.
                </div>
              )}
            </div>

            {/* Sidebar: legend + all paths */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Legend — role / domain</div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div>Agent · Capability · Handler · Resource/Operation · Consequence</div>
                  <div className="pt-2 text-[10px] uppercase tracking-widest text-slate-500">Evidence state</div>
                  <div><span className="text-emerald-400">●</span> Established &nbsp;&nbsp;<span className="text-slate-500">○</span> Not assessed</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 max-h-[420px] overflow-y-auto">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">All {paths.length} evaluated paths</div>
                <div className="space-y-1">
                  {paths.map((p) => (
                    <button
                      key={p.pathId}
                      onClick={() => setSelectedPathId(p.pathId)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${
                        selectedPathId === p.pathId ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {p.handlerRef} → {sinkLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-200/80 leading-relaxed">
                  Missing runtime, policy and permission evidence is an open question — not proof of
                  non-occurrence.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
