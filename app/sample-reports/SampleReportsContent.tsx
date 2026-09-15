'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  FileText,
  Shield,
  Scale,
  GitBranch,
  ExternalLink,
  ChevronRight,
  Eye,
  ArrowRight,
  X,
  Maximize2,
  Minimize2,
  CheckCircle2,
} from 'lucide-react'
import {
  SAMPLE_ARTIFACTS,
  SAMPLE_ARTIFACT_COUNT,
  SAMPLE_CATEGORIES,
  type SampleArtifact,
} from '@/data/sample-reports'

// Icon mapping by product owner (presentation only, not truth)
const PRODUCT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Evidence-Bound Assurance': Shield,
  'Compliance Wizard': FileText,
  'AI Security Scanner': Shield,
  'NYC Bias Audit': Scale,
  'GitHub App': GitBranch,
  'AI Security Runtime Engine': Shield,
  'Colorado AI Service': FileText,
}

function iconFor(artifact: SampleArtifact) {
  return PRODUCT_ICONS[artifact.productOwner] || FileText
}

// Integrity label mapping (per artifact, not global)
const INTEGRITY_LABELS: Record<string, string> = {
  HASH_BOUND: 'Hash-bound example',
  NOT_VERIFIED: 'Integrity metadata not independently verified',
  NOT_APPLICABLE: 'Not applicable',
}

const CAPABILITY_LABELS: Record<string, string> = {
  CURRENT: 'Current generated example',
  PARTIAL: 'Partial capability',
  HISTORICAL: 'Historical example',
}

export default function SampleReportsContent() {
  const [selectedId, setSelectedId] = useState<string>(SAMPLE_ARTIFACTS[0].id)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)

  const filtered = activeCategory === 'all'
    ? SAMPLE_ARTIFACTS
    : SAMPLE_ARTIFACTS.filter(a => a.category === activeCategory)

  const selected = SAMPLE_ARTIFACTS.find(a => a.id === selectedId) || SAMPLE_ARTIFACTS[0]

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
              Preview the structure and level of detail HAIEC can produce.
              Each sample is labeled by type: current generated, historical, or synthetic demonstration.
              Structured outputs designed for technical, executive, and assurance review.
            </p>
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {SAMPLE_ARTIFACT_COUNT} sample deliverables
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-500" />
                Framework mapping, not certification
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured flagship — Kestrel real-repository example */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              Real repository example
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Current generated example
            </span>
            <span className="text-[10px] text-slate-500">Sanitized · Kestrel / AI Service Call Agent · commit 5e65843</span>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Kestrel Agentic AI Assurance</h2>
              <div className="mt-3 flex items-center gap-5">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Decision</div>
                  <div className="text-2xl font-extrabold text-amber-300">REVIEW</div>
                </div>
                <div>
                  <div className="text-3xl font-extrabold text-white">44</div>
                  <div className="text-[10px] text-slate-500">code-capable consequential action paths</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-400 max-w-xl leading-relaxed">
                HAIEC established what the implementation can cause. Policy authority, effective
                runtime permission and observed execution were not established by the available
                evidence — shown explicitly, not assumed.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/sample-reports/kestrel"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  View Assurance Report <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/sample-reports/kestrel/constellation"
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium rounded-lg transition-colors"
                >
                  Explore System Constellation
                </Link>
              </div>
            </div>
            <div className="hidden sm:block text-[11px] text-slate-500 max-w-[220px] leading-relaxed border-l border-slate-800 pl-5">
              Generated from one frozen evaluation — not a synthetic scenario. Digest-bound
              artifacts and machine export included.
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {SAMPLE_CATEGORIES.map(cat => (
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
                const Icon = iconFor(artifact)
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
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                            {artifact.badge}
                          </span>
                        </div>
                        <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                          {artifact.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{artifact.productOwner}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                            {CAPABILITY_LABELS[artifact.currentCapability]}
                          </span>
                        </div>
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
                          {artifact.demonstrates.map((item, j) => (
                            <div key={j} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="text-[11px] text-slate-400">{item}</span>
                            </div>
                          ))}
                        </div>
                        {/* Per-artifact provenance */}
                        <div className="mt-3 space-y-1 text-[10px] text-slate-500">
                          <div>
                            <span className="text-slate-600">Integrity:</span> {INTEGRITY_LABELS[artifact.integrityState]}
                          </div>
                          {artifact.limitations.length > 0 && (
                            <div>
                              <span className="text-slate-600">Limitations:</span> {artifact.limitations[0]}
                            </div>
                          )}
                        </div>
                        <Link
                          href={artifact.cta.href}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          {artifact.cta.label}
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
                  {CAPABILITY_LABELS[selected.currentCapability]}
                </p>
                <Link
                  href={selected.cta.href}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {selected.cta.label}
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
                    <p className="text-xs text-slate-400">{selected.productOwner}</p>
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
                  <p className="text-xs text-slate-500">{CAPABILITY_LABELS[selected.currentCapability]}</p>
                  <Link
                    href={selected.cta.href}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {selected.cta.label}
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
            Every report above was produced by HAIEC engines. Start with a free
            self-audit to see where you stand.
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
