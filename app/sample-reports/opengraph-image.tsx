import { createOGImage, size, contentType } from '@/lib/og-image-template'

export const dynamic = 'force-dynamic'

export { size, contentType }

export default function SampleReportsOGImage() {
  return createOGImage({
    title: 'Sample Assurance Reports',
    category: 'Resources',
    insight: 'Preview sample output: NYC LL144, Colorado AI Act, SOC 2 control mapping, HIPAA mapping, SARIF. Framework mapping — not certification',
    url: 'haiec.com/sample-reports',
    accentColor: '#06b6d4',
  })
}
