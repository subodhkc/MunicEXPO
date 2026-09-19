'use client';

/**
 * CONSTELLATION-VISUAL-1 — Consequence Flow presentation.
 *
 * Consequence-first, path-focused, evidence-bound presentation over
 * EXISTING canonical structures. This is a pure presentation layer:
 *
 *   PRESENTATION != TOPOLOGY_TRUTH
 *   PATH_STAGE_ADJACENCY != CANONICAL_EDGE
 *   MISSING_BRIDGE -> FRONTIER (a break is shown, never a fabricated edge)
 *   GROUPING != NEW_ANALYSIS
 *   CODE_CAPABLE != AUTHORIZED ; CODE_CAPABLE != OBSERVED
 *   NOT_ASSESSED != FAILURE ; UNRESOLVED != ABSENT
 *
 * Shared by the public Kestrel constellation and the authenticated map.
 * It consumes the existing evaluated action paths (EvidenceActionPath
 * grain) + the canonical TopologyProjectionResult for consequence-node
 * identity — it does not build a second semantic model.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Braces, ChevronLeft, ChevronRight, Database,
  HelpCircle, Network, Shield, Wrench, Zap,
} from 'lucide-react';
import type { TopologyProjectionResult } from '@/lib/topology/types';
import {
  groupPathsByConsequence,
  type ConsequenceGroup,
  type ConsequenceLabelLike,
  type FlowActionPath,
} from '@/lib/topology/consequence-flow-presentation';

export type { FlowActionPath, ConsequenceLabelLike, ConsequenceGroup };
export type FlowMode = 'overview' | 'path' | 'authority' | 'proof';

const PLANE_LABEL: Record<string, string> = {
  requested: 'Requested',
  policyAuthorized: 'Policy Authorized',
  effectivelyGranted: 'Effectively Granted',
  codeCapable: 'Code Capable',
  observed: 'Observed',
};
const PLANE_ORDER = ['requested', 'policyAuthorized', 'effectivelyGranted', 'codeCapable', 'observed'] as const;

const PLANE_STYLE: Record<string, string> = {
  ESTABLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  PARTIAL: 'bg-amber-50 text-amber-800 border-amber-300',
  NOT_ASSESSED: 'bg-slate-50 text-slate-600 border-slate-300',
  NOT_AVAILABLE: 'bg-slate-50 text-slate-500 border-slate-300',
  UNKNOWN: 'bg-slate-50 text-slate-500 border-slate-300',
  UNSUPPORTED: 'bg-slate-50 text-slate-500 border-slate-300',
  NOT_RUN: 'bg-slate-50 text-slate-500 border-slate-300',
};

function stateChip(state: string | undefined) {
  const s = state ?? 'NOT_ASSESSED';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PLANE_STYLE[s] ?? PLANE_STYLE.NOT_ASSESSED}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

function sinkResource(p: FlowActionPath): string {
  const s = p.sinkTargetIds?.[0] ?? '';
  return s.split('/').slice(-1)[0]?.split(':')[0] || s || '—';
}

function capabilityLabel(p: FlowActionPath): string {
  const t = p.toolCandidateId ?? '';
  return t.split(':')[1]?.split('/').pop() || t.split(':').pop() || 'capability';
}




export function ConsequenceFlowView({
  aiSystemName,
  projection,
  paths,
  mode,
  selectedPathId,
  onSelectPath,
  consequenceLabelFor,
  evaluationIdentity,
  disposition,
  firstGroupLabel,
}: {
  aiSystemName: string;
  projection: TopologyProjectionResult;
  paths: FlowActionPath[];
  mode: FlowMode;
  selectedPathId: string | null;
  onSelectPath: (pathId: string | null) => void;
  consequenceLabelFor?: (p: FlowActionPath) => ConsequenceLabelLike;
  evaluationIdentity?: { evaluationId?: string; commitSha?: string | null; sourceCommitShort?: string } | null;
  disposition?: string | null;
  /**
   * Optional display preference: pin one exact consequence label first in
   * Overview ordering (e.g. Kestrel's headline ORDER RECORD WRITE).
   * Presentation ordering only — not a risk ranking, not a truth claim.
   */
  firstGroupLabel?: string;
}) {
  const labelFor = (p: FlowActionPath): ConsequenceLabelLike => {
    if (consequenceLabelFor) return consequenceLabelFor(p);
    const rel = p.consequenceRelationId;
    const node = rel
      ? projection.nodes.find((n) => n.kind === 'consequence' && n.consequenceRelationId === rel)
      : undefined;
    return { label: node?.label ?? 'INVOCABLE OPERATION', resource: sinkResource(p) };
  };

  const groups: ConsequenceGroup[] = useMemo(() => {
    const g = groupPathsByConsequence(paths, labelFor);
    if (firstGroupLabel) {
      const i = g.findIndex((x) => x.label === firstGroupLabel);
      if (i > 0) g.unshift(g.splice(i, 1)[0]);
    }
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, projection, consequenceLabelFor, firstGroupLabel]);

  const allPaths = useMemo(() => groups.flatMap((g) => g.paths), [groups]);
  const selected = allPaths.find((p) => p.pathId === selectedPathId) ?? null;

  // Path-focused modes need a selection — pick the first path in the
  // deterministic ordering when entering without one (deep links still
  // restore the exact pathId).
  useEffect(() => {
    if (mode !== 'overview' && !selected && allPaths.length > 0) {
      onSelectPath(allPaths[0].pathId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedPathId, allPaths.length]);

  // A consequence stage is canonically bound when the projection carries the
  // exact consequence node for this path's relation id — otherwise frontier.
  const consequenceBound = (p: FlowActionPath) =>
    !!p.consequenceRelationId &&
    projection.nodes.some((n) => n.kind === 'consequence' && n.consequenceRelationId === p.consequenceRelationId);

  if (paths.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          Cataloged objects are available, but this view has no established consequential paths to connect them.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Use the System Map view to explore the cataloged topology, or select an evaluated action path.
        </p>
      </div>
    );
  }

  const go = (dir: 1 | -1) => {
    if (allPaths.length === 0) return;
    const idx = selected ? allPaths.indexOf(selected) : -1;
    const next = allPaths[(idx + dir + allPaths.length) % allPaths.length];
    onSelectPath(next.pathId);
  };

  return (
    <div className="space-y-4">
      {mode === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <ConsequenceWorkflowCard
              key={g.key}
              group={g}
              aiSystemName={aiSystemName}
              selected={selected ? g.paths.some((p) => p.pathId === selected.pathId) : false}
              onOpen={() => onSelectPath(g.paths[0].pathId)}
              onPickPath={onSelectPath}
              bound={consequenceBound}
            />
          ))}
        </div>
      )}

      {mode !== 'overview' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {/* Path picker — exact consequence group + path identity */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Consequence</span>
            <select
              value={selected ? (groups.find((g) => g.paths.some((p) => p.pathId === selected.pathId))?.key ?? '') : ''}
              onChange={(e) => {
                const g = groups.find((x) => x.key === e.target.value);
                if (g) onSelectPath(g.paths[0].pathId);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 max-w-[16rem]"
              aria-label="Select consequence"
            >
              {groups.map((g) => (
                <option key={g.key} value={g.key}>{g.label} ({g.paths.length})</option>
              ))}
            </select>
            <div className="flex-1" />
            <button type="button" onClick={() => go(-1)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Previous action path">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              {selected ? `${allPaths.indexOf(selected) + 1}/${allPaths.length}` : `0/${allPaths.length}`}
            </span>
            <button type="button" onClick={() => go(1)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Next action path">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!selected ? (
            <p className="px-4 py-6 text-sm text-slate-500">Select an evaluated action path above.</p>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              <PathChain path={selected} label={labelFor(selected)} aiSystemName={aiSystemName} bound={consequenceBound(selected)} />

              {mode === 'authority' && <AuthorityRail path={selected} />}

              {mode === 'proof' && (
                <ProofPanel path={selected} evaluationIdentity={evaluationIdentity} />
              )}

              {mode === 'path' && (
                <div className="flex flex-wrap gap-2">
                  {(groups.find((g) => g.paths.some((p) => p.pathId === selected.pathId))?.paths ?? [])
                    .map((p) => (
                      <button
                        key={p.pathId}
                        type="button"
                        onClick={() => onSelectPath(p.pathId)}
                        className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                          p.pathId === selected.pathId
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {p.pathId.slice(0, 14)}…
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {disposition && mode === 'overview' && (
        <p className="text-[11px] text-slate-500">
          Assurance disposition for this evaluation: <span className="font-semibold text-slate-700">{disposition}</span>.
          Code-capable paths are not authorized or observed executions — authority and runtime evidence are separate questions.
        </p>
      )}
    </div>
  );
}

/* ─── Consequence workflow card (overview unit) ───────────────────────────── */

function ConsequenceWorkflowCard({
  group,
  aiSystemName,
  selected,
  onOpen,
  onPickPath,
  bound,
}: {
  group: ConsequenceGroup;
  aiSystemName: string;
  selected: boolean;
  onOpen: () => void;
  onPickPath: (id: string) => void;
  bound: (p: FlowActionPath) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rep = group.paths[0];
  return (
    <div
      className={`rounded-xl border bg-white p-4 text-left transition-colors ${
        selected ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
      }`}
      data-testid={`consequence-group-${group.label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-amber-600 font-semibold">Consequence</div>
          <div className="text-sm font-extrabold text-slate-900 leading-snug">{group.label}</div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">{group.resource}</div>
        </div>
        <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
      </div>
      <div className="mt-1.5 text-[10px] text-slate-400">
        {group.effect ? `${group.effect} · ` : ''}
        {group.paths.length} evaluated path{group.paths.length !== 1 ? 's' : ''}
        {' · '}
        {group.relationIds.length} exact consequence relation{group.relationIds.length !== 1 ? 's' : ''}
      </div>

      {/* Representative path mini-chain */}
      <div className="mt-3">
        <MiniChain path={rep} aiSystemName={aiSystemName} bound={bound(rep)} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-slate-700"
        >
          Open path detail
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          {expanded ? 'Hide paths' : `View ${group.paths.length} evaluated path${group.paths.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {group.paths.map((p) => (
            <button
              key={p.pathId}
              type="button"
              onClick={() => onPickPath(p.pathId)}
              className="block w-full rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-left text-[10px] font-mono text-slate-600 hover:border-slate-300"
              title={p.consequenceRelationId ?? p.pathId}
            >
              {p.handlerRef ?? p.pathId.slice(0, 18)}
              {p.consequenceRelationId && (
                <span className="block text-[8.5px] text-slate-400 truncate">relation: {p.consequenceRelationId}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Stage chain primitives ──────────────────────────────────────────────── */

const STAGE_STYLE: Record<string, { icon: typeof Network; cls: string; role: string }> = {
  system: { icon: Network, cls: 'border-slate-300 bg-slate-50', role: 'AI SYSTEM' },
  capability: { icon: Wrench, cls: 'border-indigo-200 bg-indigo-50', role: 'CAPABILITY' },
  handler: { icon: Braces, cls: 'border-sky-200 bg-sky-50', role: 'HANDLER' },
  resource: { icon: Database, cls: 'border-violet-200 bg-violet-50', role: 'RESOURCE' },
  consequence: { icon: Zap, cls: 'border-amber-300 bg-amber-50', role: 'CONSEQUENCE' },
};

function StageCard({ stage, label, sub, dominant }: { stage: string; label: string; sub?: string; dominant?: boolean }) {
  const s = STAGE_STYLE[stage];
  const Icon = s.icon;
  return (
    <div className={`rounded-lg border px-3 py-2 min-w-0 ${s.cls} ${dominant ? 'ring-1 ring-amber-300' : ''}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
        <Icon className="w-3 h-3" /> {s.role}
      </div>
      <div className={`mt-0.5 break-all leading-snug ${dominant ? 'text-sm font-extrabold text-amber-900' : 'text-[12px] font-semibold text-slate-800'}`}>
        {label}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Connector({ established, label }: { established: boolean; label?: string }) {
  if (!established) {
    return (
      <div className="flex items-center gap-1.5 px-1 min-w-[4rem]" data-testid="evidence-frontier-break">
        <div className="flex-1 border-t-2 border-dotted border-slate-300" />
        <HelpCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <div className="flex-1 border-t-2 border-dotted border-slate-300" />
      </div>
    );
  }
  return (
    <div className="flex items-center px-1 min-w-[3rem]">
      <div className="flex-1 border-t-2 border-emerald-400" />
      {label && <span className="px-1 text-[9px] text-slate-400">{label}</span>}
      <span className="text-emerald-500 text-[10px]">▶</span>
    </div>
  );
}

function MiniChain({ path, aiSystemName, bound }: { path: FlowActionPath; aiSystemName: string; bound: boolean }) {
  // Fact summary — no arrows. TYPOGRAPHIC_ARROW != RELATIONSHIP: the
  // presentation input carries path membership, not stage-to-stage edges.
  const rows: [typeof Bot, string, string][] = [
    [Bot, 'System', aiSystemName],
    [Braces, 'Handler', path.handlerRef ?? 'handler'],
    [Database, 'Target', sinkResource(path)],
  ];
  return (
    <div className="space-y-1.5">
      <dl className="space-y-1">
        {rows.map(([Icon, k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <dt className="w-12 flex-shrink-0 text-slate-400">{k}:</dt>
            <dd className="truncate font-mono">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="text-[9.5px] text-slate-400">
        {bound ? (
          'Exact consequence relation: established'
        ) : (
          <span className="inline-flex items-center gap-1">
            <HelpCircle className="w-3 h-3" /> Exact consequence relation: not established — frontier
          </span>
        )}
      </div>
    </div>
  );
}

function PathChain({
  path,
  label,
  aiSystemName,
  bound,
}: {
  path: FlowActionPath;
  label: ConsequenceLabelLike;
  aiSystemName: string;
  bound: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-stretch gap-1.5" data-testid="focused-path-chain">
      <StageCard stage="system" label={aiSystemName} sub="system under evaluation" />
      <Connector established={false} />
      <StageCard stage="capability" label={capabilityLabel(path)} sub="evaluated capability" />
      <Connector established={false} />
      <StageCard stage="handler" label={path.handlerRef ?? 'handler'} sub={path.handlerFunctionId ? 'invocable handler' : 'invocable handler (function id not bound)'} />
      {/* ONE canonical consequenceRelationId = ONE established edge.
          Target resource is metadata ON the relation, not a second edge —
          ONE_CANONICAL_RELATION != TWO_DISPLAY_EDGES. */}
      <Connector established={bound} label={bound ? 'established consequence relation' : undefined} />
      <StageCard
        stage="consequence"
        label={label.label}
        sub={
          [
            label.effect ?? undefined,
            label.resource ? `target: ${label.resource}` : path.sinkTargetIds?.length ? `target: ${sinkResource(path)}` : undefined,
            label.technical,
            bound ? 'established relation' : 'frontier — relation not established',
          ]
            .filter(Boolean)
            .join(' · ')
        }
        dominant
      />
    </div>
  );
}

function AuthorityRail({ path }: { path: FlowActionPath }) {
  if (!path.planes) {
    return (
      <p className="text-xs text-slate-500">
        Authority plane states are not bound to this path in the evaluated snapshot — not assessed is not failure.
      </p>
    );
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Authority &amp; evidence planes</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {PLANE_ORDER.map((k) => (
          <div key={k} className="rounded-lg border border-slate-200 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-widest text-slate-500">{PLANE_LABEL[k]}</div>
            <div className="mt-1">{stateChip(path.planes?.[k])}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-slate-500">
        Each plane is an independent evidence question. Code Capable establishes what the code can do —
        not that it was authorized or observed.
      </p>
    </div>
  );
}

function ProofPanel({
  path,
  evaluationIdentity,
}: {
  path: FlowActionPath;
  evaluationIdentity?: { evaluationId?: string; commitSha?: string | null; sourceCommitShort?: string } | null;
}) {
  const rows: [string, string | undefined][] = [
    ['Handler', path.handlerRef],
    ['Handler function', path.handlerFunctionId],
    ['Consequence relation', path.consequenceRelationId],
    ['Target resource', path.sinkTargetIds?.[0]],
    ['Downstream operations', path.downstreamOperationIds?.length ? `${path.downstreamOperationIds.length}` : undefined],
    ['Evaluation', evaluationIdentity?.evaluationId],
    ['Source commit', evaluationIdentity?.commitSha ?? evaluationIdentity?.sourceCommitShort ?? undefined],
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">Evidence &amp; provenance</div>
      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex gap-2 min-w-0">
            <dt className="text-slate-400 w-32 flex-shrink-0">{k}</dt>
            <dd className="font-mono text-slate-700 break-all">{v}</dd>
          </div>
        ))}
      </dl>
      {path.contextBindings && path.contextBindings.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">Context bindings</div>
          <ul className="space-y-0.5 text-[10.5px] text-slate-600">
            {path.contextBindings.map((b, i) => (
              <li key={i}>
                <span className="font-mono">{b.contextKind}</span> — {b.state.replace(/_/g, ' ')}
                {b.tenantFilterBound != null && ` · tenant filter ${b.tenantFilterBound ? 'bound' : 'not bound'}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {path.limitations && path.limitations.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">Limitations</div>
          <ul className="space-y-0.5 text-[10.5px] text-slate-500">
            {path.limitations.map((l, i) => <li key={i}>· {l}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Shield className="w-3 h-3" /> Provenance shown is exact evaluation identity — not regenerated or re-analyzed.
      </p>
    </div>
  );
}
