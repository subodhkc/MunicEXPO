/**
 * Consequence Delta — canonical comparison contract and pure comparator.
 *
 * Compares the evaluated consequence/action intelligence of TWO persisted,
 * COMPLETED Assurance evaluations of the SAME AI system — the snapshots
 * loaded by the canonical evaluated-scan loader, never rendered artifacts.
 *
 * Directional: BASELINE → CANDIDATE. Not a symmetric set diff.
 *
 * LOCKS:
 *   DELTA_DIRECTIONAL = YES
 *   RUNTIME_ABSENT != CONSEQUENCE_REMOVED
 *   UNKNOWN != REMOVED
 *   NOT_ASSESSED != REMOVED
 *   PARTIAL_COVERAGE != PROOF_OF_ABSENCE
 *   COMPARISON_KEY != CANONICAL_ENTITY_IDENTITY
 *   AGENT_CANDIDATE != CANONICAL_AGENT_IDENTITY
 *   EVIDENCE_CHANGE != CONSEQUENCE_CHANGE (default EVIDENCE_CHANGED)
 *   PARTIAL_COMPARABILITY != EXACT_COMPARABILITY
 *   DELTA != U5_DISPOSITION (no disposition recomputation, no score)
 *   DETERMINISTIC_INPUTS => DETERMINISTIC_BYTES
 */

import type {
  PersistedOperationCoverageIntelligence,
} from '@/lib/ai-security/operation-coverage-read';
import type {
  AriCoverageFamily,
  AriCoverageState,
  AriResourceIdentity,
} from '@/lib/ai-security/types';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

export const CONSEQUENCE_DELTA_SCHEMA_VERSION = 'consequence-delta-1.0.0';

// ─── Contract vocabulary (MunichTech handoff §6) ─────────────────────────────

export type ConsequenceDeltaAvailability = 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';

export type ConsequenceDeltaUnavailableReason =
  | 'BASELINE_EVALUATION_NOT_FOUND'
  | 'CANDIDATE_EVALUATION_NOT_FOUND'
  | 'BASELINE_EVALUATION_NOT_COMPLETED'
  | 'CANDIDATE_EVALUATION_NOT_COMPLETED'
  | 'CROSS_ORGANIZATION_COMPARISON'
  | 'CROSS_AI_SYSTEM_COMPARISON'
  | 'SAME_EVALUATION_COMPARISON'
  | 'INVALID_COMPARISON_ORDER'
  | 'BASELINE_SNAPSHOT_NOT_AVAILABLE'
  | 'CANDIDATE_SNAPSHOT_NOT_AVAILABLE'
  | 'BASELINE_SNAPSHOT_INVALID'
  | 'CANDIDATE_SNAPSHOT_INVALID'
  | 'COMPARISON_BUILD_FAILED';

export type DeltaKind =
  | 'ADDED'
  | 'REMOVED'
  | 'EXPANDED'
  | 'NARROWED'
  | 'CONTROL_CHANGED'
  | 'DEPENDENCY_CHANGED'
  | 'EVIDENCE_CHANGED'
  | 'UNRESOLVED_DELTA';

export type DeltaDimension =
  | 'ACTION_CONSEQUENCE'
  | 'RESOURCE_REACHABILITY'
  | 'SERVICE_REACHABILITY'
  | 'AGENT_REACHABILITY'
  | 'SHARED_SUBSTRATE'
  | 'APPROVAL_CONTROL'
  | 'EGRESS'
  | 'SUPPLY_CHAIN'
  | 'MEMORY_CONTEXT'
  | 'DEFERRED_EXECUTION'
  | 'EVALUATION_INTEGRITY'
  | 'EVIDENCE_COVERAGE';

export type DeltaComparisonState = 'ESTABLISHED' | 'PARTIAL' | 'UNRESOLVED';

export type DeltaIdentityBasis =
  | 'CANONICAL_ACTION_RESOURCE'
  | 'EXACT_RESOURCE_KEY'
  | 'SYMBOLIC_RESOURCE_KEY'
  | 'EXACT_SERVICE_OPERATION'
  | 'EXACT_EGRESS_DESTINATION'
  | 'EXACT_SUPPLY_CHAIN_COMPONENT'
  | 'SOURCE_QUALIFIED_CONSEQUENCE'
  | 'SOURCE_ANCHOR_PARTIAL'
  | 'UNRESOLVED';

export interface SnapshotIdentity {
  evaluationId: string;
  orchestratorRunId: string;
  scanId: string;
  commitSha: string | null;
  operationCoverageSchemaVersion: string;
  evaluatedScopeSchemaVersion?: string;
  evaluatedScopeDigest?: string;
  organizationId: string;
  aiSystemId: string;
  packageId?: string;
  semanticPackageDigest?: string;
  semanticReportDigest?: string;
  receiptHash?: string;
}

export interface ConsequenceDeltaItem {
  id: string;
  kind: DeltaKind;
  dimension: DeltaDimension;
  comparisonState: DeltaComparisonState;
  identityBasis: DeltaIdentityBasis;
  /** Internal comparison key — sanitized, never a canonical entity id. */
  semanticKey: string;
  title: string;
  summary: string;
  baselineState?: string;
  candidateState?: string;
  baselineRelationRefs: string[];
  candidateRelationRefs: string[];
  baselineResourceRefs: string[];
  candidateResourceRefs: string[];
  baselineSourceRefs: string[];
  candidateSourceRefs: string[];
  limitations: string[];
  consequenceLabel?: string;
  resourceLabel?: string;
  serviceLabel?: string;
  controlStageBefore?: string;
  controlStageAfter?: string;
  dependencyBefore?: string;
  dependencyAfter?: string;
}

export interface DeltaCoverageRecord {
  dimension: DeltaDimension;
  baselineCoverage: string;
  candidateCoverage: string;
  comparisonCoverage: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  limitations: string[];
}

export interface ConsequenceDeltaScopeComparison {
  state: 'SAME' | 'CHANGED' | 'NOT_AVAILABLE';
  baselineScopeSchemaVersion?: string;
  candidateScopeSchemaVersion?: string;
  baselineScopeDigest?: string;
  candidateScopeDigest?: string;
  limitations: string[];
}

export interface DeltaAnalyzerComparability {
  /**
   * EXACT may only be emitted when the canonical analyzer identity owner
   * supplies actual comparable exact build identity data AND the baseline
   * identity equals the target identity per that owner. A boolean
   * availability flag is not identity equality:
   *   EXACT_AVAILABLE_BOOLEAN != EXACT_IDENTITY_EQUALITY
   * Today no such data is persisted, so EXACT is unreachable.
   */
  state: 'EXACT' | 'PARTIAL' | 'UNRESOLVED' | 'NOT_COMPARABLE';
  exactAnalyzerBuildIdentityAvailable: boolean;
  knownFragments: {
    baselineCoverageSchemaVersion: string;
    candidateCoverageSchemaVersion: string;
    baselineArchetypeProducerId: string;
    candidateArchetypeProducerId: string;
    baselineArchetypeSchemaVersion: string;
    candidateArchetypeSchemaVersion: string;
  };
  limitations: string[];
}

export interface DeltaComparisonContext {
  baselineEvaluationSnapshotAt: string;
  candidateEvaluationSnapshotAt: string;
  scopeComparison: ConsequenceDeltaScopeComparison;
  baselineAssuranceMethodologyVersion?: string;
  candidateAssuranceMethodologyVersion?: string;
  analyzerComparability?: DeltaAnalyzerComparability;
}

export interface ConsequenceDelta {
  schemaVersion: string;
  deltaId: string;
  availability: ConsequenceDeltaAvailability;
  unavailableReason?: ConsequenceDeltaUnavailableReason;
  baseline?: SnapshotIdentity;
  candidate?: SnapshotIdentity;
  comparisonContext?: DeltaComparisonContext;
  summary?: {
    totalChanges: number;
    added: number;
    removed: number;
    expanded: number;
    narrowed: number;
    controlChanged: number;
    dependencyChanged: number;
    evidenceChanged: number;
    unresolved: number;
  };
  items: ConsequenceDeltaItem[];
  coverage: DeltaCoverageRecord[];
  limitations: string[];
  comparisonDigest?: string;
}

// ─── ComparableFact construction (§7) ────────────────────────────────────────

interface ComparableFact {
  dimension: DeltaDimension;
  semanticKey: string;
  identityBasis: DeltaIdentityBasis;
  state: string;
  coverageState: string;
  relationRefs: string[];
  resourceRefs: string[];
  sourceRefs: string[];
  /** Agent-candidate subject anchors cap comparison at PARTIAL. */
  subjectAnchor?: string;
  consequenceLabel?: string;
  resourceLabel?: string;
  serviceLabel?: string;
  controlStage?: string;
  dependencyIdentity?: string;
  limitations: string[];
}

const n = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : '-');

function scopeKey(scope?: {
  environment?: string; provider?: string; cloudAccountOrProject?: string;
  region?: string; tenant?: string; namespace?: string; workload?: string; partition?: string;
}): string {
  if (!scope) return '';
  return [
    n(scope.environment), n(scope.provider), n(scope.cloudAccountOrProject),
    n(scope.region), n(scope.tenant), n(scope.namespace),
    n(scope.workload), n(scope.partition),
  ].join('/');
}

function resourceKeyPart(resource?: AriResourceIdentity): { key: string; basis: DeltaIdentityBasis; ref: string } {
  if (!resource) return { key: 'unresolved', basis: 'UNRESOLVED', ref: '' };
  if (resource.resolution === 'EXACT' && resource.key) {
    return { key: `exact:${resource.key}:${scopeKey(resource.scope)}`, basis: 'EXACT_RESOURCE_KEY', ref: resource.key };
  }
  if (resource.resolution === 'SYMBOLIC' && (resource.key || resource.sourceBasis)) {
    const k = resource.key ?? resource.sourceBasis ?? 'symbolic';
    return { key: `symbolic:${k}:${scopeKey(resource.scope)}`, basis: 'SYMBOLIC_RESOURCE_KEY', ref: k };
  }
  return { key: `unresolved:${n(resource.displayName)}`, basis: 'UNRESOLVED', ref: resource.displayName ?? '' };
}

function subjectAnchorOf(subject?: { kind: string; id: string; displayName?: string }): string | undefined {
  if (!subject) return undefined;
  // Agent candidate ids are scan-local. Display name + kind is a comparison
  // hint only — never canonical identity (LOCK: AGENT_CANDIDATE != CANONICAL).
  if (subject.kind === 'AGENT') return `agent:${n(subject.displayName)}`;
  return `${subject.kind.toLowerCase()}:${subject.id}`;
}

/**
 * Build deterministic ComparableFact records from a persisted operation-
 * coverage snapshot. Facts are keyed by semantic identity — never by
 * relation id, array position, or display label.
 */
export function buildComparableFacts(
  snapshot: PersistedOperationCoverageIntelligence,
): ComparableFact[] {
  const facts: ComparableFact[] = [];

  // ACTION_CONSEQUENCE — handler → consequential operation. Sink target
  // semantics (kind/api/resourceTarget) are the cross-scan basis; a bare
  // targetId is scan-local.
  for (const op of snapshot.handlerOperationRelations ?? []) {
    const sink = op.sinkTargetRef;
    const targetPart = op.targetKind === 'SINK' && sink
      ? `sink:${n(sink.kind)}:${n(sink.api)}:${n(sink.resourceTarget)}`
      : `${n(op.targetKind)}:${n(op.targetId)}`;
    const handlerPart = n(op.handlerRef || op.handlerFunctionId);
    facts.push({
      dimension: 'ACTION_CONSEQUENCE',
      semanticKey: `hco|${handlerPart}|${targetPart}`,
      identityBasis: 'SOURCE_QUALIFIED_CONSEQUENCE',
      state: op.state,
      coverageState: 'ANALYZED',
      relationRefs: [op.id],
      resourceRefs: sink?.resourceTarget ? [sink.resourceTarget] : [],
      sourceRefs: [...(op.sourceRefs ?? [])].sort(),
      consequenceLabel: `${op.targetKind ?? 'OPERATION'} ${sink?.api ?? ''}`.trim(),
      limitations: [...(op.limitations ?? [])].sort(),
    });
  }

  // RESOURCE_REACHABILITY — subject → resource access.
  for (const rel of snapshot.resourceAccessRelations ?? []) {
    const rk = resourceKeyPart(rel.resource);
    facts.push({
      dimension: 'RESOURCE_REACHABILITY',
      semanticKey: `res|${n(rel.accessType)}|${n(rel.surface)}|${rk.key}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: rk.basis,
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: rel.sourceRelationId ? [rel.sourceRelationId] : [],
      subjectAnchor: subjectAnchorOf(rel.subject),
      resourceLabel: rel.resource?.displayName,
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // SERVICE_REACHABILITY — provider/service operation + resource basis.
  for (const rel of snapshot.serviceCallRelations ?? []) {
    const rk = resourceKeyPart(rel.resource);
    const exactSvc = rel.provider && rel.operation && rk.basis === 'EXACT_RESOURCE_KEY';
    facts.push({
      dimension: 'SERVICE_REACHABILITY',
      semanticKey: `svc|${n(rel.provider)}|${n(rel.serviceContext)}|${n(rel.operation)}|${rk.key}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: exactSvc ? 'EXACT_SERVICE_OPERATION'
        : rk.basis === 'UNRESOLVED' ? 'UNRESOLVED' : 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: rel.sourceRelationId ? [rel.sourceRelationId] : [],
      subjectAnchor: subjectAnchorOf(rel.subject),
      serviceLabel: [rel.provider, rel.serviceContext, rel.operation].filter(Boolean).join('/'),
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // AGENT_REACHABILITY — agent→tool relationships. Agent candidate ids are
  // scan-local; the comparison hint is the source-declared name anchor.
  for (const rel of snapshot.agentRelationshipRelations ?? []) {
    const agents = snapshot.agentCandidates ?? [];
    const fromAgent = agents.find((a) => a.id === rel.fromAgentCandidateId);
    const toTool = (snapshot.toolCandidates ?? []).find((t) => t.id === rel.toToolCandidateId);
    facts.push({
      dimension: 'AGENT_REACHABILITY',
      semanticKey: `agent|${n(rel.kind)}|${n(fromAgent?.name)}|${n(toTool?.name)}`,
      identityBasis: 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [],
      sourceRefs: [],
      subjectAnchor: `agent:${n(fromAgent?.name)}`,
      limitations: [
        ...(rel.limitations ?? []),
        'AGENT_CANDIDATE != CANONICAL_AGENT_IDENTITY — comparison anchored on source-declared name, not runtime identity.',
      ].sort(),
    });
  }

  // APPROVAL_CONTROL — approval stage bound to a consequence; integrity
  // pairs (mediated vs unmediated path to the same consequence).
  for (const rel of snapshot.approvalControlRelations ?? []) {
    facts.push({
      dimension: 'APPROVAL_CONTROL',
      semanticKey: `appr|${n(rel.consequenceKind)}|${n(rel.consequenceId)}`,
      identityBasis: rel.consequenceId ? 'CANONICAL_ACTION_RESOURCE' : 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [],
      sourceRefs: [rel.handlerOperationRelationId].filter(Boolean) as string[],
      consequenceLabel: rel.consequenceKind,
      controlStage: rel.controlStage,
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }
  for (const rel of snapshot.approvalIntegrityRelations ?? []) {
    facts.push({
      dimension: 'APPROVAL_CONTROL',
      semanticKey: `apprint|${n(rel.consequenceKind)}|${n(rel.consequenceId)}`,
      identityBasis: rel.consequenceId ? 'CANONICAL_ACTION_RESOURCE' : 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [],
      sourceRefs: [rel.mediatedHandlerOperationId, rel.unmediatedHandlerOperationId].filter(Boolean) as string[],
      consequenceLabel: rel.consequenceKind,
      controlStage: 'INTEGRITY_PAIR',
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // EGRESS — declared destination. SOURCE_DECLARED_EGRESS != DESTINATION_REACHED.
  for (const rel of snapshot.egressRelations ?? []) {
    facts.push({
      dimension: 'EGRESS',
      semanticKey: `egress|${n(rel.destinationRef)}|${n(rel.destinationClass)}|${n(rel.declaredVia)}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: rel.destinationResolution === 'EXACT' ? 'EXACT_EGRESS_DESTINATION'
        : rel.destinationResolution === 'UNRESOLVED' ? 'UNRESOLVED' : 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [rel.destinationRef],
      sourceRefs: [],
      subjectAnchor: subjectAnchorOf(rel.subject),
      resourceLabel: rel.destinationRef,
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // SUPPLY_CHAIN — component kind + normalized reference + version/digest.
  for (const rel of snapshot.toolSupplyChainRelations ?? []) {
    facts.push({
      dimension: 'SUPPLY_CHAIN',
      semanticKey: `sc|${n(rel.componentKind)}|${n(rel.reference)}`,
      identityBasis: rel.versionOrDigest ? 'EXACT_SUPPLY_CHAIN_COMPONENT' : 'SOURCE_ANCHOR_PARTIAL',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [rel.reference],
      sourceRefs: [],
      dependencyIdentity: rel.versionOrDigest ?? 'UNRESOLVED',
      resourceLabel: rel.reference,
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // MEMORY_CONTEXT — memory access, lineage, model-context influence.
  for (const rel of snapshot.memoryAccessRelations ?? []) {
    const rk = resourceKeyPart(rel.resourceIdentity);
    facts.push({
      dimension: 'MEMORY_CONTEXT',
      semanticKey: `mem|${n(rel.accessKind)}|${rk.key}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: rk.basis,
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: [rel.sourceRelationId].filter(Boolean) as string[],
      subjectAnchor: subjectAnchorOf(rel.subject),
      resourceLabel: rel.resourceIdentity?.displayName,
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }
  for (const rel of snapshot.memoryLineageRelations ?? []) {
    const rk = resourceKeyPart(rel.resourceIdentity);
    facts.push({
      dimension: 'MEMORY_CONTEXT',
      semanticKey: `memlin|${n(rel.influenceKind)}|${rk.key}`,
      identityBasis: rk.basis,
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: [],
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }
  for (const rel of snapshot.modelContextInfluenceRelations ?? []) {
    const rk = resourceKeyPart(rel.resourceIdentity);
    facts.push({
      dimension: 'MEMORY_CONTEXT',
      semanticKey: `ctx|${n(rel.influenceKind)}|${n(rel.stage)}|${n(rel.sourceRef)}|${rk.key}`,
      identityBasis: rk.basis === 'UNRESOLVED' ? 'SOURCE_ANCHOR_PARTIAL' : rk.basis,
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: [rel.sourceRef],
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // DEFERRED_EXECUTION — deferred trigger + persistence creation.
  for (const rel of snapshot.deferredExecutionRelations ?? []) {
    const rk = resourceKeyPart(rel.deferredResource);
    facts.push({
      dimension: 'DEFERRED_EXECUTION',
      semanticKey: `def|${n(rel.triggerKind)}|${rk.key}`,
      identityBasis: rk.basis,
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rk.ref ? [rk.ref] : [],
      sourceRefs: [rel.creationSourceRelationId, rel.consumerSourceRelationId].filter(Boolean) as string[],
      limitations: [
        ...(rel.limitations ?? []),
        'SCHEDULED != EXECUTED — deferred semantics are source-qualified only.',
      ].sort(),
    });
  }
  for (const rel of snapshot.persistenceCreationRelations ?? []) {
    facts.push({
      dimension: 'DEFERRED_EXECUTION',
      semanticKey: `persist|${n(rel.mechanism)}|${n(rel.targetRef)}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: rel.targetRef ? 'SOURCE_ANCHOR_PARTIAL' : 'UNRESOLVED',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: rel.targetRef ? [rel.targetRef] : [],
      sourceRefs: [],
      subjectAnchor: subjectAnchorOf(rel.subject),
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  // EVALUATION_INTEGRITY — access to evaluation surfaces (exposure only).
  for (const rel of snapshot.evaluationAccessRelations ?? []) {
    facts.push({
      dimension: 'EVALUATION_INTEGRITY',
      semanticKey: `eval|${n(rel.surfaceId)}|${n(rel.accessType)}|${n(subjectAnchorOf(rel.subject))}`,
      identityBasis: 'SOURCE_QUALIFIED_CONSEQUENCE',
      state: rel.state,
      coverageState: 'ANALYZED',
      relationRefs: [rel.id],
      resourceRefs: [rel.surfaceId],
      sourceRefs: [...(rel.viaRelationIds ?? [])].sort(),
      subjectAnchor: subjectAnchorOf(rel.subject),
      limitations: [...(rel.limitations ?? [])].sort(),
    });
  }

  return facts;
}

// ─── Coverage gating (§9) ────────────────────────────────────────────────────

const DIMENSION_COVERAGE_FAMILIES: Record<DeltaDimension, AriCoverageFamily[]> = {
  ACTION_CONSEQUENCE: [],
  RESOURCE_REACHABILITY: ['resourceAccess'],
  SERVICE_REACHABILITY: ['serviceCalls'],
  AGENT_REACHABILITY: ['agentTopology'],
  SHARED_SUBSTRATE: ['sharedSubstrates'],
  APPROVAL_CONTROL: ['approvalIntegrity', 'delegatedAuthority'],
  EGRESS: ['egress'],
  SUPPLY_CHAIN: [],
  MEMORY_CONTEXT: ['memoryLineage', 'modelContextInfluence'],
  DEFERRED_EXECUTION: ['deferredExecution', 'persistenceCreation'],
  EVALUATION_INTEGRITY: ['evaluationSurfaces'],
  EVIDENCE_COVERAGE: [],
};

function weakestCoverage(states: AriCoverageState[]): AriCoverageState {
  const order: AriCoverageState[] = ['NOT_ANALYZED', 'UNKNOWN', 'UNSUPPORTED', 'PARTIAL', 'ANALYZED'];
  let weakest: AriCoverageState = 'ANALYZED';
  for (const s of states) {
    if (order.indexOf(s) < order.indexOf(weakest)) weakest = s;
  }
  return weakest;
}

/** Family coverage state for a dimension; 'UNKNOWN' when not recorded. */
export function dimensionCoverageState(
  snapshot: PersistedOperationCoverageIntelligence,
  dimension: DeltaDimension,
): AriCoverageState {
  if (dimension === 'ACTION_CONSEQUENCE') {
    const records = snapshot.handlerOperationCoverage ?? [];
    if (records.length === 0) return 'UNKNOWN';
    return weakestCoverage(records.map((r) =>
      r.state === 'FULLY_ANALYZED' ? 'ANALYZED'
        : r.state === 'NOT_ANALYZED' ? 'NOT_ANALYZED' : 'PARTIAL'));
  }
  if (dimension === 'SUPPLY_CHAIN') {
    return snapshot.toolSupplyChainCoverage?.state ?? 'UNKNOWN';
  }
  const families = DIMENSION_COVERAGE_FAMILIES[dimension];
  if (families.length === 0) return 'UNKNOWN';
  const states = families.map((f) => snapshot.ariCoverage?.[f]?.state ?? 'UNKNOWN');
  return weakestCoverage(states);
}

/** Adequate coverage for an absence/addition proof (§9 gates). */
function coverageAdequate(state: AriCoverageState): boolean {
  return state === 'ANALYZED';
}

/** Identity bases that can support an ESTABLISHED (strong) delta claim. */
const STRONG_BASES: ReadonlySet<DeltaIdentityBasis> = new Set([
  'CANONICAL_ACTION_RESOURCE',
  'EXACT_RESOURCE_KEY',
  'EXACT_SERVICE_OPERATION',
  'EXACT_EGRESS_DESTINATION',
  'EXACT_SUPPLY_CHAIN_COMPONENT',
  'SOURCE_QUALIFIED_CONSEQUENCE',
]);

function comparisonStateFor(fact: ComparableFact): DeltaComparisonState {
  if (fact.identityBasis === 'UNRESOLVED') return 'UNRESOLVED';
  // Agent-anchored facts can never claim exact cross-scan identity.
  if (fact.subjectAnchor?.startsWith('agent:')) return 'PARTIAL';
  if (STRONG_BASES.has(fact.identityBasis)) return 'ESTABLISHED';
  return 'PARTIAL';
}

// ─── Comparison ──────────────────────────────────────────────────────────────

const KIND_TITLES: Record<DeltaKind, string> = {
  ADDED: 'New consequential path',
  REMOVED: 'No longer established',
  EXPANDED: 'Expanded reach',
  NARROWED: 'Narrowed reach',
  CONTROL_CHANGED: 'Authority changed',
  DEPENDENCY_CHANGED: 'Dependency changed',
  EVIDENCE_CHANGED: 'Evidence changed',
  UNRESOLVED_DELTA: 'Unresolved change',
};

const KIND_SUMMARY: Record<DeltaKind, string> = {
  ADDED: 'Newly established in candidate compared with analyzed baseline.',
  REMOVED: 'No longer established in candidate under comparable analyzed scope.',
  EXPANDED: 'Same comparable consequence now reaches a wider source-qualified scope.',
  NARROWED: 'Same comparable consequence now reaches a narrower source-qualified scope.',
  CONTROL_CHANGED: 'Approval/control evidence changed on the same comparable consequence.',
  DEPENDENCY_CHANGED: 'Dependency identity or version changed under source-qualified comparison.',
  EVIDENCE_CHANGED: 'Evidence or coverage changed without a basis to claim behavior changed.',
  UNRESOLVED_DELTA: 'A potentially meaningful difference exists, but comparison could not be safely established.',
};

function makeItemId(
  baselineScanId: string,
  candidateScanId: string,
  dimension: DeltaDimension,
  kind: DeltaKind,
  semanticKey: string,
): string {
  return 'cdi-' + hashTextContent(canonicalSerialize({
    v: CONSEQUENCE_DELTA_SCHEMA_VERSION,
    b: baselineScanId,
    c: candidateScanId,
    d: dimension,
    k: kind,
    s: semanticKey,
  })).slice(0, 24);
}

interface FactIndex {
  /** semanticKey → deterministic witness set (never overwritten). */
  byKey: Map<string, ComparableFact[]>;
}

function indexFacts(facts: ComparableFact[]): FactIndex {
  const byKey = new Map<string, ComparableFact[]>();
  for (const f of facts) {
    const list = byKey.get(f.semanticKey) ?? [];
    list.push(f);
    byKey.set(f.semanticKey, list);
  }
  // Deterministic witness ordering inside each key group.
  for (const list of byKey.values()) {
    list.sort((a, b) =>
      canonicalSerialize(a.relationRefs).localeCompare(canonicalSerialize(b.relationRefs)));
  }
  return { byKey };
}

function mergeWitness(facts: ComparableFact[]): ComparableFact {
  const sorted = [...facts].sort((a, b) =>
    canonicalSerialize([a.relationRefs, a.sourceRefs, a.state])
      .localeCompare(canonicalSerialize([b.relationRefs, b.sourceRefs, b.state])));
  const first = sorted[0];
  const states = [...new Set(sorted.map((f) => f.state))].sort();
  return {
    ...first,
    state: states.length === 1 ? states[0] : states.join('|'),
    relationRefs: [...new Set(sorted.flatMap((f) => f.relationRefs))].sort(),
    resourceRefs: [...new Set(sorted.flatMap((f) => f.resourceRefs))].sort(),
    sourceRefs: [...new Set(sorted.flatMap((f) => f.sourceRefs))].sort(),
    limitations: [...new Set(sorted.flatMap((f) => f.limitations))].sort(),
  };
}

export interface BuildDeltaInput {
  baseline: {
    identity: SnapshotIdentity;
    snapshot: PersistedOperationCoverageIntelligence;
  };
  candidate: {
    identity: SnapshotIdentity;
    snapshot: PersistedOperationCoverageIntelligence;
  };
  comparisonContext?: DeltaComparisonContext;
  /** Additional limitations to surface (loader reasons, analyzer gaps). */
  limitations?: string[];
}

/**
 * Pure deterministic comparator. No persistence, no wall-clock, no mutation
 * of the input snapshots.
 */
export function buildConsequenceDelta(input: BuildDeltaInput): ConsequenceDelta {
  const { baseline, candidate } = input;
  const limitations = [...(input.limitations ?? [])].sort();

  // P0: Structural change claims (ADDED/REMOVED/EXPANDED/NARROWED) require
  // established scope comparability. Analyzed per-dimension coverage alone
  // does NOT establish comparable scope — different observed topology under
  // incomparable scopes is not proof the system topology itself changed.
  //   SCOPE_CHANGED != PROOF_OF_ADDITION / PROOF_OF_REMOVAL
  //   SCOPE_NOT_AVAILABLE != PROOF_OF_ADDITION / PROOF_OF_REMOVAL
  //   ANALYZED_COVERAGE_ALONE != COMPARABLE_SCOPE
  const scopeComparisonState =
    input.comparisonContext?.scopeComparison.state ?? 'NOT_AVAILABLE';
  const scopeComparable = scopeComparisonState === 'SAME';
  const scopeGateLimitation =
    scopeComparisonState === 'CHANGED'
      ? 'Evaluated scope differs between baseline and target — structural difference cannot be claimed as an actual addition/removal.'
      : 'Evaluated scope is not persisted for one or both evaluations — structural difference cannot be claimed as an actual addition/removal.';

  const baselineFacts = indexFacts(buildComparableFacts(baseline.snapshot));
  const candidateFacts = indexFacts(buildComparableFacts(candidate.snapshot));

  const items: ConsequenceDeltaItem[] = [];
  const allKeys = [...new Set([...baselineFacts.byKey.keys(), ...candidateFacts.byKey.keys()])].sort();

  for (const key of allKeys) {
    const bList = baselineFacts.byKey.get(key);
    const cList = candidateFacts.byKey.get(key);
    const b = bList ? mergeWitness(bList) : undefined;
    const c = cList ? mergeWitness(cList) : undefined;
    const dimension = (b ?? c)!.dimension;
    const baseCov = dimensionCoverageState(baseline.snapshot, dimension);
    const candCov = dimensionCoverageState(candidate.snapshot, dimension);
    const anchorLimit = (b ?? c)!.subjectAnchor?.startsWith('agent:')
      ? ['Agent-anchored comparison is partial: source-declared name anchor, not canonical runtime identity.']
      : [];

    const push = (kind: DeltaKind, extraLimitations: string[] = []) => {
      const fact = (c ?? b)!;
      const cs = kind === 'UNRESOLVED_DELTA' ? 'UNRESOLVED'
        : comparisonStateFor(fact);
      items.push({
        id: makeItemId(baseline.identity.scanId, candidate.identity.scanId, dimension, kind, key),
        kind,
        dimension,
        comparisonState: cs,
        identityBasis: fact.identityBasis,
        semanticKey: key,
        title: KIND_TITLES[kind],
        summary: KIND_SUMMARY[kind],
        baselineState: b?.state,
        candidateState: c?.state,
        baselineRelationRefs: b?.relationRefs ?? [],
        candidateRelationRefs: c?.relationRefs ?? [],
        baselineResourceRefs: b?.resourceRefs ?? [],
        candidateResourceRefs: c?.resourceRefs ?? [],
        baselineSourceRefs: b?.sourceRefs ?? [],
        candidateSourceRefs: c?.sourceRefs ?? [],
        limitations: [...new Set([...fact.limitations, ...anchorLimit, ...extraLimitations])].sort(),
        consequenceLabel: fact.consequenceLabel,
        resourceLabel: fact.resourceLabel,
        serviceLabel: fact.serviceLabel,
        controlStageBefore: b?.controlStage,
        controlStageAfter: c?.controlStage,
        dependencyBefore: b?.dependencyIdentity,
        dependencyAfter: c?.dependencyIdentity,
      });
    };

    if (b && c) {
      // Same comparable semantic fact on both sides.
      if (b.state === c.state &&
          canonicalSerialize(b.resourceRefs) === canonicalSerialize(c.resourceRefs) &&
          b.controlStage === c.controlStage &&
          b.dependencyIdentity === c.dependencyIdentity) {
        continue; // unchanged — not reported
      }
      if (b.controlStage !== c.controlStage) {
        push('CONTROL_CHANGED');
        continue;
      }
      if (b.dependencyIdentity !== c.dependencyIdentity) {
        push('DEPENDENCY_CHANGED');
        continue;
      }
      // Reachable-scope expansion/contraction on an exact basis.
      const bSet = new Set(b.resourceRefs);
      const cSet = new Set(c.resourceRefs);
      const gained = [...cSet].filter((r) => !bSet.has(r));
      const lost = [...bSet].filter((r) => !cSet.has(r));
      if (STRONG_BASES.has(c.identityBasis) && gained.length > 0 && lost.length === 0 && b.state === c.state) {
        if (!scopeComparable) {
          push('UNRESOLVED_DELTA', [scopeGateLimitation]);
        } else {
          push('EXPANDED');
        }
        continue;
      }
      if (STRONG_BASES.has(b.identityBasis) && lost.length > 0 && gained.length === 0 && b.state === c.state) {
        if (!scopeComparable) {
          push('UNRESOLVED_DELTA', [scopeGateLimitation]);
        } else if (!coverageAdequate(candCov)) {
          push('UNRESOLVED_DELTA', ['Candidate coverage is not adequate to prove scope narrowing.']);
        } else {
          push('NARROWED');
        }
        continue;
      }
      // Same fact, different epistemic state → evidence change, not behavior.
      push('EVIDENCE_CHANGED');
      continue;
    }

    if (c && !b) {
      // Candidate-only fact: ADDED requires comparable scope (SAME), baseline
      // coverage adequate to make absence meaningful, AND exact identity.
      if (!scopeComparable) {
        push('UNRESOLVED_DELTA', [scopeGateLimitation]);
      } else if (!coverageAdequate(baseCov)) {
        push('UNRESOLVED_DELTA', [
          `Baseline ${dimension} coverage is ${baseCov} — absence in baseline is not proven.`,
        ]);
      } else if (comparisonStateFor(c) !== 'ESTABLISHED') {
        push('UNRESOLVED_DELTA', [
          'Candidate fact identity is not exact enough to establish a new consequence claim.',
        ]);
      } else {
        push('ADDED');
      }
      continue;
    }

    if (b && !c) {
      // Baseline-only fact: REMOVED requires comparable scope (SAME) AND
      // candidate coverage adequate to make absence meaningful.
      if (!scopeComparable) {
        push('UNRESOLVED_DELTA', [scopeGateLimitation]);
      } else if (!coverageAdequate(candCov)) {
        push('UNRESOLVED_DELTA', [
          `Candidate ${dimension} coverage is ${candCov} — absence in candidate is not proven.`,
        ]);
      } else if (comparisonStateFor(b) !== 'ESTABLISHED') {
        push('UNRESOLVED_DELTA', [
          'Baseline fact identity is not exact enough to establish a removal claim.',
        ]);
      } else {
        push('REMOVED');
      }
    }
  }

  // ─── Coverage transitions → EVIDENCE_COVERAGE records + items ───────────
  const coverage: DeltaCoverageRecord[] = [];
  const coverageDimensions: DeltaDimension[] = [
    'ACTION_CONSEQUENCE', 'RESOURCE_REACHABILITY', 'SERVICE_REACHABILITY',
    'AGENT_REACHABILITY', 'SHARED_SUBSTRATE', 'APPROVAL_CONTROL', 'EGRESS',
    'SUPPLY_CHAIN', 'MEMORY_CONTEXT', 'DEFERRED_EXECUTION', 'EVALUATION_INTEGRITY',
  ];
  for (const dimension of coverageDimensions) {
    const bCov = dimensionCoverageState(baseline.snapshot, dimension);
    const cCov = dimensionCoverageState(candidate.snapshot, dimension);
    const comparisonCoverage =
      bCov === 'ANALYZED' && cCov === 'ANALYZED' ? 'ESTABLISHED'
        : bCov === 'ANALYZED' || cCov === 'ANALYZED' ? 'PARTIAL' : 'NOT_AVAILABLE';
    coverage.push({
      dimension,
      baselineCoverage: bCov,
      candidateCoverage: cCov,
      comparisonCoverage,
      limitations: comparisonCoverage === 'ESTABLISHED' ? [] : [
        `Coverage is not fully analyzed on both sides for ${dimension}; absence claims are gated.`,
      ],
    });
    if (bCov !== cCov) {
      const key = `coverage|${dimension}`;
      items.push({
        id: makeItemId(baseline.identity.scanId, candidate.identity.scanId, 'EVIDENCE_COVERAGE', 'EVIDENCE_CHANGED', key),
        kind: 'EVIDENCE_CHANGED',
        dimension: 'EVIDENCE_COVERAGE',
        comparisonState: 'ESTABLISHED',
        identityBasis: 'CANONICAL_ACTION_RESOURCE',
        semanticKey: key,
        title: 'Coverage changed',
        summary: `${dimension} analysis coverage changed between evaluations (${bCov} → ${cCov}). This is an evidence-quality change, not a consequence change.`,
        baselineState: bCov,
        candidateState: cCov,
        baselineRelationRefs: [],
        candidateRelationRefs: [],
        baselineResourceRefs: [],
        candidateResourceRefs: [],
        baselineSourceRefs: [],
        candidateSourceRefs: [],
        limitations: ['COVERAGE_CHANGE != CONSEQUENCE_CHANGE'],
      });
    }
  }

  // Deterministic ordering: dimension → semanticKey → kind → summary.
  items.sort((a, b) =>
    [a.dimension, a.semanticKey, a.kind, a.summary].join('')
      .localeCompare([b.dimension, b.semanticKey, b.kind, b.summary].join('')));

  const summary = {
    totalChanges: items.length,
    added: items.filter((i) => i.kind === 'ADDED').length,
    removed: items.filter((i) => i.kind === 'REMOVED').length,
    expanded: items.filter((i) => i.kind === 'EXPANDED').length,
    narrowed: items.filter((i) => i.kind === 'NARROWED').length,
    controlChanged: items.filter((i) => i.kind === 'CONTROL_CHANGED').length,
    dependencyChanged: items.filter((i) => i.kind === 'DEPENDENCY_CHANGED').length,
    evidenceChanged: items.filter((i) => i.kind === 'EVIDENCE_CHANGED').length,
    unresolved: items.filter((i) => i.kind === 'UNRESOLVED_DELTA').length,
  };

  // ESTABLISHED requires fully analyzed coverage on all dimensions AND exact
  // analyzer comparability. Anything less (PARTIAL / UNRESOLVED /
  // NOT_COMPARABLE / absent) degrades the delta to PARTIAL.
  const availability: ConsequenceDeltaAvailability =
    coverage.every((c) => c.comparisonCoverage === 'ESTABLISHED') &&
    input.comparisonContext?.analyzerComparability?.state === 'EXACT'
      ? 'ESTABLISHED'
      : 'PARTIAL';

  const deltaId = 'cd-' + hashTextContent(canonicalSerialize({
    v: CONSEQUENCE_DELTA_SCHEMA_VERSION,
    b: baseline.identity.evaluationId,
    c: candidate.identity.evaluationId,
    bs: baseline.identity.scanId,
    cs: candidate.identity.scanId,
  })).slice(0, 24);

  // P4: the semantic digest binds every interpretation-bearing comparison
  // context, not only the resulting items — scope comparability, coverage
  // state, and analyzer provenance all change the meaning of identical item
  // sets, so identical items under different context are different deltas.
  // Deterministic inputs only — no Date.now()/render/request timestamps.
  const comparisonDigest = hashTextContent(canonicalSerialize({
    schemaVersion: CONSEQUENCE_DELTA_SCHEMA_VERSION,
    organizationId: baseline.identity.organizationId,
    aiSystemId: baseline.identity.aiSystemId,
    baseline: {
      evaluationId: baseline.identity.evaluationId,
      orchestratorRunId: baseline.identity.orchestratorRunId,
      scanId: baseline.identity.scanId,
      commitSha: baseline.identity.commitSha,
      operationCoverageSchemaVersion: baseline.identity.operationCoverageSchemaVersion,
      evaluatedScopeSchemaVersion: baseline.identity.evaluatedScopeSchemaVersion,
      evaluatedScopeDigest: baseline.identity.evaluatedScopeDigest,
    },
    candidate: {
      evaluationId: candidate.identity.evaluationId,
      orchestratorRunId: candidate.identity.orchestratorRunId,
      scanId: candidate.identity.scanId,
      commitSha: candidate.identity.commitSha,
      operationCoverageSchemaVersion: candidate.identity.operationCoverageSchemaVersion,
      evaluatedScopeSchemaVersion: candidate.identity.evaluatedScopeSchemaVersion,
      evaluatedScopeDigest: candidate.identity.evaluatedScopeDigest,
    },
    methodologyVersions: {
      baseline: input.comparisonContext?.baselineAssuranceMethodologyVersion ?? null,
      candidate: input.comparisonContext?.candidateAssuranceMethodologyVersion ?? null,
    },
    scopeComparison: input.comparisonContext?.scopeComparison ?? { state: 'NOT_AVAILABLE', limitations: [] },
    analyzerComparability: input.comparisonContext?.analyzerComparability ?? null,
    items: items.map((i) => ({
      dimension: i.dimension,
      kind: i.kind,
      semanticKey: i.semanticKey,
      comparisonState: i.comparisonState,
      baselineState: i.baselineState,
      candidateState: i.candidateState,
    })),
    coverage,
    limitations,
  }));

  return {
    schemaVersion: CONSEQUENCE_DELTA_SCHEMA_VERSION,
    deltaId,
    availability,
    baseline: baseline.identity,
    candidate: candidate.identity,
    comparisonContext: input.comparisonContext,
    summary,
    items,
    coverage,
    limitations,
    comparisonDigest,
  };
}

/** Deterministic canonical byte form for evidence packaging. */
export function canonicalDeltaBytes(delta: ConsequenceDelta): string {
  return canonicalSerialize(delta);
}
