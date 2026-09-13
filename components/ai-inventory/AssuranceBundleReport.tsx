'use client';

import type { AssuranceEvidenceBundleV1 } from '@/lib/assurance/reporting-projection-bundle';
import { projectAssuranceReportProfile, type AssuranceReportProfile, type AssuranceReportSection } from '@/lib/assurance/report-profile-projection';

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
        <div key={p.pathId} className="rounded-lg border border-slate-200 p-3">
          <p className="font-mono text-xs text-slate-500">Path {p.pathId.slice(0, 16)}…</p>
          <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
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

function Section({ section }: { section: AssuranceReportSection }) {
  return (
    <section className="report-section">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{section.title}</h2>
      <p className="mt-1 text-sm text-slate-900">{section.summary}</p>
      {section.items && section.items.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
      {section.limitations && section.limitations.length > 0 && (
        <p className="mt-2 text-xs italic text-slate-500">Limitations: {section.limitations.join('; ')}</p>
      )}
    </section>
  );
}

export function AssuranceBundleReport({ bundle, profile = 'executive' }: { bundle: AssuranceEvidenceBundleV1; profile?: AssuranceReportProfile }) {
  const projection = projectAssuranceReportProfile(bundle, profile);
  const decision = projection.sections.find((s) => s.key === 'decision');
  return (
    <article className="assurance-bundle-report bg-white text-slate-900">
      <header className="border-b-2 border-slate-900 pb-6">
        <p className="text-xs font-mono uppercase tracking-[0.2em]">HAIEC</p>
        <h1 className="mt-2 text-3xl font-bold">Assurance Report</h1>
        <p className="mt-2 text-sm">AI System: {projection.evaluationIdentity.aiSystemId}</p>
        <p className="text-sm">Evaluation: {projection.evaluationIdentity.evaluationId} · Snapshot: {projection.evaluationIdentity.evaluationSnapshotAt ?? 'not bound'}</p>
        <p className="text-sm font-mono">Bundle: {projection.bundleDigest.slice(0, 16)}…</p>
        <p className="mt-2 text-sm italic">HAIEC establishes what the available evidence supports — and shows what remains unproven.</p>
      </header>

      <section className="report-section">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Assurance Decision</h2>
        <p className="mt-1 text-lg font-semibold">{projection.disposition}</p>
        <p className="mt-1 text-sm text-slate-700">{decision?.summary}</p>
      </section>

      {projection.sections
        .filter((s) => s.key !== 'decision' && s.key !== 'fivePlanes')
        .map((s) => <Section key={s.key} section={s} />)}

      <section className="report-section">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Five Authority / Action Planes</h2>
        <PlaneStrip paths={bundle.actionPaths} />
      </section>

      <footer className="mt-8 border-t border-slate-300 pt-4 text-xs text-slate-500">
        <p>This report is a semantic projection of the Assurance Evidence Bundle. It does not recompute U5, rerun analyzers, or reinterpret evidence.</p>
      </footer>
    </article>
  );
}
