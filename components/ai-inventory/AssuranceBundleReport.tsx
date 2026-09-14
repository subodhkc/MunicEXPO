'use client';

import type { AssuranceEvidenceBundleV1 } from '@/lib/assurance/reporting-projection-bundle';
import { projectAssuranceReportProfile, resolveProofReference, type AssuranceReportProfile, type AssuranceReportSection } from '@/lib/assurance/report-profile-projection';

const STATE_LABEL: Record<string, string> = {
  ESTABLISHED: 'Established',
  PARTIAL: 'Partially established',
  UNKNOWN: 'Unknown',
  NOT_ASSESSED: 'Not assessed',
  UNSUPPORTED: 'Unsupported',
  NOT_APPLICABLE: 'Not applicable',
};

function PlaneStrip({ paths }: { paths: AssuranceEvidenceBundleV1['actionPaths'] }) {
  if (paths.length === 0) return <p className="text-sm text-slate-500">No action paths were evaluated in this bundle.</p>;
  return (
    <div className="space-y-2">
      {paths.map((p) => (
        <div key={p.pathId} className="rounded-lg border border-slate-200 p-3 break-inside-avoid">
          <p className="font-mono text-xs text-slate-500 break-all">Path {p.pathId.slice(0, 16)}…</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            {(['requested', 'policyAuthorized', 'effectivelyGranted', 'codeCapable', 'observed'] as const).map((plane) => (
              <div key={plane} className="rounded bg-slate-50 p-2">
                <div className="font-semibold">{plane.replace(/([A-Z])/g, ' $1').trim()}</div>
                <div className="mt-1">{STATE_LABEL[p.planes[plane]]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Inspect Proof — deterministic report-side drill-down over the same bundle.
 * Resolves exact evidence/action-path references; never re-analyzes.
 */
function InspectProof({ bundle, section }: { bundle: AssuranceEvidenceBundleV1; section: AssuranceReportSection }) {
  const refs = [...new Set([...(section.proofRefs ?? section.evidenceRefs ?? []), ...(section.actionPathRefs ?? [])])].sort();
  if (refs.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">No qualifying evidence reference is bound to this statement.</p>;
  }
  return (
    <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
        Inspect proof ({refs.length} reference{refs.length === 1 ? '' : 's'})
      </summary>
      <ul className="mt-2 space-y-2">
        {refs.map((ref) => {
          const resolved = resolveProofReference(bundle, ref);
          if (resolved.kind === 'ACTION_PATH' && resolved.path) {
            const p = resolved.path;
            return (
              <li key={ref} className="rounded bg-white p-2">
                <p className="font-mono break-all">action path {p.pathId.slice(0, 16)}…</p>
                <p className="mt-1 text-slate-600">
                  Planes — requested {STATE_LABEL[p.planes.requested]}, policy {STATE_LABEL[p.planes.policyAuthorized]},
                  granted {STATE_LABEL[p.planes.effectivelyGranted]}, capable {STATE_LABEL[p.planes.codeCapable]},
                  observed {STATE_LABEL[p.planes.observed]}.
                </p>
                {(p.registrationRelationId || p.dispatchRelationId || p.modelExposureRelationId) && (
                  <p className="mt-1 font-mono break-all text-slate-500">
                    Relations: {[p.registrationRelationId, p.modelExposureRelationId, p.dispatchRelationId, p.toolImplementationRelationId].filter(Boolean).join(', ')}
                  </p>
                )}
                {p.downstreamOperationIds.length > 0 && (
                  <p className="mt-1 font-mono break-all text-slate-500">Downstream operation references: {p.downstreamOperationIds.join(', ')}</p>
                )}
                {p.sinkTargetIds.length > 0 && (
                  <p className="mt-1 font-mono break-all text-slate-500">Target references: {p.sinkTargetIds.join(', ')}</p>
                )}
                {(p.contextBindings?.length ?? 0) > 0 && (
                  <p className="mt-1 text-slate-600">
                    Context bindings — {(p.contextBindings ?? []).map((b) => `${b.contextKind} ${b.state.toLowerCase().replace(/_/g, ' ')} (tenant context ${b.tenantContextPresent === true ? 'present' : b.tenantContextPresent === false ? 'absent' : 'not established'}, filter ${b.tenantFilterBound === true ? 'bound' : b.tenantFilterBound === false ? 'not bound' : 'not established'}, subject ${b.tenantSubjectBound === true ? 'bound' : b.tenantSubjectBound === false ? 'not bound' : 'not established'})`).join('; ')}.
                  </p>
                )}
                {p.limitations.length > 0 && <p className="mt-1 italic text-slate-500">Limitations: {p.limitations.join('; ')}</p>}
              </li>
            );
          }
          if (resolved.u5Member) {
            const m = resolved.u5Member;
            return (
              <li key={ref} className="rounded bg-white p-2">
                <p className="font-mono break-all">Assurance evidence {m.evidenceId}</p>
                <p className="mt-1 text-slate-600">
                  Claim {m.claimKey} — {m.claimState} · role {m.role} · class {m.epistemicClass} · producer {m.producerId}
                </p>
                {m.role === 'EXCLUDED' && (
                  <p className="mt-1 italic text-amber-700">
                    Excluded{ m.exclusionReason ? ` — ${m.exclusionReason}` : ''}. Excluded evidence is not positive support.
                  </p>
                )}
                {resolved.evidence && (
                  <p className="mt-1 text-slate-600">
                    Also bound as {resolved.evidence.facet}:{resolved.evidence.subjectId} — {STATE_LABEL[resolved.evidence.state] ?? resolved.evidence.state}.
                  </p>
                )}
              </li>
            );
          }
          if (resolved.kind === 'EVIDENCE' && resolved.evidence) {
            const e = resolved.evidence;
            return (
              <li key={ref} className="rounded bg-white p-2">
                <p className="font-mono break-all">{e.facet}:{e.subjectId}</p>
                <p className="mt-1 text-slate-600">
                  State {STATE_LABEL[e.state] ?? e.state} · coverage {e.coverage}
                  {e.producerId ? ` · producer ${e.producerId}` : ''}
                </p>
                {e.relationIds.length > 0 && <p className="mt-1 font-mono break-all text-slate-500">Relations: {e.relationIds.join(', ')}</p>}
                {e.evidenceRefs.length > 0 && <p className="mt-1 font-mono break-all text-slate-500">Evidence: {e.evidenceRefs.join(', ')}</p>}
                {e.limitations.length > 0 && <p className="mt-1 italic text-slate-500">Limitations: {e.limitations.join('; ')}</p>}
              </li>
            );
          }
          return (
            <li key={ref} className="rounded bg-white p-2">
              <p className="font-mono break-all">{ref}</p>
              <p className="mt-1 text-slate-500">No qualifying evidence reference is bound to this statement.</p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Section({ bundle, section }: { bundle: AssuranceEvidenceBundleV1; section: AssuranceReportSection }) {
  return (
    <section className="report-section break-inside-avoid">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{section.title}</h2>
      <p className="mt-1 text-sm text-slate-900">{section.summary}</p>
      {section.items && section.items.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {section.items.map((item, i) => <li key={i} className="break-words">{item}</li>)}
        </ul>
      )}
      {section.limitations && section.limitations.length > 0 && (
        <p className="mt-2 text-xs italic text-slate-500">Limitations: {section.limitations.join('; ')}</p>
      )}
      <InspectProof bundle={bundle} section={section} />
    </section>
  );
}

export function AssuranceBundleReport({ bundle, profile = 'executive', aiSystemDisplayName }: { bundle: AssuranceEvidenceBundleV1; profile?: AssuranceReportProfile; aiSystemDisplayName?: string | null }) {
  const projection = projectAssuranceReportProfile(bundle, profile);
  const decision = projection.sections.find((s) => s.key === 'decision');
  const selectedPathsSection = projection.sections.find((s) => s.key === 'selectedPaths');
  const selectedPathIds = new Set(selectedPathsSection?.actionPathRefs ?? []);
  const selectedPaths = bundle.actionPaths.filter((p) => selectedPathIds.has(p.pathId));
  return (
    <article className="assurance-bundle-report bg-white text-slate-900">
      <header className="border-b-2 border-slate-900 pb-6">
        <p className="text-xs font-mono uppercase tracking-[0.2em]">HAIEC</p>
        <h1 className="mt-2 text-3xl font-bold">Assurance Report</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-700">
          HAIEC traces consequential AI action paths and compares code capability with the
          authority and evidence available for the same evaluated scope.
        </p>
        <dl className="mt-3 text-sm">
          {aiSystemDisplayName && <div className="flex gap-2"><dt className="font-medium text-slate-600">AI System:</dt><dd>{aiSystemDisplayName}</dd></div>}
          <div className="flex gap-2"><dt className="font-medium text-slate-600">AI System ID:</dt><dd className="font-mono text-xs break-all">{projection.evaluationIdentity.aiSystemId}</dd></div>
          <div className="flex gap-2"><dt className="font-medium text-slate-600">Evaluation ID:</dt><dd className="font-mono text-xs break-all">{projection.evaluationIdentity.evaluationId}</dd></div>
          <div className="flex gap-2"><dt className="font-medium text-slate-600">Evaluation snapshot:</dt><dd>{projection.evaluationIdentity.evaluationSnapshotAt ?? 'not bound'}</dd></div>
          <div className="flex gap-2"><dt className="font-medium text-slate-600">Repository commit:</dt><dd className="font-mono text-xs break-all">{projection.evaluationIdentity.repositoryCommitSha ?? 'not bound'}</dd></div>
          <div className="flex gap-2"><dt className="font-medium text-slate-600">Methodology:</dt><dd>{projection.methodologyVersion ?? 'not bound'}</dd></div>
          <div className="flex gap-2"><dt className="font-medium text-slate-600">Evidence Bundle Digest:</dt><dd className="font-mono text-xs break-all">{projection.bundleDigest.slice(0, 16)}…</dd></div>
        </dl>
      </header>

      <section className="report-section break-inside-avoid">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Assurance Decision</h2>
        <p
          className={`mt-1 text-lg font-semibold ${
            projection.disposition === 'ALLOW'
              ? 'text-emerald-700'
              : projection.disposition === 'BLOCK'
                ? 'text-red-700'
                : 'text-amber-700'
          }`}
        >
          {projection.disposition}
        </p>
        <p className="mt-1 text-sm text-slate-700">{decision?.summary}</p>
        {decision && <InspectProof bundle={bundle} section={decision} />}
      </section>

      {projection.sections
        .filter((s) => s.key !== 'decision' && s.key !== 'fivePlanes')
        .map((s) => <Section key={s.key} bundle={bundle} section={s} />)}

      <section className="report-section break-inside-avoid">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Capability &amp; Authority Alignment</h2>
        <p className="mt-1 text-xs text-slate-500">
          Showing {projection.displayedPathCount} of {projection.totalPathCount} evaluated path(s).
          Selected for presentation; not an exhaustive absence claim.
        </p>
        <PlaneStrip paths={selectedPaths} />
      </section>

      <footer className="mt-8 border-t border-slate-300 pt-4 text-xs text-slate-500">
        <p>This report is projected from the exact Assurance Evidence Bundle. It does not recompute the assurance decision, mutate canonical evidence states, or rerun analyzers.</p>
      </footer>
    </article>
  );
}
