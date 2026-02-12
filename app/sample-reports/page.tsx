'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  FileText,
  Shield,
  Scale,
  GitBranch,
  Scan,
  ExternalLink,
  ChevronRight,
  Eye,
  ArrowRight,
  X,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Lock,
  Hash,
} from 'lucide-react'

interface SampleArtifact {
  id: string
  name: string
  product: string
  productIcon: React.ComponentType<{ className?: string }>
  category: 'report' | 'artifact' | 'disclosure'
  description: string
  proves: string[]
  previewUrl: string
  ctaLabel: string
  ctaHref: string
  badge: string
  badgeColor: string
}

const artifacts: SampleArtifact[] = [
  {
    id: 'soc2-detailed',
    name: 'SOC 2 Type II Audit Report',
    product: 'Compliance Wizard',
    productIcon: FileText,
    category: 'report',
    description: 'Full 30+ page audit report with executive summary, control testing results, findings, and recommendations. Formatted for print with cover page and table of contents.',
    proves: [
      'Control environment assessment across CC1–CC9',
      'Testing procedures with sampling methodology',
      'Findings with risk levels and remediation timelines',
    ],
    previewUrl: '/demo/compliance-wizard-soc2-sample-report.html',
    ctaLabel: 'Get SOC 2 Ready',
    ctaHref: '/compliance-readiness',
    badge: 'SOC 2',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    id: 'soc2-artifact',
    name: 'SOC 2 Trust Artifact',
    product: 'AI Security Scanner',
    productIcon: Shield,
    category: 'artifact',
    description: 'Shareable compliance artifact with cryptographic verification. Maps findings to SOC 2, GDPR, ISO 27001, and OWASP controls. Includes contract-ready language.',
    proves: [
      'Evidence hash (SHA-256) for tamper-proof verification',
      'Compliance framework mapping with control IDs',
      'Legal use cases: VSQ, RFP, due diligence, insurance',
    ],
    previewUrl: '/demo/artifact-showcase.html',
    ctaLabel: 'Scan Your Code',
    ctaHref: '/security',
    badge: 'Trust Artifact',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'll144-report',
    name: 'NYC LL144 Compliance Assessment',
    product: 'NYC Bias Audit',
    productIcon: Scale,
    category: 'report',
    description: 'Executive dashboard with compliance score, bias audit status, critical gaps, and remediation roadmap. Covers all 22 LL144 requirements with pass/fail verdicts.',
    proves: [
      '22-point compliance checklist with verdicts',
      'Bias audit readiness assessment',
      'Gap analysis with prioritized remediation steps',
    ],
    previewUrl: '/demo/nyc-ll144-sample-report.html',
    ctaLabel: 'Start Bias Audit',
    ctaHref: '/services/nyc-bias-audit',
    badge: 'NYC LL144',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    id: 'll144-disclosure',
    name: 'NYC LL144 Public Disclosure',
    product: 'NYC Bias Audit',
    productIcon: Scale,
    category: 'disclosure',
    description: 'Employer-facing public notice page with selection rate tables by sex and race/ethnicity, methodology section, auditor information, and embed/QR/PDF sharing options.',
    proves: [
      'Selection rates by sex and race/ethnicity categories',
      'EEOC 4/5ths rule compliance with adverse impact flags',
      'Embeddable disclosure with QR code and PDF download',
    ],
    previewUrl: '/demo/nyc-ll144-sample-disclosure.html',
    ctaLabel: 'Start Bias Audit',
    ctaHref: '/services/nyc-bias-audit',
    badge: 'NYC LL144',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    id: 'll144-evidence',
    name: 'NYC LL144 Evidence Bundle',
    product: 'NYC Bias Audit',
    productIcon: Lock,
    category: 'artifact',
    description: '9-file SHA-256 evidence bundle with manifest, run spec, input hashes, validation report, analysis results, and methodology. Cryptographically sealed for audit trail.',
    proves: [
      '9 evidence files with individual SHA-256 hashes',
      'Deterministic reproducibility — same inputs produce same hashes',
      'Chain of custody from raw data to final verdict',
    ],
    previewUrl: '/demo/nyc-ll144-sample-evidence-bundle.html',
    ctaLabel: 'Start Bias Audit',
    ctaHref: '/services/nyc-bias-audit',
    badge: 'Evidence Bundle',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  {
    id: 'ai-security-scanner',
    name: 'AI Security Scanner Report',
    product: 'AI Security Scanner',
    productIcon: Scan,
    category: 'report',
    description: 'Static analysis report with executive dashboard, vulnerability findings by severity, code snippets, industry benchmarks, and remediation roadmap. Covers 78+ AI-specific security rules.',
    proves: [
      'AI attack surface analysis with risk score',
      'Vulnerability findings mapped to OWASP LLM Top 10',
      'Remediation roadmap with priority and timeline',
    ],
    previewUrl: '/demo/ai-security-scanner-sample-report.html',
    ctaLabel: 'Scan Your Code',
    ctaHref: '/security',
    badge: 'AI Security',
    badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  {
    id: 'github-app',
    name: 'GitHub App Security Controls Report',
    product: 'GitHub App',
    productIcon: GitBranch,
    category: 'report',
    description: 'Repository security controls assessment with branch protection, CI/CD configuration, policy enforcement, and security posture scoring. Auto-generated on every PR.',
    proves: [
      'Security controls score with pass/fail per control',
      'Branch protection and CI/CD configuration audit',
      'Remediation steps for each missing control',
    ],
    previewUrl: '/demo/github-app-sample-report.html',
    ctaLabel: 'Connect GitHub',
    ctaHref: '/github-integration',
    badge: 'GitHub App',
    badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  {
    id: 'colorado-ai-act',
    name: 'Colorado AI Act Compliance Assessment',
    product: 'Compliance Wizard',
    productIcon: FileText,
    category: 'report',
    description: 'SB24-205 compliance assessment with section-by-section scoring across 8 requirement areas, critical gap analysis, remediation roadmap, and resource estimates. Deadline: June 30, 2026.',
    proves: [
      '8-section compliance scoring against SB24-205 requirements',
      'Critical gaps with statutory references',
      'Phased remediation roadmap with cost estimates',
    ],
    previewUrl: '/demo/colorado-ai-act-sample-report.html',
    ctaLabel: 'Start Assessment',
    ctaHref: '/colorado-ai-act',
    badge: 'Colorado AI Act',
    badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
]

const categories = [
  { key: 'all', label: 'All Samples' },
  { key: 'report', label: 'Reports' },
  { key: 'artifact', label: 'Artifacts & Evidence' },
  { key: 'disclosure', label: 'Disclosures' },
]

export default function SampleReportsPage() {
  const [selectedId, setSelectedId] = useState<string>(artifacts[0].id)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)

  const filtered = activeCategory === 'all'
    ? artifacts
    : artifacts.filter(a => a.category === activeCategory)

  const selected = artifacts.find(a => a.id === selectedId) || artifacts[0]

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setIsMobilePreviewOpen(true)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-slate-950 to-slate-950" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
              <Eye className="w-3.5 h-3.5" />
              Preview Before You Buy
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              Sample Reports & Artifacts
            </h1>
            <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
              Enterprise-grade compliance output — the same reports your auditors, board, and regulators will see. 
              No mockups. These are real outputs from HAIEC engines.
            </p>
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                5 sample deliverables
              </span>
              <span className="flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-emerald-500" />
                SHA-256 verified
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-500" />
                Big 4 quality standard
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Category Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.key
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-slate-700/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split Panel Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex flex-col lg:flex-row gap-6 min-h-[700px]">
          
          {/* Left Panel — Artifact Cards */}
          <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 space-y-3 overflow-y-auto max-h-[800px] pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filtered.map((artifact, i) => {
                const Icon = artifact.productIcon
                const isActive = artifact.id === selectedId
                return (
                  <motion.button
                    key={artifact.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                    onClick={() => handleSelect(artifact.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all group ${
                      isActive
                        ? 'bg-slate-800/80 border-emerald-500/40 shadow-lg shadow-emerald-900/10'
                        : 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-800/50 hover:border-slate-600/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-800 border border-slate-700/50'
                      }`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${artifact.badgeColor}`}>
                            {artifact.badge}
                          </span>
                        </div>
                        <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                          {artifact.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{artifact.product}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 transition-transform ${
                        isActive ? 'text-emerald-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                      }`} />
                    </div>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-slate-700/50"
                      >
                        <p className="text-xs text-slate-400 leading-relaxed">{artifact.description}</p>
                        <div className="mt-2.5 space-y-1.5">
                          {artifact.proves.map((item, j) => (
                            <div key={j} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="text-[11px] text-slate-400">{item}</span>
                            </div>
                          ))}
                        </div>
                        <Link
                          href={artifact.ctaHref}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          {artifact.ctaLabel}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </motion.div>
                    )}
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Right Panel — iframe Preview (Desktop) */}
          <div className="hidden lg:flex flex-1 flex-col">
            <div className={`flex-1 rounded-xl border border-slate-700/50 bg-slate-900/30 overflow-hidden flex flex-col ${
              isFullscreen ? 'fixed inset-4 z-50 rounded-2xl shadow-2xl' : ''
            }`}>
              {/* Preview Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className="text-xs text-slate-400 font-mono truncate max-w-[300px]">
                    {selected.previewUrl}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={selected.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* iframe */}
              <div className="flex-1 bg-white">
                <AnimatePresence mode="wait">
                  <motion.iframe
                    key={selected.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    src={selected.previewUrl}
                    title={selected.name}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </AnimatePresence>
              </div>
              {/* Preview Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/80 border-t border-slate-700/50">
                <p className="text-xs text-slate-500">
                  Sample output — actual reports use your data
                </p>
                <Link
                  href={selected.ctaHref}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {selected.ctaLabel}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            {isFullscreen && (
              <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setIsFullscreen(false)} />
            )}
          </div>

          {/* Mobile Preview Modal */}
          <AnimatePresence>
            {isMobilePreviewOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 z-50 bg-black/80 flex flex-col"
              >
                {/* Mobile Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700/50">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{selected.name}</h3>
                    <p className="text-xs text-slate-400">{selected.product}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={selected.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                      aria-label="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => setIsMobilePreviewOpen(false)}
                      className="p-2 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                      aria-label="Close preview"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {/* Mobile iframe */}
                <div className="flex-1 bg-white">
                  <iframe
                    src={selected.previewUrl}
                    title={selected.name}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
                {/* Mobile Footer */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500">Sample output</p>
                  <Link
                    href={selected.ctaHref}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {selected.ctaLabel}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom CTA */}
      <section className="border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Ready to generate your own reports?
          </h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Every report above was generated by HAIEC engines — deterministic, reproducible, and audit-grade. 
            Start with a free self-audit to see where you stand.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/self-audit"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/30 flex items-center gap-2"
            >
              Free Self-Audit
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white font-semibold rounded-xl transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
