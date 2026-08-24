/**
 * E1 Closure Section 1 — Capability Fact Projection
 *
 * Deterministically projects qualifying existing state/evidence into five planes:
 *   REQUESTED, POLICY_AUTHORIZED, EFFECTIVELY_GRANTED, CODE_CAPABLE, OBSERVED.
 *
 * Does NOT create another evidence system. Reuses canonical evidence already
 * collected by U4 and U5. Every CapabilityFact references source evidence IDs,
 * producer run ID and content hash where available.
 *
 * Source rules:
 *   REQUESTED         → signed/package manifest, explicit declaration, vendor manifest
 *   POLICY_AUTHORIZED → APPROVED operating envelope only (DRAFT cannot provide this)
 *   EFFECTIVELY_GRANTED → IAM / service account / OAuth / actual config evidence
 *   CODE_CAPABLE      → exact static/CI capability evidence with exact mapping
 *   OBSERVED          → authoritative Action Witness / runtime evidence only
 *
 * Generic scanner presence or generic runtime trace is insufficient for CODE_CAPABLE
 * or OBSERVED. No canonical BLOCK/ALLOW from an evidence-free CapabilityFact.
 */

import {
  CapabilityFact,
  OperatingEnvelope,
  ResolvedProfile,
  EvidenceMethod,
  AuthorityClass,
  AssurancePlane,
  AuthoritySourceLabel,
  PlaneAvailability,
} from './types';
import type { EvidenceCapabilityDeclaration, EvidenceMappingStrength } from '@/lib/evidence/capability-declaration-contract';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';

export interface CapabilityFactProjectionInput {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  evidence: DecisionEvidenceProjection[];
  resolvedProfile: ResolvedProfile;
  operatingEnvelope?: OperatingEnvelope;
  evaluationSnapshotAt: Date;
}

export interface CapabilityFactProjectionResult {
  requested: CapabilityFact[];
  policy: CapabilityFact[];
  granted: CapabilityFact[];
  capable: CapabilityFact[];
  observed: CapabilityFact[];
}

/**
 * Main projection — no LLM, deterministic, evidence-backed.
 */
export function projectCapabilityFacts(input: CapabilityFactProjectionInput): CapabilityFactProjectionResult {
  const { evidence, operatingEnvelope, aiSystemId } = input;

  return {
    requested: projectRequestedFacts(evidence, aiSystemId),
    policy: projectPolicyFacts(operatingEnvelope, aiSystemId),
    granted: projectGrantedFacts(evidence, aiSystemId),
    capable: projectCapableFacts(evidence, aiSystemId),
    observed: projectObservedFacts(evidence, aiSystemId),
  };
}

function projectRequestedFacts(evidence: DecisionEvidenceProjection[], aiSystemId: string): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const caps = extractCapabilityDeclarations(ev, 'REQUESTED', aiSystemId);
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

/**
 * POLICY_AUTHORIZED may ONLY come from an APPROVED operating envelope.
 * DRAFT / SUPERSEDED / REVOKED envelopes produce no POLICY_AUTHORIZED facts.
 */
function projectPolicyFacts(operatingEnvelope: OperatingEnvelope | undefined, aiSystemId: string): CapabilityFact[] {
  if (!operatingEnvelope) return [];
  if (operatingEnvelope.state !== 'APPROVED') return [];

  const facts: CapabilityFact[] = [];
  const constraints = operatingEnvelope.constraints;
  const base = {
    subject: `system:${aiSystemId}`,
    sourcePlane: 'POLICY_AUTHORIZED' as AssurancePlane,
    authorityClass: 'AUTHORITATIVE_POLICY' as AuthorityClass,
    evidenceMethod: 'APPROVED_POLICY_RECORD' as EvidenceMethod,
    sourceEvidenceIds: [operatingEnvelope.envelopeId],
    evidenceId: operatingEnvelope.envelopeId,
    producerRunId: undefined,
    contentHash: operatingEnvelope.envelopeDigest,
    authoritySourceLabel: operatingEnvelope.authoritySourceLabel ?? 'AUTHORITATIVE_POLICY',
  };

  for (const op of constraints.allowedOperations) {
    for (const scope of constraints.resourceScopes.length > 0 ? constraints.resourceScopes : ['*']) {
      facts.push({
        ...base,
        capabilityId: `${op}:${scope}`,
        capabilityFamily: (op.split('.')[0] ?? 'UNKNOWN') as any,
        action: op,
        resource: extractResourceFromOperation(op),
        scope,
        dataClass: constraints.dataClasses[0] ?? 'INTERNAL',
        environment: constraints.allowedEnvironments[0] ?? 'sandbox',
        targetCount: constraints.maxTargetCount,
        changeMagnitude: constraints.maxChangeMagnitude,
      });
    }
  }
  return facts;
}

function projectGrantedFacts(evidence: DecisionEvidenceProjection[], aiSystemId: string): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const caps = extractCapabilityDeclarations(ev, 'EFFECTIVELY_GRANTED', aiSystemId);
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

function projectCapableFacts(evidence: DecisionEvidenceProjection[], aiSystemId: string): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const producer = resolveCanonicalProducerId(ev.producerId) ?? ev.producerId;
    // U6-INVENTORY-LOCK: inventory presence does not prove code capability.
    const isStatic = producer === 'saas-static';
    if (!isStatic) continue;

    const caps = extractCapabilityDeclarations(ev, 'CODE_CAPABLE', aiSystemId);
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

function projectObservedFacts(evidence: DecisionEvidenceProjection[], aiSystemId: string): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const producer = resolveCanonicalProducerId(ev.producerId) ?? ev.producerId;
    const isRuntime = producer === 'saas-runtime' || ev.evidenceType === 'action_witness' || ev.evidenceType === 'runtime_trace';
    if (!isRuntime) continue;

    // Generic runtime trace alone cannot establish OBSERVED/APPLIED.
    // Only exact capability declarations on runtime evidence with sourcePlane=OBSERVED are kept
    const caps = extractCapabilityDeclarations(ev, 'OBSERVED', aiSystemId);
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

/** U6: Canonical methods acceptable per plane. */
const PLANE_METHODS: Record<AssurancePlane, string[]> = {
  REQUESTED: ['SIGNED_MANIFEST', 'SELF_REPORT'],
  POLICY_AUTHORIZED: ['APPROVED_POLICY_RECORD', 'POLICY_CONFIGURATION'],
  EFFECTIVELY_GRANTED: ['IAM_OBSERVATION', 'POLICY_CONFIGURATION'],
  CODE_CAPABLE: ['STATIC_PATH_ANALYSIS', 'STATIC_STRUCTURAL_ANALYSIS'],
  OBSERVED: ['RUNTIME_TRACE', 'ACTION_WITNESS'],
};

/** U6: Canonical authority classes acceptable per plane. */
const PLANE_AUTHORITIES: Record<AssurancePlane, string[]> = {
  REQUESTED: ['VENDOR_DECLARATION', 'AUTHORITATIVE_POLICY', 'NON_AUTHORITATIVE'],
  POLICY_AUTHORIZED: ['AUTHORITATIVE_POLICY'],
  EFFECTIVELY_GRANTED: ['EFFECTIVE_GRANT'],
  CODE_CAPABLE: ['NON_AUTHORITATIVE'],
  OBSERVED: ['NON_AUTHORITATIVE'],
};

/** U6: only these mapping strengths may create canonical CODE_CAPABLE facts. */
const CODE_CAPABLE_MAPPING_STRENGTHS: EvidenceMappingStrength[] = [
  'EXACT_RULE_MAPPING',
  'EXACT_CAPABILITY_MAPPING',
  'PROFILE_MAPPING',
];

/**
 * U6 fail-closed qualification per plane. Missing/incompatible authority or method → reject.
 */
function qualifyDeclaration(ev: DecisionEvidenceProjection, decl: EvidenceCapabilityDeclaration, sourcePlane: AssurancePlane): boolean {
  if (!decl.evidenceMethod || !PLANE_METHODS[sourcePlane].includes(decl.evidenceMethod)) return false;
  if (!decl.authorityClass || !PLANE_AUTHORITIES[sourcePlane].includes(decl.authorityClass)) return false;
  if (sourcePlane === 'CODE_CAPABLE' && !CODE_CAPABLE_MAPPING_STRENGTHS.includes(decl.mappingStrength as EvidenceMappingStrength)) return false;
  return true;
}

/**
 * Extract capability declarations from evidence's safe structured capability projection.
 * Returns empty if no canonical declaration exists or the plane qualification fails.
 */
function extractCapabilityDeclarations(ev: DecisionEvidenceProjection, sourcePlane: AssurancePlane, aiSystemId: string): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  const declarations = ev.capabilityDeclarations || [];

  for (const decl of declarations) {
    if (!decl || decl.sourcePlane !== sourcePlane) continue;
    if (!qualifyDeclaration(ev, decl, sourcePlane)) continue;
    const fact = buildCapabilityFact(ev, decl, aiSystemId);
    if (fact) facts.push(fact);
  }

  return facts;
}

function buildCapabilityFact(ev: DecisionEvidenceProjection, decl: EvidenceCapabilityDeclaration, aiSystemId: string): CapabilityFact | undefined {
  if (!decl.evidenceMethod) return undefined;
  return {
    capabilityId: decl.capabilityId ?? `${ev.evidenceId}:capability`,
    capabilityFamily: decl.capabilityFamily as any,
    subject: decl.subject ?? `system:${aiSystemId}`,
    action: decl.action ?? 'unknown',
    resource: decl.resource ?? 'unknown',
    scope: decl.scope ?? 'UNKNOWN',
    dataClass: decl.dataClass,
    channel: decl.channel,
    guardRequirements: Array.isArray(decl.guardRequirements) ? decl.guardRequirements : undefined,
    impact: decl.impact, // U6: severity is NOT impact; only set if source truth provides it
    environment: decl.environment,
    constraints: Array.isArray(decl.constraints) ? decl.constraints : undefined,
    targetCount: typeof decl.targetCount === 'number' ? decl.targetCount : undefined,
    changeMagnitude: typeof decl.changeMagnitude === 'number' ? decl.changeMagnitude : undefined,
    sourceLocation: decl.sourceLocation,
    discoveryBasis: (decl.discoveryBasis as any) ?? undefined,
    capabilityCoverage: (decl.capabilityCoverage as any) ?? undefined,
    evidenceId: ev.evidenceId,
    producerRunId: ev.producerRunId ?? undefined,
    contentHash: ev.contentHash ?? undefined,
    sourcePlane: decl.sourcePlane as AssurancePlane,
    authorityClass: (decl.authorityClass as AuthorityClass) ?? 'NON_AUTHORITATIVE',
    evidenceMethod: decl.evidenceMethod as EvidenceMethod,
    sourceEvidenceIds: [ev.evidenceId, ...(Array.isArray(decl.sourceEvidenceIds) ? decl.sourceEvidenceIds : [])],
    authoritySourceLabel: (decl.authoritySourceLabel as AuthoritySourceLabel) ?? 'UNKNOWN',
  };
}

function extractResourceFromOperation(operation: string): string {
  // Minimal resource inference from O-RAN / R1 operations
  const op = operation.toLowerCase();
  if (op.includes('policy')) return 'policy';
  if (op.includes('config')) return 'config';
  if (op.includes('data')) return 'data';
  if (op.includes('model')) return 'model';
  if (op.includes('callback')) return 'callback';
  if (op.includes('service')) return 'service';
  return 'resource';
}

const PLANE_ORDER: AssurancePlane[] = ['REQUESTED', 'POLICY_AUTHORIZED', 'EFFECTIVELY_GRANTED', 'CODE_CAPABLE', 'OBSERVED'];

/** U6: canonical producers that currently emit qualifying capability evidence per plane. */
const PLANE_PRODUCERS: Record<AssurancePlane, string[]> = {
  REQUESTED: [], // no native REQUESTED capability producer currently
  POLICY_AUTHORIZED: [], // operating envelope / policy record
  EFFECTIVELY_GRANTED: [], // IAM/grant evidence not yet integrated
  CODE_CAPABLE: [PRODUCER_IDS.SAAS_STATIC], // bounded R2/R10 finding-derived bridge only
  OBSERVED: [PRODUCER_IDS.SAAS_RUNTIME], // authoritative action witness evidence
};

/**
 * U6: Build a plane availability snapshot from the projected capability facts.
 *
 * PRESENT != COMPLETE. A finding-derived CODE_CAPABLE fact is PRESENT but coverage is PARTIAL.
 * Missing planes are reported as NOT_PROVIDED rather than invented.
 */
export function buildPlaneAvailability(
  facts: CapabilityFactProjectionResult,
  availableProducerIds: string[] = [],
): PlaneAvailability[] {
  const canonicalAvailable = new Set(availableProducerIds.map(resolveCanonicalProducerId).filter(Boolean) as string[]);
  const factMap: Record<AssurancePlane, CapabilityFact[]> = {
    REQUESTED: facts.requested,
    POLICY_AUTHORIZED: facts.policy,
    EFFECTIVELY_GRANTED: facts.granted,
    CODE_CAPABLE: facts.capable,
    OBSERVED: facts.observed,
  };

  return PLANE_ORDER.map(plane => {
    const planeFacts = factMap[plane];
    const present = planeFacts.length > 0;
    const sourceEvidenceIds = Array.from(new Set(planeFacts.flatMap(f => f.sourceEvidenceIds ?? [])));
    const coverages = new Set(planeFacts.map(f => f.capabilityCoverage ?? 'UNKNOWN'));
    const bases = new Set(planeFacts.map(f => f.discoveryBasis ?? 'UNKNOWN'));

    let coverage: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'NOT_APPLICABLE' = 'UNKNOWN';
    if (coverages.has('PARTIAL') || coverages.size > 1) coverage = 'PARTIAL';
    else if (coverages.has('COMPLETE')) coverage = 'COMPLETE';
    else if (coverages.has('NOT_APPLICABLE')) coverage = 'NOT_APPLICABLE';

    const basisList = Array.from(bases).sort();
    const basis = basisList.length > 1 ? 'MIXED' : basisList[0] ?? 'UNKNOWN';
    const exactBasis = basisList;

    let status: PlaneAvailability['status'] = present ? 'PRESENT' : 'NOT_PROVIDED';
    if (!present && canonicalAvailable.size > 0) {
      const planeProducers = new Set(PLANE_PRODUCERS[plane]);
      if (Array.from(canonicalAvailable).some(p => planeProducers.has(p))) {
        status = 'EVALUATED_NO_QUALIFYING_FACTS';
      }
    }

    return {
      plane,
      status,
      coverage,
      basis,
      exactBasis,
      sourceEvidenceIds,
      explanation: present
        ? `Plane supported by ${planeFacts.length} capability fact(s); coverage ${coverage.toLowerCase()}.`
        : status === 'EVALUATED_NO_QUALIFYING_FACTS'
          ? `No qualifying capability fact was produced by the currently supported ${plane.toLowerCase().replace(/_/g, ' ')} mappings; this does not prove absence of other capabilities.`
          : 'No qualifying capability evidence was provided for this plane.',
    };
  });
}
