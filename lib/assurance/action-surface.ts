/**
 * Gate 4 — Action Surface
 *
 * Customer-visible read projection of capabilities.
 * This is a READ projection/UI helper — NOT a decision engine or evidence store.
 *
 * Shows rows: Capability | Principal | Asset | Scope | Effect | Guards | Plane | Evidence
 *
 * Where five-plane evidence exists, shows:
 *   Requested | Policy Authorized | Effectively Granted | Code Capable | Observed
 *
 * Distinguishes: PRESENT | NOT_PROVIDED | EVALUATED_NO_QUALIFYING_FACTS
 *
 * U5 remains canonical. No new assurance verdict.
 *
 * G4-R2: Row identity now uses canonical capability identity (family, subject,
 * action, resource, scope, dataClass, channel, environment) — not just action+resource.
 * Evidence quality fields are exposed for customer transparency.
 */

import { EvidenceCapabilityDeclaration, AIReachabilityStatus, CapabilityCardinality, AnalysisImpediment } from '@/lib/evidence/capability-declaration-contract';
import { CapabilityFact, normalizeCapabilityKey, capabilityKeyToString } from './types';

// ─── Action Surface Row ──────────────────────────────────────────────────────

export type PlaneStatus = 'PRESENT' | 'NOT_PROVIDED' | 'EVALUATED_NO_QUALIFYING_FACTS';

export interface ActionSurfaceRow {
  /** Canonical capability identity (family:subject:action:resource:scope) */
  capabilityId: string;
  action: string;
  resource: string;
  principal: string;
  asset: string;
  scope: string;
  effect: string;
  guards: string[];
  plane: string;
  evidence: string;
  // Five-plane availability
  requested: PlaneStatus;
  policyAuthorized: PlaneStatus;
  effectivelyGranted: PlaneStatus;
  codeCapable: PlaneStatus;
  observed: PlaneStatus;
  // Provenance
  mappingStrength: string;
  isCanonical: boolean; // true = EXACT_CAPABILITY_MAPPING, false = HEURISTIC_SUGGESTION
  // G4-R2: Evidence quality fields
  capabilityCoverage: string;
  authorityClass: string;
  authoritySourceLabel: string;
  discoveryBasis: string;
  aiReachability: AIReachabilityStatus | 'UNKNOWN';
  cardinality: CapabilityCardinality | 'UNKNOWN';
  analysisImpediments: AnalysisImpediment[];
  scanCompleteness: string;
  sourceLocation: string;
  sourceEvidenceIds: string[];
}

export interface ActionSurfaceResult {
  rows: ActionSurfaceRow[];
  stats: {
    total: number;
    canonical: number;
    heuristic: number;
    presentByPlane: {
      requested: number;
      policyAuthorized: number;
      effectivelyGranted: number;
      codeCapable: number;
      observed: number;
    };
    // G4-R2: Quality stats
    byReachability: Record<string, number>;
    byCoverage: Record<string, number>;
    withImpediments: number;
  };
}

// ─── Build Action Surface from declarations + facts ──────────────────────────

/**
 * Build the Action Surface projection from:
 * - CODE_CAPABLE declarations (from the bridge)
 * - CapabilityFacts (from the five-plane projection, if available)
 *
 * If facts are not provided (no U5 evaluation yet), only CODE_CAPABLE plane is populated.
 *
 * G4-R2: Plane matching uses canonical sameCapability() — not just action+resource.
 */
export function buildActionSurface(
  declarations: EvidenceCapabilityDeclaration[],
  facts?: {
    requested?: CapabilityFact[];
    policy?: CapabilityFact[];
    granted?: CapabilityFact[];
    capable?: CapabilityFact[];
    observed?: CapabilityFact[];
  },
): ActionSurfaceResult {
  const rows: ActionSurfaceRow[] = [];

  for (const decl of declarations) {
    const isCanonical = decl.mappingStrength === 'EXACT_CAPABILITY_MAPPING' ||
      decl.mappingStrength === 'EXACT_RULE_MAPPING';

    // G4-R2: Build a synthetic CapabilityFact from the declaration for canonical matching
    const declAsFact: CapabilityFact = {
      capabilityId: decl.capabilityId,
      capabilityFamily: decl.capabilityFamily as any,
      subject: decl.subject ?? 'principal:unknown',
      action: decl.action,
      resource: decl.resource,
      scope: decl.scope ?? 'unknown',
      dataClass: decl.dataClass,
      channel: decl.channel,
      environment: decl.environment,
      guardRequirements: decl.guardRequirements,
      impact: decl.impact,
      constraints: decl.constraints,
      targetCount: decl.targetCount,
      changeMagnitude: decl.changeMagnitude,
      sourceLocation: decl.sourceLocation,
      discoveryBasis: decl.discoveryBasis as any,
      capabilityCoverage: decl.capabilityCoverage as any,
      evidenceId: '',
      sourcePlane: decl.sourcePlane as any,
      authorityClass: decl.authorityClass as any,
      evidenceMethod: decl.evidenceMethod as any,
      sourceEvidenceIds: decl.sourceEvidenceIds ?? [],
      authoritySourceLabel: decl.authoritySourceLabel as any,
    };

    // G4-R2.1: Use exact operational identity for plane matching (not sameCapability candidate)
    const requestedStatus = checkPlaneStatusExact(declAsFact, facts?.requested);
    const policyStatus = checkPlaneStatusExact(declAsFact, facts?.policy);
    const grantedStatus = checkPlaneStatusExact(declAsFact, facts?.granted);
    const codeCapableStatus = checkPlaneStatusExact(declAsFact, facts?.capable);
    const observedStatus = checkPlaneStatusExact(declAsFact, facts?.observed);

    // If no facts at all, CODE_CAPABLE is PRESENT (from declarations), others NOT_PROVIDED
    const noFacts = !facts || (
      (facts.requested?.length ?? 0) === 0 &&
      (facts.policy?.length ?? 0) === 0 &&
      (facts.granted?.length ?? 0) === 0 &&
      (facts.capable?.length ?? 0) === 0 &&
      (facts.observed?.length ?? 0) === 0
    );

    rows.push({
      capabilityId: decl.capabilityId,
      action: decl.action,
      resource: decl.resource,
      principal: decl.subject ?? 'principal:unknown',
      asset: decl.resource,
      scope: decl.scope ?? 'unknown',
      effect: decl.constraints?.find(c => c.startsWith('effect:'))?.replace('effect:', '') ?? 'UNKNOWN',
      guards: decl.guardRequirements ?? [],
      plane: decl.sourcePlane,
      evidence: decl.evidenceMethod ?? 'UNKNOWN',
      requested: noFacts ? 'NOT_PROVIDED' : requestedStatus,
      policyAuthorized: noFacts ? 'NOT_PROVIDED' : policyStatus,
      effectivelyGranted: noFacts ? 'NOT_PROVIDED' : grantedStatus,
      codeCapable: noFacts ? 'PRESENT' : codeCapableStatus === 'NOT_PROVIDED' ? 'PRESENT' : codeCapableStatus,
      observed: noFacts ? 'NOT_PROVIDED' : observedStatus,
      mappingStrength: decl.mappingStrength,
      isCanonical,
      // G4-R2: Evidence quality fields
      capabilityCoverage: decl.capabilityCoverage ?? 'UNKNOWN',
      authorityClass: decl.authorityClass ?? 'UNKNOWN',
      authoritySourceLabel: decl.authoritySourceLabel ?? 'UNKNOWN',
      discoveryBasis: decl.discoveryBasis ?? 'UNKNOWN',
      aiReachability: decl.aiReachability ?? 'UNKNOWN',
      cardinality: decl.cardinality ?? 'UNKNOWN',
      analysisImpediments: decl.analysisImpediments ?? [],
      scanCompleteness: decl.scanCompleteness ?? 'UNKNOWN',
      sourceLocation: decl.sourceLocation ?? '',
      sourceEvidenceIds: decl.sourceEvidenceIds ?? [],
    });
  }

  // G4-R2: Compute quality stats
  const byReachability: Record<string, number> = {};
  const byCoverage: Record<string, number> = {};
  let withImpediments = 0;
  for (const row of rows) {
    byReachability[row.aiReachability] = (byReachability[row.aiReachability] ?? 0) + 1;
    byCoverage[row.capabilityCoverage] = (byCoverage[row.capabilityCoverage] ?? 0) + 1;
    if (row.analysisImpediments.length > 0) withImpediments++;
  }

  const stats = {
    total: rows.length,
    canonical: rows.filter(r => r.isCanonical).length,
    heuristic: rows.filter(r => !r.isCanonical).length,
    presentByPlane: {
      requested: rows.filter(r => r.requested === 'PRESENT').length,
      policyAuthorized: rows.filter(r => r.policyAuthorized === 'PRESENT').length,
      effectivelyGranted: rows.filter(r => r.effectivelyGranted === 'PRESENT').length,
      codeCapable: rows.filter(r => r.codeCapable === 'PRESENT').length,
      observed: rows.filter(r => r.observed === 'PRESENT').length,
    },
    byReachability,
    byCoverage,
    withImpediments,
  };

  return { rows, stats };
}

// ─── Plane status check (exact operational identity) ─────────────────────────

/**
 * G4-R2.1: Use exact operational identity for plane presence matching.
 *
 * `sameCapability()` is a semantic CANDIDATE comparator — it returns true
 * when optional dimensions are unknown on one side. That is correct for U5
 * candidate pairing but NOT for Action Surface plane presence.
 *
 * Action Surface plane presence requires exact operational identity:
 *   subject + action + resource + scope + dataClass + channel + environment
 * must all match (case-insensitive, trimmed). Unknown dimensions normalize
 * to empty string and must match exactly — unknown ≠ anything.
 *
 * This prevents a declaration for scope "tenant-A" from showing PRESENT
 * in a plane that has a fact for scope "tenant-B", even though
 * `sameCapability()` would consider them candidates.
 */
function checkPlaneStatusExact(
  declAsFact: CapabilityFact,
  facts?: CapabilityFact[],
): PlaneStatus {
  if (!facts || facts.length === 0) {
    return 'NOT_PROVIDED';
  }

  const declKey = capabilityKeyToString(normalizeCapabilityKey(declAsFact));

  const matching = facts.some(f => {
    const factKey = capabilityKeyToString(normalizeCapabilityKey(f));
    return factKey === declKey;
  });

  return matching ? 'PRESENT' : 'EVALUATED_NO_QUALIFYING_FACTS';
}
