/* eslint-disable @typescript-eslint/no-unused-vars -- uniform projection function signatures; unused read-model/data parameters are kept for API consistency and future extension */

/**
 * S6 — Agentic Assurance / Action Assurance customer-facing projection.
 *
 * Builds a bounded, HISTORICAL Action Assurance read-model summary for the
 * exact source scan bound to a completed Assurance evaluation.
 *
 * This is a THIN PROJECTION over the existing ARI-P0 read model, persisted
 * operation coverage intelligence, and the exact-run Evidence Core projection.
 * It does NOT:
 *   - recompute U5 authority
 *   - create new evidence
 *   - create a new graph engine
 *   - create a new report system
 *   - produce findings or dispositions
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
 *   ANALYZER_RAN != RELATION_ESTABLISHED
 *   ANALYSIS_STATE != RESULT_STATE
 *   PRODUCER_FRONTIER != NO_RISK
 *   UNKNOWN != FALSE
 *   STATIC_CONTROL_PRESENT != RUNTIME_CONTROL_TRIGGERED
 *   NOT_RUNTIME_VALIDATED != RUNTIME_SAFE
 */

import type { AssuranceEvaluation } from './types';
import { loadEvaluatedOperationCoverage, type EvaluatedScanUnavailable } from './u6-scan-loader';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import {
  buildAgentReachabilityReadModel,
  type AgentReachabilityReadModel,
  type ReachabilitySourceProvenance,
} from '@/lib/ai-inventory/agent-reachability-read-model';
import {
  U6_REPORT_SCHEMA_VERSION_S6,
  type ActionAssuranceReportSection,
  type ActionAssuranceRunContext,
  type ActionAssuranceSurface,
  type ActionAssuranceSurfaceFacet,
  type AnalysisCoverageState,
  type ResultState,
} from './u6-types';
import type { FindingRef } from '@/lib/evidence/evidence-contract';
import { PRODUCER_IDS } from '@/lib/engine-registry/producer-registry';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';
import type { AriFamilyCoverage, AriRelationState } from '@/lib/ai-security/types';
import type { DecisionEvidenceProjection } from '@/lib/decision-pipeline/evidence-projection';

const MAX_SURFACES = 10;
const MAX_SURFACE_REFS = 24;

type RelationLike = { id: string; state?: AriRelationState | string };
type SourceProvenance = { scanId: string; commitSha: string | null };

function truncateReason(reason: string | undefined, max = 120): string {
  const r = reason ?? '';
  return r.length > max ? `${r.slice(0, max)}...` : r;
}

function toResultState(state: AriRelationState | string | undefined): ResultState {
  switch (state) {
    case 'ESTABLISHED':
      return 'ESTABLISHED';
    case 'CONDITIONAL':
      return 'CONDITIONAL';
    case 'CANDIDATE':
      return 'CANDIDATE';
    case 'PARTIAL':
      return 'PARTIAL';
    case 'UNKNOWN':
      return 'UNKNOWN';
    case 'NOT_ANALYZED':
      return 'NOT_ANALYZED';
    case 'UNSUPPORTED':
    case 'NOT_APPLICABLE':
      return 'UNSUPPORTED';
    default:
      return 'UNKNOWN';
  }
}

function combineResultStates(states: ResultState[]): ResultState {
  if (states.length === 0) return 'ANALYZED_EMPTY';
  if (states.every((s) => s === 'NOT_ANALYZED')) return 'NOT_ANALYZED';
  if (states.every((s) => s === 'UNKNOWN')) return 'UNKNOWN';
  if (states.every((s) => s === 'UNSUPPORTED')) return 'UNSUPPORTED';
  if (states.every((s) => s === 'CANDIDATE')) return 'CANDIDATE';
  if (states.every((s) => s === 'ESTABLISHED')) return 'ESTABLISHED';
  const allEstablishedOrConditional = states.every((s) => s === 'ESTABLISHED' || s === 'CONDITIONAL');
  if (allEstablishedOrConditional) return states.some((s) => s === 'CONDITIONAL') ? 'CONDITIONAL' : 'ESTABLISHED';
  return 'PARTIAL';
}

function familyAnalysisState(family: AriFamilyCoverage | undefined): AnalysisCoverageState {
  const s = family?.state ?? 'NOT_ANALYZED';
  if (s === 'ANALYZED' || s === 'PARTIAL' || s === 'NOT_ANALYZED' || s === 'UNKNOWN' || s === 'UNSUPPORTED') {
    return s as AnalysisCoverageState;
  }
  return 'UNKNOWN';
}

function deriveResultFromRelationStates(relations: RelationLike[]): ResultState {
  const states = relations.map((r) => toResultState(r.state));
  if (states.every((s) => s === 'ESTABLISHED')) return 'ESTABLISHED';
  const allEstablishedOrConditional = states.every((s) => s === 'ESTABLISHED' || s === 'CONDITIONAL');
  if (allEstablishedOrConditional) return states.some((s) => s === 'CONDITIONAL') ? 'CONDITIONAL' : 'ESTABLISHED';
  if (states.every((s) => s === 'CANDIDATE')) return 'CANDIDATE';
  return 'PARTIAL';
}

function familyResultState(family: AriFamilyCoverage | undefined, relations: RelationLike[]): ResultState {
  const reason = family?.reason ?? '';
  if (reason.includes('PRODUCER_FRONTIER')) {
    return 'PRODUCER_FRONTIER';
  }

  const fs = family?.state ?? 'NOT_ANALYZED';
  if (fs === 'NOT_ANALYZED') return 'NOT_ANALYZED';
  if (fs === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (fs === 'UNKNOWN') return 'UNKNOWN';

  if (fs === 'ANALYZED') {
    if (relations.length === 0) {
      const limitations = family?.limitations ?? [];
      const hasAnalyzedEmptyLimitation = limitations.some((l) => l.includes('ANALYZED_EMPTY'));
      return hasAnalyzedEmptyLimitation || limitations.length === 0 ? 'ANALYZED_EMPTY' : 'UNKNOWN';
    }
    return deriveResultFromRelationStates(relations);
  }

  if (fs === 'PARTIAL') {
    if (relations.length === 0) return 'UNKNOWN';
    return deriveResultFromRelationStates(relations);
  }

  return 'UNKNOWN';
}

function combineLimitations(base: string[], family: AriFamilyCoverage | undefined, extra: string[] = []): string[] {
  const result = new Set<string>(base);
  if (family) {
    for (const l of family.limitations) result.add(l);
  }
  for (const l of extra) result.add(l);
  return Array.from(result);
}

function customerStatus(label: string, analysis: AnalysisCoverageState, result: ResultState): string {
  const lower = label.toLowerCase();
  switch (result) {
    case 'NOT_ANALYZED':
      return analysis === 'NOT_ANALYZED'
        ? `This ${lower} dimension was not analyzed for the evaluated snapshot.`
        : `No qualified ${lower} relation established in the analyzed evidence.`;
    case 'ANALYZED_EMPTY':
      return `No qualified ${lower} relations found in the analyzed evidence.`;
    case 'PRODUCER_FRONTIER':
      return `Explicit ${lower} producer not currently established; bounded frontier.`;
    case 'ESTABLISHED':
      return `Established ${lower} relation(s) found in the analyzed evidence.`;
    case 'CONDITIONAL':
      return `Conditional ${lower} relation(s) found; subject to stated limitations.`;
    case 'CANDIDATE':
      return `Candidate ${lower} path(s) present; not established as observed.`;
    case 'PARTIAL':
      return `Partial ${lower} coverage; some dimensions remain unresolved.`;
    case 'UNKNOWN':
      return `${label} coverage is unknown for the evaluated snapshot.`;
    case 'UNSUPPORTED':
      return `${label} analysis is not supported for the evaluated snapshot.`;
    case 'NOT_RUNTIME_VALIDATED':
      return `No runtime corroboration for the evaluated ${lower} dimension.`;
    case 'RUNTIME_NOT_SELECTED':
      return `Runtime evidence was not selected for the evaluated ${lower} dimension.`;
    case 'RUNTIME_SELECTED_EMPTY':
      return `Runtime evidence selected but produced zero qualifying records for the evaluated ${lower} dimension.`;
    case 'RUNTIME_FAILED':
      return `Runtime producer failed for the evaluated ${lower} dimension.`;
    case 'RUNTIME_PARTIAL':
      return `Runtime producer returned partial results for the evaluated ${lower} dimension.`;
    case 'RUNTIME_EVIDENCE_PRESENT':
      return `Runtime evidence present, but exact action correspondence not established.`;
    case 'STATIC_WITH_RUNTIME_CORROBORATION':
      return `Static and runtime evidence correspond for a comparable action identity.`;
    case 'STATIC_RUNTIME_DIVERGENCE':
      return `Static and runtime evidence diverge for a comparable action identity.`;
    default:
      return `${label} state is not available for the evaluated snapshot.`;
  }
}

function buildFacet(
  key: string,
  title: string,
  family: AriFamilyCoverage | undefined,
  relations: RelationLike[],
  baseLimitations: string[] = [],
  extraLimitations: string[] = [],
): ActionAssuranceSurfaceFacet {
  const analysis = familyAnalysisState(family);
  const result = familyResultState(family, relations);
  const limitations = combineLimitations(baseLimitations, family, extraLimitations);
  return {
    facetKey: key,
    title,
    analysisCoverageState: analysis,
    resultState: result,
    relationCount: relations.length,
    relationRefs: relations.map((r) => r.id).slice(0, MAX_SURFACE_REFS),
    summary: `${title}: analysis ${analysis}, result ${result}, ${relations.length} source relation(s).`,
    customerStatus: customerStatus(title, analysis, result),
    limitations,
  };
}

function buildSurfaceBase(
  key: string,
  title: string,
  analysis: AnalysisCoverageState,
  result: ResultState,
  reason: string,
  relationCount: number,
  relationRefs: string[],
  summary: string,
  limitations: string[],
  sourceBasis: string,
  evidenceRefs: string[] = [],
): ActionAssuranceSurface {
  return {
    surfaceKey: key,
    title,
    analysisCoverageState: analysis,
    resultState: result,
    coverageReason: reason,
    relationCount,
    relationRefs,
    summary,
    limitations,
    evidenceRefs,
    findingRefs: [],
    sourceBasis,
    customerStatus: customerStatus(title, analysis, result),
  };
}

function deriveOverallAnalysis(facets: ActionAssuranceSurfaceFacet[]): AnalysisCoverageState {
  if (facets.length === 0) return 'NOT_ANALYZED';
  const states = new Set(facets.map((f) => f.analysisCoverageState));
  if (states.size === 1) {
    return facets[0].analysisCoverageState;
  }
  if (states.has('PARTIAL')) return 'PARTIAL';
  if (states.has('NOT_ANALYZED') || states.has('UNKNOWN')) return 'PARTIAL';
  if (states.has('UNSUPPORTED')) return 'PARTIAL';
  return 'ANALYZED';
}

function deriveOverallResult(facets: ActionAssuranceSurfaceFacet[]): ResultState {
  if (facets.length === 0) return 'NOT_ANALYZED';
  const states = facets.map((f) => f.resultState);
  // ANALYZED_EMPTY is a non-contradicting absence signal; it does not downgrade
  // positive result states from other facets, but an empty-only surface is empty.
  const meaningful = states.filter((s) => s !== 'ANALYZED_EMPTY');
  if (meaningful.length === 0) return 'ANALYZED_EMPTY';

  if (meaningful.every((s) => s === 'NOT_ANALYZED')) return 'NOT_ANALYZED';
  if (meaningful.every((s) => s === 'UNKNOWN')) return 'UNKNOWN';
  if (meaningful.every((s) => s === 'UNSUPPORTED')) return 'UNSUPPORTED';
  if (meaningful.every((s) => s === 'CANDIDATE')) return 'CANDIDATE';
  if (meaningful.every((s) => s === 'ESTABLISHED')) return 'ESTABLISHED';
  const allEstablishedOrConditional = meaningful.every((s) => s === 'ESTABLISHED' || s === 'CONDITIONAL');
  if (allEstablishedOrConditional) return meaningful.some((s) => s === 'CONDITIONAL') ? 'CONDITIONAL' : 'ESTABLISHED';
  if (meaningful.some((s) => s === 'PRODUCER_FRONTIER')) {
    const nonFrontier = meaningful.filter((s) => s !== 'PRODUCER_FRONTIER');
    if (nonFrontier.length === 0 || nonFrontier.every((s) => ['NOT_ANALYZED', 'UNKNOWN', 'CANDIDATE'].includes(s))) {
      return 'PRODUCER_FRONTIER';
    }
  }
  return 'PARTIAL';
}

function buildMultiFamilySurface(
  key: string,
  title: string,
  facets: ActionAssuranceSurfaceFacet[],
  reason: string,
  sourceBasis: string,
  evidenceRefs: string[] = [],
): ActionAssuranceSurface {
  const analysis = deriveOverallAnalysis(facets);
  const result = deriveOverallResult(facets);
  const relationCount = facets.reduce((sum, f) => sum + f.relationCount, 0);
  const relationRefs = facets.flatMap((f) => f.relationRefs).slice(0, MAX_SURFACE_REFS);
  const summary = `${title}: ${facets.map((f) => `${f.title} = ${f.resultState}`).join('; ')}.`;
  const limitations = Array.from(new Set(facets.flatMap((f) => f.limitations)));
  const base = buildSurfaceBase(
    key,
    title,
    analysis,
    result,
    reason,
    relationCount,
    relationRefs,
    summary,
    limitations,
    sourceBasis,
    evidenceRefs,
  );
  return { ...base, facets };
}

// ─── Individual customer-facing surfaces ────────────────────────────────────

function buildAgentCapabilityConstellation(
  readModel: AgentReachabilityReadModel,
  _data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const agents = readModel.agents.items;
  const relationships = readModel.relationships?.items ?? [];

  // Scope coverage to the agentTopology family only. Unrelated producer frontiers
  // (replay, composition, delegation, etc.) must not downgrade this surface.
  const agentTopologyFamily = _data.ariCoverage?.agentTopology;
  const analysis: AnalysisCoverageState =
    readModel.availability === 'NOT_AVAILABLE'
      ? 'NOT_ANALYZED'
      : familyAnalysisState(agentTopologyFamily);

  // Derive result from actual bounded epistemic states: agent candidate states,
  // canonical relationship states, and tool capability stage states. Do not let
  // the mere existence of an agent definition establish the whole surface.
  const states: ResultState[] = [];
  for (const agent of agents) {
    states.push(toResultState(agent.candidateState));
  }
  for (const rel of relationships) {
    states.push(toResultState(rel.state));
  }
  for (const agent of agents) {
    for (const tc of agent.toolCapabilities) {
      for (const stage of tc.stages) {
        states.push(toResultState(stage.state));
      }
    }
  }

  const result: ResultState =
    readModel.availability === 'NOT_AVAILABLE'
      ? 'NOT_ANALYZED'
      : agentTopologyFamily?.reason?.includes('PRODUCER_FRONTIER')
        ? 'PRODUCER_FRONTIER'
        : combineResultStates(states);

  const relationCount = relationships.length;
  const relationRefs = relationships.map((r) => r.id).slice(0, MAX_SURFACE_REFS);
  const entityCount = agents.length;
  const entityRefs = agents.map((a) => a.id).slice(0, MAX_SURFACE_REFS);

  const summary = `Agent capability constellation: ${agents.length} agent candidate(s), ${relationships.length} canonical relationship(s).`;

  return {
    ...buildSurfaceBase(
      'AGENT_CAPABILITY_CONSTELLATION',
      'Agent Capability Constellation',
      analysis,
      result,
      'ARI_AGENT_TOPOLOGY_PROJECTION',
      relationCount,
      relationRefs,
      summary,
      [
        'AGENT_CANDIDATE != AGENT_INSTANCE',
        'TOOL_CAPABILITY != RUNTIME_REACHABLE',
        'TOPOLOGY_PROJECTION != OBSERVED_EXECUTION',
        'AGENT_PRESENT != AGENT_ESTABLISHED',
      ],
      'AgentReachabilityReadModel.agents, relationships, toolCapabilities, agentTopology coverage',
    ),
    entityCount,
    entityRefs,
  };
}

function buildReachabilitySharedSubstrate(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const hubs = readModel.sharedResourceHubs?.items ?? [];
  const channels = readModel.potentialChannels?.items ?? [];
  const resourceAccess = data.resourceAccessRelations ?? [];
  const serviceCalls = data.serviceCallRelations ?? [];
  const persistenceCreation = data.persistenceCreationRelations ?? [];

  // Scope coverage to relevant families only. Unrelated frontiers (e.g. replay,
  // action composition) must not downgrade this surface.
  const sharedSubstrateFamily = data.ariCoverage?.sharedSubstrates;
  const resourceAccessFamily = data.ariCoverage?.resourceAccess;
  const persistenceFamily = data.ariCoverage?.persistenceCreation;

  // SHARED_SUBSTRATE facet: hubs and potential channels are projected resource
  // artifacts, not canonical relations. Resource keys are kept in resourceRefs.
  const substrateStates: ResultState[] = [];
  for (const h of hubs) substrateStates.push(toResultState(h.state));
  for (const c of channels) substrateStates.push(toResultState(c.state));
  const substrateResult = sharedSubstrateFamily?.reason?.includes('PRODUCER_FRONTIER')
    ? 'PRODUCER_FRONTIER'
    : substrateStates.length === 0
      ? familyResultState(sharedSubstrateFamily, [])
      : combineResultStates(substrateStates);
  const sharedSubstrateFacet: ActionAssuranceSurfaceFacet = {
    facetKey: 'SHARED_SUBSTRATE',
    title: 'Shared Substrate',
    analysisCoverageState: familyAnalysisState(sharedSubstrateFamily),
    resultState: substrateResult,
    relationCount: 0,
    relationRefs: [],
    resourceCount: hubs.length + channels.length,
    resourceRefs: [...hubs.map((h) => h.resourceKey), ...channels.map((c) => c.resourceKey)].slice(0, MAX_SURFACE_REFS),
    summary: `Shared substrate: ${hubs.length} hub(s), ${channels.length} potential channel(s).`,
    customerStatus: customerStatus('shared substrate', familyAnalysisState(sharedSubstrateFamily), substrateResult),
    limitations: combineLimitations(
      ['SHARED_SUBSTRATE != CROSS_AGENT_EXFILTRATION', 'POTENTIAL_CHANNEL != ACTUAL_CHANNEL'],
      sharedSubstrateFamily,
    ),
  };

  // RESOURCE_ACCESS facet: canonical resource access and service call relations.
  const resourceAccessFacet = buildFacet(
    'RESOURCE_ACCESS',
    'Resource Access',
    resourceAccessFamily,
    [...resourceAccess, ...serviceCalls],
    ['REACHABLE != ACCESSED', 'SERVICE_CALL != RESOURCE_ACCESS_ESTABLISHED'],
  );

  // PERSISTENCE_CREATION facet: canonical persistence creation relations.
  const persistenceFacet = buildFacet(
    'PERSISTENCE_CREATION',
    'Persistence Creation',
    persistenceFamily,
    persistenceCreation,
    ['PERSISTENCE_CREATION != FUTURE_READ', 'WRITE != READ'],
  );

  const facets = [sharedSubstrateFacet, resourceAccessFacet, persistenceFacet];
  const analysis = deriveOverallAnalysis(facets);
  const result = deriveOverallResult(facets);

  const relationCount = facets.reduce((sum, f) => sum + f.relationCount, 0);
  const relationRefs = facets.flatMap((f) => f.relationRefs).slice(0, MAX_SURFACE_REFS);
  const resourceCount = facets.reduce((sum, f) => sum + (f.resourceCount ?? 0), 0);
  const resourceRefs = facets.flatMap((f) => f.resourceRefs ?? []).slice(0, MAX_SURFACE_REFS);

  const summary = `Reachability & shared substrate: ${facets.map((f) => `${f.title} = ${f.resultState}`).join('; ')}.`;
  const limitations = Array.from(new Set(facets.flatMap((f) => f.limitations)));

  const base = buildSurfaceBase(
    'REACHABILITY_SHARED_SUBSTRATE',
    'Reachability & Shared Substrate',
    analysis,
    result,
    'ARI_RESOURCE_ACCESS_AND_SHARED_SUBSTRATE_PROJECTION',
    relationCount,
    relationRefs,
    summary,
    limitations,
    'AgentReachabilityReadModel.sharedResourceHubs, potentialChannels; PersistedOperationCoverageIntelligence.resourceAccessRelations, serviceCallRelations, persistenceCreationRelations',
  );

  return { ...base, resourceCount, resourceRefs, facets };
}

function buildMemoryContextIntegrity(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const memoryAccess = data.memoryAccessRelations ?? [];
  const memoryLineage = data.memoryLineageRelations ?? [];
  const modelContext = data.modelContextInfluenceRelations ?? [];

  const facets: ActionAssuranceSurfaceFacet[] = [
    buildFacet(
      'MEMORY_LINEAGE',
      'Memory Lineage',
      data.ariCoverage?.memoryLineage,
      [...memoryAccess, ...memoryLineage],
      [
        'MEMORY_ACCESS != DATA_EXFILTRATION',
        'PERSISTENCE_CREATION != FUTURE_READ',
        'SYMBOLIC_RESOURCE != EXACT_RESOURCE',
      ],
    ),
    buildFacet(
      'MODEL_CONTEXT_INFLUENCE',
      'Model Context Influence',
      data.ariCoverage?.modelContextInfluence,
      modelContext,
      [
        'MODEL_CONTEXT_EXPOSURE != PROMPT_INJECTION',
        'CONTEXT_INFLUENCE != AUTHORIZED_ACTION',
      ],
    ),
  ];

  return buildMultiFamilySurface(
    'MEMORY_CONTEXT_INTEGRITY',
    'Memory & Context Influence',
    facets,
    'ARI_MEMORY_AND_MODEL_CONTEXT_PROJECTION',
    'PersistedOperationCoverageIntelligence.memoryAccessRelations, memoryLineageRelations, modelContextInfluenceRelations',
  );
}

function buildDelegatedAuthority(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const relations = data.delegatedAuthorityRelations ?? [];
  const family = data.ariCoverage?.delegatedAuthority;
  const analysis = familyAnalysisState(family);
  const result = familyResultState(family, relations);
  const relationCount = relations.length;
  const relationRefs = relations.map((r) => r.id).slice(0, MAX_SURFACE_REFS);
  const entityCount = 0;
  const entityRefs: string[] = [];

  const summary = `Delegated authority: ${relations.length} source-qualified delegation relation(s).`;
  const limitations = combineLimitations(
    [
      'HANDOFF != AUTHORITY_DELEGATED',
      'AGENT_AS_TOOL != DELEGATION',
      'PERMISSION != DELEGATION',
      'DELEGATION_DECLARED != DELEGATION_ACTIVE',
    ],
    family,
  );

  return {
    ...buildSurfaceBase(
      'DELEGATED_AUTHORITY',
      'Delegated Authority',
      analysis,
      result,
      family?.reason ?? 'ARI_DELEGATION_PROJECTION',
      relationCount,
      relationRefs,
      summary,
      limitations,
      'PersistedOperationCoverageIntelligence.delegatedAuthorityRelations',
    ),
    entityCount,
    entityRefs,
  };
}

function buildApprovalIntegrity(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const controls = data.approvalControlRelations ?? [];
  const integrity = data.approvalIntegrityRelations ?? [];

  const facets: ActionAssuranceSurfaceFacet[] = [
    buildFacet(
      'APPROVAL_CONTROL',
      'Approval Control',
      data.ariCoverage?.approvalIntegrity,
      controls,
      [
        'CONTROL_PRESENT != PATH_BOUND',
        'PATH_BOUND != TRIGGERED',
        'TRIGGERED != ACTION_EXECUTED',
      ],
    ),
    buildFacet(
      'APPROVAL_INTEGRITY',
      'Approval Integrity',
      data.ariCoverage?.approvalIntegrity,
      integrity,
      [
        'UI_CONFIRMATION != SERVER_SIDE_ENFORCEMENT',
        'CONFIRMATION_DECLARED != CONFIRMATION_ENFORCED',
      ],
    ),
  ];

  return buildMultiFamilySurface(
    'APPROVAL_INTEGRITY',
    'Approval Integrity',
    facets,
    'ARI_APPROVAL_INTEGRITY_PROJECTION',
    'PersistedOperationCoverageIntelligence.approvalControlRelations, approvalIntegrityRelations',
  );
}

function buildActionCompositionDeferred(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const composition = data.actionCompositionRelations ?? [];
  const deferred = data.deferredExecutionRelations ?? [];

  const facets: ActionAssuranceSurfaceFacet[] = [
    buildFacet(
      'ACTION_COMPOSITION',
      'Action Composition',
      data.ariCoverage?.actionComposition,
      composition,
      [
        'FUNCTION_CALL != COMPOSITION',
        'TOPOLOGY_ADJACENT != COMPOSED',
        'SAME_NAME != COMPOSITION',
      ],
    ),
    buildFacet(
      'DEFERRED_EXECUTION',
      'Deferred Execution',
      data.ariCoverage?.deferredExecution,
      deferred,
      [
        'SCHEDULED != EXECUTED',
        'QUEUE_WRITE != QUEUE_CONSUMED',
        'PERSISTENCE_CREATION != FUTURE_EXECUTION',
        'CANDIDATE_PATH != ESTABLISHED_PATH',
        'STATIC_PATH != OBSERVED_EXECUTION',
        'ARGUMENT_PRESERVATION_UNKNOWN != ARGUMENT_PRESERVED',
      ],
    ),
  ];

  return buildMultiFamilySurface(
    'ACTION_COMPOSITION_DEFERRED_EXECUTION',
    'Action Composition & Deferred Execution',
    facets,
    data.ariCoverage?.actionComposition?.reason ?? data.ariCoverage?.deferredExecution?.reason ?? 'ACTION_COMPOSITION_DEFERRED_NOT_ANALYZED',
    'PersistedOperationCoverageIntelligence.actionCompositionRelations, deferredExecutionRelations',
  );
}

function buildReplayRetry(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const family = data.ariCoverage?.replay;
  const relations = data.replayRelations ?? [];
  const analysis = familyAnalysisState(family);
  const result = familyResultState(family, relations);
  const relationCount = relations.length;
  const relationRefs = relations.map((r) => r.id).slice(0, MAX_SURFACE_REFS);
  const summary = `Replay, retry, and duplicate effect: ${relationCount} source-qualified replay relation(s).`;
  const limitations = combineLimitations(
    [
      'RETRY_CONFIGURED != RETRY_OCCURRED',
      'REPLAY_CAPABLE != REPLAY_OBSERVED',
      'REPEATED_CALL != REPLAY',
      'SAME_ARGUMENTS != REPLAY',
      'TEMPORAL_ADJACENCY != REPLAY',
    ],
    family,
  );

  return buildSurfaceBase(
    'REPLAY_RETRY_DUPLICATE_EFFECT',
    'Replay, Retry & Duplicate Effect',
    analysis,
    result,
    family?.reason ?? 'ARI_REPLAY_PROJECTION',
    relationCount,
    relationRefs,
    summary,
    limitations,
    'PersistedOperationCoverageIntelligence.replayRelations',
  );
}

function buildEnforcementCoverage(
  _readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
): ActionAssuranceSurface {
  const confirmations = data.actionConfirmationMediationRelations ?? [];
  const controls = data.approvalControlRelations ?? [];

  const facets: ActionAssuranceSurfaceFacet[] = [
    buildFacet(
      'CONFIRMATION_MEDIATION',
      'Confirmation Mediation',
      data.ariCoverage?.approvalIntegrity,
      confirmations,
      [
        'CONFIRMATION_MEDIATED != ACTION_EXECUTED',
        'MEDIATION_DECLARED != RUNTIME_ENFORCED',
      ],
    ),
    buildFacet(
      'APPROVAL_CONTROL',
      'Approval Control',
      data.ariCoverage?.approvalIntegrity,
      controls,
      [
        'CONTROL_PRESENT != PATH_BOUND',
        'PATH_BOUND != TRIGGERED',
        'TRIGGERED != ACTION_EXECUTED',
        'UI_CONFIRMATION != SERVER_SIDE_ENFORCEMENT',
      ],
    ),
  ];

  const pathBound = controls.filter((c) => c.controlStage === 'PATH_BOUND').length;

  const surface = buildMultiFamilySurface(
    'ENFORCEMENT_COVERAGE',
    'Enforcement Coverage',
    facets,
    'ARI_CONFIRMATION_MEDIATION_PROJECTION',
    'PersistedOperationCoverageIntelligence.actionConfirmationMediationRelations, approvalControlRelations',
  );

  // Static path-bound controls are not runtime enforcement. Cap the surface
  // result at PARTIAL when any path-bound controls are present, and surface
  // the path-bound count in the customer-facing status.
  const resultState = pathBound > 0 && (surface.resultState === 'ESTABLISHED' || surface.resultState === 'CONDITIONAL')
    ? 'PARTIAL'
    : surface.resultState;

  const customerStatus = pathBound > 0
    ? `Path-bound static controls present (${pathBound}); confirmation/approval mediation is not runtime enforcement.`
    : surface.customerStatus;

  return { ...surface, resultState, customerStatus };
}

type ProducerEvidenceState = {
  producerId: string;
  selected: boolean;
  records: DecisionEvidenceProjection[];
  outcome: ResultState;
};

function evidenceOutcomeFromRecord(record: DecisionEvidenceProjection | undefined): ResultState {
  if (!record) return 'UNKNOWN';
  const po = record.producerOutcome;
  const cs = record.coverageStatus;
  if (po === 'FAILED' || po === 'TIMEOUT' || po === 'CANCELLED') return 'PARTIAL';
  if (po === 'PARTIAL' || cs === 'PARTIAL') return 'PARTIAL';
  if (cs === 'UNKNOWN' || cs === 'NOT_ASSESSED') return 'UNKNOWN';
  if (po === 'COMPLETE' && cs === 'COMPLETE') return 'ESTABLISHED';
  return 'UNKNOWN';
}

function deriveProducerEvidenceStates(
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
): ProducerEvidenceState[] {
  if (!runContext) return [];

  const byProducer = new Map<string, DecisionEvidenceProjection[]>();
  for (const e of projectedEvidence) {
    const list = byProducer.get(e.producerId) ?? [];
    list.push(e);
    byProducer.set(e.producerId, list);
  }

  const canonicalSelected = new Set<string>();
  for (const engine of runContext.selectedEngines ?? []) {
    const canonical = resolveCanonicalProducerId(engine);
    if (canonical) canonicalSelected.add(canonical);
  }
  // Explicit producer run IDs also select the corresponding producer.
  if (runContext.staticScanId) canonicalSelected.add(PRODUCER_IDS.SAAS_STATIC);
  if (runContext.runtimeTestId) canonicalSelected.add(PRODUCER_IDS.SAAS_RUNTIME);
  if (runContext.wizardAssessmentId) canonicalSelected.add(PRODUCER_IDS.SAAS_WIZARD);
  if (runContext.regulatoryReportId) canonicalSelected.add(PRODUCER_IDS.SAAS_REGULATORY);

  const producers = Array.from(canonicalSelected).map((producerId) => {
    const records = byProducer.get(producerId) ?? [];
    const representative = records[0];
    let outcome: ResultState;
    if (records.length === 0) {
      // Selected exact-run producer produced zero qualifying evidence records.
      outcome = 'ANALYZED_EMPTY';
    } else {
      outcome = evidenceOutcomeFromRecord(representative);
    }
    return { producerId, selected: true, records, outcome };
  });

  return producers;
}

function deriveEvidenceSufficiency(
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
): { analysis: AnalysisCoverageState; result: ResultState; evidenceCount: number; evidenceRefs: string[]; findingRefs: FindingRef[] } {
  const evidenceRefs = projectedEvidence.map((e) => e.evidenceId).slice(0, MAX_SURFACE_REFS);
  const findingRefs = projectedEvidence.flatMap((e) => e.findingRefs).slice(0, MAX_SURFACE_REFS);

  // Without an explicit run context we cannot distinguish producer selection vs
  // ANALYZED_EMPTY, so we fall back to the safest coarse interpretation:
  // evidence records present -> analyzed/partial; none present -> not analyzed.
  if (!runContext) {
    if (projectedEvidence.length === 0) {
      return { analysis: 'NOT_ANALYZED', result: 'NOT_ANALYZED', evidenceCount: 0, evidenceRefs, findingRefs };
    }
    return { analysis: 'ANALYZED', result: 'PARTIAL', evidenceCount: projectedEvidence.length, evidenceRefs, findingRefs };
  }

  const producers = deriveProducerEvidenceStates(projectedEvidence, runContext);

  if (producers.length === 0) {
    return {
      analysis: 'NOT_ANALYZED',
      result: 'NOT_ANALYZED',
      evidenceCount: 0,
      evidenceRefs,
      findingRefs,
    };
  }

  const outcomes = producers.map((p) => p.outcome);
  const analysis: AnalysisCoverageState = outcomes.some((o) => o === 'PARTIAL' || o === 'UNKNOWN')
    ? 'PARTIAL'
    : 'ANALYZED';

  const totalRecords = producers.reduce((sum, p) => sum + p.records.length, 0);
  const result: ResultState =
    totalRecords === 0
      ? outcomes.some((o) => o === 'PARTIAL' || o === 'UNKNOWN')
        ? 'PARTIAL'
        : 'ANALYZED_EMPTY'
      : 'PARTIAL';

  return { analysis, result, evidenceCount: totalRecords, evidenceRefs, findingRefs };
}

function buildEvidenceSufficiencyUncertainty(
  readModel: AgentReachabilityReadModel,
  _data: PersistedOperationCoverageIntelligence,
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
): ActionAssuranceSurface {
  const { analysis, result, evidenceCount, evidenceRefs, findingRefs } = deriveEvidenceSufficiency(
    projectedEvidence,
    runContext,
  );

  const frontierCount = readModel.frontiers.total;

  const summary = `Evidence sufficiency and uncertainty: ${evidenceCount} exact-run Evidence Core projection(s), ${readModel.coverage.items.length} analyzer coverage family(ies), ${frontierCount} unresolved frontier(s).`;

  const limitations = [
    'SURFACE_IMPLEMENTED != EVIDENCE_COMPLETE',
    'SURFACE_VISIBLE != ANALYZER_COMPLETE',
    'UNKNOWN != ZERO',
    'PRODUCER_FRONTIER != ANALYSIS_FAILURE',
    'ALL_ANALYZERS_RAN != SUFFICIENT_EVIDENCE',
    'ZERO_FRONTIERS != SUFFICIENT_EVIDENCE',
    'ARI_ANALYSIS_COVERAGE != EVIDENCE_SUFFICIENCY',
    'ZERO_EVIDENCE != NOT_ANALYZED',
    'NO_EVIDENCE_RECORD != PRODUCER_NOT_RUN',
  ];

  const base = buildSurfaceBase(
    'EVIDENCE_SUFFICIENCY_UNCERTAINTY',
    'Evidence Sufficiency & Uncertainty',
    analysis,
    result,
    'EXACT_RUN_EVIDENCE_AND_ANALYZER_COVERAGE_PROJECTION',
    0,
    [],
    summary,
    limitations,
    'AgentReachabilityReadModel.coverage, frontiers; exact-run DecisionEvidenceProjection; ActionAssuranceRunContext',
    evidenceRefs,
  );

  return { ...base, evidenceCount, findingRefs, findingCount: findingRefs.length };
}

function deriveRuntimeState(
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
): { analysis: AnalysisCoverageState; result: ResultState; runtimeEvidence: DecisionEvidenceProjection[]; staticEvidence: DecisionEvidenceProjection[] } {
  const runtimeEvidence = projectedEvidence.filter((e) => e.producerId === PRODUCER_IDS.SAAS_RUNTIME);
  const staticEvidence = projectedEvidence.filter((e) => e.producerId === PRODUCER_IDS.SAAS_STATIC);

  const explicitRuntimeSelected = runContext
    ? !!(runContext.runtimeTestId ||
        (runContext.selectedEngines ?? []).some((e) => resolveCanonicalProducerId(e) === PRODUCER_IDS.SAAS_RUNTIME))
    : undefined;

  // When no explicit run context is supplied, infer runtime participation from
  // the presence of runtime evidence records.
  const runtimeSelected = explicitRuntimeSelected ?? runtimeEvidence.length > 0;

  if (!runtimeSelected) {
    return {
      analysis: 'NOT_ANALYZED',
      result: runContext ? 'RUNTIME_NOT_SELECTED' : 'NOT_RUNTIME_VALIDATED',
      runtimeEvidence,
      staticEvidence,
    };
  }

  if (runtimeEvidence.length === 0) {
    return {
      analysis: 'ANALYZED',
      result: runContext ? 'RUNTIME_SELECTED_EMPTY' : 'NOT_RUNTIME_VALIDATED',
      runtimeEvidence,
      staticEvidence,
    };
  }

  const representative = runtimeEvidence[0];
  const po = representative.producerOutcome;
  const cs = representative.coverageStatus;

  if (po === 'FAILED' || po === 'TIMEOUT' || po === 'CANCELLED') {
    return { analysis: 'PARTIAL', result: 'RUNTIME_FAILED', runtimeEvidence, staticEvidence };
  }
  if (po === 'PARTIAL' || cs === 'PARTIAL') {
    return { analysis: 'PARTIAL', result: 'RUNTIME_PARTIAL', runtimeEvidence, staticEvidence };
  }
  if (cs === 'UNKNOWN' || cs === 'NOT_ASSESSED') {
    return { analysis: 'PARTIAL', result: 'RUNTIME_PARTIAL', runtimeEvidence, staticEvidence };
  }

  return { analysis: 'ANALYZED', result: 'RUNTIME_EVIDENCE_PRESENT', runtimeEvidence, staticEvidence };
}

function buildRuntimeValidatedDifferential(
  _readModel: AgentReachabilityReadModel,
  _data: PersistedOperationCoverageIntelligence,
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
): ActionAssuranceSurface {
  const { analysis, result, runtimeEvidence, staticEvidence } = deriveRuntimeState(projectedEvidence, runContext);

  const evidenceCount = runtimeEvidence.length;
  const evidenceRefs = runtimeEvidence.map((e) => e.evidenceId).slice(0, MAX_SURFACE_REFS);
  const findingRefs = runtimeEvidence.flatMap((e) => e.findingRefs).slice(0, MAX_SURFACE_REFS);

  const summary = `Runtime-validated differential: ${runtimeEvidence.length} runtime evidence projection(s), ${staticEvidence.length} static evidence projection(s). Exact static/runtime action correspondence not established by the available producers.`;

  const limitations = [
    'STATIC_PATH != RUNTIME_OCCURRENCE',
    'NOT_RUNTIME_VALIDATED != RUNTIME_SAFE',
    'NO_RUNTIME_EVIDENCE != NO_OBSERVED_EFFECT',
    'RUNTIME_EVIDENCE_PRESENT != ACTION_OBSERVED',
    'GENERIC_RUNTIME_TRACE != OBSERVED_CAPABILITY',
    'RUNTIME_TEST_EXECUTED != STATIC_RELATION_CONFIRMED',
    'EXACT_CROSS_PLANE_COMPARATOR_NOT_AVAILABLE',
    'RUNTIME_NOT_SELECTED != RUNTIME_SELECTED_BUT_EMPTY',
    'RUNTIME_FAILED != RUNTIME_NOT_ANALYZED',
  ];

  const base = buildSurfaceBase(
    'RUNTIME_VALIDATED_DIFFERENTIAL',
    'Runtime-Validated Differential',
    analysis,
    result,
    result === 'RUNTIME_NOT_SELECTED'
      ? 'RUNTIME_EVIDENCE_NOT_INCLUDED_IN_EVALUATED_SCOPE'
      : 'RUNTIME_EVIDENCE_PRESENT_WITHOUT_EXACT_CROSS_PLANE_COMPARATOR',
    0,
    [],
    summary,
    limitations,
    'Exact-run DecisionEvidenceProjection filtered by saas-runtime and saas-static producer IDs; ActionAssuranceRunContext',
    evidenceRefs,
  );

  return { ...base, evidenceCount, findingRefs, findingCount: findingRefs.length };
}

// ─── Surface assembly and report builder ────────────────────────────────────

function buildAllSurfaces(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
  projectedEvidence: DecisionEvidenceProjection[],
  runContext: ActionAssuranceRunContext | undefined,
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
    buildEvidenceSufficiencyUncertainty(readModel, data, projectedEvidence, runContext),
    buildRuntimeValidatedDifferential(readModel, data, projectedEvidence, runContext),
  ];

  return surfaces.slice(0, MAX_SURFACES);
}

function buildCoverageSummary(
  readModel: AgentReachabilityReadModel,
): ActionAssuranceReportSection['coverage'] {
  return readModel.coverage.items.map((c) => ({
    family: c.family,
    state: c.state,
    limitations: c.limitations.slice(0, 8),
  }));
}

export function buildActionAssuranceSectionFromReadModel(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
  provenance: SourceProvenance,
  projectedEvidence: DecisionEvidenceProjection[] = [],
  runContext?: ActionAssuranceRunContext,
): ActionAssuranceReportSection {
  if (readModel.availability === 'NOT_AVAILABLE') {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: mapAriUnavailableReason(readModel.unavailableReason),
      scanId: readModel.scanId,
      commitSha: readModel.commitSha,
      summary: {
        surfaceCount: 0,
        agentCount: 0,
        relationCount: 0,
        frontierCount: 0,
        coverageFamilyCount: 0,
      },
      surfaces: [],
      coverage: [],
      coverageLimitations: [
        'NO_HISTORICAL_BINDING -> NOT_AVAILABLE',
        'CURRENT_REPOSITORY_TRACE != EVALUATED_REPOSITORY_TRACE',
      ],
      surfacesShown: 0,
      totalSurfaces: MAX_SURFACES,
      // No evaluated coverage — no path-level truth exists to report.
      pathLevelCodeCapability: undefined,
    };
  }

  const surfaces = buildAllSurfaces(readModel, data, projectedEvidence, runContext);

  // AA-FLAGSHIP-HARDENING-1: path-level code-capability truth in the same
  // grain the reporting bundle's actionPaths carry — handler-operation
  // relation state maps to path-level CODE_CAPABLE via the canonical
  // state mapping (ESTABLISHED -> ESTABLISHED; CANDIDATE -> PARTIAL;
  // everything else -> UNKNOWN/NOT_ASSESSED).
  const handlerOps = data.handlerOperationRelations ?? [];
  const pathLevelCodeCapability = {
    totalActionPaths: handlerOps.length,
    codeCapableEstablishedPaths: handlerOps.filter((r) => r.state === 'ESTABLISHED').length,
    codeCapablePartialPaths: handlerOps.filter((r) => r.state === 'CANDIDATE').length,
  };

  const agentCount = readModel.agents.total;
  const relationCount = surfaces.reduce((sum, s) => sum + (s.relationCount ?? 0), 0);
  const frontierCount = surfaces.filter(
    (s) => s.resultState === 'PRODUCER_FRONTIER' || s.resultState === 'PARTIAL' || s.resultState === 'UNKNOWN',
  ).length;

  return {
    availability: readModel.availability,
    scanId: provenance.scanId,
    commitSha: provenance.commitSha,
    summary: {
      surfaceCount: surfaces.length,
      agentCount,
      relationCount,
      frontierCount,
      coverageFamilyCount: readModel.coverage.total,
    },
    surfaces,
    coverage: buildCoverageSummary(readModel),
    coverageLimitations: readModel.frontiers.items.map((f) => `${f.dimension}: ${f.reason}`).slice(0, 16),
    surfacesShown: surfaces.length,
    totalSurfaces: MAX_SURFACES,
    pathLevelCodeCapability,
  };
}

function mapAriUnavailableReason(
  reason: string | undefined,
):
  | 'EVALUATED_SCAN_BINDING_NOT_CAPTURED'
  | 'EVALUATED_RUN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_IDENTITY_MISMATCH'
  | 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE'
  | 'ARI_NOT_PRESENT_IN_SNAPSHOT'
  | 'ARI_NOT_ANALYZED'
  | 'EVALUATED_SNAPSHOT_INVALID'
  | 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED'
  | 'SECTION_BUILD_FAILED' {
  switch (reason) {
    case 'ARI_NOT_PRESENT_IN_SNAPSHOT':
    case 'ARI_NOT_ANALYZED':
    case 'EVALUATED_SCAN_HAS_NO_OPERATION_COVERAGE':
    case 'EVALUATED_SCAN_BINDING_NOT_CAPTURED':
    case 'EVALUATED_RUN_IDENTITY_MISMATCH':
    case 'EVALUATED_SCAN_IDENTITY_MISMATCH':
    case 'EVALUATED_SNAPSHOT_INVALID':
    case 'AUTHORITY_PROMOTION_INVARIANT_VIOLATED':
      return reason;
    default:
      return 'SECTION_BUILD_FAILED';
  }
}

export async function buildActionAssuranceReportSection(
  evaluation: AssuranceEvaluation,
  projectedEvidence?: DecisionEvidenceProjection[],
  runContext?: ActionAssuranceRunContext,
): Promise<ActionAssuranceReportSection> {
  function unavailable(reason: 'SECTION_BUILD_FAILED'): ActionAssuranceReportSection {
    return {
      availability: 'NOT_AVAILABLE',
      unavailableReason: reason,
      scanId: undefined,
      commitSha: null,
    };
  }

  try {
    const result = await loadEvaluatedOperationCoverage(evaluation);
    if (!('data' in result)) {
      return {
        availability: 'NOT_AVAILABLE',
        unavailableReason: mapAriUnavailableReason(result.unavailableReason),
        scanId: result.scanId,
        commitSha: result.commitSha ?? null,
      };
    }

    const readModel = buildAgentReachabilityReadModel(result.data, {
      scanId: result.scanId,
      commitSha: result.commitSha,
    });

    return buildActionAssuranceReportSectionFromSnapshot(readModel, result.data, result.scanId, result.commitSha);
  } catch {
    return unavailable('SECTION_BUILD_FAILED');
  }
}

/**
 * Build the Action Assurance section from an already-built
 * AgentReachabilityReadModel and validated coverage snapshot. No database access.
 */
export function buildActionAssuranceReportSectionFromSnapshot(
  readModel: AgentReachabilityReadModel,
  data: PersistedOperationCoverageIntelligence,
  scanId: string,
  commitSha: string | null,
): ActionAssuranceReportSection {
  return buildActionAssuranceSectionFromReadModel(readModel, data, { scanId, commitSha }, [], undefined);
}
