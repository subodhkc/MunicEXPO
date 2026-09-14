/**
 * AI Action & Access Map — Topology Projector
 *
 * Deterministic read projection over persisted accepted-scan truth.
 *
 * Adapters:
 *   - SYSTEM_IDENTITY_ADAPTER       — AI System identity from prisma.ai_systems
 *   - CONNECTED_ASSET_ADAPTER       — Connected assets from listConnectedAssets (projected as nodes, displayName primary)
 *   - APPLICATION_ACCESS_ADAPTER    — AC-1 application authorization facts (same scan as Action Authority)
 *   - ACTION_AUTHORITY_ADAPTER      — buildSystemActionAuthorityReadModel (current source, policy, evaluated basis)
 *   - CURRENT_POLICY_ADAPTER        — current approved Operating Envelope (from Action Authority read model)
 *   - EVIDENCE_ADAPTER              — resolveSystemEvidence (canonical system evidence owner)
 *   - ARCHITECTURE_INSIGHT_ADAPTER  — DEFERRED (not implemented in this MVP)
 *
 * LOCK: MAP_REQUEST != STATIC_REANALYSIS
 * LOCK: RENDERER != ANALYZER
 * LOCK: GRAPH_PRESENTATION != GRAPH_TRUTH
 * LOCK: TOPOLOGY_EDGE != NEW_EVIDENCE
 * LOCK: CODE_RBAC != EFFECTIVELY_GRANTED
 * LOCK: PARTIAL_AWS_OBSERVATION != EFFECTIVELY_GRANTED
 * LOCK: FIELD_ABSENT != FIELD_PRESENT_EMPTY
 * LOCK: LATEST_COMPLETED_SCAN != CURRENT_ACCEPTED_STATIC_SOURCE
 * LOCK: AC1_SOURCE_SCAN == CURRENT_ACTION_AUTHORITY_SOURCE_SCAN
 * LOCK: CURRENT_COMPOSITE_MAP != HISTORICAL_SCAN_SNAPSHOT
 * LOCK: TOPOLOGY_PROJECTOR != ACTION_AUTHORITY_ENGINE
 * LOCK: ACTION_METHOD_NAME != CONSEQUENCE_SEMANTICS
 * LOCK: UNKNOWN_CONSEQUENCE != READ_DATA
 * LOCK: AI_REACHABLE != EXECUTED
 * LOCK: AI_REACHABILITY_UNKNOWN != EXECUTES
 * LOCK: PARTIAL_CREDENTIAL_EVIDENCE != AUTHORIZATION
 * LOCK: TENANT_CONTEXT != TENANT_ENFORCEMENT
 * LOCK: DISPLAY_LABEL != NODE_IDENTITY
 * LOCK: SAME_ACTION_LABEL != SAME_EXECUTION_PATH
 * LOCK: PROJECTION_RELATION_OR_SOURCE_IDENTITY_CHANGE => PROJECTION_HASH_CHANGE
 * LOCK: PROJECTION_HASH != UNIVERSAL_NATIVE_STATE_DIGEST
 * LOCK: LOCAL_KEYWORD_HEURISTIC != GATE4C_QUALIFIED_SEMANTIC_REFERENCE
 * LOCK: SIMILAR_ACTION_STRING != CANONICAL_CAPABILITY_JOIN
 * LOCK: NO_EXACT_CAPABILITY_JOIN => NO_CAPABILITY_EFFECT_PROMOTION
 * LOCK: CURRENT_SOURCE_BASIS != EVALUATED_BASIS
 * LOCK: LATEST_EVALUATION != CURRENT_TOPOLOGY
 * LOCK: ASSET_TYPE != ASSET_INSTANCE_IDENTITY
 * LOCK: AGENT_RELATION != DELEGATION_PROOF
 *
 * @version topology-1.0.0
 */

import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { verifyAISystemOrgBinding } from '@/lib/org-context';
import { listConnectedAssets } from '@/lib/ai-inventory/connected-assets';
import { readApplicationAuthorizationForSystem } from '@/lib/ai-security/application-authorization-read';
import {
  validatePersistedSnapshot,
  type PersistedOperationCoverageIntelligence,
} from '@/lib/ai-security/operation-coverage-read';
import { buildActionProofTraceProjection } from '@/lib/ai-inventory/action-proof-trace';
import { buildAriTopologyProjection } from './ari-topology-convergence';
import { getCurrentEffectiveGrant } from '@/lib/iam-grant/effective-grant-observation';
import { buildSystemActionAuthorityReadModel } from '@/lib/ai-inventory/system-action-authority';
import { resolveSystemEvidence } from '@/lib/ai-inventory/system-evidence-resolver';
import {
  computeProjectionHash,
  type TopologyProjectionPayload,
  type RelationRef,
  type SourceRef,
  type EvidenceRef,
  type JoinBasis,
} from '@/lib/shared-contracts/wave0-contract-freeze';
import {
  type TopologyProjectionResult,
  type TopologyNode,
  type TopologyEdge,
  type NodeAvailability,
  type PlaneStatusDisplay,
  TOPOLOGY_PROJECTION_SCHEMA_VERSION,
  TOPOLOGY_PROJECTION_VERSION,
  SUPPORTED_MAP_LENSES,
  SUPPORTED_SEMANTIC_ZOOM_LEVELS,
  SUBTYPE_LABELS,
  AVAILABILITY_LABELS,
  EFFECT_LABELS,
} from './types';
import { stableNodeId, stableEdgeId, s } from './stable-ids';

// ─── Unique canonical capability source correlation ──────────────────────────
// The join between an AC-1 occurrence and a canonical capability action is
// a UNIQUE_SOURCE_OPERATION_CORRELATION, not a full canonical capability identity.
// Both sides carry sourceLocation (source-established) and action/protectedAction.
//
// Qualification rules (fail-closed):
//   1. CANONICAL_MAPPING_REQUIRED — only exact/canonical mappingStrength candidates are eligible
//   2. RESOURCE_MATCH_WHEN_KNOWN — if AC-1 has protectedResource, require exact normalized match
//   3. UNIQUE_RESULT_REQUIRED — exactly ONE qualified candidate may remain (0 or >1 → NO JOIN)
//
// LOCK: SIMILAR_ACTION_STRING != CANONICAL_CAPABILITY_JOIN
// LOCK: NO_EXACT_CAPABILITY_JOIN => NO_CAPABILITY_EFFECT_PROMOTION
// LOCK: MULTIPLE_SOURCE_CORRELATED_CAPABILITIES != ONE_EXACT_CAPABILITY
// LOCK: LAST_CANDIDATE != CORRECT_CAPABILITY
// LOCK: HEURISTIC_CAPABILITY_SUGGESTION != EXACT_ACTION_CAPABILITY_JOIN
// LOCK: HEURISTIC_EFFECT != SOURCE_ESTABLISHED_CONSEQUENCE
// LOCK: RESOURCE_A != RESOURCE_B
// LOCK: AMBIGUOUS_JOIN != EXACT_JOIN

interface CapabilityJoinEntry {
  planeStatus: PlaneStatusDisplay;
  effect: string;
  capabilityId: string;
  resource: string;
  mappingStrength: string;
  basis: 'CURRENT_SOURCE' | 'EVALUATED_BASIS';
}

// Mapping strengths that qualify as canonical/exact (per Action Surface semantics).
// LOCK: TOPOLOGY_CANONICALITY == ACTION_SURFACE_CANONICALITY
// Must match lib/assurance/action-surface.ts isCanonical rule exactly:
//   decl.mappingStrength === 'EXACT_CAPABILITY_MAPPING' ||
//   decl.mappingStrength === 'EXACT_RULE_MAPPING'
// LOCK: PROFILE_MAPPING != CANONICAL_ACTION_SURFACE_MAPPING
// LOCK: MANUAL_APPROVED_MAPPING != CANONICAL_ACTION_SURFACE_MAPPING
const CANONICAL_MAPPING_STRENGTHS = new Set([
  'EXACT_CAPABILITY_MAPPING',
  'EXACT_RULE_MAPPING',
]);

function normalizeResource(r: string | undefined | null): string {
  return (r ?? '').trim().toLowerCase();
}

function buildCapabilityJoinMap(
  actionAuthority: Awaited<ReturnType<typeof buildSystemActionAuthorityReadModel>>,
): Map<string, CapabilityJoinEntry[]> {
  // Multi-value map: key → all candidates (qualified + unqualified)
  // Join resolution happens at lookup time with fail-closed semantics
  const joinMap = new Map<string, CapabilityJoinEntry[]>();
  if (!actionAuthority?.currentSourceBasis?.candidateActions) return joinMap;

  for (const ca of actionAuthority.currentSourceBasis.candidateActions) {
    const key = `${ca.sourceLocation}::${ca.action}`;
    const entry: CapabilityJoinEntry = {
      planeStatus: {
        requested: ca.planeStatus.requested,
        policyAuthorized: ca.planeStatus.policyAuthorized,
        effectivelyGranted: ca.planeStatus.effectivelyGranted,
        codeCapable: ca.planeStatus.codeCapable,
        observed: ca.planeStatus.observed,
      },
      effect: ca.effect || 'UNKNOWN',
      capabilityId: ca.capabilityId,
      resource: ca.resource,
      mappingStrength: ca.mappingStrength,
      basis: 'CURRENT_SOURCE',
    };
    const existing = joinMap.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      joinMap.set(key, [entry]);
    }
  }
  return joinMap;
}

function tryUniqueCanonicalJoin(
  fact: { protectedAction?: string; protectedResource?: string; sourceLocation: string },
  joinMap: Map<string, CapabilityJoinEntry[]>,
): CapabilityJoinEntry | undefined {
  if (!fact.protectedAction) return undefined;
  const key = `${fact.sourceLocation}::${fact.protectedAction}`;
  const candidates = joinMap.get(key);
  if (!candidates || candidates.length === 0) return undefined;

  // Qualification Rule 1: canonical mapping only
  // LOCK: HEURISTIC_CAPABILITY_SUGGESTION != EXACT_ACTION_CAPABILITY_JOIN
  const canonicalCandidates = candidates.filter((c) =>
    CANONICAL_MAPPING_STRENGTHS.has(c.mappingStrength),
  );

  // Qualification Rule 2: resource match when AC-1 knows it
  // LOCK: RESOURCE_A != RESOURCE_B
  const ac1Resource = normalizeResource(fact.protectedResource);
  const hasAc1Resource = ac1Resource.length > 0;

  const resourceMatched = canonicalCandidates.filter((c) => {
    if (hasAc1Resource) {
      return normalizeResource(c.resource) === ac1Resource;
    }
    return true;
  });

  // Qualification Rule 3: unique result required
  // LOCK: AMBIGUOUS_JOIN != EXACT_JOIN
  // LOCK: MULTIPLE_SOURCE_CORRELATED_CAPABILITIES != ONE_EXACT_CAPABILITY
  if (resourceMatched.length === 0) return undefined; // ZERO → NO JOIN
  if (resourceMatched.length > 1) return undefined; // AMBIGUOUS → NO JOIN
  return resourceMatched[0]; // ONE → qualified join
}

/**
 * Build the topology projection for an AI System.
 *
 * Tenant invariant: verifyAISystemOrgBinding before any read.
 */
export async function buildTopologyProjection(
  aiSystemId: string,
  organizationId: string,
): Promise<TopologyProjectionResult | null> {
  const bound = await verifyAISystemOrgBinding(aiSystemId, organizationId);
  if (!bound) return null;

  // SYSTEM_IDENTITY_ADAPTER
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiSystem = await (prisma as any).ai_systems.findFirst({
    where: { id: aiSystemId, organizationId },
    select: { id: true, name: true, systemType: true, provider: true },
  });
  if (!aiSystem) return null;

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const limitations: string[] = [];
  const relations: RelationRef[] = [];
  const sourceRefs: SourceRef[] = [];
  const evidenceRefs: EvidenceRef[] = [];

  // ─── AI Execution Node ──────────────────────────────────────────────────
  const aiSystemNodeId = stableNodeId('ai_execution', [aiSystemId]);
  nodes.push({
    id: aiSystemNodeId,
    label: aiSystem.name || 'AI System',
    kind: 'ai_execution',
    subType: aiSystem.systemType || undefined,
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
  });
  sourceRefs.push({
    sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
    sourceId: `ai_systems:${aiSystemId}`,
    derivationMethod: 'prisma_direct_read',
  });

  // ─── ACTION_AUTHORITY_ADAPTER ───────────────────────────────────────────
  // Reuse the canonical Action Authority read model for:
  //   - current accepted source identity
  //   - current source candidate actions (with five-plane status)
  //   - current policy basis
  //   - evaluated basis (persisted, never recomputed)
  let actionAuthority: Awaited<ReturnType<typeof buildSystemActionAuthorityReadModel>> = null;
  try {
    actionAuthority = await buildSystemActionAuthorityReadModel(aiSystemId, organizationId);
  } catch {
    limitations.push('Action authority read model could not be loaded');
  }

  // ─── CURRENT_POLICY_ADAPTER ─────────────────────────────────────────────
  let currentPolicy: TopologyProjectionResult['currentPolicy'];
  if (actionAuthority?.currentPolicyBasis) {
    const cp = actionAuthority.currentPolicyBasis;
    currentPolicy = {
      state: cp.state,
      envelopeId: cp.envelopeId,
      version: cp.version,
      approvedBy: cp.approvedBy,
      approvedAt: cp.approvedAt,
    };
    if (cp.state === 'APPROVED') {
      const policyNodeId = stableNodeId('policy', [s(cp.envelopeId)]);
      nodes.push({
        id: policyNodeId,
        label: SUBTYPE_LABELS['APPROVED'] || 'Approved policy',
        kind: 'policy',
        subType: 'APPROVED',
        subTypeLabel: 'Approved policy',
        aiReachable: 'UNKNOWN',
        availability: 'AVAILABLE',
        limitations: [],
      });
      edges.push({
        id: stableEdgeId(policyNodeId, aiSystemNodeId, 'governed_by'),
        source: policyNodeId,
        target: aiSystemNodeId,
        label: 'governs',
        kind: 'governed_by',
        joinBasis: 'POLICY_BINDING',
        style: 'solid',
      });
      relations.push({
        relationType: 'POLICY_GOVERNS_SYSTEM',
        fromRef: policyNodeId,
        toRef: aiSystemNodeId,
        joinBasis: 'POLICY_BINDING',
      });
      sourceRefs.push({
        sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
        sourceId: `operating_envelope:${s(cp.envelopeId)}`,
        derivationMethod: 'action_authority_current_policy_basis',
      });
    } else {
      // Policy not configured — show as source gap, not fake green
      const policyNodeId = stableNodeId('policy', ['not_configured']);
      nodes.push({
        id: policyNodeId,
        label: SUBTYPE_LABELS['NOT_CONFIGURED'] || 'Policy not yet defined',
        kind: 'policy',
        subType: 'NOT_CONFIGURED',
        subTypeLabel: 'Policy not yet defined',
        aiReachable: 'UNKNOWN',
        availability: 'SOURCE_GAP',
        limitations: ['No approved operating envelope configured for this AI System'],
      });
      limitations.push('No approved operating envelope configured — policy plane is not established');
    }
  }

  // ─── APPLICATION_ACCESS_ADAPTER (AC-1 persisted facts) ──────────────────
  // Uses the SAME source selection as Action Authority (orchestrator run → staticScanId)
  const ac1Read = await readApplicationAuthorizationForSystem(aiSystemId, organizationId);

  let mapAvailability: NodeAvailability = 'AVAILABLE';
  let scanProvenance: TopologyProjectionResult['scanProvenance'];
  /**
   * Whether ActionProofTrace references were resolved from the SAME scan this
   * map is projected from. 'NOT_AVAILABLE' means no valid operation-coverage
   * snapshot exists for this exact scanId — never a different scan's traces.
   */
  let actionProofBasis: 'SAME_SCAN' | 'NOT_AVAILABLE' = 'NOT_AVAILABLE';
  let opCovData: PersistedOperationCoverageIntelligence | null = null;
  // AA-REPORTING-INTERPRETATION-2 §3: presentation/provenance view state.
  // Default = latest accepted evidence for this AI system.
  let viewState: TopologyProjectionResult['viewState'] = 'CURRENT_SYSTEM_VIEW';

  if (ac1Read.status === 'NO_CURRENT_ACCEPTED_SOURCE') {
    mapAvailability = 'SOURCE_GAP';
    limitations.push('No current accepted static source exists for this AI System — run a scan via the orchestrator to populate the map');
  } else if (ac1Read.status === 'SOURCE_GAP') {
    mapAvailability = 'SOURCE_GAP';
    // AA-REPORTING-INTERPRETATION-2 §3.A: FIELD_NULL on an active run means
    // this is a Current Scan Projection — analysis still populating.
    if (ac1Read.reason === 'FIELD_NULL' && ac1Read.sourceRunActive === true) {
      viewState = 'CURRENT_SCAN_PROJECTION';
    }
    if (ac1Read.reason === 'FIELD_NULL') {
      // AA-REPORTING-INTERPRETATION-2 §5: ACTIVE current scan whose fields
      // are still being populated != COMPLETED legacy scan that predates
      // the evidence producer. FIELD_NULL stays the evidence state.
      limitations.push(
        ac1Read.sourceRunActive === true
          ? 'Analysis is still being populated for this scan. Additional relationships will appear as evidence becomes available.'
          : 'The current accepted scan predates application authorization analysis — run a new scan to populate the map',
      );
    } else if (ac1Read.reason === 'INVALID_SNAPSHOT') {
      limitations.push(`Application authorization snapshot is invalid: ${ac1Read.invalidReason}`);
    } else if (ac1Read.reason === 'UNSUPPORTED_SCHEMA_VERSION') {
      limitations.push(`Application authorization snapshot uses unsupported schema version "${ac1Read.encounteredVersion}"`);
    }
    scanProvenance = {
      scanId: ac1Read.scanId,
      commitSha: null,
      scannerVersion: null,
      scannedAt: null,
    };
  } else if (ac1Read.status === 'AVAILABLE') {
    scanProvenance = {
      scanId: ac1Read.scanId,
      commitSha: ac1Read.commitSha,
      scannerVersion: ac1Read.scannerVersion,
      scannedAt: ac1Read.scannedAt?.toISOString() ?? null,
    };
    sourceRefs.push({
      sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
      sourceId: `ai_security_scans:${ac1Read.scanId}`,
      derivationMethod: 'application_authorization_read_seam',
    });

    const { snapshot } = ac1Read;
    for (const lim of snapshot.extractionLimitations) {
      limitations.push(lim);
    }

    // ─── Operation-coverage snapshot (ActionProof + ARI source) ───────────
    // Same-scan only. Loaded once and reused for trace references and ARI topology.
    const traceIdsBySinkId = new Map<string, string[]>();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opCovScan = await (prisma as any).ai_security_scans.findFirst({
        where: { scanId: ac1Read.scanId, organizationId },
        select: { scanId: true, operationCoverageIntelligence: true },
      });
      if (opCovScan?.operationCoverageIntelligence != null) {
        const raw = typeof opCovScan.operationCoverageIntelligence === 'string'
          ? JSON.parse(opCovScan.operationCoverageIntelligence)
          : opCovScan.operationCoverageIntelligence;
        const parsed = raw as PersistedOperationCoverageIntelligence;
        const validationError = validatePersistedSnapshot(parsed);
        if (
          !validationError &&
          parsed.authorityPlaneInvariants?.LIKELY_PROMOTES_CANONICAL_AUTHORITY !== true
        ) {
          if (parsed.scanId === ac1Read.scanId) {
            opCovData = parsed;
            const traceProjection = buildActionProofTraceProjection({
              scanId: ac1Read.scanId,
              toolCandidates: opCovData.toolCandidates || [],
              toolRegistrationRelations: opCovData.toolRegistrationRelations,
              pythonToolModelExposureRelations: opCovData.pythonToolModelExposureRelations,
              pythonToolDispatchRelations: opCovData.pythonToolDispatchRelations,
              toolImplementationRelations: opCovData.toolImplementationRelations,
              handlerOperationRelations: opCovData.handlerOperationRelations,
              handlerOperationCoverage: opCovData.handlerOperationCoverage,
              operationArgumentProvenanceRelations: opCovData.operationArgumentProvenanceRelations,
              argumentProvenanceCoverage: opCovData.argumentProvenanceCoverage,
              actionContextBindingRelations: opCovData.actionContextBindingRelations,
              actionContextBindingCoverage: opCovData.actionContextBindingCoverage,
              actionConfirmationMediationRelations: opCovData.actionConfirmationMediationRelations,
              pythonToolExposureCoverage: opCovData.pythonToolExposureCoverage,
              extractionCompletion: opCovData.extractionCompletion,
              extractionLimitations: opCovData.extractionLimitations,
            });
            actionProofBasis = 'SAME_SCAN';
            for (const t of traceProjection.traces) {
              const ct = t.consequenceTarget;
              if (ct && ct.targetKind === 'SINK' && ct.targetId) {
                const list = traceIdsBySinkId.get(ct.targetId) ?? [];
                list.push(t.id);
                traceIdsBySinkId.set(ct.targetId, list);
              }
            }
            // PX-FINAL-R: coverage limitation truth — map trace references are
            // populated only for exact SINK-backed consequence identities.
            // PROVIDER_NATIVE_OPERATION traces have no equally strong canonical
            // AC-1 sinkId join, so they remain available in Repository
            // Intelligence without a map reference. NO heuristic join.
            // LOCK: PROVIDER_NATIVE_OPERATION_ID != AC1_SINK_ID
            // LOCK: NO_EXACT_PROVIDER_MAP_JOIN => NO_MAP_TRACE_REFERENCE
            // LOCK: TRACE_EXISTS != MAP_REFERENCE_EXISTS
            // LOCK: MAP_REFERENCE_ABSENT != TRACE_ABSENT
            // LOCK: MAP_TRACE_COVERAGE_PARTIAL != ANALYSIS_INCOMPLETE
            const hasUnlinkedProviderNative = traceProjection.traces.some(
              (t) => t.consequenceTarget?.targetKind === 'PROVIDER_NATIVE_OPERATION',
            );
            if (hasUnlinkedProviderNative) {
              limitations.push(
                'Action Proof map references currently cover exact SINK-backed consequence identities. ' +
                'Provider-native operation traces remain available in Repository Intelligence but are not ' +
                'map-linked without an exact canonical map identity.',
              );
            }
          } else {
            actionProofBasis = 'NOT_AVAILABLE';
            limitations.push('Operation-coverage snapshot scan identity does not match the current accepted scan.');
          }
        }
      }
    } catch {
      // Action proof references are additive; absence degrades gracefully.
      limitations.push('Action proof trace references could not be resolved for this scan');
    }

    // Build exact capability join map (Part 1: retire string-only join)
    // LOCK: SIMILAR_ACTION_STRING != CANONICAL_CAPABILITY_JOIN
    // Key: sourceLocation + action — both source-established on both sides
    const capabilityJoinMap = buildCapabilityJoinMap(actionAuthority);

    // Track which action-occurrence IDs we've created (repair 16: don't collapse)
    const actionOccurrenceNodes = new Map<string, TopologyNode>();
    // Track entrypoint nodes
    const entrypointNodes = new Map<string, TopologyNode>();
    // Track identity nodes
    const identityNodes = new Map<string, TopologyNode>();
    // Track access nodes
    const accessNodes = new Map<string, TopologyNode>();
    // Track tenant context nodes per entrypoint
    const tenantContextNodes = new Map<string, TopologyNode>();

    for (const fact of snapshot.facts) {
      const scanId = ac1Read.scanId;

      // ─── Identity Node (repair 15: semantic tuple, not display string) ──
      const identityTuple = [scanId, s(fact.entrypointId), fact.subjectKind, s(fact.roleOrPermissionToken)];
      const identityNodeId = stableNodeId('identity', identityTuple);
      if (!identityNodes.has(identityNodeId)) {
        const identityLabel = fact.subjectKind === 'role'
          ? `${fact.roleOrPermissionToken ?? 'Role'} role`
          : fact.subjectKind === 'permission'
          ? `${fact.roleOrPermissionToken ?? 'Permission'} permission`
          : SUBTYPE_LABELS[fact.subjectKind] || fact.subjectKind;
        const identityNode: TopologyNode = {
          id: identityNodeId,
          label: identityLabel,
          kind: 'identity',
          subType: fact.subjectKind,
          subTypeLabel: SUBTYPE_LABELS[fact.subjectKind] || fact.subjectKind,
          aiReachable: 'UNKNOWN',
          availability: 'AVAILABLE',
          limitations: [],
        };
        identityNodes.set(identityNodeId, identityNode);
        nodes.push(identityNode);
      }

      // ─── Application Access Node ────────────────────────────────────────
      const accessTuple = [scanId, s(fact.entrypointId), fact.guardType, s(fact.roleOrPermissionToken)];
      const accessNodeId = stableNodeId('application_access', accessTuple);
      if (!accessNodes.has(accessNodeId)) {
        const accessLabel = SUBTYPE_LABELS[fact.guardType] || fact.guardType;
        const accessAvailability: NodeAvailability = fact.authorizationOrdering === 'AFTER_SINK'
          ? 'PARTIAL'
          : fact.authorizationOrdering === 'AUTH_NOT_FOUND'
          ? 'UNAVAILABLE'
          : fact.authorizationOrdering === 'AUTH_ORDER_UNKNOWN'
          ? 'UNKNOWN'
          : 'AVAILABLE';
        const accessLimitations: string[] = [];
        if (fact.authorizationOrdering === 'AFTER_SINK') {
          accessLimitations.push('Guard occurs after the action — does not protect it');
        }
        if (fact.authenticationOrdering === 'AUTH_NOT_FOUND') {
          accessLimitations.push('No authentication guard found');
        }
        const accessNode: TopologyNode = {
          id: accessNodeId,
          label: accessLabel,
          kind: 'application_access',
          subType: fact.guardType,
          subTypeLabel: SUBTYPE_LABELS[fact.guardType] || fact.guardType,
          aiReachable: 'UNKNOWN',
          availability: accessAvailability,
          sourceLocation: fact.guardLocation ? `${fact.guardLocation.file}:${fact.guardLocation.line}` : undefined,
          limitations: accessLimitations,
        };
        accessNodes.set(accessNodeId, accessNode);
        nodes.push(accessNode);
      }

      // ─── Entrypoint Node (repair 13: project entrypoint/route layer) ────
      let entrypointNodeId: string | undefined;
      if (fact.entrypointId) {
        const epTuple = [scanId, fact.entrypointId];
        entrypointNodeId = stableNodeId('entrypoint', epTuple);
        if (!entrypointNodes.has(entrypointNodeId)) {
          const epNode: TopologyNode = {
            id: entrypointNodeId,
            label: fact.route || fact.entrypointId,
            kind: 'entrypoint',
            subType: 'route',
            subTypeLabel: 'Route / Handler',
            aiReachable: 'UNKNOWN',
            availability: 'AVAILABLE',
            sourceLocation: fact.sourceLocation,
            limitations: [],
          };
          entrypointNodes.set(entrypointNodeId, epNode);
          nodes.push(epNode);
        }
      }

      // ─── Action Node (repair 16: don't collapse same-named actions) ─────
      // Identity = scanId + entrypointId + sinkId + protectedAction + protectedResource
      // LOCK: SAME_SINK_ACTION_DIFFERENT_RESOURCE != SAME_ACTION_OCCURRENCE
      // LOCK: RESOURCE_A != RESOURCE_B
      const actionTuple = [scanId, s(fact.entrypointId), s(fact.sinkId), s(fact.protectedAction), s(fact.protectedResource)];
      const actionNodeId = stableNodeId('action', actionTuple);
      let actionNode = actionOccurrenceNodes.get(actionNodeId);
      if (!actionNode) {
        // Part 1: Exact capability join — NO string-only match
        // LOCK: NO_EXACT_CAPABILITY_JOIN => NO_CAPABILITY_EFFECT_PROMOTION
        const exactJoin = tryUniqueCanonicalJoin(fact, capabilityJoinMap);
        const actionLimitations = [...fact.limitations];
        if (!exactJoin) {
          actionLimitations.push('Authority comparison is not linked to a unique canonical capability for this action path');
        }
        actionNode = {
          id: actionNodeId,
          label: fact.protectedAction || 'Action',
          kind: 'action',
          aiReachable: fact.aiReachable,
          availability: 'AVAILABLE',
          sourceLocation: fact.sourceLocation,
          limitations: actionLimitations,
          scanId,
          // planeStatus ONLY attached when exact join exists
          planeStatus: exactJoin?.planeStatus,
          planeStatusBasis: exactJoin?.basis,
          // effect ONLY attached when exact join exists
          effect: exactJoin?.effect,
          effectLabel: exactJoin ? (EFFECT_LABELS[exactJoin.effect] || exactJoin.effect) : undefined,
          // PY-K3: exact same-scan canonical sinkId join only.
          // LOCK: MAP_NODE_NAME != TRACE_IDENTITY
          actionProofTraceIds: fact.sinkId && traceIdsBySinkId.get(fact.sinkId)?.length
            ? traceIdsBySinkId.get(fact.sinkId)
            : undefined,
        };
        actionOccurrenceNodes.set(actionNodeId, actionNode);
        nodes.push(actionNode);
      }

      // ─── Edges ──────────────────────────────────────────────────────────
      // identity → access (reaches)
      const idToAccessEdge = stableEdgeId(identityNodes.get(identityNodeId)!.id, accessNodeId, 'reaches');
      if (!edges.some((e) => e.id === idToAccessEdge)) {
        edges.push({
          id: idToAccessEdge,
          source: identityNodeId,
          target: accessNodeId,
          label: 'reaches',
          kind: 'reaches',
          joinBasis: 'STRUCTURAL_RELATION',
          style: 'solid',
        });
        relations.push({
          relationType: 'IDENTITY_REACHES_ACCESS',
          fromRef: identityNodeId,
          toRef: accessNodeId,
          joinBasis: 'STRUCTURAL_RELATION',
        });
      }

      // access → entrypoint (routes_to) — Part 6: authorization ordering visible
      if (entrypointNodeId) {
        const accessToEpEdge = stableEdgeId(accessNodeId, entrypointNodeId, 'routes_to');
        if (!edges.some((e) => e.id === accessToEpEdge)) {
          // Part 6: edge label reflects authorization ordering
          const orderLabel = SUBTYPE_LABELS[fact.authorizationOrdering] || fact.authorizationOrdering;
          const orderStyle: 'solid' | 'dashed' | 'dotted' =
            fact.authorizationOrdering === 'BEFORE_SINK' ? 'solid' :
            fact.authorizationOrdering === 'AFTER_SINK' ? 'dashed' :
            fact.authorizationOrdering === 'AUTH_NOT_FOUND' ? 'dotted' : 'dotted';
          edges.push({
            id: accessToEpEdge,
            source: accessNodeId,
            target: entrypointNodeId,
            label: orderLabel,
            kind: 'routes_to',
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
            style: orderStyle,
          });
          relations.push({
            relationType: 'ACCESS_ROUTES_TO_ENTRYPOINT',
            fromRef: accessNodeId,
            toRef: entrypointNodeId,
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
          });
        }

        // entrypoint → action — truthful reachability relation
        // LOCK: AI_REACHABILITY_UNKNOWN != ENTRYPOINT_REACHES_ACTION
        // LOCK: AI_NOT_REACHABLE != ENTRYPOINT_REACHES_ACTION
        // LOCK: DISPLAY_LABEL_TRUTH == RELATION_TRUTH
        const reachKind = fact.aiReachable === true ? 'can_reach' : fact.aiReachable === 'UNKNOWN' ? 'reachability_unknown' : 'not_ai_reachable';
        const epToActionEdge = stableEdgeId(entrypointNodeId, actionNodeId, reachKind);
        if (!edges.some((e) => e.id === epToActionEdge)) {
          const reachLabel = fact.aiReachable === true ? 'can reach' : fact.aiReachable === 'UNKNOWN' ? 'reachability unknown' : 'not AI-reachable';
          const reachStyle: 'solid' | 'dashed' | 'dotted' = fact.aiReachable === true ? 'solid' : fact.aiReachable === 'UNKNOWN' ? 'dotted' : 'dashed';
          const reachRelationType = fact.aiReachable === true ? 'ENTRYPOINT_CAN_REACH_ACTION' : fact.aiReachable === 'UNKNOWN' ? 'ENTRYPOINT_ACTION_REACHABILITY_UNKNOWN' : 'ENTRYPOINT_NOT_AI_REACHABLE';
          const reachJoinBasis = fact.aiReachable === true ? 'STRUCTURAL_RELATION' : 'UNRESOLVED';
          edges.push({
            id: epToActionEdge,
            source: entrypointNodeId,
            target: actionNodeId,
            label: reachLabel,
            kind: reachKind,
            joinBasis: reachJoinBasis,
            style: reachStyle,
          });
          relations.push({
            relationType: reachRelationType,
            fromRef: entrypointNodeId,
            toRef: actionNodeId,
            joinBasis: reachJoinBasis,
          });
        }
      } else {
        // No entrypoint — access → action directly
        const accessToActionEdge = stableEdgeId(accessNodeId, actionNodeId, 'guarded_by');
        if (!edges.some((e) => e.id === accessToActionEdge)) {
          // repair 10: truthful ordering labels
          const guardLabel = SUBTYPE_LABELS[fact.authorizationOrdering] || fact.authorizationOrdering;
          const guardStyle: 'solid' | 'dashed' | 'dotted' =
            fact.authorizationOrdering === 'BEFORE_SINK' ? 'solid' :
            fact.authorizationOrdering === 'AFTER_SINK' ? 'dashed' :
            fact.authorizationOrdering === 'AUTH_NOT_FOUND' ? 'dotted' : 'dotted';
          edges.push({
            id: accessToActionEdge,
            source: accessNodeId,
            target: actionNodeId,
            label: guardLabel,
            kind: 'guarded_by',
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
            style: guardStyle,
          });
          relations.push({
            relationType: 'ACCESS_GUARDS_ACTION',
            fromRef: accessNodeId,
            toRef: actionNodeId,
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
          });
        }
      }

      // ─── Tenant Branch (repair 14) ──────────────────────────────────────
      if (fact.tenantContextPresent && fact.entrypointId) {
        const tenantTuple = [scanId, fact.entrypointId, 'tenant_context'];
        const tenantNodeId = stableNodeId('identity', tenantTuple);
        if (!tenantContextNodes.has(tenantNodeId)) {
          const tenantAvailability: NodeAvailability = fact.tenantFilterBound ? 'AVAILABLE' : 'UNKNOWN';
          const tenantLabel = fact.tenantFilterBound ? 'Tenant scoped to this action' : 'Tenant context detected';
          const tenantLimitations = fact.tenantFilterBound
            ? []
            : ['Tenant context detected — enforcement on this action not established'];
          const tenantNode: TopologyNode = {
            id: tenantNodeId,
            label: tenantLabel,
            kind: 'identity',
            subType: 'tenant',
            subTypeLabel: 'Tenant context',
            aiReachable: 'UNKNOWN',
            availability: tenantAvailability,
            limitations: tenantLimitations,
          };
          tenantContextNodes.set(tenantNodeId, tenantNode);
          nodes.push(tenantNode);
        }

        // Tenant → action edge (scoped_by)
        const tenantEdgeId = stableEdgeId(tenantNodeId, actionNodeId, 'scoped_by');
        if (!edges.some((e) => e.id === tenantEdgeId)) {
          // repair 14: solid only when filter is bound; dotted when context-only
          const tenantEdgeStyle: 'solid' | 'dotted' = fact.tenantFilterBound ? 'solid' : 'dotted';
          const tenantEdgeLabel = fact.tenantFilterBound ? 'scopes' : 'context only — enforcement not established';
          edges.push({
            id: tenantEdgeId,
            source: tenantNodeId,
            target: actionNodeId,
            label: tenantEdgeLabel,
            kind: 'scoped_by',
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
            style: tenantEdgeStyle,
          });
          relations.push({
            relationType: fact.tenantFilterBound ? 'TENANT_SCOPES_ACTION' : 'TENANT_CONTEXT_DETECTED',
            fromRef: tenantNodeId,
            toRef: actionNodeId,
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
          });
        }

        // Object authorization remains not established unless AC-1 establishes it
        if (!fact.objectOwnershipChecked) {
          // Add limitation to action node
          const existingAction = actionOccurrenceNodes.get(actionNodeId);
          if (existingAction && !existingAction.limitations.some((l) => l.includes('Object access'))) {
            existingAction.limitations.push('Object access not established');
          }
        }
      }

      // ─── Consequence (Part 7: source-backed effect on exact join) ───────
      // LOCK: NO_EXACT_CAPABILITY_JOIN => NO_CAPABILITY_EFFECT_PROMOTION
      // LOCK: LEXICAL_EFFECT_INFERENCE = NO
      // Consequence identity depends on action occurrence identity (includes resource)
      const consequenceTuple = [scanId, s(fact.entrypointId), s(fact.sinkId), s(fact.protectedAction), s(fact.protectedResource), 'consequence'];
      const consequenceNodeId = stableNodeId('consequence', consequenceTuple);
      if (!nodes.some((n) => n.id === consequenceNodeId)) {
        const exactJoin = tryUniqueCanonicalJoin(fact, capabilityJoinMap);
        if (exactJoin && exactJoin.effect && exactJoin.effect !== 'UNKNOWN') {
          // Source-backed effect from canonical Capability semantics
          const effectLabel = EFFECT_LABELS[exactJoin.effect] || exactJoin.effect;
          nodes.push({
            id: consequenceNodeId,
            label: effectLabel,
            kind: 'consequence',
            aiReachable: fact.aiReachable,
            availability: 'AVAILABLE',
            limitations: [],
            effect: exactJoin.effect,
            effectLabel,
            // Same exact same-scan sinkId join as the action node.
            actionProofTraceIds: fact.sinkId && traceIdsBySinkId.get(fact.sinkId)?.length
              ? traceIdsBySinkId.get(fact.sinkId)
              : undefined,
          });
          const actionToConsequenceEdge = stableEdgeId(actionNodeId, consequenceNodeId, 'produces');
          edges.push({
            id: actionToConsequenceEdge,
            source: actionNodeId,
            target: consequenceNodeId,
            label: 'produces',
            kind: 'produces',
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
            style: 'solid',
          });
          relations.push({
            relationType: 'ACTION_PRODUCES_EFFECT',
            fromRef: actionNodeId,
            toRef: consequenceNodeId,
            joinBasis: 'SOURCE_LOCATION_CORRELATION',
          });
        } else {
          // No exact join → UNKNOWN consequence, no fabricated effect
          nodes.push({
            id: consequenceNodeId,
            label: 'Consequence not established',
            kind: 'consequence',
            aiReachable: fact.aiReachable,
            availability: 'UNKNOWN',
            limitations: ['Consequence semantics require a qualified source owner — not inferred from action name'],
          });
          const actionToConsequenceEdge = stableEdgeId(actionNodeId, consequenceNodeId, 'produces');
          edges.push({
            id: actionToConsequenceEdge,
            source: actionNodeId,
            target: consequenceNodeId,
            label: 'effect not established',
            kind: 'produces',
            joinBasis: 'UNRESOLVED',
            style: 'dotted',
          });
          relations.push({
            relationType: 'ACTION_CONSEQUENCE_UNRESOLVED',
            fromRef: actionNodeId,
            toRef: consequenceNodeId,
            joinBasis: 'UNRESOLVED',
          });
        }
      }
    }
  }

  // ─── ARI Topology Convergence ───────────────────────────────────────────
  // Source-backed projection of agent/tool/handler/resource/service/hub/
  // persistence/deferred/evaluation/credential topology from the SAME scan.
  // No React-side name joins; all IDs are stable semantic hashes.
  if (opCovData && ac1Read.status !== 'NO_CURRENT_ACCEPTED_SOURCE') {
    const ari = buildAriTopologyProjection(opCovData, ac1Read.scanId, aiSystemNodeId);
    for (const n of ari.nodes) nodes.push(n);
    for (const e of ari.edges) {
      edges.push(e);
      relations.push({
        relationType: e.kind,
        fromRef: e.source,
        toRef: e.target,
        joinBasis: e.joinBasis as JoinBasis,
      });
    }
    for (const l of ari.limitations) limitations.push(l);
  }

  // ─── CONNECTED_ASSET_ADAPTER (repair 12: actually project assets) ───────
  let assets: Awaited<ReturnType<typeof listConnectedAssets>> = [];
  try {
    assets = await listConnectedAssets(aiSystemId, organizationId, { includeRetired: false });
  } catch {
    limitations.push('Connected assets could not be loaded');
  }

  for (const asset of assets) {
    const assetNodeId = stableNodeId('connected_asset', [asset.id]);
    // Part 5: displayName is primary label, asset type is subtype
    // LOCK: ASSET_TYPE != ASSET_INSTANCE_IDENTITY
    const assetTypeLabel = asset.assetType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    nodes.push({
      id: assetNodeId,
      label: asset.displayName || assetTypeLabel,
      kind: 'connected_asset',
      subType: asset.assetType,
      subTypeLabel: assetTypeLabel,
      aiReachable: 'UNKNOWN',
      availability: asset.connectionState === 'CONNECTED' ? 'AVAILABLE' : asset.connectionState === 'REGISTERED' ? 'PARTIAL' : 'UNKNOWN',
      limitations: [],
      assetProvider: asset.provider || undefined,
      assetEnvironment: asset.environment || undefined,
      assetConnectionState: asset.connectionState || undefined,
    });
    // AI System → Connected Asset (connected_to) — inventory relationship, not execution
    const assetEdgeId = stableEdgeId(aiSystemNodeId, assetNodeId, 'connected_to');
    edges.push({
      id: assetEdgeId,
      source: aiSystemNodeId,
      target: assetNodeId,
      label: 'connected to',
      kind: 'connected_to',
      joinBasis: 'EXACT_ID',
      style: 'solid',
    });
    relations.push({
      relationType: 'SYSTEM_CONNECTED_TO_ASSET',
      fromRef: aiSystemNodeId,
      toRef: assetNodeId,
      joinBasis: 'EXACT_ID',
    });
    sourceRefs.push({
      sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
      sourceId: `ai_system_assets:${asset.id}`,
      derivationMethod: 'listConnectedAssets',
    });
  }

  // ─── PROVIDER IAM (repair 11: evidence, not authorization) ─────────────
  let providerIam: TopologyProjectionResult['providerIam'];
  try {
    const grant = await getCurrentEffectiveGrant(organizationId, aiSystemId);
    if (grant.state !== 'NOT_OBSERVED' && grant.state !== 'INVALID_PERSISTED_STATE') {
      // repair 11: OBSERVATION_FAILED → UNAVAILABLE, not PARTIAL
      const iamAvailability: NodeAvailability =
        grant.state === 'OBSERVATION_FAILED' ? 'UNAVAILABLE' :
        grant.state === 'OBSERVED_PARTIAL' || grant.state === 'OBSERVED_NO_QUALIFIED' ? 'PARTIAL' :
        'UNKNOWN';

      const iamLabel = grant.state === 'OBSERVATION_FAILED'
        ? 'Credential observation failed'
        : 'Credential evidence';

      providerIam = {
        state: grant.state,
        principalArn: grant.principalArn,
        observedAt: grant.observedAt,
        limitations: [
          'Credential evidence is partial — identity policy allows do not equal effective grants',
          'Unmodeled authorization layers (resource policies, SCPs, session policies) may change actual authorization',
        ],
      };

      const iamNodeId = stableNodeId('provider_iam', [s(grant.principalArn), aiSystemId]);
      nodes.push({
        id: iamNodeId,
        label: iamLabel,
        kind: 'provider_iam',
        subType: grant.state,
        subTypeLabel: SUBTYPE_LABELS[grant.state] || grant.state,
        aiReachable: 'UNKNOWN',
        availability: iamAvailability,
        limitations: providerIam.limitations,
      });

      // Defect 2: edge direction must agree with label.
      // AI System → Credential evidence (AI System uses credential)
      // NOT: Credential → AI System (which reads as "credential uses credential")
      // LOCK: PARTIAL_CREDENTIAL_EVIDENCE != AUTHORIZATION
      // LOCK: PARTIAL_AWS_OBSERVATION != EFFECTIVELY_GRANTED
      // LOCK: OBSERVATION_FAILED = UNAVAILABLE
      const iamEdgeKind = grant.state === 'OBSERVATION_FAILED' ? 'evidenced_by' : 'uses_credential';
      const iamEdgeLabel = grant.state === 'OBSERVATION_FAILED' ? 'observation failed' : 'uses credential';
      edges.push({
        id: stableEdgeId(aiSystemNodeId, iamNodeId, iamEdgeKind),
        source: aiSystemNodeId,
        target: iamNodeId,
        label: iamEdgeLabel,
        kind: iamEdgeKind,
        joinBasis: 'EXACT_ID',
        style: grant.state === 'OBSERVATION_FAILED' ? 'dashed' : 'dotted',
      });
      relations.push({
        relationType: 'SYSTEM_USES_CREDENTIAL_EVIDENCE',
        fromRef: aiSystemNodeId,
        toRef: iamNodeId,
        joinBasis: 'EXACT_ID',
      });
    }
  } catch {
    limitations.push('Provider credential evidence could not be loaded');
  }

  // ─── EVIDENCE_ADAPTER (repair 17: reuse canonical resolveSystemEvidence) ─
  try {
    const evidenceResult = await resolveSystemEvidence(aiSystemId, organizationId);
    if (evidenceResult && evidenceResult.records.length > 0) {
      const evidenceNodeId = stableNodeId('evidence', [aiSystemId]);
      nodes.push({
        id: evidenceNodeId,
        label: 'Evidence',
        kind: 'evidence',
        aiReachable: 'UNKNOWN',
        availability: evidenceResult.coverage === 'NOT_ASSESSED' ? 'SOURCE_GAP' : 'AVAILABLE',
        limitations: evidenceResult.hasPartialProducerEvidence ? ['Some producer evidence is partial'] : [],
      });
      edges.push({
        id: stableEdgeId(evidenceNodeId, aiSystemNodeId, 'evidenced_by'),
        source: evidenceNodeId,
        target: aiSystemNodeId,
        label: 'evidences',
        kind: 'evidenced_by',
        joinBasis: 'EXACT_ID',
        style: 'solid',
      });
      relations.push({
        relationType: 'EVIDENCE_FOR_SYSTEM',
        fromRef: evidenceNodeId,
        toRef: aiSystemNodeId,
        joinBasis: 'EXACT_ID',
      });

      // repair 18: add evidenceRefs to canonical payload
      for (const rec of evidenceResult.records.slice(0, 20)) {
        evidenceRefs.push({
          evidenceId: rec.id,
          producerId: rec.producerId as any,
          producerRunId: rec.producerRunId ?? undefined,
        });
      }
      sourceRefs.push({
        sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
        sourceId: `evidence:system:${aiSystemId}`,
        derivationMethod: 'resolveSystemEvidence',
      });
    }
  } catch {
    // Non-fatal
  }

  // ─── Compute deterministic projection hash (repair 18: covers graph truth) ─
  const payload: TopologyProjectionPayload = {
    projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
    sourceVersion: TOPOLOGY_PROJECTION_VERSION,
    projectionScope: 'AI_SYSTEM',
    organizationId,
    aiSystemId,
    scanId: scanProvenance?.scanId,
    // repair 4: CURRENT composite map, not historical scan snapshot
    primaryTimeBasis: 'CURRENT',
    coverage: mapAvailability === 'AVAILABLE' ? 'PARTIAL' : mapAvailability === 'SOURCE_GAP' ? 'NOT_ASSESSED' : 'UNKNOWN',
    limitations,
    relations,
    sourceRefs,
    evidenceRefs,
  };
  const projectionHash = computeProjectionHash(payload);

  // Deterministic ordering
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  // ─── Part 2: Evaluated basis (historical, NOT current) ──────────────────
  let evaluatedBasis: TopologyProjectionResult['evaluatedBasis'];
  if (actionAuthority?.evaluatedBasis && actionAuthority.evaluatedBasis.state === 'AVAILABLE') {
    const eb = actionAuthority.evaluatedBasis;
    evaluatedBasis = {
      state: eb.state,
      evaluationId: eb.evaluationId,
      evaluationSnapshotAt: eb.evaluationSnapshotAt,
      disposition: eb.disposition,
    };
  }

  return {
    projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
    sourceVersion: TOPOLOGY_PROJECTION_VERSION,
    projectionScope: 'AI_SYSTEM',
    organizationId,
    aiSystemId,
    aiSystemName: aiSystem.name || 'AI System',
    scanId: scanProvenance?.scanId,
    primaryTimeBasis: 'CURRENT',
    projectionHash,
    coverage: payload.coverage,
    mapAvailability,
    limitations,
    nodes,
    edges,
    scanProvenance,
    providerIam,
    currentPolicy,
    evaluatedBasis,
    actionProofBasis,
    viewState,
    lenses: SUPPORTED_MAP_LENSES,
    zoomLevels: SUPPORTED_SEMANTIC_ZOOM_LEVELS,
  };
}

/**
 * Build an exact evaluated-basis topology projection from a single persisted
 * operation-coverage snapshot. No current sources, no fallback, no reanalysis.
 *
 * LOCKS:
 *   CURRENT_COMPOSITE_MAP != HISTORICAL_SCAN_SNAPSHOT
 *   CURRENT_SOURCE_BASIS != EVALUATED_BASIS
 *   EVALUATED_BASIS == EXACT_PERSISTED_SNAPSHOT
 */
export function buildEvaluatedTopologyProjection(
  coverage: PersistedOperationCoverageIntelligence,
  provenance: {
    evaluationId: string;
    scanId: string;
    repositoryCommitSha: string | null;
    organizationId: string;
    aiSystemId: string;
    aiSystemName?: string;
  },
): TopologyProjectionResult {
  // Defensive exact-scan guard before any composition.
  if (coverage.scanId !== provenance.scanId) {
    return {
      projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
      sourceVersion: TOPOLOGY_PROJECTION_VERSION,
      projectionScope: 'ASSURANCE_EVALUATION',
      organizationId: provenance.organizationId,
      aiSystemId: provenance.aiSystemId,
      aiSystemName: provenance.aiSystemName ?? provenance.aiSystemId,
      scanId: provenance.scanId,
      primaryTimeBasis: 'EVALUATED_SCOPE',
      projectionHash: 'unavailable',
      coverage: 'NOT_ASSESSED',
      mapAvailability: 'SOURCE_GAP',
      limitations: [
        'EVALUATED_SCAN_IDENTITY_MISMATCH: coverage scanId does not match provenance scanId.',
      ],
      nodes: [],
      edges: [],
      scanProvenance: {
        scanId: provenance.scanId,
        commitSha: provenance.repositoryCommitSha,
        scannerVersion: null,
        scannedAt: null,
      },
      evaluatedBasis: {
        state: 'NOT_AVAILABLE',
        evaluationId: provenance.evaluationId,
        evaluationSnapshotAt: null,
        disposition: null,
      },
      viewState: 'EVALUATION_SNAPSHOT',
      lenses: SUPPORTED_MAP_LENSES,
      zoomLevels: SUPPORTED_SEMANTIC_ZOOM_LEVELS,
    };
  }

  const aiSystemNodeId = stableNodeId('ai_system', [provenance.scanId, provenance.aiSystemId]);

  // Build canonical ARI topology nodes/edges from the exact snapshot.
  const ari = buildAriTopologyProjection(coverage, provenance.scanId, aiSystemNodeId);

  // The ARI projection does not emit the root AI system node; add it explicitly.
  const aiSystemNode: TopologyNode = {
    id: aiSystemNodeId,
    label: provenance.aiSystemName ?? provenance.aiSystemId,
    kind: 'ai_execution',
    subType: 'ai_system',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['AI_SYSTEM_IDENTITY != EVALUATED_AGENT_RUNTIME'],
    scanId: provenance.scanId,
    agentName: provenance.aiSystemName,
  };

  const nodes: TopologyNode[] = [aiSystemNode, ...ari.nodes];
  const edges: TopologyEdge[] = ari.edges;

  // Deterministic projection hash over canonical node/edge IDs.
  const hashInput = [
    provenance.evaluationId,
    provenance.scanId,
    provenance.repositoryCommitSha ?? '',
    ...nodes.map((n) => n.id).sort(),
    ...edges.map((e) => e.id).sort(),
  ].join('\n');
  const projectionHash = `eval-${createHash('sha256').update(hashInput).digest('hex').slice(0, 32)}`;

  const coverageState: TopologyProjectionResult['coverage'] =
    nodes.some((n) => n.availability !== 'AVAILABLE') ? 'PARTIAL' : 'COMPLETE';

  const mapAvailability: NodeAvailability =
    nodes.some((n) => n.availability === 'SOURCE_GAP') ? 'SOURCE_GAP'
    : nodes.some((n) => n.availability !== 'AVAILABLE') ? 'PARTIAL'
    : 'AVAILABLE';

  return {
    projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
    sourceVersion: TOPOLOGY_PROJECTION_VERSION,
    projectionScope: 'ASSURANCE_EVALUATION',
    organizationId: provenance.organizationId,
    aiSystemId: provenance.aiSystemId,
    aiSystemName: provenance.aiSystemName ?? provenance.aiSystemId,
    scanId: provenance.scanId,
    primaryTimeBasis: 'EVALUATED_SCOPE',
    projectionHash,
    coverage: coverageState,
    mapAvailability,
    limitations: [
      ...ari.limitations,
      'Evaluated-basis projection uses only the exact persisted operation-coverage snapshot.',
      'Current-only sources are intentionally excluded from historical evaluations.',
    ],
    nodes,
    edges,
    scanProvenance: {
      scanId: provenance.scanId,
      commitSha: provenance.repositoryCommitSha,
      scannerVersion: null,
      scannedAt: null,
    },
    evaluatedBasis: {
      state: 'AVAILABLE',
      evaluationId: provenance.evaluationId,
      evaluationSnapshotAt: null,
      disposition: null,
    },
    viewState: 'EVALUATION_SNAPSHOT',
    lenses: SUPPORTED_MAP_LENSES,
    zoomLevels: SUPPORTED_SEMANTIC_ZOOM_LEVELS,
  };
}

/**
 * AA-REPORTING-INTERPRETATION-2 §7: resolve the exact evaluation-bound
 * topology for a persisted assurance evaluation — the SAME projector the
 * U6 package uses (buildEvaluatedTopologyProjection over the exact
 * persisted operation-coverage snapshot). Never the current/latest scan.
 *
 * Identity locks (same as the Action Path Evidence section):
 *   ORCHESTRATOR_RUN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF
 *   STATIC_SCAN_ID_MATCH != EVALUATED_SYSTEM_IDENTITY_PROOF
 *   CROSS_SYSTEM_HISTORICAL_JOIN = INVALID
 *   CURRENT_MAP_SCAN_A + EVALUATED_SCAN_B != PROOF_JOIN
 *
 * Returns null when no exact evaluated binding can be established — the
 * caller must NOT silently fall back to the current projection.
 */
export async function buildEvaluatedActionMapProjection(
  aiSystemId: string,
  organizationId: string,
  evaluationId: string,
): Promise<TopologyProjectionResult | null> {
  const bound = await verifyAISystemOrgBinding(aiSystemId, organizationId);
  if (!bound) return null;

  // Evaluation identity: the evaluationId route param is the
  // "<orchestratorRunId>:assurance:<version>" composite used across U6.
  const orchestratorRunId = evaluationId.split(':')[0];
  if (!orchestratorRunId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = await (prisma as any).audit_orchestrator_runs.findFirst({
    where: { id: orchestratorRunId, organizationId, aiSystemId },
    select: { id: true, staticScanId: true, organizationId: true, aiSystemId: true },
  });
  if (!run?.staticScanId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scan = await (prisma as any).ai_security_scans.findFirst({
    where: { scanId: run.staticScanId, organizationId },
    select: { scanId: true, commitSha: true, aiSystemId: true, operationCoverageIntelligence: true },
  });
  if (!scan) return null;
  // Present scan-level system binding must not contradict the run.
  if (scan.aiSystemId != null && scan.aiSystemId !== aiSystemId) return null;
  if (scan.operationCoverageIntelligence == null) return null;

  let coverage: PersistedOperationCoverageIntelligence;
  try {
    coverage = (typeof scan.operationCoverageIntelligence === 'string'
      ? JSON.parse(scan.operationCoverageIntelligence)
      : scan.operationCoverageIntelligence) as PersistedOperationCoverageIntelligence;
  } catch {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiSystem = await (prisma as any).ai_systems.findFirst({
    where: { id: aiSystemId, organizationId },
    select: { name: true },
  });

  return buildEvaluatedTopologyProjection(coverage, {
    evaluationId,
    scanId: scan.scanId,
    repositoryCommitSha: scan.commitSha ?? null,
    organizationId,
    aiSystemId,
    aiSystemName: aiSystem?.name,
  });
}
