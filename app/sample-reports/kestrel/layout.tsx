import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kestrel — Agentic AI Assurance Report Example | HAIEC',
  description:
    'A sanitized real-repository assurance example: HAIEC evaluated the Kestrel AI Service Call Agent and produced a bounded REVIEW assurance decision — 44 code-capable consequential action paths, with policy, runtime, and observed evidence explicitly not assessed.',
  openGraph: {
    title: 'Kestrel — Agentic AI Assurance Report Example | HAIEC',
    description:
      'Sanitized real-repository AI assurance example: bounded REVIEW decision, 44 code-capable consequential action paths, explicit evidence frontier.',
    url: 'https://www.haiec.com/sample-reports/kestrel',
    siteName: 'HAIEC',
    type: 'article',
  },
  alternates: {
    canonical: 'https://www.haiec.com/sample-reports/kestrel',
  },
  robots: { index: true, follow: true },
}

export default function KestrelDemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
