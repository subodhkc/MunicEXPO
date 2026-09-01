/**
 * U1 — Producer ID Compatibility Layer
 *
 * Translates legacy engine IDs to canonical producer IDs.
 * Historical records remain readable. New records use canonical IDs.
 *
 * Rules:
 * - Translation is deterministic (same input → same output)
 * - Unknown IDs return null (fail closed, do not guess)
 * - Canonical IDs pass through unchanged
 * - Multiple legacy IDs may map to the same canonical ID
 */

import { PRODUCER_IDS, type ProducerId, isCanonicalProducerId } from './producer-registry';

// ─── Legacy → Canonical Mapping ────────────────────────────────────────────
//
// This is the authoritative mapping from historical engine IDs to
// canonical producer IDs. It is used by:
// - Decision Pipeline aggregation (to resolve engine results)
// - Report generation (to label evidence sources)
// - U2 Evidence Core (to normalize historical records)
//
// IMPORTANT: Do NOT add ad-hoc aliases outside this map.

const LEGACY_TO_CANONICAL: Record<string, ProducerId> = {
  // SaaS Static Scanner
  'static': PRODUCER_IDS.SAAS_STATIC,
  'static-analysis': PRODUCER_IDS.SAAS_STATIC,
  'static_scan': PRODUCER_IDS.SAAS_STATIC,
  'static_scanner': PRODUCER_IDS.SAAS_STATIC, // legacy sourceType used by StaticScannerAdapter
  'ai-security': PRODUCER_IDS.SAAS_STATIC,
  'ai_security': PRODUCER_IDS.SAAS_STATIC,

  // SaaS Runtime Scanner
  'runtime': PRODUCER_IDS.SAAS_RUNTIME,
  'runtime-test': PRODUCER_IDS.SAAS_RUNTIME,
  'runtime_test': PRODUCER_IDS.SAAS_RUNTIME,
  'ai-security-runtime': PRODUCER_IDS.SAAS_RUNTIME,

  // AI Inventory
  'inventory': PRODUCER_IDS.SAAS_INVENTORY,
  'ai-inventory': PRODUCER_IDS.SAAS_INVENTORY,
  'ai_inventory': PRODUCER_IDS.SAAS_INVENTORY,

  // Compliance Wizard
  'wizard': PRODUCER_IDS.SAAS_WIZARD,
  'compliance-wizard': PRODUCER_IDS.SAAS_WIZARD,
  'wizard-v2': PRODUCER_IDS.SAAS_WIZARD,

  // Regulatory
  'regulatory': PRODUCER_IDS.SAAS_REGULATORY,

  // SARIF Import
  'sarif': PRODUCER_IDS.SARIF_IMPORT,
  'external': PRODUCER_IDS.SARIF_IMPORT,
  'scan-import': PRODUCER_IDS.SARIF_IMPORT,

  // CI/CD Scanner
  'ci-cd': PRODUCER_IDS.CI_CD_SCANNER,
  'cicd': PRODUCER_IDS.CI_CD_SCANNER,
  'ci_cd': PRODUCER_IDS.CI_CD_SCANNER,

  // NYC LL144
  'nyc-ll144': PRODUCER_IDS.NYC_LL144,
  'bias-audit': PRODUCER_IDS.NYC_LL144,
  'nyc_ll144': PRODUCER_IDS.NYC_LL144,

  // LLMVerify
  'llmverify': PRODUCER_IDS.LLVERIFY,
  'llm-verify': PRODUCER_IDS.LLVERIFY,

  // ISAF Logger
  'isaf': PRODUCER_IDS.ISAF_LOGGER,
  'isaf-logger': PRODUCER_IDS.ISAF_LOGGER,

  // OSNIT
  'osnit': PRODUCER_IDS.OSNIT,

  // AIRRD
  'airrd': PRODUCER_IDS.AIRRD,

  // Compliance Twin
  'compliance-twin': PRODUCER_IDS.COMPLIANCE_TWIN,
  'twin': PRODUCER_IDS.COMPLIANCE_TWIN,
};

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve any engine ID (legacy or canonical) to a canonical producer ID.
 *
 * @param engineId - Legacy or canonical engine ID
 * @returns Canonical producer ID, or null if unknown (fail closed)
 */
export function resolveCanonicalProducerId(engineId: string): ProducerId | null {
  // Pass-through for canonical IDs
  if (isCanonicalProducerId(engineId)) {
    return engineId as ProducerId;
  }

  // Legacy mapping
  return LEGACY_TO_CANONICAL[engineId] ?? null;
}

/**
 * Check if an engine ID is a known legacy ID.
 */
export function isLegacyEngineId(engineId: string): boolean {
  return engineId in LEGACY_TO_CANONICAL && !isCanonicalProducerId(engineId);
}

/**
 * Get all legacy IDs that map to a given canonical producer ID.
 */
export function getLegacyIdsForProducer(canonicalId: ProducerId): string[] {
  return Object.entries(LEGACY_TO_CANONICAL)
    .filter(([, canonical]) => canonical === canonicalId)
    .map(([legacy]) => legacy);
}

/**
 * Get the full mapping table for documentation/audit purposes.
 */
export function getFullCompatibilityMap(): Array<{
  legacyId: string;
  canonicalId: ProducerId;
}> {
  return Object.entries(LEGACY_TO_CANONICAL).map(([legacyId, canonicalId]) => ({
    legacyId,
    canonicalId,
  }));
}
