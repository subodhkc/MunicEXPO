import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kestrel — Release Comparison Example | HAIEC',
  description:
    'Two frozen evaluations of the same AI system, compared: 12 established control changes (DECLARED → DECLARED + PATH_BOUND), 99 unresolved facts, overall INCONCLUSIVE — qualified evidence, not blanket claims.',
  openGraph: {
    title: 'Kestrel — Release Comparison Example | HAIEC',
    description:
      'Evidence-bound release comparison: qualified control change established between two evaluated releases; unresolved remains explicit, never absent.',
    url: 'https://www.haiec.com/sample-reports/kestrel/compare',
    siteName: 'HAIEC',
    type: 'article',
  },
  alternates: {
    canonical: 'https://www.haiec.com/sample-reports/kestrel/compare',
  },
  robots: { index: true, follow: true },
}

export default function KestrelCompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
