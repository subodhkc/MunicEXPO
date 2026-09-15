import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kestrel System Constellation — Evaluation Snapshot | HAIEC',
  description:
    'Consequence-first System Constellation for the sanitized Kestrel evaluation snapshot: evidence-backed paths from the AI agent through handlers to consequential operations, with the explicit evidence frontier.',
  openGraph: {
    title: 'Kestrel System Constellation — Evaluation Snapshot | HAIEC',
    description:
      'Consequence-first view of a real repository evaluation: what the AI can reach, what controls apply, and where the evidence ends.',
    url: 'https://www.haiec.com/sample-reports/kestrel/constellation',
    siteName: 'HAIEC',
    type: 'article',
  },
  alternates: {
    canonical: 'https://www.haiec.com/sample-reports/kestrel/constellation',
  },
}

export default function KestrelConstellationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
