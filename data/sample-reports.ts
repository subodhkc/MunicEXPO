/**
 * Canonical Sample Report Manifest
 *
 * Single source of truth for public sample report/artifact metadata.
 * Every public sample must have:
 *   - id
 *   - name
 *   - productOwner
 *   - sampleType (synthetic_demonstration | historical_example | current_generated_example)
 *   - currentCapability (CURRENT | PARTIAL | HISTORICAL)
 *   - integrityState (HASH_BOUND | NOT_VERIFIED | NOT_APPLICABLE)
 *   - evidenceBasis
 *   - limitations
 *   - previewUrl
 *   - cta
 *   - frameworkMappings (optional)
 *
 * LOCK: A synthetic sample does not prove a customer condition.
 * LOCK: Integrity is per artifact, not global.
 * LOCK: Historical examples must not be presented as current generated deliverables.
 *
 * @version sample-reports-1.0.0
 */

export type SampleType = 'synthetic_demonstration' | 'historical_example' | 'current_generated_example';
export type CurrentCapability = 'CURRENT' | 'PARTIAL' | 'HISTORICAL';
export type IntegrityState = 'HASH_BOUND' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';
export type SampleCategory = 'report' | 'artifact' | 'disclosure';

export interface SampleArtifact {
  id: string;
  name: string;
  productOwner: string;
  sampleType: SampleType;
  currentCapability: CurrentCapability;
  integrityState: IntegrityState;
  category: SampleCategory;
  description: string;
  /** What the sample demonstrates (not "proves") */
  demonstrates: string[];
  evidenceBasis: string;
  limitations: string[];
  previewUrl: string;
  cta: { label: string; href: string };
  badge: string;
  frameworkMappings?: string[];
}

export const SAMPLE_ARTIFACTS: SampleArtifact[] = [
  {
    id: 'soc2-detailed',
    name: 'SOC 2 Control Mapping Report',
    productOwner: 'Compliance Wizard',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'Sample report mapping HAIEC evidence to SOC 2 Trust Services Criteria. Framework mapping, not a SOC 2 audit opinion or Type II attestation. Formatted for print with cover page and table of contents.',
    demonstrates: [
      'Control environment mapping across CC1 through CC9',
      'Testing procedures with sampling methodology',
      'Findings with risk levels and remediation timelines',
    ],
    evidenceBasis: 'Synthetic illustrative data mapped to SOC 2 Trust Services Criteria framework.',
    limitations: [
      'Framework mapping, not a SOC 2 audit opinion',
      'Not a Type II attestation',
      'Synthetic data does not represent a real organization',
    ],
    previewUrl: '/demo/compliance-wizard-soc2-sample-report.html',
    cta: { label: 'Get SOC 2 Ready', href: '/compliance-readiness' },
    badge: 'SOC 2',
    frameworkMappings: ['SOC 2'],
  },
  {
    id: 'soc2-artifact',
    name: 'SOC 2 Trust Artifact',
    productOwner: 'AI Security Scanner',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'artifact',
    description: 'Shareable compliance artifact mapping findings to SOC 2, GDPR, ISO 27001, and OWASP controls. Includes contract-ready language.',
    demonstrates: [
      'Compliance framework mapping with control IDs',
      'Legal use cases: VSQ, RFP, due diligence, insurance',
      'Shareable artifact format',
    ],
    evidenceBasis: 'Synthetic illustrative data mapped to multiple compliance frameworks.',
    limitations: [
      'Framework mapping, not certification',
      'Integrity metadata not independently verified for this sample',
      'Synthetic data does not represent a real scan',
    ],
    previewUrl: '/demo/artifact-showcase.html',
    cta: { label: 'Scan Your Code', href: '/security' },
    badge: 'Trust Artifact',
    frameworkMappings: ['SOC 2', 'GDPR', 'ISO 27001', 'OWASP'],
  },
  {
    id: 'll144-report',
    name: 'NYC LL144 Compliance Assessment',
    productOwner: 'NYC Bias Audit',
    sampleType: 'historical_example',
    currentCapability: 'HISTORICAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'Executive dashboard with compliance score, bias audit status, critical gaps, and remediation roadmap. Covers LL144 requirements with pass/fail verdicts.',
    demonstrates: [
      'Compliance checklist with verdicts',
      'Bias audit readiness assessment',
      'Gap analysis with prioritized remediation steps',
    ],
    evidenceBasis: 'Historical example output from the NYC bias audit workflow.',
    limitations: [
      'Historical example, not a current generated deliverable',
      'LL144 requirement count and structure may have changed',
      'Not an independent bias audit opinion',
    ],
    previewUrl: '/demo/nyc-ll144-sample-report.html',
    cta: { label: 'Start Bias Audit', href: '/services/nyc-bias-audit' },
    badge: 'NYC LL144',
    frameworkMappings: ['NYC LL144'],
  },
  {
    id: 'll144-disclosure',
    name: 'NYC LL144 Public Disclosure',
    productOwner: 'NYC Bias Audit',
    sampleType: 'historical_example',
    currentCapability: 'HISTORICAL',
    integrityState: 'NOT_VERIFIED',
    category: 'disclosure',
    description: 'Employer-facing public notice page with selection rate tables by sex and race/ethnicity, methodology section, auditor information, and embed/QR/PDF sharing options.',
    demonstrates: [
      'Selection rates by sex and race/ethnicity categories',
      'Methodology section with auditor information',
      'Embeddable disclosure with QR code and PDF download',
    ],
    evidenceBasis: 'Historical example of the NYC LL144 public disclosure format.',
    limitations: [
      'Historical example, not a current generated deliverable',
      'Four-fifths rule analysis is illustrative',
      'Not an actual employer disclosure',
    ],
    previewUrl: '/demo/nyc-ll144-sample-disclosure.html',
    cta: { label: 'Start Bias Audit', href: '/services/nyc-bias-audit' },
    badge: 'NYC LL144',
    frameworkMappings: ['NYC LL144'],
  },
  {
    id: 'll144-evidence',
    name: 'NYC LL144 Evidence Bundle',
    productOwner: 'NYC Bias Audit',
    sampleType: 'historical_example',
    currentCapability: 'HISTORICAL',
    integrityState: 'HASH_BOUND',
    category: 'artifact',
    description: 'Evidence bundle with manifest, run spec, input hashes, validation report, analysis results, and methodology. Includes integrity metadata for audit trail.',
    demonstrates: [
      'Evidence files with individual hash metadata',
      'Deterministic reproducibility: same inputs produce same outputs',
      'Chain of custody from raw data to final verdict',
    ],
    evidenceBasis: 'Historical example of the NYC bias audit evidence bundle format.',
    limitations: [
      'Historical example, not a current generated deliverable',
      'Hash metadata included but not independently verified',
      'Not an actual audit evidence bundle',
    ],
    previewUrl: '/demo/nyc-ll144-sample-evidence-bundle.html',
    cta: { label: 'Start Bias Audit', href: '/services/nyc-bias-audit' },
    badge: 'Evidence Bundle',
    frameworkMappings: ['NYC LL144'],
  },
  {
    id: 'ai-security-scanner',
    name: 'AI Security Scanner Report',
    productOwner: 'AI Security Scanner',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'CURRENT',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'Illustrative HAIEC Security Report generated through the HAIEC reporting pipeline using a synthetic demonstration scenario. Static analysis report with executive dashboard, security findings by severity, code snippets, industry risk context, and remediation roadmap.',
    demonstrates: [
      'AI attack surface analysis with findings by severity',
      'Vulnerability findings mapped to OWASP LLM Top 10',
      'Remediation roadmap with priority and timeline',
    ],
    evidenceBasis: 'Synthetic demonstration scenario analyzed by the HAIEC AI Security Scanner (121 static rules).',
    limitations: [
      'Synthetic scenario, not a real repository scan',
      'Risk context is illustrative',
      'Not an independent security assessment',
    ],
    previewUrl: '/demo/ai-security-scanner-sample-report.html',
    cta: { label: 'Scan Your Code', href: '/security' },
    badge: 'AI Security',
    frameworkMappings: ['OWASP LLM Top 10'],
  },
  {
    id: 'github-app',
    name: 'GitHub App Security Controls Report',
    productOwner: 'GitHub App',
    sampleType: 'historical_example',
    currentCapability: 'HISTORICAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'Repository security controls assessment with branch protection, CI/CD configuration, policy enforcement, and security posture scoring.',
    demonstrates: [
      'Security controls score with pass/fail per control',
      'Branch protection and CI/CD configuration audit',
      'Remediation steps for each missing control',
    ],
    evidenceBasis: 'Historical example of the GitHub App security controls report format.',
    limitations: [
      'Historical example, not a current generated deliverable',
      'Auto-generation on every PR is not confirmed for this sample',
      'Not an actual repository assessment',
    ],
    previewUrl: '/demo/github-app-sample-report.html',
    cta: { label: 'Connect GitHub', href: '/github-integration' },
    badge: 'GitHub App',
  },
  {
    id: 'colorado-ai-act',
    name: 'Colorado AI Act Compliance Assessment',
    productOwner: 'Compliance Wizard',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'SB 26-189 compliance assessment with covered ADMT classification, technical documentation review, consumer notice evaluation, post-adverse-outcome disclosure procedures, and record retention framework.',
    demonstrates: [
      'Compliance scoring against SB 26-189 requirements',
      'Critical gaps with statutory references',
      'Phased remediation roadmap with cost estimates',
    ],
    evidenceBasis: 'Synthetic illustrative data mapped to Colorado SB 26-189 requirements.',
    limitations: [
      'Framework mapping, not legal advice',
      'SB 26-189 requirements may have changed',
      'Synthetic data does not represent a real organization',
    ],
    previewUrl: '/demo/colorado-ai-act-sample-report.html',
    cta: { label: 'Start Assessment', href: '/colorado-ai-act' },
    badge: 'Colorado AI Act',
    frameworkMappings: ['Colorado SB 26-189'],
  },
  {
    id: 'colorado-impact-assessment',
    name: 'Colorado AI Impact Assessment',
    productOwner: 'Colorado AI Service',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'CRS 6-1-1703 deployer impact assessment with system description, training data analysis, known biases, performance metrics, affected populations, and human oversight measures.',
    demonstrates: [
      'Impact assessment sections per CRS 6-1-1703(3)',
      'Performance metrics with bias testing benchmarks',
      'Assessor evidence inputs (not a third-party certification)',
    ],
    evidenceBasis: 'Synthetic illustrative data mapped to Colorado CRS 6-1-1703 requirements.',
    limitations: [
      'Framework mapping, not a third-party certification',
      'Not legal advice',
      'Synthetic data does not represent a real assessment',
    ],
    previewUrl: '/demo/colorado-ai-impact-assessment-sample.html',
    cta: { label: 'Get Started', href: '/services/colorado-ai-compliance' },
    badge: 'Colorado Deployer',
    frameworkMappings: ['Colorado SB 26-189'],
  },
  {
    id: 'colorado-consumer-notice',
    name: 'Colorado AI Consumer Notice',
    productOwner: 'Colorado AI Service',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'disclosure',
    description: 'CRS 6-1-1704 consumer notice template covering AI disclosure, data collection, opt-out instructions, adverse decision appeal process, and contact information.',
    demonstrates: [
      'General and adverse decision notice in one document',
      'Opt-out and appeal process with timelines',
      'Consumer-friendly language per statutory requirements',
    ],
    evidenceBasis: 'Synthetic illustrative template mapped to Colorado CRS 6-1-1704 requirements.',
    limitations: [
      'Template, not legal advice',
      'Statutory requirements may have changed',
      'Not an actual consumer notice',
    ],
    previewUrl: '/demo/colorado-ai-consumer-notice-sample.html',
    cta: { label: 'Get Started', href: '/services/colorado-ai-compliance' },
    badge: 'Colorado Notice',
    frameworkMappings: ['Colorado SB 26-189'],
  },
  {
    id: 'ai-runtime-security',
    name: 'AI Runtime Security Test Report',
    productOwner: 'AI Security Runtime Engine',
    sampleType: 'historical_example',
    currentCapability: 'HISTORICAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'Controlled adversarial runtime test report with executive dashboard, attack-by-category breakdown, detailed findings with attack payloads and model responses, safety property evaluation, attack coverage matrix, and compliance framework mappings.',
    demonstrates: [
      'Empirical evidence from adversarial attacks across categories',
      'Safety property pass/fail evaluation',
      'Compliance mapping to SOC 2, HIPAA, NIST AI RMF, ISO 42001, EU AI Act',
    ],
    evidenceBasis: 'Historical example of the AI Runtime Security test report format.',
    limitations: [
      'Historical example, not a current generated deliverable',
      'Attack count and safety property count are illustrative',
      'Framework mapping, not compliance certification',
    ],
    previewUrl: '/demo/ai-runtime-security-sample-report.html',
    cta: { label: 'Run Runtime Test', href: '/dashboard/runtime-security' },
    badge: 'Runtime Engine',
    frameworkMappings: ['SOC 2', 'HIPAA', 'NIST AI RMF', 'ISO 42001', 'EU AI Act'],
  },
  {
    id: 'colorado-risk-policy',
    name: 'Colorado ADMT Act Record Retention Framework',
    productOwner: 'Colorado AI Service',
    sampleType: 'synthetic_demonstration',
    currentCapability: 'PARTIAL',
    integrityState: 'NOT_VERIFIED',
    category: 'report',
    description: 'SB 26-189 compliance record retention framework with documentation standards for technical documentation, consumer notices, post-adverse-outcome disclosures, and consumer rights requests.',
    demonstrates: [
      'NIST/ISO-aligned documentation standards',
      'Risk matrix with categories and ownership',
      'Incident response protocol with AG notification workflow',
    ],
    evidenceBasis: 'Synthetic illustrative framework mapped to Colorado SB 26-189 retention requirements.',
    limitations: [
      'Framework mapping, not legal advice',
      'Not a complete retention policy',
      'Synthetic data does not represent a real organization',
    ],
    previewUrl: '/demo/colorado-ai-risk-policy-sample.html',
    cta: { label: 'Get Started', href: '/services/colorado-ai-compliance' },
    badge: 'Colorado Policy',
    frameworkMappings: ['Colorado SB 26-189'],
  },
];

// ─── Derived counts (single source of truth) ─────────────────────────────────

export const SAMPLE_ARTIFACT_COUNT = SAMPLE_ARTIFACTS.length;

export const SAMPLE_CATEGORIES: { key: SampleCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All Samples' },
  { key: 'report', label: 'Reports' },
  { key: 'artifact', label: 'Artifacts & Evidence' },
  { key: 'disclosure', label: 'Disclosures' },
];
