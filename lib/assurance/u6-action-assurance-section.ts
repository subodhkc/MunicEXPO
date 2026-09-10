/**
 * S6 — Agentic Assurance / Action Assurance customer-facing projection.
 *
 * Builds a bounded, HISTORICAL Action Assurance read-model summary for the
 * exact source scan bound to a completed Assurance evaluation.
 *
 * This is a THIN PROJECTION over the existing ARI-P0 read model and persisted
 * operation coverage intelligence. It does NOT:
 *   - recompute U5 authority
 *   - create new evidence
 *   - create a new graph engine
 *   - create a new report system
 *
 * LOCKS:
 *   CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE
 *   NO_HISTORICAL_BINDING -> NOT_AVAILABLE (never current-trace fallback)
 *   CROSS_SCAN_JOIN = INVALID
 *   ACTION_ASSURANCE_REPORT_SECTION != U5_DECISION_INPUT
 *   SURFACE_IMPLEMENTED != EVIDENCE_COMPLETE
 *   SURFACE_VISIBLE != ANALYZER_COMPLETE
 *   NO_RELATION != SAFE
 *   ANALYZED_EMPTY != NOT_ANALYZED
 *   PRODUCER_FRONTIER != NO_RISK
 *   UNKNOWN != FALSE
 *   STATIC_CONTROL_PRESENT != RUNTIME_CONTROL_TRIGGERED
 *   NOT_RUNTIME_VALIDATED != RUNTIME_SAFE
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- uniform projection function signatures; unused read-model/data parameters are kept for API consistency and future extension */

import type { AssuranceEvaluation } from './types';
import { loadEvaluatedOperationCoverage, type EvaluatedScanUnavailable } from './u6-scan-loader';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import {
  buildAgentReachabilityReadModel,
  type AgentReachabilityReadModel,
  type ReachabilitySourceProvenance,
} from '@/lib/ai-inventory/agent-reachability-read-model';
import type { ActionAssuranceReportSection, ActionAssuranceSurface } from './u6-types';
import type { AriFamilyCoverage } from '@/lib/ai-security/types';

const MAX_SURFACES = 10;
const MAX_SURFACE_REFS = 24;

function truncateReason(reason: string | undefined, max = 120): string {
  const r = reason ?? '';
  return r.length > max ? `${r.slice(0, max)}...` : r;
}

function familyCoverageState(family: AriFamilyCoverage | undefined, relationCount: number): string {
  if (!family) return 'NOT_ANALYZED';
  const state = family.state;
  const reason = family.reason ?? '';

  if (reason.includes('PRODUCER_FRONTIER')) {
    return 'PRODUCER_FRONTIER';
  }

  if (state === 'ANALYZED' && relationCount === 0) {
    const hasAnalyzedEmptyLimitation = family.limitations.some((l) => l.includes('ANALYZED_EMPTY'));
    if (hasAnalyzedEmptyLimitation) {
      return 'ANALYZED_EMPTY';
    }
  }

  if (state === 'NOT_ANALYZED') return 'NOT_ANALYZED';
  if (state === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (state === 'UNKNOWN') return 'UNKNOWN';
  if (state === 'ANALYZED') return 'ESTABLISHED';
  return state;
}

function combineLimitations(base: string[], family: AriFamilyCoverage | undefined, extra: string[] = []): string[] {
  const result = new Set<string>(base);
  if (family) {
    for (const l of family.limitations) result.add(l);
  }
  for (const l of extra) result.add(l);
  return Array.from(result);
}

function refsFromReadModel(readModel: AgentReachabilityReadModel, data: PersistedOperationCoverageIntelligence): string[] {
  const refs: string[] = [];
  for (const a of readModel.agents.items) {
    refs.push(a.id);
  }
  for (const r of readModel.relationships.items) {
    refs.push(r.id);
  }
  for (const tc of readModel.agents.items.flatMap((a) => a.toolCapabilities)) {
    for (const s of tc.stages) {
      for (const id of s.relationIds) {
        refs.push(id);
      }
    }
  }
  for (const r of data.handlerOperationRelations ?? []) {
    refs.push(r.id);
  }
  return Array.from(new Set(refs)).slice(0, MAX_SURFACE_REFS);
}

function buildAgentCapabilityConstellation(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.agentTopology;
  const relationCount =
    readModel.agents.total +
    readModel.relationships.total +
    data.toolCandidates.length +
    (data.handlerOperationRelations?.length ?? 0);

  const capabilities = readModel.agents.items.flatMap((a) => a.toolCapabilities);
  const establishedStages = capabilities
    .flatMap((tc) => tc.stages)
    .filter((s) => s.state === 'ESTABLISHED').length;

  const state = familyCoverageState(family, relationCount);
  const summary = `Constellation of ${readModel.agents.total} agent candidate(s) with ${readModel.relationships.total} relationship(s) and ${capabilities.length} tool capability chain(s); ${establishedStages} source-established stage(s).`;

  return {
    surfaceKey: 'AGENT_CAPABILITY_CONSTELLATION',
    title: 'Agent Capability Constellation',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_AGENT_TOPOLOGY_PROJECTION',
    relationCount,
    relationRefs: refsFromReadModel(readModel, data),
    summary,
    limitations: combineLimitations(
      [
        'AGENT_CANDIDATE != CANONICAL_RUNTIME_AGENT_IDENTITY',
        'AGENT_DEFINITION != RUNTIME_INSTANCE',
        'TOOL_REGISTRATION != TOOL_EXECUTION',
        'MODEL_VISIBLE != REQUESTED',
        'HANDLER_BOUND != EXECUTED',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'AgentReachabilityReadModel.agentCandidates, toolCandidates, handlerOperationRelations',
    customerStatus: state === 'ESTABLISHED' || state === 'ANALYZED_EMPTY' ? 'Mapped' : 'Partial',
  };
}

function buildReachabilitySharedSubstrate(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.sharedSubstrates;
  const hubs = readModel.sharedResourceHubs;
  const channels = readModel.potentialChannels;
  const relationCount = hubs.total + channels.total;

  const state = familyCoverageState(family, relationCount);
  const summary = `Reachability shared substrate: ${hubs.total} co-access resource hub(s) and ${channels.total} potential communication channel(s).`;

  return {
    surfaceKey: 'REACHABILITY_SHARED_SUBSTRATE',
    title: 'Reachability Shared Substrate',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_SHARED_SUBSTRATE_PROJECTION',
    relationCount,
    relationRefs: [
      ...hubs.items.map((h) => h.resourceKey),
      ...channels.items.map((c) => c.id),
    ].slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'SHARED_SUBSTRATE != COMMUNICATION_CHANNEL',
        'CO_ACCESS != DIRECTIONAL_INFLUENCE',
        'SAME_RESOURCE != SAME_AUTHORITY',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'AgentReachabilityReadModel.sharedResourceHubs, potentialChannels',
    customerStatus: hubs.total > 0 || channels.total > 0 ? 'Co-access present' : 'None established',
  };
}

function buildMemoryContextIntegrity(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.modelContextInfluence ?? data.ariCoverage?.memoryLineage;
  const influence = data.modelContextInfluenceRelations ?? [];
  const lineage = data.memoryLineageRelations ?? [];
  const relationCount = influence.length + lineage.length;

  const state = familyCoverageState(family, relationCount);
  const summary = `Memory/context influence: ${influence.length} model-context relation(s) and ${lineage.length} memory lineage relation(s).`;

  return {
    surfaceKey: 'MEMORY_CONTEXT_INTEGRITY',
    title: 'Memory & Context Integrity',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_MEMORY_CONTEXT_PROJECTION',
    relationCount,
    relationRefs: [
      ...influence.map((r) => r.id),
      ...lineage.map((r) => r.id),
    ].slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'MEMORY_ACCESS != AGENT_INFLUENCE',
        'CONTEXT_REACH != CONSEQUENTIAL_OPERATION',
        'MODEL_CONTEXT_INFLUENCE != RUNTIME_BEHAVIOR',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.modelContextInfluenceRelations, memoryLineageRelations',
    customerStatus: relationCount > 0 ? 'Influence paths present' : 'Not established',
  };
}

function buildDelegatedAuthority(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.delegatedAuthority;
  const relations = data.delegatedAuthorityRelations ?? [];
  const relationCount = relations.length;

  const state = familyCoverageState(family, relationCount);
  const summary = `Delegated authority: ${relationCount} source-qualified delegation relation(s) found.`;

  return {
    surfaceKey: 'DELEGATED_AUTHORITY',
    title: 'Delegated Authority',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_DELEGATION_PROJECTION',
    relationCount,
    relationRefs: relations.map((r) => r.id).slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'HANDOFF != AUTHORITY_DELEGATED',
        'AGENT_AS_TOOL != DELEGATION',
        'PERMISSION != DELEGATION',
        'DELEGATION_DECLARED != DELEGATION_ACTIVE',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.delegatedAuthorityRelations',
    customerStatus: relationCount > 0 ? 'Relations present' : 'No established delegation',
  };
}

function buildApprovalIntegrity(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.approvalIntegrity;
  const controls = data.approvalControlRelations ?? [];
  const integrity = data.approvalIntegrityRelations ?? [];
  const relationCount = controls.length + integrity.length;

  const pathBound = controls.filter((c) => c.controlStage === 'PATH_BOUND').length;
  const attached = controls.filter((c) => c.controlStage === 'ATTACHED' || c.controlStage === 'DECLARED').length;

  const state = familyCoverageState(family, relationCount);
  const summary = `Approval integrity: ${controls.length} control relation(s) (${pathBound} path-bound static, ${attached} attached/declared) and ${integrity.length} integrity relation(s).`;

  return {
    surfaceKey: 'APPROVAL_INTEGRITY',
    title: 'Approval Integrity',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_APPROVAL_INTEGRITY_PROJECTION',
    relationCount,
    relationRefs: [
      ...controls.map((r) => r.id),
      ...integrity.map((r) => r.id),
    ].slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'CONTROL_PRESENT != PATH_BOUND',
        'PATH_BOUND != TRIGGERED',
        'TRIGGERED != ACTION_EXECUTED',
        'UI_CONFIRMATION != SERVER_SIDE_ENFORCEMENT',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.approvalControlRelations, approvalIntegrityRelations',
    customerStatus: pathBound > 0 ? 'Path-bound controls present' : 'Controls not path-bound',
  };
}

function buildActionCompositionDeferred(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const compositionFamily = data.ariCoverage?.actionComposition;
  const deferredFamily = data.ariCoverage?.deferredExecution;
  const composition = data.actionCompositionRelations ?? [];
  const deferred = data.deferredExecutionRelations ?? [];

  const relationCount = composition.length + deferred.length;
  const hasCompositionFrontier = (compositionFamily?.reason ?? '').includes('PRODUCER_FRONTIER');

  // Surface state: preserve the composition producer frontier above all else.
  // If the composition family is a producer frontier, the surface is a frontier
  // even when some deferred paths are present.
  let state: string;
  if (hasCompositionFrontier) {
    state = 'PRODUCER_FRONTIER';
  } else if (compositionFamily) {
    state = familyCoverageState(compositionFamily, composition.length);
  } else if (deferredFamily) {
    state = familyCoverageState(deferredFamily, deferred.length);
  } else {
    state = 'NOT_ANALYZED';
  }

  const reason = compositionFamily?.reason ?? deferredFamily?.reason ?? 'ACTION_COMPOSITION_DEFERRED_NOT_ANALYZED';
  const summary = `Action composition / deferred execution: ${composition.length} composition relation(s), ${deferred.length} deferred execution path(s). Explicit composition source producer not currently established.`;

  return {
    surfaceKey: 'ACTION_COMPOSITION_DEFERRED_EXECUTION',
    title: 'Action Composition & Deferred Execution',
    coverageState: state,
    coverageReason: truncateReason(reason),
    relationCount,
    relationRefs: [
      ...composition.map((r) => r.id),
      ...deferred.map((r) => r.id),
    ].slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'FUNCTION_CALL != COMPOSITION',
        'TOPOLOGY_ADJACENT != COMPOSED',
        'SAME_NAME != COMPOSITION',
        'SCHEDULED != EXECUTED',
        'QUEUE_WRITE != QUEUE_CONSUMED',
        'PERSISTENCE_CREATION != FUTURE_EXECUTION',
        'CANDIDATE_PATH != ESTABLISHED_PATH',
        'STATIC_PATH != OBSERVED_EXECUTION',
      ],
      compositionFamily,
      [
        'ARGUMENT_PRESERVATION_UNKNOWN != ARGUMENT_PRESERVED',
      ],
    ),
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.actionCompositionRelations, deferredExecutionRelations',
    customerStatus: 'Analysis surface available; composition source producer frontier',
  };
}

function buildReplayRetry(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.replay;
  const replay = data.replayRelations ?? [];
  const relationCount = replay.length;

  const state = familyCoverageState(family, relationCount);
  const summary = `Replay / retry / duplicate effect: ${relationCount} source-qualified replay relation(s).`;

  return {
    surfaceKey: 'REPLAY_RETRY_DUPLICATE_EFFECT',
    title: 'Replay, Retry & Duplicate Effect',
    coverageState: state,
    coverageReason: family?.reason ?? 'ARI_REPLAY_PROJECTION',
    relationCount,
    relationRefs: replay.map((r) => r.id).slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: combineLimitations(
      [
        'RETRY_CONFIGURED != RETRY_OCCURRED',
        'REPLAY_CAPABLE != REPLAY_OBSERVED',
        'REPEATED_CALL != REPLAY',
        'SAME_ARGUMENTS != REPLAY',
        'TEMPORAL_ADJACENCY != REPLAY',
      ],
      family,
    ),
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.replayRelations',
    customerStatus: 'Replay producer frontier; no replay occurrence claimed',
  };
}

function buildEnforcementCoverage(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const controls = data.approvalControlRelations ?? [];
  const confirmations = data.actionConfirmationMediationRelations ?? [];
  const relationCount = controls.length + confirmations.length;

  const stageCounts: Record<string, number> = {
    PATH_BOUND: 0,
    ATTACHED: 0,
    DECLARED: 0,
    UNKNOWN: 0,
  };

  for (const c of controls) {
    const stage = c.controlStage ?? 'UNKNOWN';
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  let state: string;
  if (confirmations.length === 0 && controls.length === 0) {
    state = 'NOT_ANALYZED';
  } else if (stageCounts.PATH_BOUND > 0) {
    state = 'PARTIAL';
  } else if (stageCounts.ATTACHED > 0 || stageCounts.DECLARED > 0) {
    state = 'PARTIAL';
  } else {
    state = 'UNKNOWN';
  }

  const summary = `Enforcement coverage: ${confirmations.length} confirmation mediation relation(s), ${controls.length} approval control relation(s) (${stageCounts.PATH_BOUND} path-bound static, ${stageCounts.ATTACHED} attached, ${stageCounts.DECLARED} declared, ${stageCounts.UNKNOWN} unknown).`;

  return {
    surfaceKey: 'ENFORCEMENT_COVERAGE',
    title: 'Enforcement Coverage',
    coverageState: state,
    coverageReason: 'ARI_CONFIRMATION_MEDIATION_PROJECTION',
    relationCount,
    relationRefs: [
      ...confirmations.map((r) => r.id),
      ...controls.map((r) => r.id),
    ].slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: [
      'STATIC_CONTROL_PRESENT != RUNTIME_CONTROL_TRIGGERED',
      'PATH_BOUND != OBSERVED_ENFORCEMENT',
      'UI_CONFIRMATION != SERVER_SIDE_ENFORCEMENT',
      'CONTROL_PRESENT != PATH_BOUND',
      'TRIGGERED != ACTION_EXECUTED',
    ],
    evidenceRefs: [],
    sourceBasis: 'PersistedOperationCoverageIntelligence.actionConfirmationMediationRelations, approvalControlRelations',
    customerStatus: stageCounts.PATH_BOUND > 0 ? 'Path-bound static controls present' : 'No path-bound static enforcement established',
  };
}

function buildEvidenceSufficiencyUncertainty(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const coverage = readModel.coverage;
  const frontiers = readModel.frontiers;

  const allAnalyzed = coverage.items.every((c) => c.state === 'ANALYZED');
  const state = frontiers.total > 0 || !allAnalyzed ? 'PARTIAL' : 'ESTABLISHED';
  const reason = frontiers.total > 0
    ? 'FRONTIERS_REMAIN_IN_EVALUATED_SCOPE'
    : allAnalyzed
      ? 'ALL_COVERAGE_FAMILIES_ANALYZED'
      : 'PARTIAL_ANALYZER_COVERAGE';

  const summary = `Evidence sufficiency: ${coverage.total} coverage family(ies), ${frontiers.total} unresolved frontier(s).`;

  return {
    surfaceKey: 'EVIDENCE_SUFFICIENCY_UNCERTAINTY',
    title: 'Evidence Sufficiency & Uncertainty',
    coverageState: state,
    coverageReason: reason,
    relationCount: frontiers.total,
    relationRefs: frontiers.items.map((f) => f.id).slice(0, MAX_SURFACE_REFS),
    summary,
    limitations: [
      'SURFACE_IMPLEMENTED != EVIDENCE_COMPLETE',
      'SURFACE_VISIBLE != ANALYZER_COMPLETE',
      'UNKNOWN != ZERO',
      'PRODUCER_FRONTIER != ANALYSIS_FAILURE',
    ],
    evidenceRefs: [],
    sourceBasis: 'AgentReachabilityReadModel.coverage, frontiers',
    customerStatus: state === 'ESTABLISHED' ? 'Coverage established' : 'Evidence incomplete or partial',
  };
}

function buildRuntimeValidatedDifferential(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  // Runtime evidence is not part of the static operation coverage snapshot.
  // The S6 scope explicitly does not create or require runtime evidence.
  const runtimeCorroborations: unknown[] = [];
  const relationCount = runtimeCorroborations.length;

  const state = relationCount === 0 ? 'NOT_RUNTIME_VALIDATED' : 'STATIC_ONLY';
  const summary = `Runtime-validated differential: ${relationCount} runtime corroboration(s). Static source evidence has no runtime corroboration.`;

  return {
    surfaceKey: 'RUNTIME_VALIDATED_DIFFERENTIAL',
    title: 'Runtime-Validated Differential',
    coverageState: state,
    coverageReason: relationCount === 0
      ? 'RUNTIME_EVIDENCE_NOT_INCLUDED_IN_EVALUATED_SCOPE'
      : 'RUNTIME_CORROBORATION_PRESENT',
    relationCount,
    relationRefs: [],
    summary,
    limitations: [
      'STATIC_PATH != RUNTIME_OCCURRENCE',
      'NOT_RUNTIME_VALIDATED != RUNTIME_SAFE',
      'NO_RUNTIME_EVIDENCE != NO_OBSERVED_EFFECT',
    ],
    evidenceRefs: [],
    sourceBasis: 'No runtime evidence in evaluated static snapshot',
    customerStatus: 'No runtime corroboration',
  };
}

function buildAllSurfaces(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface[] {
  const surfaces: ActionAssuranceSurface[] = [
    buildAgentCapabilityConstellation(readModel, data),
    buildReachabilitySharedSubstrate(readModel, data),
    buildMemoryContextIntegrity(readModel, data),
    buildDelegatedAuthority(readModel, data),
    buildApprovalIntegrity(readModel, data),
    buildActionCompositionDeferred(readModel, data),
    buildReplayRetry(readModel, data),
    buildEnforcementCoverage(readModel, data),
    buildEvidenceSufficiencyUncertainty(readModel, data),
    buildRuntimeValidatedDifferential(readModel, data),
  ];
  return surfaces.slice(0, MAX_SURFACES);
}

function mapAriUnavailableReason(
  reason: AgentReachabilityReadModel['unavailableReason'],
): NonNullable<ActionAssuranceReportSection['unavailableReason']> {
  switch (reason) {
    case 'ARI_NOT_PRESENT_IN_SNAPSHOT':
    case 'ARI_NOT_ANALYZED':
    case 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED':
      return reason;
    case 'OPERATION_COVERAGE_NOT_AVAILABLE':
    case 'SOURCE_GAP':
      return 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE';
    case 'UNSUPPORTED_SCHEMA':
      return 'EVALUATED_SNAPSHOT_INVALID';
    default:
      return 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE';
  }
}

function buildCoverageSummary(
  readModel: AgentReachabilityReadModel,
): Array<{ family: string; state: string; limitations: string[] }> {
  return readModel.coverage.items.map((c) => ({
    family: c.family,
    state: c.state,
    limitations: c.limitations,
  }));
}

export function buildActionAssuranceSectionFromReadModel(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
  provenance: ReachabilitySourceProvenance,
): ActionAssuranceReportSection {
  if (readModel.availability === 'NOT_AVAILABLE') {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: mapAriUnavailableReason(readModel.unavailableReason),
      scanId: provenance.scanId,
      commitSha: provenance.commitSha,
    };
  }

  const surfaces = buildAllSurfaces(readModel, data);
  const coverage = buildCoverageSummary(readModel);

  return {
    availability: readModel.availability,
    scanId: provenance.scanId,
    commitSha: provenance.commitSha,
    summary: {
      surfaceCount: surfaces.length,
      agentCount: readModel.agents.total,
      relationCount: readModel.relationships.total,
      frontierCount: readModel.frontiers.total,
      coverageFamilyCount: coverage.length,
    },
    surfaces,
    coverage,
    coverageLimitations: readModel.coverage.items.flatMap((c) => c.limitations),
    surfacesShown: surfaces.length,
    totalSurfaces: surfaces.length,
  };
}

/**
 * Build the Agentic Assurance / Action Assurance report section for one evaluation.
 *
 * Always returns a section so the report does not silently omit availability.
 */
export async function buildActionAssuranceReportSection(
  evaluation: AssuranceEvaluation,
): Promise<ActionAssuranceReportSection> {
  const unavailable = (reason: NonNullable<ActionAssuranceReportSection['unavailableReason']>): ActionAssuranceReportSection => ({
    availability: 'NOT_AVAILABLE',
    unavailableReason: reason,
  });

  try {
    const result = await loadEvaluatedOperationCoverage(evaluation);
    if ('availability' in result) {
      const r = result as EvaluatedScanUnavailable;
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: r.unavailableReason,
        scanId: r.scanId,
        commitSha: r.commitSha,
      };
    }

    const readModel = buildAgentReachabilityReadModel(result.data, {
      scanId: result.scanId,
      commitSha: result.commitSha,
    });

    if (readModel.availability === 'NOT_AVAILABLE') {
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: mapAriUnavailableReason(readModel.unavailableReason),
        scanId: readModel.scanId,
        commitSha: readModel.commitSha,
      };
    }

    return buildActionAssuranceSectionFromReadModel(readModel, result.data, {
      scanId: result.scanId,
      commitSha: result.commitSha,
    });
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}
