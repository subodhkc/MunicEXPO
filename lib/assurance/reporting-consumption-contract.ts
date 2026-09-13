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

import { PRODUCER_IDS, type ProducerId } from '@/lib/engine-registry/producer-registry';
import type { AssuranceEvidenceBundleV1 } from './reporting-projection-bundle';

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
 * AA-PROJECTION-1 canonical read-model/intelligence registry.
 *
 * This is the contract matrix for assurance sections and read models.
 * Adding a canonical read model without an explicit policy must fail CI.
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
  { domain: 'SYSTEM_CONSTELLATION', owner: 'lib/topology/constellation-presentation-projection.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'System Constellation' },
  { domain: 'PASSPORT_U6_LINEAGE', owner: 'lib/assurance/u6-package-service.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'Passport' },
  { domain: 'DECISION_RECEIPT', owner: 'lib/assurance/assurance-output-bundle.ts', policy: 'PROFILE_SPECIFIC', customerCategory: 'Decision Receipt' },
  { domain: 'MACHINE_READABLE_ARTIFACT', owner: 'lib/assurance/assurance-artifact-manifest.ts', policy: 'MACHINE_ONLY', customerCategory: 'Machine JSON' },
  { domain: 'BUILD_IDENTITY', owner: 'lib/build-identity.ts', policy: 'MACHINE_ONLY', customerCategory: 'Evaluation Integrity' },
  { domain: 'OPERATING_ENVELOPE', owner: 'lib/operating-envelope/*', policy: 'INTENTIONALLY_NOT_SHOWN', rationale: 'Operating Envelope is bound in the Decision Receipt; not repeated in the bundle summary.' },
  { domain: 'S0_LEGACY_TRUST_STATUS', owner: 'lib/trust-artifacts/types.ts', policy: 'LEGACY_CONTAINED', rationale: 'S0 containment status preserved until U2/U5 replaces all consumers.' },
  { domain: 'DECISION_PIPELINE_SCORE', owner: 'lib/decision-pipeline/scoring.ts', policy: 'LEGACY_CONTAINED', rationale: 'Legacy scoring is not canonical disposition; kept for compatibility.' },
];

/**
 * Authoritative canonical producer projection policies.
 *
 * Producer IDs come from lib/engine-registry/producer-registry.ts.
 * A producer added to the authoritative registry without a policy here
 * causes a CI/unit qualification failure.
 */
export const CANONICAL_PRODUCER_PROJECTION_POLICIES: Partial<Record<ProducerId, ProjectionConsumptionPolicy>> = {
  [PRODUCER_IDS.SAAS_STATIC]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SAAS_RUNTIME]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SAAS_INVENTORY]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SAAS_WIZARD]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SAAS_REGULATORY]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SARIF_IMPORT]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.CI_CD_SCANNER]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.NYC_LL144]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.LLVERIFY]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.ISAF_LOGGER]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.OSNIT]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.AIRRD]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.COMPLIANCE_TWIN]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.SAAS_IAM_GRANT]: 'INTERNAL_PROVENANCE',
  [PRODUCER_IDS.MCP_AI_APPSEC]: 'LEGACY_CONTAINED',
  [PRODUCER_IDS.MCP_TENANT_ISOLATION]: 'LEGACY_CONTAINED',
  [PRODUCER_IDS.NATIVE_ENGINE]: 'LEGACY_CONTAINED',
};

/** Required domains must be represented in the bundle, even when bounded. */
export const REQUIRED_BUNDLE_FIELD_MAP: Record<string, keyof AssuranceEvidenceBundleV1> = {
  U5_ASSURANCE_DECISION: 'disposition',
  ACTION_ASSURANCE: 'actionAssurance',
  ACTION_PROOF: 'actionProof',
  AGENT_REACHABILITY: 'reachability',
  EVIDENCE_FRONTIER: 'evidenceFrontier',
  EXECUTION_ARCHETYPE: 'evidenceReferences',
};

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
  const readModelByDomain = new Map(CANONICAL_INTELLIGENCE_REGISTRY.map((d) => [d.domain, d]));
  const producerPolicies = CANONICAL_PRODUCER_PROJECTION_POLICIES;
  const unclassified: string[] = [];
  const classified: CanonicalIntelligenceDomain[] = [];

  for (const domain of domains) {
    const readModel = readModelByDomain.get(domain);
    if (readModel) {
      classified.push(readModel);
      continue;
    }
    const producerPolicy = (producerPolicies as Record<string, ProjectionConsumptionPolicy | undefined>)[domain];
    if (producerPolicy) {
      classified.push({ domain, owner: 'lib/engine-registry/producer-registry.ts', policy: producerPolicy });
      continue;
    }
    unclassified.push(domain);
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
 * All currently authoritative canonical domains: engine producers + read models.
 */
export function authoritativeCanonicalDomains(): string[] {
  return [
    ...Object.values(PRODUCER_IDS),
    ...CANONICAL_INTELLIGENCE_REGISTRY.map((d) => d.domain),
  ];
}

/**
 * Enforce that all REQUIRED_IN_BUNDLE domains are represented in the bundle.
 * A domain is represented when its mapped bundle field is defined; the field
 * may still carry a bounded unavailable/unknown/not-assessed state.
 */
export function assertRequiredBundleDomainsPresent(bundle: AssuranceEvidenceBundleV1): void {
  const requiredDomains = CANONICAL_INTELLIGENCE_REGISTRY
    .filter((d) => d.policy === 'REQUIRED_IN_BUNDLE')
    .map((d) => d.domain);
  const missing: string[] = [];
  for (const domain of requiredDomains) {
    const field = REQUIRED_BUNDLE_FIELD_MAP[domain];
    if (!field) {
      missing.push(`${domain}:NO_FIELD_MAPPING`);
      continue;
    }
    if (bundle[field] === undefined) {
      missing.push(`${domain}:MISSING`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`REQUIRED_BUNDLE_DOMAINS_MISSING: ${missing.join(', ')}`);
  }
}
