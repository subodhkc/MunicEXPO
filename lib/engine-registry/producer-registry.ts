/**
 * U1 — Canonical Producer Registry
 *
 * Single source of truth for evidence producer identities.
 * Independent of display names, package versions, and implementation classes.
 *
 * IMPORTANT: This registry does NOT connect producers. It only defines
 * canonical identities for use by U2 (Evidence Core) and U3 (Producer
 * Activation). MCP producers remain HELD per MCP_TO_SAAS_EVIDENCE_INGESTION_HOLD.
 */

// ─── Canonical Producer IDs ────────────────────────────────────────────────
//
// These are the authoritative identifiers for all evidence producers.
// New records MUST use these IDs. Historical records are translated via
// the compatibility map in `producer-id-compatibility.ts`.

export const PRODUCER_IDS = {
  /** SaaS Static Scanner — HAIEC Platform AI Security Scanner */
  SAAS_STATIC: 'saas-static',
  /** SaaS Runtime Scanner — Runtime attack/safety property testing */
  SAAS_RUNTIME: 'saas-runtime',
  /** AI Inventory — Discovery, cataloging, usage tracking */
  SAAS_INVENTORY: 'saas-inventory',
  /** Compliance Wizard V2 — Self-reported governance evidence */
  SAAS_WIZARD: 'saas-wizard',
  /** Regulatory Engine — Jurisdiction compliance checks */
  SAAS_REGULATORY: 'saas-regulatory',
  /** SARIF Import — External SARIF/scan results */
  SARIF_IMPORT: 'sarif-import',
  /** CI/CD Scanner — CI/CD pipeline security checks */
  CI_CD_SCANNER: 'ci-cd-scanner',
  /** NYC LL144 Bias Audit — Bias detection and compliance */
  NYC_LL144: 'nyc-ll144',
  /** LLMVerify — LLM input/output verification */
  LLVERIFY: 'llmverify',
  /** ISAF Logger — Training lineage evidence */
  ISAF_LOGGER: 'isaf-logger',
  /** OSNIT — Open Source Network Intelligence Tool */
  OSNIT: 'osnit',
  /** AIRRD — AI Risk and Readiness Diagnostic */
  AIRRD: 'airrd',
  /** Compliance Twin — Delta/regression evidence producer */
  COMPLIANCE_TWIN: 'compliance-twin',

  // ─── Future Producers (REGISTERED but NOT CONNECTED) ───────────────────
  /** AI AppSec MCP — Open-source static analysis (MCP package) */
  MCP_AI_APPSEC: 'mcp-ai-appsec',
  /** MCP Tenant Isolation — Tenant isolation checks (MCP package) */
  MCP_TENANT_ISOLATION: 'mcp-tenant-isolation',
  /** Future HAIEC Native Engine */
  NATIVE_ENGINE: 'native-engine',
} as const;

export type ProducerId = (typeof PRODUCER_IDS)[keyof typeof PRODUCER_IDS];

// ─── Producer Types ────────────────────────────────────────────────────────

export type ProducerType =
  | 'STATIC_ANALYSIS'
  | 'RUNTIME_TEST'
  | 'INVENTORY'
  | 'SELF_REPORT'
  | 'REGULATORY'
  | 'EXTERNAL_IMPORT'
  | 'CI_CD'
  | 'BIAS_AUDIT'
  | 'LLM_VERIFICATION'
  | 'LINEAGE'
  | 'OSINT'
  | 'READINESS'
  | 'DELTA'
  | 'NATIVE';

// ─── Producer Metadata ─────────────────────────────────────────────────────

export interface ProducerMetadata {
  /** Canonical producer ID — the authoritative identifier */
  producerId: ProducerId;
  /** Producer type classification */
  producerType: ProducerType;
  /** Human-readable name */
  displayName: string;
  /** Current implementation module (if active) */
  implementationModule: string | null;
  /** Current status */
  status: 'ACTIVE' | 'PARTIAL' | 'FUTURE' | 'HELD';
  /** Whether this producer is connected to the SaaS pipeline */
  connectedToPipeline: boolean;
  /** U3-A: Whether this producer is activated to the canonical Evidence Core */
  evidenceCoreActivated?: boolean;
  /** Legacy emitted IDs (for compatibility) */
  legacyIds: string[];
  /** Tables that store this producer's results */
  persistenceTables: string[];
  /** Current consumers of this producer's output */
  consumers: string[];
  /** U3 activation blockers (if any) */
  activationBlockers: string[];
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const PRODUCER_REGISTRY: Record<ProducerId, ProducerMetadata> = {
  [PRODUCER_IDS.SAAS_STATIC]: {
    producerId: PRODUCER_IDS.SAAS_STATIC,
    producerType: 'STATIC_ANALYSIS',
    displayName: 'SaaS Static Scanner',
    implementationModule: 'lib/ai-security/',
    status: 'ACTIVE',
    connectedToPipeline: true, // LEGACY PIPELINE CONNECTED (pre-U2)
    evidenceCoreActivated: true, // U3-A: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['static', 'static-analysis', 'static_scan'],
    persistenceTables: ['ai_security_scans', 'ai_security_findings'],
    consumers: ['audit-orchestrator', 'decision-pipeline', 'trust-artifacts', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_RUNTIME]: {
    producerId: PRODUCER_IDS.SAAS_RUNTIME,
    producerType: 'RUNTIME_TEST',
    displayName: 'SaaS Runtime Scanner',
    implementationModule: 'lib/ai-security-runtime/',
    status: 'ACTIVE',
    connectedToPipeline: true, // LEGACY PIPELINE CONNECTED (pre-U2)
    evidenceCoreActivated: true, // U3-A: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['runtime', 'runtime-test', 'runtime_test'],
    // U3-A CORRECTION: runtime_test_results does NOT exist.
    // Canonical tables: runtime_tests (execution), runtime_attacks, runtime_findings, runtime_execution_traces
    // Legacy table: runtime_security_tests (LEGACY_CONNECTED, read by old adapter, not by U3-A adapter)
    persistenceTables: ['runtime_tests', 'runtime_attacks', 'runtime_findings', 'runtime_execution_traces'],
    consumers: ['audit-orchestrator', 'decision-pipeline', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_INVENTORY]: {
    producerId: PRODUCER_IDS.SAAS_INVENTORY,
    producerType: 'INVENTORY',
    displayName: 'AI Inventory',
    implementationModule: 'lib/ai-inventory/',
    status: 'ACTIVE',
    connectedToPipeline: true,
    legacyIds: ['inventory', 'ai-inventory', 'ai_inventory'],
    persistenceTables: ['ai_inventory_entries', 'ai_systems'],
    consumers: ['audit-orchestrator', 'decision-pipeline'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_WIZARD]: {
    producerId: PRODUCER_IDS.SAAS_WIZARD,
    producerType: 'SELF_REPORT',
    displayName: 'Compliance Wizard V2',
    implementationModule: 'lib/wizard-v2/',
    status: 'ACTIVE',
    connectedToPipeline: true,
    legacyIds: ['wizard'],
    persistenceTables: ['wizard_progress', 'compliance_assessments'],
    consumers: ['audit-orchestrator', 'decision-pipeline'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_REGULATORY]: {
    producerId: PRODUCER_IDS.SAAS_REGULATORY,
    producerType: 'REGULATORY',
    displayName: 'Regulatory Engine',
    implementationModule: 'lib/audit-orchestrator/regulatory',
    status: 'ACTIVE',
    connectedToPipeline: true,
    legacyIds: ['regulatory'],
    persistenceTables: ['audit_engine_results'],
    consumers: ['audit-orchestrator'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SARIF_IMPORT]: {
    producerId: PRODUCER_IDS.SARIF_IMPORT,
    producerType: 'EXTERNAL_IMPORT',
    displayName: 'SARIF Import',
    implementationModule: 'lib/scan-import/',
    status: 'PARTIAL',
    connectedToPipeline: false,
    legacyIds: ['sarif', 'external'],
    persistenceTables: ['imported_scans'],
    consumers: [],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.CI_CD_SCANNER]: {
    producerId: PRODUCER_IDS.CI_CD_SCANNER,
    producerType: 'CI_CD',
    displayName: 'CI/CD Scanner',
    implementationModule: 'lib/ci/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['ci-cd', 'cicd'],
    persistenceTables: ['ci_scans'],
    consumers: ['trust-artifacts (cicdIntegrationActive flag)'],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.NYC_LL144]: {
    producerId: PRODUCER_IDS.NYC_LL144,
    producerType: 'BIAS_AUDIT',
    displayName: 'NYC LL144 Bias Audit',
    implementationModule: 'lib/nyc-*',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['nyc-ll144', 'bias-audit'],
    persistenceTables: ['bias_audits', 'nyc_audit_engagements', 'nyc_analysis_results'],
    consumers: ['nyc-audit reports', 'public disclosure'],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.LLVERIFY]: {
    producerId: PRODUCER_IDS.LLVERIFY,
    producerType: 'LLM_VERIFICATION',
    displayName: 'LLMVerify',
    implementationModule: 'lib/llmverify/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['llmverify', 'llm-verify'],
    persistenceTables: ['llmverify_results'],
    consumers: [],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.ISAF_LOGGER]: {
    producerId: PRODUCER_IDS.ISAF_LOGGER,
    producerType: 'LINEAGE',
    displayName: 'ISAF Logger',
    implementationModule: 'isaf-logger/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['isaf', 'isaf-logger'],
    persistenceTables: ['isaf_logs'],
    consumers: [],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.OSNIT]: {
    producerId: PRODUCER_IDS.OSNIT,
    producerType: 'OSINT',
    displayName: 'OSNIT',
    implementationModule: 'osnit/',
    status: 'PARTIAL',
    connectedToPipeline: false,
    legacyIds: ['osnit'],
    persistenceTables: ['osnit_analyses'],
    consumers: [],
    activationBlockers: ['U2 evidence envelope contract needed', 'completion status unclear'],
  },
  [PRODUCER_IDS.AIRRD]: {
    producerId: PRODUCER_IDS.AIRRD,
    producerType: 'READINESS',
    displayName: 'AIRRD',
    implementationModule: 'lib/airrd/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['airrd'],
    persistenceTables: ['airrd_scans', 'airrd_gmi_pillars'],
    consumers: [],
    activationBlockers: ['U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.COMPLIANCE_TWIN]: {
    producerId: PRODUCER_IDS.COMPLIANCE_TWIN,
    producerType: 'DELTA',
    displayName: 'Compliance Twin',
    implementationModule: 'lib/compliance-twin/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    legacyIds: ['compliance-twin', 'twin'],
    persistenceTables: ['monitored_systems', 'system_alerts', 'twin_evidence_bundles'],
    consumers: ['twin dashboard'],
    activationBlockers: ['U1: migrate customerId → organizationId', 'U2 evidence envelope contract needed'],
  },

  // ─── Future Producers (REGISTERED but NOT CONNECTED) ───────────────────
  [PRODUCER_IDS.MCP_AI_APPSEC]: {
    producerId: PRODUCER_IDS.MCP_AI_APPSEC,
    producerType: 'STATIC_ANALYSIS',
    displayName: 'AI AppSec (MCP)',
    implementationModule: null,
    status: 'HELD',
    connectedToPipeline: false,
    legacyIds: [],
    persistenceTables: [],
    consumers: [],
    activationBlockers: ['MCP_TO_SAAS_EVIDENCE_INGESTION_HOLD', 'U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.MCP_TENANT_ISOLATION]: {
    producerId: PRODUCER_IDS.MCP_TENANT_ISOLATION,
    producerType: 'STATIC_ANALYSIS',
    displayName: 'MCP Tenant Isolation',
    implementationModule: null,
    status: 'HELD',
    connectedToPipeline: false,
    legacyIds: [],
    persistenceTables: [],
    consumers: [],
    activationBlockers: ['MCP_TO_SAAS_EVIDENCE_INGESTION_HOLD', 'U2 evidence envelope contract needed'],
  },
  [PRODUCER_IDS.NATIVE_ENGINE]: {
    producerId: PRODUCER_IDS.NATIVE_ENGINE,
    producerType: 'NATIVE',
    displayName: 'HAIEC Native Engine',
    implementationModule: null,
    status: 'FUTURE',
    connectedToPipeline: false,
    legacyIds: [],
    persistenceTables: [],
    consumers: [],
    activationBlockers: ['Phase 5 — not yet built'],
  },
};

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Get producer metadata by canonical ID.
 */
export function getProducer(producerId: string): ProducerMetadata | null {
  return PRODUCER_REGISTRY[producerId as ProducerId] ?? null;
}

/**
 * Get all active producers (status = ACTIVE or PARTIAL).
 */
export function getActiveProducers(): ProducerMetadata[] {
  return Object.values(PRODUCER_REGISTRY).filter(
    (p) => p.status === 'ACTIVE' || p.status === 'PARTIAL'
  );
}

/**
 * Get all producers that are HELD (not to be connected).
 */
export function getHeldProducers(): ProducerMetadata[] {
  return Object.values(PRODUCER_REGISTRY).filter((p) => p.status === 'HELD');
}

/**
 * Check if a producer ID is a canonical ID.
 */
export function isCanonicalProducerId(id: string): boolean {
  return id in PRODUCER_REGISTRY;
}
