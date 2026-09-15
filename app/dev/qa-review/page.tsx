import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

/**
 * Development-only manual QA review hub.
 *
 * Hard production gate: this route renders 404 unless NODE_ENV=development
 * AND test mode is enabled — the same conditions under which the `test-user`
 * NextAuth provider exists. It is noindex, not in the sitemap, and not linked
 * from public navigation.
 *
 * It links to the canonical seeded E2E fixtures (scripts/playwright-seed.ts)
 * and to the public Kestrel flagship demo. The Kestrel demo is NOT copied into
 * assurance_evaluations / audit_orchestrator_runs — it is a public sanitized
 * projection, not a QA fixture.
 */

const QA_MODE =
  process.env.NODE_ENV === 'development' &&
  (process.env.PLAYWRIGHT_TEST === 'true' || process.env.NEXT_PUBLIC_TEST_MODE === 'true')

export const metadata: Metadata = {
  title: 'QA Review (dev only) | HAIEC',
  robots: { index: false, follow: false },
}

const FIXTURE_LINKS: { label: string; href: string; note?: string }[] = [
  {
    label: 'REVIEW Assurance Report',
    href: '/dashboard/assurance/evaluations/pw-seed-sys-H-review-eval-1',
    note: 'H-Review: Hiring Assistant',
  },
  {
    label: 'ALLOW Assurance Report',
    href: '/dashboard/assurance/evaluations/pw-seed-sys-G-allow-eval-1',
    note: 'G-Allow: Content Moderation API',
  },
  {
    label: 'BLOCK Assurance Report',
    href: '/dashboard/assurance/evaluations/pw-seed-sys-I-block-eval-1',
    note: 'I-Block: Unmonitored Agent',
  },
  {
    label: 'System Workspace',
    href: '/dashboard/ai-inventory/systems/pw-seed-sys-E-evidence',
    note: 'E-Evidence: Translation Service',
  },
  {
    label: 'System Constellation — Current',
    href: '/dashboard/ai-inventory/systems/pw-seed-sys-G-allow/action-map',
  },
  {
    label: 'System Constellation — Evaluation Snapshot',
    href: '/dashboard/ai-inventory/systems/pw-seed-sys-G-allow/action-map?basis=evaluation&evaluationId=pw-seed-sys-G-allow-eval-1',
  },
  { label: 'NYC workflow', href: '/dashboard/nyc-hiring' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Settings', href: '/dashboard/settings' },
  { label: 'Billing', href: '/dashboard/billing' },
]

const KESTREL_LINKS: { label: string; href: string; download?: boolean }[] = [
  { label: 'View Executive Assurance Report', href: '/sample-reports/kestrel' },
  { label: 'View Technical Profile', href: '/sample-reports/kestrel' },
  { label: 'View Auditor / Evidence Profile', href: '/sample-reports/kestrel' },
  { label: 'Explore System Constellation', href: '/sample-reports/kestrel/constellation' },
  { label: 'Download Executive PDF', href: '/demo/kestrel/kestrel-assurance-executive.pdf', download: true },
  { label: 'Download Technical PDF', href: '/demo/kestrel/kestrel-assurance-technical.pdf', download: true },
  { label: 'Download Assurance Evidence PDF', href: '/demo/kestrel/kestrel-assurance-auditor.pdf', download: true },
  { label: 'Machine-readable JSON', href: '/demo/kestrel/kestrel-assurance.machine.json', download: true },
  { label: 'Artifact Manifest', href: '/demo/kestrel/manifest.json', download: true },
]

export default function QaReviewPage() {
  if (!QA_MODE) notFound()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold tracking-wide uppercase mb-6">
          Development-only — not available in production
        </span>
        <h1 className="text-3xl font-bold text-white">QA Review Hub</h1>
        <p className="mt-2 text-sm text-slate-400">
          Manual review surface for the canonical E2E fixtures and the flagship Kestrel demo.
        </p>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Signed in as</div>
              <div className="text-slate-200 font-medium mt-0.5">test@haiec.com</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Selected organization</div>
              <div className="text-slate-200 font-medium mt-0.5">Test Organization</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Entitlement</div>
              <div className="text-slate-200 font-medium mt-0.5">Enterprise / Active</div>
            </div>
          </div>
        </div>

        <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-slate-400">
          Authenticated QA fixtures
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Seeded Playwright fixtures in Test Organization (test-org-id). These are test records —
          not the real Kestrel evaluation.
        </p>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          {FIXTURE_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 hover:border-slate-600 transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-slate-200">{l.label}</div>
                {l.note && <div className="text-[11px] text-slate-500">{l.note}</div>}
              </div>
              <span className="text-slate-600">→</span>
            </Link>
          ))}
        </div>

        <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-emerald-400">
          Flagship real-repository demo
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Kestrel Agentic AI Assurance — sanitized projection of the frozen Flagship-4 evaluation
          (commit 5e65843). Public demo, not an account-owned fixture.
        </p>
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="text-lg font-bold text-white">Kestrel Agentic AI Assurance</div>
          <div className="text-xs text-slate-400 mb-3">Decision: REVIEW · 44 code-capable consequential action paths</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {KESTREL_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                {...(l.download ? { download: true } : {})}
                className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 hover:border-emerald-500/50 transition-colors"
              >
                {l.label}
                <span className="text-emerald-500">→</span>
              </a>
            ))}
          </div>
        </div>

        <p className="mt-10 text-[11px] text-slate-600">
          Sign-in uses the existing test-user NextAuth provider (dev + test-mode only). No fake
          cookies, no auth bypass, no production availability.
        </p>
      </div>
    </div>
  )
}
