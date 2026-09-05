import { Metadata } from 'next'
import SampleReportsContent from './SampleReportsContent'

export const metadata: Metadata = {
  title: 'Sample Reports | AI Assurance Evidence & Framework Mapping | HAIEC',
  description: 'Preview sample HAIEC reports and evidence artifacts. NYC LL144 bias audit mapping, Colorado AI Act impact assessments, SOC 2 control mapping, HIPAA Security Rule mapping, EU AI Act documentation, and AI security scanner reports. Framework mapping — not certification or audit opinion.',
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
    'evidence bundle SHA-256',
    'framework mapping report',
    'AI assurance sample deliverables',
  ],
  openGraph: {
    title: 'Sample Reports | AI Assurance Evidence & Framework Mapping | HAIEC',
    description: 'Preview sample HAIEC reports: NYC LL144 bias audit mapping, Colorado AI Act assessments, SOC 2 control mapping, HIPAA Security Rule mapping, and AI security scanner output. Framework mapping — not certification.',
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
    description: 'Preview sample reports: NYC LL144, Colorado AI Act, SOC 2 control mapping, HIPAA mapping, AI security scanner. Framework mapping — not certification.',
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
          description: 'Sample HAIEC reports and evidence artifacts covering NYC LL144, Colorado AI Act, SOC 2 control mapping, HIPAA Security Rule mapping, EU AI Act, and AI security. Framework mapping — not certification or audit opinion.',
          url: 'https://www.haiec.com/sample-reports',
          numberOfItems: 12,
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'NYC LL144 Compliance Assessment Report',
              description: 'Executive dashboard with compliance score, bias audit status, and 22-point LL144 requirement checklist with pass/fail verdicts.',
              url: 'https://www.haiec.com/sample-reports#ll144-report',
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'NYC LL144 Public Disclosure',
              description: 'Employer-facing public notice with selection rate tables by sex and race/ethnicity, EEOC 4/5ths rule compliance, and embeddable disclosure.',
              url: 'https://www.haiec.com/sample-reports#ll144-disclosure',
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: 'NYC LL144 Evidence Bundle',
              description: '9-file SHA-256 evidence bundle with manifest, validation report, and cryptographic chain of custody.',
              url: 'https://www.haiec.com/sample-reports#ll144-evidence',
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: 'Colorado AI Act Compliance Assessment',
              description: 'SB 26-189 compliance assessment with 8-section scoring, critical gap analysis, and phased remediation roadmap.',
              url: 'https://www.haiec.com/sample-reports#colorado-ai-act',
            },
            {
              '@type': 'ListItem',
              position: 5,
              name: 'Colorado AI Impact Assessment',
              description: 'CRS §6-1-1703 deployer impact assessment with training data analysis, bias testing benchmarks, and assessor evidence inputs. Framework mapping — not a third-party certification.',
              url: 'https://www.haiec.com/sample-reports#colorado-impact-assessment',
            },
            {
              '@type': 'ListItem',
              position: 6,
              name: 'Colorado AI Consumer Notice',
              description: 'CRS §6-1-1704 consumer notice covering AI disclosure, opt-out instructions, and adverse decision appeal process.',
              url: 'https://www.haiec.com/sample-reports#colorado-consumer-notice',
            },
            {
              '@type': 'ListItem',
              position: 7,
              name: 'Colorado ADMT Act Record Retention Framework',
              description: '3-year compliance record retention framework with documentation standards for technical documentation, consumer notices, and consumer rights requests.',
              url: 'https://www.haiec.com/sample-reports#colorado-risk-policy',
            },
            {
              '@type': 'ListItem',
              position: 8,
              name: 'SOC 2 Control Mapping Report',
              description: 'Sample report mapping HAIEC evidence to SOC 2 Trust Services Criteria (CC1-CC9). Framework mapping — not a SOC 2 audit opinion or Type II attestation.',
              url: 'https://www.haiec.com/sample-reports#soc2-detailed',
            },
            {
              '@type': 'ListItem',
              position: 9,
              name: 'AI Security Scanner Report',
              description: 'Static analysis report with OWASP LLM Top 10 vulnerability findings, industry benchmarks, and remediation roadmap.',
              url: 'https://www.haiec.com/sample-reports#ai-security-scanner',
            },
            {
              '@type': 'ListItem',
              position: 10,
              name: 'AI Runtime Security Test Report',
              description: 'Adversarial runtime test report with 148 live attacks, safety property evaluation, and HIPAA/SOC 2/EU AI Act framework mapping. Mapping — not compliance certification.',
              url: 'https://www.haiec.com/sample-reports#ai-runtime-security',
            },
            {
              '@type': 'ListItem',
              position: 11,
              name: 'SOC 2 Trust Artifact',
              description: 'Shareable compliance artifact with SHA-256 verification, multi-framework mapping, and contract-ready language.',
              url: 'https://www.haiec.com/sample-reports#soc2-artifact',
            },
            {
              '@type': 'ListItem',
              position: 12,
              name: 'GitHub App Security Controls Report',
              description: 'Repository security controls assessment with branch protection audit, CI/CD configuration, and security posture scoring.',
              url: 'https://www.haiec.com/sample-reports#github-app',
            },
          ],
        },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'What does a NYC Local Law 144 bias audit report look like?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'A NYC LL144 bias audit report includes an executive dashboard with compliance score, 22-point requirement checklist with pass/fail verdicts, selection rate tables by sex and race/ethnicity, EEOC 4/5ths rule analysis, and a prioritized remediation roadmap. HAIEC generates these reports deterministically with SHA-256 evidence verification.',
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
                text: 'HAIEC uses deterministic, rule-based engines - not AI or ML models. Every report is reproducible: the same inputs always produce the same outputs. All evidence is SHA-256 hashed for tamper-evident verification. Reports map findings to specific statutory references and control IDs.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I use these sample reports for HIPAA AI security mapping?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'The AI Runtime Security Test Report includes framework mapping to HIPAA Security Rule controls, SOC 2, NIST AI RMF, ISO 42001, and EU AI Act. It provides empirical evidence from adversarial attacks with safety property evaluation, which can support HIPAA Security Rule documentation for AI systems handling protected health information (PHI). This is framework mapping — not a HIPAA compliance certification or audit opinion.',
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
          offers: {
            '@type': 'AggregateOffer',
            lowPrice: '0',
            highPrice: '499',
            priceCurrency: 'USD',
            offerCount: 4,
          },
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
