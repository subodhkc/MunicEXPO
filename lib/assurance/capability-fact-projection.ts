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
} from './types';
import { ProjectedEvidence } from './evidence-set-builder';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

export interface CapabilityFactProjectionInput {
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  evidence: ProjectedEvidence[];
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
  const { evidence, operatingEnvelope } = input;

  return {
    requested: projectRequestedFacts(evidence),
    policy: projectPolicyFacts(operatingEnvelope),
    granted: projectGrantedFacts(evidence),
    capable: projectCapableFacts(evidence),
    observed: projectObservedFacts(evidence),
  };
}

function projectRequestedFacts(evidence: ProjectedEvidence[]): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const caps = extractCapabilityDeclarations(ev, 'REQUESTED');
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

/**
 * POLICY_AUTHORIZED may ONLY come from an APPROVED operating envelope.
 * DRAFT / SUPERSEDED / REVOKED envelopes produce no POLICY_AUTHORIZED facts.
 */
function projectPolicyFacts(operatingEnvelope?: OperatingEnvelope): CapabilityFact[] {
  if (!operatingEnvelope) return [];
  if (operatingEnvelope.state !== 'APPROVED') return [];

  const facts: CapabilityFact[] = [];
  const constraints = operatingEnvelope.constraints;
  const base = {
    subject: 'policy',
    sourcePlane: 'POLICY_AUTHORIZED' as AssurancePlane,
    authorityClass: 'AUTHORITATIVE_POLICY' as AuthorityClass,
    evidenceMethod: 'SIGNED_MANIFEST' as EvidenceMethod,
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

function projectGrantedFacts(evidence: ProjectedEvidence[]): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const caps = extractCapabilityDeclarations(ev, 'EFFECTIVELY_GRANTED');
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

function projectCapableFacts(evidence: ProjectedEvidence[]): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const producer = resolveCanonicalProducerId(ev.sourceType) ?? ev.sourceType;
    const isStatic = producer === 'saas-static' || producer === 'saas-inventory';
    if (!isStatic) continue;

    const caps = extractCapabilityDeclarations(ev, 'CODE_CAPABLE');
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

function projectObservedFacts(evidence: ProjectedEvidence[]): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  for (const ev of evidence) {
    const producer = resolveCanonicalProducerId(ev.sourceType) ?? ev.sourceType;
    const isRuntime = producer === 'saas-runtime' || ev.evidenceType === 'action_witness' || ev.evidenceType === 'runtime_trace';
    if (!isRuntime) continue;

    // Generic runtime trace alone cannot establish OBSERVED/APPLIED.
    // Only exact capability declarations on runtime evidence with sourcePlane=OBSERVED are kept
    const caps = extractCapabilityDeclarations(ev, 'OBSERVED');
    if (caps.length > 0) facts.push(...caps);
  }
  return facts;
}

/**
 * Extract capability declarations from evidence metadata or findings.
 * Returns empty if no canonical declaration exists.
 */
function extractCapabilityDeclarations(ev: ProjectedEvidence, sourcePlane: AssurancePlane): CapabilityFact[] {
  const facts: CapabilityFact[] = [];
  const metadata = (ev.metadata ?? {}) as Record<string, unknown>;
  const declarations = metadata.capabilityDeclarations as any[] | undefined;

  if (declarations) {
    for (const decl of declarations) {
      if (decl && decl.sourcePlane === sourcePlane) {
        facts.push(buildCapabilityFact(ev, decl));
      }
    }
  }

  if (ev.findings) {
    for (const finding of ev.findings) {
      const f = finding as any;
      if (f && f.sourcePlane === sourcePlane) {
        facts.push(buildCapabilityFact(ev, f));
      }
    }
  }

  return facts;
}

function buildCapabilityFact(ev: ProjectedEvidence, decl: any): CapabilityFact {
  return {
    capabilityId: decl.capabilityId ?? `${ev.id}:capability`,
    subject: decl.subject ?? 'system',
    action: decl.action ?? 'unknown',
    resource: decl.resource ?? 'unknown',
    scope: decl.scope ?? 'unknown',
    dataClass: decl.dataClass,
    channel: decl.channel,
    guardRequirements: Array.isArray(decl.guardRequirements) ? decl.guardRequirements : undefined,
    impact: decl.impact,
    environment: decl.environment,
    constraints: Array.isArray(decl.constraints) ? decl.constraints : undefined,
    targetCount: typeof decl.targetCount === 'number' ? decl.targetCount : undefined,
    changeMagnitude: typeof decl.changeMagnitude === 'number' ? decl.changeMagnitude : undefined,
    evidenceId: ev.id,
    producerRunId: ev.producerRunId ?? ev.sourceId ?? undefined,
    contentHash: ev.contentHash ?? undefined,
    sourcePlane: decl.sourcePlane as AssurancePlane,
    authorityClass: (decl.authorityClass as AuthorityClass) ?? 'NON_AUTHORITATIVE',
    evidenceMethod: (decl.evidenceMethod as EvidenceMethod) ?? 'STATIC_PATH_ANALYSIS',
    sourceEvidenceIds: [ev.id, ...(Array.isArray(decl.sourceEvidenceIds) ? decl.sourceEvidenceIds : [])],
    authoritySourceLabel: (decl.authoritySourceLabel as AuthoritySourceLabel) ?? 'REFERENCE_DEFAULT',
  };
}

function extractResourceFromOperation(operation: string): string {
  // Minimal resource inference from O-RAN / R1 operations
  if (operation.includes('policy')) return 'policy';
  if (operation.includes('config')) return 'config';
  if (operation.includes('data')) return 'data';
  if (operation.includes('model')) return 'model';
  if (operation.includes('callback')) return 'callback';
  if (operation.includes('service')) return 'service';
  return 'resource';
}
