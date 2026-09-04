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
  /** SaaS IAM Grant — Effective grant observation from provider IAM (AWS first) */
  SAAS_IAM_GRANT: 'saas-iam-grant',

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
  | 'IAM_GRANT'
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
    evidenceCoreActivated: true, // U3-B: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['inventory', 'ai-inventory', 'ai_inventory'],
    persistenceTables: ['ai_systems', 'ai_configurations', 'risk_assessments', 'security_issues', 'usage_metrics', 'data_completeness', 'governance_triggers'],
    consumers: ['audit-orchestrator', 'decision-pipeline', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_WIZARD]: {
    producerId: PRODUCER_IDS.SAAS_WIZARD,
    producerType: 'SELF_REPORT',
    displayName: 'Compliance Wizard',
    implementationModule: 'lib/wizard-v2/',
    status: 'ACTIVE',
    connectedToPipeline: true,
    evidenceCoreActivated: true, // U3-B: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['wizard'],
    persistenceTables: ['compliance_assessments', 'compliance_assessment_completions', 'wizard_progress'],
    consumers: ['audit-orchestrator', 'decision-pipeline', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SAAS_REGULATORY]: {
    producerId: PRODUCER_IDS.SAAS_REGULATORY,
    producerType: 'REGULATORY',
    displayName: 'Regulatory Engine',
    implementationModule: 'lib/audit-orchestrator/',
    status: 'ACTIVE',
    connectedToPipeline: true,
    evidenceCoreActivated: true, // U3-B: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['regulatory'],
    persistenceTables: ['audit_engine_results', 'audit_orchestrator_runs'],
    consumers: ['audit-orchestrator', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.SARIF_IMPORT]: {
    producerId: PRODUCER_IDS.SARIF_IMPORT,
    producerType: 'EXTERNAL_IMPORT',
    displayName: 'SARIF Import',
    implementationModule: 'lib/scan-import/',
    status: 'ACTIVE', // U3-C: source-truth corrected — real parser + API + adapter now exist
    connectedToPipeline: false,
    evidenceCoreActivated: true, // U3-C: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['sarif', 'external'],
    persistenceTables: ['external_scan_imports', 'external_scan_findings'], // U3-C: corrected from nonexistent 'imported_scans'
    consumers: ['evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.CI_CD_SCANNER]: {
    producerId: PRODUCER_IDS.CI_CD_SCANNER,
    producerType: 'CI_CD',
    displayName: 'CI/CD Scanner',
    implementationModule: 'app/api/ci/scan-results/', // U3-C: corrected from nonexistent 'lib/ci/'
    status: 'ACTIVE',
    connectedToPipeline: false,
    evidenceCoreActivated: true, // U3-C: EVIDENCE_CORE_ACTIVATED
    legacyIds: ['ci-cd', 'cicd'],
    persistenceTables: ['ci_scan_results'], // U3-C: corrected from nonexistent 'ci_scans'
    consumers: ['trust-artifacts (cicdIntegrationActive flag)', 'evidence-core'],
    activationBlockers: [],
  },
  [PRODUCER_IDS.NYC_LL144]: {
    producerId: PRODUCER_IDS.NYC_LL144,
    producerType: 'BIAS_AUDIT',
    displayName: 'NYC LL144 Bias Audit',
    implementationModule: 'lib/nyc-ll144/',
    status: 'ACTIVE', // U3-C: source-confirmed — active workflow exists
    connectedToPipeline: false,
    evidenceCoreActivated: false, // U3-C: SPECIALIZED_WORKFLOW_KEEP_SEPARATE — deferred
    legacyIds: ['nyc-ll144', 'bias-audit'],
    persistenceTables: ['bias_audits', 'nyc_audit_engagements', 'nyc_analysis_results'],
    consumers: ['nyc-audit reports', 'public disclosure'],
    activationBlockers: ['U3-C: SPECIALIZED_WORKFLOW_KEEP_SEPARATE — bias_audits has no organizationId; nyc_audit_engagements.organizationId is nullable; specialized regulatory workflow not collapsed into generic Regulatory'],
  },
  [PRODUCER_IDS.LLVERIFY]: {
    producerId: PRODUCER_IDS.LLVERIFY,
    producerType: 'LLM_VERIFICATION',
    displayName: 'LLMVerify',
    implementationModule: null, // U3-C: corrected — no lib/llmverify/ module exists; package is enablement utility, not persisted Evidence producer
    status: 'PARTIAL', // U3-C: corrected from ACTIVE — capability exists but no persisted tenant-scoped Evidence feed
    connectedToPipeline: false,
    evidenceCoreActivated: false, // U3-C: CAPABILITY_NOT_EVIDENCE_PRODUCER
    legacyIds: ['llmverify', 'llm-verify'],
    persistenceTables: [], // U3-C: corrected — llmverify_results does NOT exist in schema
    consumers: [],
    activationBlockers: ['U3-C: CAPABILITY_NOT_EVIDENCE_PRODUCER — no persisted tenant-scoped results; enablement utility only'],
  },
  [PRODUCER_IDS.ISAF_LOGGER]: {
    producerId: PRODUCER_IDS.ISAF_LOGGER,
    producerType: 'LINEAGE',
    displayName: 'ISAF Logger',
    implementationModule: null, // U3-C: corrected — no isaf-logger/ module with persisted Evidence; standalone package capability
    status: 'PARTIAL', // U3-C: corrected from ACTIVE — package exists but no active production Evidence feed
    connectedToPipeline: false,
    evidenceCoreActivated: false, // U3-C: CAPABILITY_NOT_EVIDENCE_PRODUCER
    legacyIds: ['isaf', 'isaf-logger'],
    persistenceTables: [], // U3-C: corrected — isaf_logs does NOT exist in schema
    consumers: [],
    activationBlockers: ['U3-C: CAPABILITY_NOT_EVIDENCE_PRODUCER — no persisted tenant-scoped records; standalone package capability'],
  },
  [PRODUCER_IDS.OSNIT]: {
    producerId: PRODUCER_IDS.OSNIT,
    producerType: 'OSINT',
    displayName: 'OSNIT',
    implementationModule: 'app/api/osnit/',
    status: 'PARTIAL',
    connectedToPipeline: false,
    evidenceCoreActivated: false, // U3-C: BLOCKED_TENANT_IDENTITY
    legacyIds: ['osnit'],
    persistenceTables: ['osnit_analyses'],
    consumers: [],
    activationBlockers: ['U3-C: BLOCKED_TENANT_IDENTITY — osnit_analyses has no organizationId; OSINT observations do not prove internal control state'],
  },
  [PRODUCER_IDS.AIRRD]: {
    producerId: PRODUCER_IDS.AIRRD,
    producerType: 'READINESS',
    displayName: 'AIRRD',
    implementationModule: 'lib/airrd/',
    status: 'ACTIVE',
    connectedToPipeline: false,
    evidenceCoreActivated: false, // U3-C: QUALIFIED_WITH_CORRECTION — deferred; airrd_scans.organizationId is nullable
    legacyIds: ['airrd'],
    persistenceTables: ['airrd_scans', 'airrd_gmi_pillars'],
    consumers: [],
    activationBlockers: ['U3-C: QUALIFIED_WITH_CORRECTION — airrd_scans.organizationId is nullable; DERIVED_READINESS not technical security verification; AIRRD score != assurance'],
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
  [PRODUCER_IDS.SAAS_IAM_GRANT]: {
    producerId: PRODUCER_IDS.SAAS_IAM_GRANT,
    producerType: 'IAM_GRANT',
    displayName: 'SaaS IAM Grant Observer',
    implementationModule: 'lib/iam-grant/',
    status: 'ACTIVE',
    connectedToPipeline: true,
    evidenceCoreActivated: true,
    legacyIds: [],
    // Source-native raw state (cloud_credentials) remains source-native.
    // Canonical EFFECTIVELY_GRANTED participation flows through the
    // canonical evidence table — no shadow Evidence table.
    persistenceTables: ['evidence'],
    consumers: ['decision-pipeline', 'evidence-core', 'capability-fact-projection'],
    activationBlockers: [],
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
