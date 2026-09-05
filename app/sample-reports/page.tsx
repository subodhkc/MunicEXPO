import { Metadata } from 'next'
import SampleReportsContent from './SampleReportsContent'
import { SAMPLE_ARTIFACTS, SAMPLE_ARTIFACT_COUNT } from '@/data/sample-reports'

// Build schema.org ItemList from the canonical manifest
const itemListElements = SAMPLE_ARTIFACTS.map((artifact, i) => ({
  '@type': 'ListItem',
  position: i + 1,
  name: artifact.name,
  description: artifact.description,
  url: `https://www.haiec.com/sample-reports#${artifact.id}`,
}))

export const metadata: Metadata = {
  title: 'Sample Reports | AI Assurance Evidence & Framework Mapping | HAIEC',
  description: 'Preview sample HAIEC reports and evidence artifacts. NYC LL144 bias audit mapping, Colorado AI Act impact assessments, SOC 2 control mapping, HIPAA Security Rule mapping, EU AI Act documentation, and AI security scanner reports. Framework mapping, not certification or audit opinion.',
  keywords: [
    'NYC Local Law 144 sample bias audit report',
    'NYC LL144 compliance report example',
    'NYC automated employment decision tool audit',
    'NYC AEDT bias audit sample',
    'NYC hiring AI compliance report',
    'bias audit report template NYC',
    'LL144 public disclosure example',
    'NYC employer AI audit requirements',
    'Colorado ADMT Act compliance report',
    'Colorado SB 26-189 sample report',
    'Colorado AI technical documentation template',
    'Colorado AI consumer notice example',
    'Colorado AI record retention framework sample',
    'SB 26-189 covered ADMT documentation',
    'Colorado ADMT Act deadline January 2027',
    'EU AI Act compliance report sample',
    'EU AI Act high-risk AI documentation',
    'HIPAA AI security mapping sample',
    'HIPAA Security Rule AI evidence',
    'SOC 2 control mapping sample',
    'SOC 2 Type II evidence artifact example',
    'AI security scanner report example',
    'OWASP LLM Top 10 vulnerability report',
    'AI assurance report examples',
    'AI governance evidence report',
    'AI bias audit report template',
    'framework mapping report',
    'AI assurance sample deliverables',
  ],
  openGraph: {
    title: 'Sample Reports | AI Assurance Evidence & Framework Mapping | HAIEC',
    description: 'Preview sample HAIEC reports: NYC LL144 bias audit mapping, Colorado AI Act assessments, SOC 2 control mapping, HIPAA Security Rule mapping, and AI security scanner output. Framework mapping, not certification.',
    type: 'website',
    url: 'https://www.haiec.com/sample-reports',
    siteName: 'HAIEC',
    images: [
      {
        url: 'https://www.haiec.com/og-sample-reports.jpg',
        width: 1200,
        height: 630,
        alt: 'HAIEC Sample Reports | AI Assurance Evidence & Framework Mapping',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sample Reports | AI Assurance Evidence | HAIEC',
    description: 'Preview sample reports: NYC LL144, Colorado AI Act, SOC 2 control mapping, HIPAA mapping, AI security scanner. Framework mapping, not certification.',
  },
  alternates: {
    canonical: 'https://www.haiec.com/sample-reports',
  },
  other: {
    'application/ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ItemList',
          name: 'HAIEC Sample AI Assurance Reports',
          description: 'Sample HAIEC reports and evidence artifacts covering NYC LL144, Colorado AI Act, SOC 2 control mapping, HIPAA Security Rule mapping, EU AI Act, and AI security. Framework mapping, not certification or audit opinion.',
          url: 'https://www.haiec.com/sample-reports',
          numberOfItems: SAMPLE_ARTIFACT_COUNT,
          itemListElement: itemListElements,
        },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'What does a NYC Local Law 144 bias audit report look like?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'A NYC LL144 bias audit report includes an executive dashboard with compliance score, requirement checklist with verdicts, selection rate tables by sex and race/ethnicity, and a prioritized remediation roadmap. HAIEC generates these reports with evidence verification.',
              },
            },
            {
              '@type': 'Question',
              name: 'What is included in a Colorado ADMT Act compliance assessment?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'A Colorado ADMT Act (SB 26-189) compliance assessment includes covered ADMT classification, developer technical documentation review, consumer notice template generation, post-adverse-outcome disclosure procedures, record retention framework, and a phased remediation roadmap with cost estimates. The compliance deadline is January 1, 2027.',
              },
            },
            {
              '@type': 'Question',
              name: 'How does HAIEC support compliance report accuracy?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'HAIEC uses deterministic, rule-based engines. Every report is reproducible: the same inputs always produce the same outputs. Reports map findings to specific statutory references and control IDs. Integrity metadata is included per artifact.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I use these sample reports for HIPAA AI security mapping?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'The AI Runtime Security Test Report includes framework mapping to HIPAA Security Rule controls, SOC 2, NIST AI RMF, ISO 42001, and EU AI Act. This is framework mapping, not a HIPAA compliance certification or audit opinion.',
              },
            },
          ],
        },
        {
          '@type': 'SoftwareApplication',
          name: 'HAIEC Platform',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: 'Evidence-bound assurance for consequential AI systems. Framework mapping for NYC LL144, Colorado AI Act, SOC 2, HIPAA Security Rule, EU AI Act, and OWASP LLM Top 10. Not a certification or audit opinion.',
          url: 'https://www.haiec.com',
          provider: {
            '@type': 'Organization',
            name: 'HAIEC',
            url: 'https://www.haiec.com',
          },
        },
      ],
    }),
  },
}

export default function SampleReportsPage() {
  return <SampleReportsContent />
}
