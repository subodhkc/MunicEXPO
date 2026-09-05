import type { Metadata } from 'next'

// Note: page.tsx exports its own inline metadata which takes precedence.
// This file is kept for compatibility but is not the canonical metadata source.
export const metadata: Metadata = {
  title: 'Sample Reports | HAIEC | See What You\'ll Receive',
  description: 'Preview the structure and level of detail HAIEC can produce. Each sample is labeled as a live-run output, historical example, or synthetic demonstration. SOC 2 control mapping, NYC LL144, AI Security: structured outputs designed for technical, executive, and assurance review. Framework mapping — not certification.',
  keywords: [
    'sample assurance reports',
    'SOC 2 control mapping example',
    'NYC LL144 bias audit sample',
    'AI evidence bundle',
    'trust artifact preview',
    'HAIEC sample output',
    'framework mapping report',
  ],
  openGraph: {
    title: 'Sample Reports | HAIEC',
    description: 'Preview the structure and level of detail HAIEC can produce. Each sample is labeled as a live-run output, historical example, or synthetic demonstration. Framework mapping — not certification.',
    type: 'website',
    url: 'https://www.haiec.com/sample-reports',
  },
}
