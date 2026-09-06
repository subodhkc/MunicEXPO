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
  const { evidence, operatingEnvelope, aiSystemId, evaluationSnapshotAt } = input;

  const eligible = evidence.filter(ev => evidenceEligibleForSnapshot(ev, evaluationSnapshotAt));

  return {
    requested: projectRequestedFacts(eligible, aiSystemId),
    policy: projectPolicyFacts(operatingEnvelope, aiSystemId),
    granted: projectGrantedFacts(eligible, aiSystemId),
    capable: projectCapableFacts(eligible, aiSystemId),
    observed: projectObservedFacts(eligible, aiSystemId),
  };
}

function evidenceEligibleForSnapshot(ev: DecisionEvidenceProjection, evaluationSnapshotAt: Date): boolean {
  const observed = new Date(ev.observedAt);
  if (Number.isNaN(observed.getTime())) {
    // Invalid/unparseable timestamp must not silently become present.
    return false;
  }
  return observed.getTime() <= evaluationSnapshotAt.getTime();
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
      const resource = extractResourceFromOperation(op);
      facts.push({
        ...base,
        // AA-0 REVERT: The policy-fact capabilityId remains `${op}:${scope}`
        // (operation:scope). This is a DIFFERENT identity domain from the
        // canonical action/resource identity (action:resource). AA-0 centralizes
        // canonical action/resource identity construction; it must NOT silently
        // reinterpret a different legacy/policy-fact identity domain.
        // The comparator and action-surface do NOT use capabilityId for matching
        // (they use coreCapabilityKeyToString for exact operational identity),
        // so this format does not affect matching behavior.
        // LOCK: LEGACY_CAPABILITY_ID_SEMANTICS — preserve, do not reinterpret.
        capabilityId: `${op}:${scope}`,
        capabilityFamily: (extractCanonicalCapabilityFamily(op) as any),
        action: op,
        resource,
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
    // AA-0: Prefer the canonical action/resource identity from the declaration.
    // The fallback `${evidenceId}:capability` is a LEGACY fallback for
    // declarations without a capabilityId — it is NOT a canonical action/resource
    // identity and should not be treated as one.
    // LOCK: LEGACY_CAPABILITY_ID_SEMANTICS — preserve, do not reinterpret.
    capabilityId: decl.capabilityId ?? `${ev.evidenceId}:capability`,
    capabilityFamily: (normalizeCapabilityFamily(decl.capabilityFamily) as any),
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
    sourceEvidenceIds: Array.from(new Set([ev.evidenceId, ...(Array.isArray(decl.sourceEvidenceIds) ? decl.sourceEvidenceIds : [])])),
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

const CAPABILITY_FAMILY_MAP: Record<string, string> = {
  CONFIG: 'CONFIGURATION_ACTUATION',
  DATA: 'DATA_ACCESS',
  MODEL: 'MODEL_LIFECYCLE',
  TOOL: 'TOOL_ACTION_EXECUTION',
  IDENTITY: 'IDENTITY_PRIVILEGE',
  RAG: 'RAG_CONTEXT_MEMORY',
  AGENT: 'INTER_AGENT_COMMUNICATION',
  EGRESS: 'EXTERNAL_EGRESS',
  PERSIST: 'PERSISTENCE',
  SECRET: 'DATA_ACCESS',
  TENANT: 'RESOURCE_SCOPE',
  POLICY: 'RESOURCE_SCOPE',
  CALLBACK: 'EXTERNAL_EGRESS',
  SERVICE: 'INTER_AGENT_COMMUNICATION',
  NETWORK: 'EXTERNAL_EGRESS',
};

function extractCanonicalCapabilityFamily(operation: string): string {
  const prefix = operation.split('.')[0]?.toUpperCase() ?? 'UNKNOWN';
  return CAPABILITY_FAMILY_MAP[prefix] ?? prefix;
}

function normalizeCapabilityFamily(family?: string): string {
  if (!family) return 'UNKNOWN';
  const mapped = CAPABILITY_FAMILY_MAP[family.toUpperCase()];
  return mapped ?? family;
}

const PLANE_ORDER: AssurancePlane[] = ['REQUESTED', 'POLICY_AUTHORIZED', 'EFFECTIVELY_GRANTED', 'CODE_CAPABLE', 'OBSERVED'];

/** U6: canonical producers that currently emit qualifying capability evidence per plane. */
const PLANE_PRODUCERS: Record<AssurancePlane, string[]> = {
  // UX-2B: SAAS_INVENTORY now emits REQUESTED Capability Manifest evidence
  // (evidenceType = requested_capability_manifest). This is customer/operator
  // self-reported intent, NOT policy authorization.
  REQUESTED: [PRODUCER_IDS.SAAS_INVENTORY],
  POLICY_AUTHORIZED: [], // operating envelope / policy record
  // EG-1 FINAL TRUTH: OUTCOME = PARTIAL_AWS_AUTHORITY_SOURCE
  // SAAS_IAM_GRANT observes AWS IAM but cannot emit canonical EFFECTIVELY_GRANTED
  // due to unmodeled authorization layers (resource policies, VPC endpoint policies,
  // session policies). The producer remains registered but is NOT a canonical
  // plane producer for EFFECTIVELY_GRANTED. AWS observation is preserved as
  // PARTIAL/context evidence only.
  // LOCK: UNMODELED_AUTHORIZATION_LAYER != ALLOW
  EFFECTIVELY_GRANTED: [],
  CODE_CAPABLE: [PRODUCER_IDS.SAAS_STATIC], // bounded R2/R10 finding-derived bridge only
  OBSERVED: [PRODUCER_IDS.SAAS_RUNTIME], // authoritative action witness evidence
};

/**
 * U6: Build a plane availability snapshot from the projected capability facts.
 *
 * PRESENT != COMPLETE. A finding-derived CODE_CAPABLE fact is PRESENT but coverage is PARTIAL.
 * Missing planes are reported as NOT_PROVIDED rather than invented.
 *
 * Phase 12: CODE_CAPABLE availability now uses Capability Core participation truth
 * from evidence, not just producer participation. This distinguishes:
 *   - saas-static available + no Capability run → NOT_EVALUATED
 *   - saas-static available + Capability run reported zero → EVALUATED_NO_QUALIFYING_FACTS
 *   - saas-static available + qualifying facts → PRESENT
 *
 * LOCK: PRODUCER_PARTICIPATED != EVERY_PRODUCER_DIMENSION_EVALUATED
 * LOCK: CAPABILITY_CORE_NOT_REPORTED != EVALUATED_NO_QUALIFYING_FACTS
 */
export function buildPlaneAvailability(
  facts: CapabilityFactProjectionResult,
  availableProducerIds: string[] = [],
  evidence?: DecisionEvidenceProjection[],
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
        // Phase 12: For CODE_CAPABLE, use Capability Core participation truth
        // to distinguish NOT_EVALUATED from EVALUATED_NO_QUALIFYING_FACTS
        // LOCK: PRODUCER_PARTICIPATED != EVERY_PRODUCER_DIMENSION_EVALUATED
        // LOCK: CAPABILITY_CORE_NOT_REPORTED != EVALUATED_NO_QUALIFYING_FACTS
        if (plane === 'CODE_CAPABLE' && evidence) {
          const staticEvidence = evidence.filter(ev => {
            const producer = resolveCanonicalProducerId(ev.producerId) ?? ev.producerId;
            return producer === 'saas-static';
          });
          const hasCapabilityRunReported = staticEvidence.some(ev =>
            ev.capabilityRunParticipation?.reported === true
          );
          if (hasCapabilityRunReported) {
            // Capability Core was reported — evaluated but produced no qualifying facts
            status = 'EVALUATED_NO_QUALIFYING_FACTS';
          } else {
            // saas-static participated but Capability Core was NOT reported
            // LOCK: CAPABILITY_CORE_NOT_REPORTED != EVALUATED_NO_QUALIFYING_FACTS
            status = 'NOT_EVALUATED';
          }
        } else if (plane === 'REQUESTED' && evidence) {
          // UX-2B: REQUESTED plane availability is determined by whether a
          // requested_capability_manifest evidence row specifically participated
          // in this evaluation — NOT merely by saas-inventory participation.
          //
          // LOCK: SAAS_INVENTORY_PARTICIPATED != REQUESTED_MANIFEST_PROVIDED
          // LOCK: NO_REQUESTED_MANIFEST != EXPLICIT_EMPTY_REQUESTED_MANIFEST
          //
          // A manifest with zero capabilities is an explicit empty declaration
          // → EVALUATED_NO_QUALIFYING_FACTS (not NOT_PROVIDED).
          // No manifest at all → NOT_PROVIDED.
          // General inventory (system_configuration) evidence alone does NOT
          // constitute a REQUESTED manifest.
          const hasManifestEvidence = evidence.some(ev =>
            ev.evidenceType === 'requested_capability_manifest'
          );
          if (hasManifestEvidence) {
            // Manifest exists (possibly explicit empty) — evaluated with zero facts
            status = 'EVALUATED_NO_QUALIFYING_FACTS';
          } else {
            // No requested manifest evidence — NOT_PROVIDED
            // (saas-inventory may have participated with system_configuration,
            // but that is NOT a REQUESTED manifest)
            status = 'NOT_PROVIDED';
          }
        } else {
          status = 'EVALUATED_NO_QUALIFYING_FACTS';
        }
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
          : status === 'NOT_EVALUATED'
            ? `Capability Core was not reported for this scan; the ${plane.toLowerCase().replace(/_/g, ' ')} dimension was not evaluated.`
            : 'No qualifying capability evidence was provided for this plane.',
    };
  });
}
