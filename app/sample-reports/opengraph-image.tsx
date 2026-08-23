import { createOGImage, size, contentType } from '@/lib/og-image-template'

export const dynamic = 'force-dynamic'

export { size, contentType }

export default function SampleReportsOGImage() {
  return createOGImage({
    title: 'Sample AI Compliance Reports',
    category: 'Resources',
    insight: 'Preview real scan output: NYC LL144 bias audits, Colorado AI Act assessments, SOC 2 reports, HIPAA artifacts, SARIF',
    url: 'haiec.com/sample-reports',
    accentColor: '#06b6d4',
  })
}
