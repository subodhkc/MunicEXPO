/**
 * AI Action & Access Map — Topology Projector
 *
 * Deterministic read projection over persisted accepted-scan truth.
 *
 * Adapters (recorded in baseline):
 *   - SYSTEM_IDENTITY_ADAPTER       — AI System identity from prisma.ai_systems
 *   - CONNECTED_ASSET_ADAPTER       — Connected assets from listConnectedAssets
 *   - APPLICATION_ACCESS_ADAPTER    — AC-1 application authorization facts
 *   - ACTION_AUTHORITY_ADAPTER      — Action & Authority read model (capability declarations)
 *   - EVIDENCE_ADAPTER              — Evidence resolver
 *   - ARCHITECTURE_INSIGHT_ADAPTER  — Architecture insights (Gate 4C)
 *
 * The projector:
 *   - reads persisted AC-1 facts (never reruns static analysis)
 *   - reads connected assets
 *   - reads provider IAM observation (partial — separate branch)
 *   - reads evidence summary (separate overlay)
 *   - produces deterministic nodes/edges with stable IDs
 *   - preserves unknown/partial/unavailable/source-gap semantics
 *   - computes projection hash via wave0 computeProjectionHash
 *
 * LOCK: MAP_REQUEST != STATIC_REANALYSIS
 * LOCK: RENDERER != ANALYZER
 * LOCK: GRAPH_PRESENTATION != GRAPH_TRUTH
 * LOCK: TOPOLOGY_EDGE != NEW_EVIDENCE
 * LOCK: CODE_RBAC != EFFECTIVELY_GRANTED
 * LOCK: PARTIAL_AWS_OBSERVATION != EFFECTIVELY_GRANTED
 * LOCK: FIELD_ABSENT != FIELD_PRESENT_EMPTY
 *
 * @version topology-1.0.0
 */

import { prisma } from '@/lib/prisma';
import { verifyAISystemOrgBinding } from '@/lib/org-context';
import { listConnectedAssets } from '@/lib/ai-inventory/connected-assets';
import { readApplicationAuthorizationForSystem } from '@/lib/ai-security/application-authorization-read';
import { getCurrentEffectiveGrant } from '@/lib/iam-grant/effective-grant-observation';
import {
  computeProjectionHash,
  type TopologyProjectionPayload,
  type RelationRef,
  type SourceRef,
  type EvidenceRef,
} from '@/lib/shared-contracts/wave0-contract-freeze';
import {
  type TopologyProjectionResult,
  type TopologyNode,
  type TopologyEdge,
  type NodeAvailability,
  TOPOLOGY_PROJECTION_SCHEMA_VERSION,
  TOPOLOGY_PROJECTION_VERSION,
  PLANE_ALIAS,
  SUPPORTED_MAP_LENSES,
  SUPPORTED_SEMANTIC_ZOOM_LEVELS,
} from './types';
import { stableNodeId, stableEdgeId, sanitizeSemanticKey } from './stable-ids';

/**
 * Build the topology projection for an AI System.
 *
 * Tenant invariant: verifyAISystemOrgBinding before any read.
 * Cross-tenant reads are denied (fail closed).
 */
export async function buildTopologyProjection(
  aiSystemId: string,
  organizationId: string,
): Promise<TopologyProjectionResult | null> {
  // Tenant gate
  const bound = await verifyAISystemOrgBinding(aiSystemId, organizationId);
  if (!bound) return null;

  // SYSTEM_IDENTITY_ADAPTER
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiSystem = await (prisma as any).ai_systems.findFirst({
    where: { id: aiSystemId, organizationId },
    select: { id: true, name: true, systemType: true, provider: true, description: true },
  });
  if (!aiSystem) return null;

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const limitations: string[] = [];
  const relations: RelationRef[] = [];
  const sourceRefs: SourceRef[] = [];

  // ─── AI Execution Node ──────────────────────────────────────────────────
  const aiSystemNode: TopologyNode = {
    id: stableNodeId('ai_execution', sanitizeSemanticKey(aiSystemId)),
    label: aiSystem.name || 'AI System',
    kind: 'ai_execution',
    subType: aiSystem.systemType || undefined,
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
  };
  nodes.push(aiSystemNode);
  sourceRefs.push({
    sourceAuthority: 'HAIEC_NATIVE_PERSISTED',
    sourceId: `ai_systems:${aiSystemId}`,
    derivationMethod: 'prisma_direct_read',
  });

  // ─── CONNECTED_ASSET_ADAPTER ────────────────────────────────────────────
  let assets: Awaited<ReturnType<typeof listConnectedAssets>> = [];
  try {
    assets = await listConnectedAssets(aiSystemId, organizationId, { includeRetired: false });
  } catch {
    limitations.push('Connected assets could not be loaded');
  }

  // ─── APPLICATION_ACCESS_ADAPTER (AC-1 persisted facts) ──────────────────
  const ac1Read = await readApplicationAuthorizationForSystem(aiSystemId, organizationId);

  let mapAvailability: NodeAvailability = 'AVAILABLE';
  let scanProvenance: TopologyProjectionResult['scanProvenance'];

  if (ac1Read.status === 'NO_ACCEPTED_SCAN') {
    mapAvailability = 'SOURCE_GAP';
    limitations.push('No completed scan exists for this AI System — run a security scan to populate the map');
  } else if (ac1Read.status === 'SOURCE_GAP') {
    mapAvailability = 'SOURCE_GAP';
    limitations.push('The latest scan predates application authorization analysis — run a new scan to populate the map');
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

    // Add extraction limitations
    for (const lim of snapshot.extractionLimitations) {
      limitations.push(lim);
    }

    // Project AC-1 facts into topology nodes/edges
    // Group facts by entrypoint to build identity → access → action → consequence chains
    const entrypointMap = new Map<string, TopologyNode>();

    for (const fact of snapshot.facts) {
      // ─── Identity Node ──────────────────────────────────────────────────
      const identityKey = fact.subjectKind === 'role' || fact.subjectKind === 'permission'
        ? `${fact.subjectKind}:${fact.roleOrPermissionToken ?? 'unknown'}`
        : fact.subjectKind;
      const identityNodeId = stableNodeId('identity', sanitizeSemanticKey(identityKey));
      if (!nodes.some((n) => n.id === identityNodeId)) {
        const identityLabel = fact.subjectKind === 'role'
          ? `${fact.roleOrPermissionToken ?? 'Role'} role`
          : fact.subjectKind === 'permission'
          ? `${fact.roleOrPermissionToken ?? 'Permission'} permission`
          : fact.subjectKind === 'authenticated_user'
          ? 'Authenticated User'
          : fact.subjectKind === 'tenant'
          ? 'Tenant'
          : fact.subjectKind === 'service_identity'
          ? 'Service Identity'
          : fact.subjectKind === 'agent_identity'
          ? 'Agent Identity'
          : 'Unknown Identity';
        nodes.push({
          id: identityNodeId,
          label: identityLabel,
          kind: 'identity',
          subType: fact.subjectKind,
          aiReachable: 'UNKNOWN',
          availability: 'AVAILABLE',
          limitations: [],
        });
      }

      // ─── Application Access Node ────────────────────────────────────────
      const accessKey = `${fact.guardType}:${fact.roleOrPermissionToken ?? fact.subjectKind}`;
      const accessNodeId = stableNodeId('application_access', sanitizeSemanticKey(accessKey));
      if (!nodes.some((n) => n.id === accessNodeId)) {
        const accessLabel = fact.guardType === 'authentication'
          ? 'Authentication'
          : fact.guardType === 'role_check'
          ? `Role Guard: ${fact.roleOrPermissionToken ?? 'unknown'}`
          : fact.guardType === 'permission_check'
          ? `Permission Guard: ${fact.roleOrPermissionToken ?? 'unknown'}`
          : fact.guardType === 'tenant_filter'
          ? 'Tenant Boundary'
          : fact.guardType === 'object_ownership'
          ? 'Object Authorization'
          : fact.guardType === 'middleware'
          ? 'Middleware'
          : fact.guardType === 'decorator'
          ? 'Decorator'
          : 'Unknown Guard';
        const accessAvailability: NodeAvailability = fact.authorizationOrdering === 'AFTER_SINK'
          ? 'PARTIAL'
          : fact.authorizationOrdering === 'AUTH_NOT_FOUND'
          ? 'UNAVAILABLE'
          : 'AVAILABLE';
        const accessLimitations: string[] = [];
        if (fact.authorizationOrdering === 'AFTER_SINK') {
          accessLimitations.push('Guard occurs after the action — does not protect it');
        }
        if (fact.authenticationOrdering === 'AUTH_NOT_FOUND') {
          accessLimitations.push('No authentication guard found');
        }
        nodes.push({
          id: accessNodeId,
          label: accessLabel,
          kind: 'application_access',
          subType: fact.guardType,
          aiReachable: 'UNKNOWN',
          availability: accessAvailability,
          sourceLocation: fact.guardLocation ? `${fact.guardLocation.file}:${fact.guardLocation.line}` : undefined,
          limitations: accessLimitations,
        });
      }

      // ─── Action Node ────────────────────────────────────────────────────
      const actionKey = fact.protectedAction ?? fact.sinkId ?? 'unknown';
      const actionNodeId = stableNodeId('action', sanitizeSemanticKey(actionKey));
      if (!nodes.some((n) => n.id === actionNodeId)) {
        nodes.push({
          id: actionNodeId,
          label: fact.protectedAction ?? 'Action',
          kind: 'action',
          subType: undefined,
          aiReachable: fact.aiReachable,
          availability: 'AVAILABLE',
          sourceLocation: fact.sourceLocation,
          limitations: fact.limitations,
        });
      }

      // ─── Consequence Node ───────────────────────────────────────────────
      // Infer consequence from action type
      const consequenceKey = inferConsequenceKey(fact.protectedAction);
      const consequenceNodeId = stableNodeId('consequence', sanitizeSemanticKey(consequenceKey));
      if (!nodes.some((n) => n.id === consequenceNodeId)) {
        nodes.push({
          id: consequenceNodeId,
          label: inferConsequenceLabel(consequenceKey),
          kind: 'consequence',
          aiReachable: fact.aiReachable,
          availability: 'AVAILABLE',
          limitations: [],
        });
      }

      // ─── Edges ──────────────────────────────────────────────────────────
      // identity → access
      const identityToAccessEdge = stableEdgeId(identityNodeId, accessNodeId, 'reaches');
      if (!edges.some((e) => e.id === identityToAccessEdge)) {
        edges.push({
          id: identityToAccessEdge,
          source: identityNodeId,
          target: accessNodeId,
          label: 'reaches',
          kind: 'reaches',
          joinBasis: 'STRUCTURAL_RELATION',
        });
      }

      // access → action (guarded_by)
      const accessToActionEdge = stableEdgeId(accessNodeId, actionNodeId, 'guarded_by');
      if (!edges.some((e) => e.id === accessToActionEdge)) {
        edges.push({
          id: accessToActionEdge,
          source: accessNodeId,
          target: actionNodeId,
          label: fact.authorizationOrdering === 'BEFORE_SINK' ? 'guards' : 'does not guard',
          kind: 'guarded_by',
          joinBasis: 'SOURCE_LOCATION_CORRELATION',
        });
      }

      // ai_execution → action (executes)
      const aiToActionEdge = stableEdgeId(aiSystemNode.id, actionNodeId, 'executes');
      if (!edges.some((e) => e.id === aiToActionEdge)) {
        edges.push({
          id: aiToActionEdge,
          source: aiSystemNode.id,
          target: actionNodeId,
          label: 'executes',
          kind: 'executes',
          joinBasis: 'EXACT_ID',
        });
      }

      // action → consequence (produces)
      const actionToConsequenceEdge = stableEdgeId(actionNodeId, consequenceNodeId, 'produces');
      if (!edges.some((e) => e.id === actionToConsequenceEdge)) {
        edges.push({
          id: actionToConsequenceEdge,
          source: actionNodeId,
          target: consequenceNodeId,
          label: 'produces',
          kind: 'produces',
          joinBasis: 'SEMANTIC_REFERENCE',
        });
      }

      // Track entrypoint for tenant filter annotation
      if (fact.entrypointId && !entrypointMap.has(fact.entrypointId)) {
        entrypointMap.set(fact.entrypointId, {
          id: stableNodeId('application_access', `entrypoint:${sanitizeSemanticKey(fact.entrypointId)}`),
          label: fact.route ?? fact.entrypointId,
          kind: 'application_access',
          subType: 'entrypoint',
          aiReachable: 'UNKNOWN',
          availability: 'AVAILABLE',
          sourceLocation: fact.sourceLocation,
          limitations: [],
        });
      }

      // Add wave0 relation for canonical hash
      relations.push({
        relationType: 'IDENTITY_REACHES_ACTION',
        fromRef: identityNodeId,
        toRef: actionNodeId,
        joinBasis: 'STRUCTURAL_RELATION',
      });
    }

    // Tenant filter annotation
    const tenantFilteredFacts = snapshot.facts.filter((f) => f.tenantFilterBound);
    const tenantContextFacts = snapshot.facts.filter((f) => f.tenantContextPresent && !f.tenantFilterBound);
    if (tenantContextFacts.length > 0) {
      limitations.push(`${tenantContextFacts.length} action(s) have tenant context but no bound tenant filter`);
    }
  }

  // ─── PROVIDER IAM (separate branch — partial) ───────────────────────────
  let providerIam: TopologyProjectionResult['providerIam'];
  try {
    const grant = await getCurrentEffectiveGrant(organizationId, aiSystemId);
    if (grant.state !== 'NOT_OBSERVED' && grant.state !== 'INVALID_PERSISTED_STATE') {
      // PARTIAL_AWS_AUTHORITY_SOURCE — never promote to EFFECTIVELY_GRANTED
      providerIam = {
        state: grant.state,
        principalArn: grant.principalArn,
        observedAt: grant.observedAt,
        limitations: [
          'Provider IAM observation is partial — identity policy allows do not equal effective grants',
          'Unmodeled authorization layers (resource policies, SCPs, session policies) may change actual authorization',
        ],
      };
      const iamNodeId = stableNodeId('provider_iam', sanitizeSemanticKey(grant.principalArn ?? 'aws-iam'));
      nodes.push({
        id: iamNodeId,
        label: 'Provider IAM',
        kind: 'provider_iam',
        subType: 'aws',
        aiReachable: 'UNKNOWN',
        availability: 'PARTIAL',
        limitations: providerIam.limitations,
      });
      // Connect IAM to AI System
      edges.push({
        id: stableEdgeId(iamNodeId, aiSystemNode.id, 'authorized_by'),
        source: iamNodeId,
        target: aiSystemNode.id,
        label: 'partial authority',
        kind: 'authorized_by',
        joinBasis: 'EXACT_ID',
      });
      relations.push({
        relationType: 'PROVIDER_IAM_PARTIAL',
        fromRef: iamNodeId,
        toRef: aiSystemNode.id,
        joinBasis: 'EXACT_ID',
      });
    }
  } catch {
    // Non-fatal — provider IAM is a separate overlay
    limitations.push('Provider IAM observation could not be loaded');
  }

  // ─── EVIDENCE_ADAPTER (separate overlay) ────────────────────────────────
  // Add evidence summary node as overlay (does not create new Evidence)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidenceCount = await (prisma as any).evidence.count({
      where: {
        organizationId,
        status: 'active',
        metadata: { path: ['target', 'id'], equals: aiSystemId } as any,
      },
    });
    if (evidenceCount > 0) {
      const evidenceNodeId = stableNodeId('evidence', sanitizeSemanticKey(aiSystemId));
      nodes.push({
        id: evidenceNodeId,
        label: 'Evidence',
        kind: 'evidence',
        aiReachable: 'UNKNOWN',
        availability: 'AVAILABLE',
        limitations: [],
      });
      edges.push({
        id: stableEdgeId(evidenceNodeId, aiSystemNode.id, 'observed_by'),
        source: evidenceNodeId,
        target: aiSystemNode.id,
        label: 'observes',
        kind: 'observed_by',
        joinBasis: 'EXACT_ID',
      });
    }
  } catch {
    // Non-fatal
  }

  // ─── Compute deterministic projection hash ──────────────────────────────
  const payload: TopologyProjectionPayload = {
    projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
    sourceVersion: TOPOLOGY_PROJECTION_VERSION,
    projectionScope: 'AI_SYSTEM',
    organizationId,
    aiSystemId,
    scanId: scanProvenance?.scanId,
    primaryTimeBasis: 'SCAN_RUN',
    coverage: mapAvailability === 'AVAILABLE' ? 'PARTIAL' : mapAvailability === 'SOURCE_GAP' ? 'NOT_ASSESSED' : 'UNKNOWN',
    limitations,
    relations,
    sourceRefs,
  };
  const projectionHash = computeProjectionHash(payload);

  // ─── Deterministic ordering ─────────────────────────────────────────────
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  return {
    projectionSchemaVersion: TOPOLOGY_PROJECTION_SCHEMA_VERSION,
    sourceVersion: TOPOLOGY_PROJECTION_VERSION,
    projectionScope: 'AI_SYSTEM',
    organizationId,
    aiSystemId,
    aiSystemName: aiSystem.name || 'AI System',
    scanId: scanProvenance?.scanId,
    primaryTimeBasis: 'SCAN_RUN',
    projectionHash,
    coverage: payload.coverage,
    mapAvailability,
    limitations,
    nodes,
    edges,
    scanProvenance,
    providerIam,
    lenses: SUPPORTED_MAP_LENSES,
    zoomLevels: SUPPORTED_SEMANTIC_ZOOM_LEVELS,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferConsequenceKey(action: string | undefined): string {
  if (!action) return 'unknown';
  const lower = action.toLowerCase();
  if (lower.includes('delete') || lower.includes('remove')) return 'delete';
  if (lower.includes('create') || lower.includes('insert') || lower.includes('write') || lower.includes('post')) return 'write_data';
  if (lower.includes('update') || lower.includes('patch') || lower.includes('put')) return 'write_data';
  if (lower.includes('refund') || lower.includes('charge') || lower.includes('payment')) return 'financial_mutation';
  if (lower.includes('send') || lower.includes('email') || lower.includes('notify')) return 'send_externally';
  if (lower.includes('config') || lower.includes('deploy') || lower.includes('infra')) return 'config_change';
  if (lower.includes('role') || lower.includes('permission') || lower.includes('admin')) return 'authority_change';
  return 'read_data';
}

function inferConsequenceLabel(key: string): string {
  switch (key) {
    case 'delete': return 'Delete Data';
    case 'write_data': return 'Write Data';
    case 'financial_mutation': return 'Financial Mutation';
    case 'send_externally': return 'Send Externally';
    case 'config_change': return 'Configuration Change';
    case 'authority_change': return 'Authority Change';
    default: return 'Read Data';
  }
}
