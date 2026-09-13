/**
 * AA-PROJECTION-1: Reporting Consumption Contract.
 *
 * Every canonical intelligence producer/read-model must have an explicit
 * projection policy. This is reporting routing, not assurance state.
 *
 * Invariants:
 *   PROJECTION_POLICY != ASSURANCE_STATE
 *   UNCLASSIFIED_CANONICAL_PRODUCERS = 0
 *   DISPLAY_ELIGIBILITY != EVIDENCE_STATE
 *   PROFILE_SPECIFIC does not alter canonical truth
 */

export type ProjectionConsumptionPolicy =
  | 'REQUIRED_IN_BUNDLE'       // must appear in AssuranceEvidenceBundleV1
  | 'PROFILE_SPECIFIC'         // included in audience-specific projections
  | 'MACHINE_ONLY'             // only machine-readable / provenance artifacts
  | 'INTERNAL_PROVENANCE'      // engineering provenance, not customer-facing
  | 'INTENTIONALLY_NOT_SHOWN'  // deliberate absence from customer surfaces
  | 'LEGACY_CONTAINED'         // kept for compatibility, not new reports
  | 'NOT_APPLICABLE';          // genuinely inapplicable for this evaluation

export interface CanonicalIntelligenceDomain {
  /** Stable domain key. */
  domain: string;
  /** Owner file/module for traceability. */
  owner: string;
  /** Projection policy. */
  policy: ProjectionConsumptionPolicy;
  /** Rationale for internal-only / legacy / not-shown decisions. */
  rationale?: string;
  /** Customer-facing category if shown. */
  customerCategory?: string;
}

/**
 * AA-PROJECTION-1 canonical intelligence inventory.
 *
 * This is the contract matrix. Adding a canonical producer without updating
 * this registry (or the guard) must fail CI/unit qualification.
 */
export const CANONICAL_INTELLIGENCE_REGISTRY: CanonicalIntelligenceDomain[] = [
  { domain: 'U5_ASSURANCE_DECISION', owner: 'lib/assurance/assurance-evaluator.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Assurance Decision' },
  { domain: 'ACTION_ASSURANCE', owner: 'lib/assurance/u6-action-assurance-section.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Action Assurance' },
  { domain: 'ACTION_PROOF', owner: 'lib/assurance/u6-action-proof-section.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Action Path Evidence' },
  { domain: 'AGENT_REACHABILITY', owner: 'lib/assurance/u6-agent-reachability-section.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Agent Reachability' },
  { domain: 'EVIDENCE_FRONTIER', owner: 'lib/assurance/assurance-output-composer.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Evidence Frontier' },
  { domain: 'EXECUTION_ARCHETYPE', owner: 'lib/ai-inventory/execution-archetype.ts', policy: 'REQUIRED_IN_BUNDLE', customerCategory: 'Capability & Authority Alignment' },
  { domain: 'FRAMEWORK_RELEVANCE', owner: 'lib/assurance/assurance-output-composer.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'Standards & Obligations' },
  { domain: 'CONSEQUENCE_DELTA', owner: 'lib/assurance/consequence-delta.ts', policy: 'INTERNAL_PROVENANCE', rationale: 'Accepted-change provenance for package lineage; not a customer report surface.' },
  { domain: 'ANALYZER_EXECUTION_IDENTITY', owner: 'lib/ai-security/analyzer-execution-identity.ts', policy: 'MACHINE_ONLY', customerCategory: 'Evaluation Integrity' },
  { domain: 'EVIDENCE_CORE_TRACES', owner: 'lib/evidence/evidence-contract.ts', policy: 'INTERNAL_PROVENANCE', rationale: 'Raw evidence traces for audit replay; surfaced through inspectability anchors.' },
  { domain: 'SYSTEM_CONSTELLATION', owner: 'lib/topology/constellation-presentation-projection.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'System Constellation' },
  { domain: 'PASSPORT_U6_LINEAGE', owner: 'lib/assurance/u6-package-service.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'Passport' },
  { domain: 'DECISION_RECEIPT', owner: 'lib/assurance/assurance-output-bundle.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'Decision Receipt' },
  { domain: 'MACHINE_READABLE_ARTIFACT', owner: 'lib/assurance/assurance-artifact-manifest.ts', policy: 'MACHINE_ONLY', customerCategory: 'Machine JSON' },
  { domain: 'BUILD_IDENTITY', owner: 'lib/build-identity.ts', policy: 'MACHINE_ONLY', customerCategory: 'Evaluation Integrity' },
  { domain: 'OPERATING_ENVELOPE', owner: 'lib/operating-envelope/*', policy: 'INTENTIONALLY_NOT_SHOWN', rationale: 'Operating Envelope is bound in the Decision Receipt; not repeated in the bundle summary.' },
  { domain: 'S0_LEGACY_TRUST_STATUS', owner: 'lib/trust-artifacts/types.ts', policy: 'LEGACY_CONTAINED', rationale: 'S0 containment status preserved until U2/U5 replaces all consumers.' },
  { domain: 'DECISION_PIPELINE_SCORE', owner: 'lib/decision-pipeline/scoring.ts', policy: 'LEGACY_CONTAINED', rationale: 'Legacy scoring is not canonical disposition; kept for compatibility.' },
];

export interface ReportingConsumptionGuardResult {
  valid: boolean;
  unclassified: string[];
  classified: number;
  requiredInBundle: CanonicalIntelligenceDomain[];
  profileSpecific: CanonicalIntelligenceDomain[];
  machineOnly: CanonicalIntelligenceDomain[];
  internalOnly: CanonicalIntelligenceDomain[];
  intentionallyNotShown: CanonicalIntelligenceDomain[];
  legacyContained: CanonicalIntelligenceDomain[];
  notApplicable: CanonicalIntelligenceDomain[];
}

/**
 * Validate that every provided canonical intelligence domain is classified.
 * Unknown domains (new producers without an explicit policy) fail closed.
 */
export function reportingConsumptionGuard(domains: string[]): ReportingConsumptionGuardResult {
  const byDomain = new Map(CANONICAL_INTELLIGENCE_REGISTRY.map((d) => [d.domain, d]));
  const unclassified: string[] = [];
  const classified: CanonicalIntelligenceDomain[] = [];

  for (const domain of domains) {
    const entry = byDomain.get(domain);
    if (!entry) {
      unclassified.push(domain);
    } else {
      classified.push(entry);
    }
  }

  const bucket = (policy: ProjectionConsumptionPolicy) => classified.filter((d) => d.policy === policy);

  return {
    valid: unclassified.length === 0,
    unclassified,
    classified: classified.length,
    requiredInBundle: bucket('REQUIRED_IN_BUNDLE'),
    profileSpecific: bucket('PROFILE_SPECIFIC'),
    machineOnly: bucket('MACHINE_ONLY'),
    internalOnly: bucket('INTERNAL_PROVENANCE'),
    intentionallyNotShown: bucket('INTENTIONALLY_NOT_SHOWN'),
    legacyContained: bucket('LEGACY_CONTAINED'),
    notApplicable: bucket('NOT_APPLICABLE'),
  };
}

/**
 * Enforce that all REQUIRED_IN_BUNDLE domains are represented in the bundle.
 */
export function assertRequiredBundleDomainsPresent(required: string[], bundleDomainKeys: string[]): void {
  const registryKeys = new Set(CANONICAL_INTELLIGENCE_REGISTRY.filter((d) => d.policy === 'REQUIRED_IN_BUNDLE').map((d) => d.domain));
  for (const key of required) {
    if (!registryKeys.has(key)) {
      throw new Error(`BUNDLE_DOMAIN_NOT_REGISTERED: ${key}`);
    }
  }
  const missing = [...registryKeys].filter((k) => !bundleDomainKeys.includes(k));
  if (missing.length > 0) {
    throw new Error(`REQUIRED_BUNDLE_DOMAINS_MISSING: ${missing.join(', ')}`);
  }
}
