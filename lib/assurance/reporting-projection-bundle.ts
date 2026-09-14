/**
 * AA-PROJECTION-1: Reporting projection bundle and manifest.
 *
 * ONE EVALUATION -> ONE VERSIONED ASSURANCE EVIDENCE BUNDLE
 *              -> MULTIPLE AUDIENCE PROJECTIONS
 *              -> SAME TRUTH EVERYWHERE
 *
 * This is a semantic projection owner, not an analyzer or assurance engine.
 * It converts the canonical EvaluatedAssuranceOutput + persisted coverage
 * into a stable, audience-profile-agnostic Evidence Bundle and binds every
 * generated artifact to that bundle through a Report Projection Manifest.
 *
 * Invariants:
 *   PROJECTION != ANALYSIS
 *   PROJECTION != U5_DECISION
 *   SEMANTIC_IDENTITY != PUBLICATION_IDENTITY
 *   WALL_CLOCK_TIME != EVALUATION_SNAPSHOT_TIME
 *   CROSS_EVALUATION_COMPOSITION = REJECT
 *   DISPLAY_ELIGIBILITY != EVIDENCE_STATE
 *   REDACTION != EVIDENCE_STATE_CHANGE
 *   REGISTERED_TOOL != REQUESTED_AUTHORITY
 *   BUILD_IDENTITY_AVAILABLE != PRODUCER_COMPLETED
 *   NO_TRUNCATION_FACT != TRUNCATION_FALSE
 *   NO_STALE_FACT != EVIDENCE_FRESH
 *   NOT_APPLICABLE != UNSUPPORTED
 *   SUBJECT_ID != EVIDENCE_ID
 */

import { createHash } from 'crypto';
import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { ArtifactManifest } from './assurance-artifact-manifest';
import type { AssuranceDisposition, AssuranceEvaluation, AssuranceEvaluationStatus, ClaimEvaluationResult, ClaimReasonCode, ClaimState } from './types';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';

/**
 * Deterministic canonical JSON serialization for semantic digests.
 *
 * Stable key ordering, no undefined values, no incidental timestamps.
 * Output is NOT for human reading; it is for identity only.
 */
function canonicalSerialize(o: unknown): string {
  if (o === null) return 'null';
  if (typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonicalSerialize).join(',') + ']';
  const keys = Object.keys(o as Record<string, unknown>).filter((k) => (o as Record<string, unknown>)[k] !== undefined).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize((o as Record<string, unknown>)[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function computeSemanticDigest(input: unknown): string {
  return createHash('sha256').update(canonicalSerialize(input), 'utf8').digest('hex');
}

/** Evidence authority plane with bounded states. */
export type EvidenceAuthorityState = 'ESTABLISHED' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED' | 'UNSUPPORTED' | 'NOT_APPLICABLE';

/** Integrity dimension truth state. */
export type IntegrityDimensionState = 'TRUNCATED' | 'NOT_TRUNCATED' | 'FRESH' | 'STALE' | 'UNKNOWN' | 'NOT_ASSESSED';

/** Producer completion state from canonical extraction outcome. */
export type ProducerCompletionState = 'COMPLETED' | 'NOT_COMPLETED' | 'PARTIAL' | 'FAILED' | 'TIMEOUT' | 'UNSUPPORTED' | 'NOT_RUN' | 'NOT_ASSESSED';

/** A single canonical evidence reference suitable for rendering. */
export interface EvidenceReference {
  /** Canonical relation IDs that established this evidence. */
  relationIds: string[];
  /** Canonical Evidence Core evidence IDs, when bound. */
  evidenceRefs: string[];
  /** Producer that established this evidence. */
  producerId?: string;
  /** Authority class (e.g., source, runtime, policy). */
  authorityClass: string;
  /** Evidence state from canonical owner. */
  state: EvidenceAuthorityState;
  coverage: string;
  /** Facet / family (e.g., registration, dispatch, handler-operation). */
  facet: string;
  subjectId: string;
  /** Canonical source location if established. */
  location?: { file?: string | null; line?: number; column?: number };
  /** Explicit limitations for this evidence item. */
  limitations: string[];
}

/**
 * AA-REPORTING-INTERPRETATION-2: bounded AD-3 context-binding projection
 * joined to an action path ONLY by exact canonical identity
 * (ActionContextBindingRelation.handlerOperationRelationId === the path's
 * handler-operation relation id). Never name/file/handler heuristics.
 *
 * LOCKS:
 *   TENANT_CONTEXT_PRESENT != TENANT_FILTER_BOUND
 *   TENANT_FILTER_BOUND != TENANT_SUBJECT_BOUND
 *   ACTION_CONTEXT_BINDING != POLICY_AUTHORIZED
 *   ACTION_CONTEXT_BINDING != EFFECTIVELY_GRANTED
 *   ACTION_CONTEXT_BINDING != OBSERVED
 *   TENANT_CONTEXT_PRESENT != CROSS_TENANT_ISOLATION_PROVEN
 *   NO_EXACT_JOIN -> NO_DISPLAYED_BINDING
 */
export interface PathContextBinding {
  /** Canonical AD-3 relation ID — exact Inspect Proof reference. */
  relationId: string;
  contextKind: string;
  state: string;
  tenantContextPresent?: boolean;
  tenantFilterBound?: boolean;
  tenantSubjectBound?: boolean;
  tenantValueOrigin?: string;
  authenticationOrdering?: string;
}

/** Bounded action consequence evidence for one capability path. */
export interface EvidenceActionPath {
  /** Derived projection identity — not a canonical relation. */
  pathId: string;
  toolCandidateId?: string;
  registrationRelationId?: string;
  modelExposureRelationId?: string;
  dispatchRelationId?: string;
  toolImplementationRelationId?: string;
  handlerFunctionId?: string;
  handlerRef?: string;
  /**
   * Canonical AD-1 handler-operation relation id backing this path's
   * consequence stage — the exact join identity for context bindings.
   */
  consequenceRelationId?: string;
  /**
   * Exact AD-3 context bindings joined by canonical handler-operation
   * relation id. Absent when the evaluated snapshot carries no AD-3
   * relations for this path — never fabricated.
   */
  contextBindings?: PathContextBinding[];
  downstreamOperationIds: string[];
  sinkTargetIds: string[];
  /** Planes of authority independently tracked. */
  planes: {
    requested: EvidenceAuthorityState;
    policyAuthorized: EvidenceAuthorityState;
    effectivelyGranted: EvidenceAuthorityState;
    codeCapable: EvidenceAuthorityState;
    observed: EvidenceAuthorityState;
  };
  /** Exact canonical five-plane join state for this path. */
  planeJoin: 'JOINED' | 'NOT_JOINED' | 'NOT_AVAILABLE';
  /** Adverse / conflicting evidence for this path. */
  adverseEvidence: EvidenceReference[];
  /** Protections / controls observed for this path. */
  protectiveControls: EvidenceReference[];
  limitations: string[];
}

export interface EvidenceFrontierProjection {
  facet: string;
  subjectId: string;
  value: string;
  state: EvidenceAuthorityState;
  coverage: string;
  reasonCode: string;
  reason: string;
  sourceRelationIds: string[];
}

export interface EvaluationIntegrityProjection {
  /** Canonical producer/extraction completion state; NOT build identity. */
  producerCompletion: ProducerCompletionState;
  /** Whether source truncation is proven by persisted coverage. */
  sourceTruncationState: IntegrityDimensionState;
  /** Whether graph truncation is proven by persisted coverage. */
  graphTruncationState: IntegrityDimensionState;
  /** Whether evidence freshness is proven by canonical source. */
  freshnessState: IntegrityDimensionState;
  analysisLimitations: string[];
  unsupportedAnalyzers: string[];
  notAssessedAnalyzers: string[];
  mixedVersionLimitations: string[];
}

export interface MaterialChangeProjection {
  comparability: 'SAME' | 'CHANGED' | 'NOT_COMPARABLE' | 'NOT_EVALUATED';
  baselineEvaluationId?: string;
  targetEvaluationId?: string;
  explanation: string;
  limitations: string[];
}

/**
 * AA-PROJECTION-1: Assurance Evidence Bundle V1.
 *
 * Semantic projection contract over a single exact evaluation.
 * All fields are either canonical or explicitly bounded.
 */
export interface AssuranceEvidenceBundleV1 {
  schemaVersion: 'assurance-evidence-bundle-1.0.0' | 'assurance-evidence-bundle-1.1.0';
  /** Canonical identity of the evaluated scope. */
  evaluationIdentity: {
    evaluationId: string;
    organizationId: string;
    aiSystemId: string;
    orchestratorRunId: string;
    exactScanId: string;
    repositoryCommitSha: string | null;
    evaluationSnapshotAt: string | null;
  };
  /** Deterministic digest of the canonical semantic bundle. */
  bundleDigest: string;
  /** Canonical build provenance for the evaluated output. */
  buildProvenance: EvaluatedAssuranceOutput['buildProvenance'];
  /** Canonical U5 bounded disposition, only when bound from the exact evaluation. */
  disposition: AssuranceDisposition | 'UNKNOWN';
  dispositionSource: 'CANONICAL_U5' | 'NOT_AVAILABLE';
  dispositionAvailability: 'BOUND' | 'NOT_BOUND';
  dispositionMethodologyVersion?: string;
  dispositionLimitations: string[];
  /** Action Assurance / authority-consequence reconciliation summary. */
  actionAssurance: {
    availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
    surfaces?: unknown[];
    frontierCount: number;
    limitations: string[];
  };
  /** Action Proof section (canonical). */
  actionProof: {
    availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
    /**
     * AA-REPORTING-INTERPRETATION-2: canonical supporting-trace count.
     * ACTION_PROOF_TRACE_COUNT != ACTION_ASSURANCE_PATH_COUNT.
     */
    totalTraces?: number;
    limitations: string[];
  };
  /** Agent Reachability section (canonical). */
  reachability: {
    availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
    agentCount: number;
    relationCount: number;
    limitations: string[];
  };
  /**
   * Bounded U5 decision basis — canonical evaluation facts bound only when the
   * exact canonical evaluation identity validates. NOT_BOUND carries nothing.
   *   DECISION_BASIS = CANONICAL_U5_FACTS
   *   DECISION_BASIS != REPORTER_INFERENCE
   */
  u5DecisionBasis: {
    availability: 'BOUND' | 'NOT_BOUND';
    evaluationStatus?: AssuranceEvaluationStatus;
    reasonCodes?: ClaimReasonCode[];
    claimCounts?: Record<ClaimState, number>;
    claimResults?: ClaimEvaluationResult[];
  };
  /** Selected action/consequence paths with bounded plane states. */
  actionPaths: EvidenceActionPath[];
  /**
   * AA-REPORTING-INTERPRETATION-2: canonical AD-3 context-binding counts
   * over the evaluated path population. Counts only — no tenant-security
   * verdict. Per-path detail lives on EvidenceActionPath.contextBindings.
   * Optional for 1.0.0 compatibility — projections must treat absent as
   * NOT_ESTABLISHED, not zero-context-evidence.
   */
  tenantBinding?: {
    /** Total canonical AD-3 relations in the evaluated snapshot. */
    contextBindingRelationCount: number;
    /** Evaluated paths with at least one exact AD-3 join. */
    pathsWithContextEvidence: number;
    /** TENANT_CONTEXT relations where a tenant context is present. */
    tenantContextPresent: number;
    /** TENANT_CONTEXT relations where a tenant filter is bound. */
    tenantFilterBound: number;
    /** TENANT_CONTEXT relations where the tenant value is subject-bound. */
    tenantSubjectBound: number;
    /** AD-3 relations whose binding state is not ESTABLISHED. */
    partialOrUnknownBinding: number;
  };
  /** Evidence references grouped by facet for inspectability. */
  evidenceReferences: EvidenceReference[];
  /** Evidence frontier — missing, partial, unsupported, not-assessed. */
  evidenceFrontier: EvidenceFrontierProjection[];
  /** Evaluation integrity / limitation state. */
  evaluationIntegrity: EvaluationIntegrityProjection;
  /** Material change (bounded). */
  materialChange: MaterialChangeProjection;
  /** Constellation projection anchors (references, not independent truth). */
  constellationAnchors: {
    topologyProjectionDigest: string;
    reachabilityDigest: string;
    constellationDigest: string;
  };
  /** Explicit projection limitations. */
  limitations: string[];
}

/** One projected artifact's provenance entry. */
export interface ReportProjectionArtifactEntry {
  artifactType: 'report' | 'passport' | 'machine-readable' | 'constellation-svg' | 'constellation-json' | 'evidence-bundle' | 'decision-receipt' | 'html' | 'pdf' | string;
  name: string;
  schemaVersion: string;
  /** Semantic bundle digest for the same evaluation package. */
  evidenceBundleDigest: string;
  /**
   * Whether the artifact semantics were derived from the evidence bundle or
   * merely share the same evaluation. SERIALIZATION_OF_EVIDENCE_BUNDLE is the
   * byte serialization of the bundle itself — not an independent derivation.
   */
  semanticRelationToEvidenceBundle: 'DERIVED_FROM_EVIDENCE_BUNDLE' | 'SAME_EVALUATION_SIBLING' | 'SERIALIZATION_OF_EVIDENCE_BUNDLE';
  /** Exact artifact byte digest. */
  artifactDigest: string;
  /** Profile identity for audience-specific projection. */
  profileId: string;
  profileVersion: string;
  /** Renderer identity/version that produced this artifact. */
  rendererId: string;
  rendererVersion: string;
  /** Evaluation identity repeated for fail-closed composition checks. */
  evaluationId: string;
  exactScanId: string;
  repositoryCommitSha: string | null;
}

/**
 * Minimal caller-owned facts about one projected artifact.
 * Identity fields are attached by the manifest builder from the bundle.
 */
export interface ProjectedArtifactInput {
  artifactType: string;
  name: string;
  schemaVersion: string;
  artifactDigest: string;
  /** Caller-owned claim that this artifact was projected from the bundle. */
  semanticRelationToEvidenceBundle?: 'DERIVED_FROM_EVIDENCE_BUNDLE' | 'SAME_EVALUATION_SIBLING' | 'SERIALIZATION_OF_EVIDENCE_BUNDLE';
  profileId?: string;
  profileVersion?: string;
  rendererId?: string;
  rendererVersion?: string;
}

/**
 * AA-PROJECTION-1: Report Projection Manifest V1.
 *
 * Provenance binding every generated artifact to one exact Evaluation,
 * one Assurance Evidence Bundle, one profile, and one renderer.
 */
export interface ReportProjectionManifestV1 {
  schemaVersion: 'report-projection-manifest-1.0.0';
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  evidenceBundleDigest: string;
  evidenceBundleSchemaVersion: string;
  /** Canonical U5 methodology/version when bound; null when not bound. */
  assuranceMethodologyVersion: string | null;
  assuranceMethodologyAvailability: 'BOUND' | 'NOT_BOUND';
  /** Projection / profile / renderer contract versions. */
  projectionProfileVersion: string;
  rendererRegistryVersion: string;
  /** Whether a qualified renderer registry exists for these artifact types. */
  rendererRegistryAvailability: 'QUALIFIED' | 'NOT_YET_QUALIFIED';
  artifacts: ReportProjectionArtifactEntry[];
  /** Deterministic digest of this manifest (excludes itself). */
  manifestDigest: string;
  limitations: string[];
}

export interface BuildAssuranceEvidenceBundleInput {
  output: EvaluatedAssuranceOutput;
  /** Canonical artifact manifest produced by the bundle builder. */
  artifactManifest: ArtifactManifest;
  /** Persisted coverage intelligence for the exact evaluated scan. */
  coverage: PersistedOperationCoverageIntelligence;
  /** Optional canonical evaluation carrying exact U5 identity, disposition, methodology and decision basis. */
  canonicalEvaluation?: Pick<AssuranceEvaluation, 'id' | 'organizationId' | 'aiSystemId' | 'orchestratorRunId' | 'disposition' | 'assuranceMethodologyVersion' | 'evaluationStatus' | 'reasonCodes' | 'claimCounts' | 'claimResults'> & { evaluationSnapshotAt?: Date | string };
  /** Optional reachability/topology/constellation digests if already computed. */
  topologyProjectionDigest?: string;
  reachabilityDigest?: string;
  constellationDigest?: string;
}

function toEvidenceAuthorityState(state: string, coverage?: string): EvidenceAuthorityState {
  if (state === 'NOT_ANALYZED') return 'NOT_ASSESSED';
  if (state === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (state === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (state === 'UNKNOWN' && coverage === 'NOT_ANALYZED') return 'NOT_ASSESSED';
  if (state === 'UNKNOWN' && coverage === 'UNSUPPORTED') return 'UNSUPPORTED';
  switch (state) {
    case 'ESTABLISHED':
      return 'ESTABLISHED';
    case 'PARTIAL':
    case 'CONDITIONAL':
    case 'CANDIDATE':
      return 'PARTIAL';
    case 'UNKNOWN':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

function evidenceRefsFromArchetype(output: EvaluatedAssuranceOutput): EvidenceReference[] {
  const refs: EvidenceReference[] = [];
  for (const dim of output.executionArchetype.dimensions) {
    for (const v of dim.values) {
      refs.push({
        relationIds: v.sourceRelationIds,
        evidenceRefs: v.evidenceRefs,
        authorityClass: 'SOURCE',
        state: toEvidenceAuthorityState(v.state, v.coverage),
        coverage: v.coverage,
        facet: dim.facet,
        subjectId: v.subject.id,
        limitations: v.limitations,
      });
    }
  }
  return refs;
}

function actionPathsFromArchetype(
  output: EvaluatedAssuranceOutput,
  coverage: PersistedOperationCoverageIntelligence,
): EvidenceActionPath[] {
  // AA-REPORTING-INTERPRETATION-2: exact canonical join — AD-3 relations are
  // keyed by handlerOperationRelationId, which equals the path's
  // consequenceRelationId. No name/file/handler heuristics.
  const ad3ByHorId = new Map<string, NonNullable<PersistedOperationCoverageIntelligence['actionContextBindingRelations']>[number][]>();
  for (const rel of coverage.actionContextBindingRelations ?? []) {
    const list = ad3ByHorId.get(rel.handlerOperationRelationId);
    if (list) list.push(rel);
    else ad3ByHorId.set(rel.handlerOperationRelationId, [rel]);
  }
  return output.executionArchetype.consequencePathSummary.map((p) => {
    const downstreamOperationIds = p.stages.filter((s) => s.stage === 'CONSEQUENCE' && s.targetId).map((s) => s.relationId);
    const sinkTargetIds = p.stages.filter((s) => s.stage === 'CONSEQUENCE' && s.targetId).map((s) => s.targetId ?? s.relationId);
    const contextBindings = (ad3ByHorId.get(p.consequenceId ?? '') ?? []).map((rel): PathContextBinding => ({
      relationId: rel.id,
      contextKind: rel.contextKind,
      state: rel.state,
      tenantContextPresent: rel.tenantContextPresent,
      tenantFilterBound: rel.tenantFilterBound,
      tenantSubjectBound: rel.tenantSubjectBound,
      tenantValueOrigin: rel.tenantValueOrigin,
      authenticationOrdering: rel.authenticationOrdering,
    }));
    return {
      pathId: computeSemanticDigest({
        toolCandidateId: p.toolCandidateId,
        handlerRef: p.handlerRef,
        consequenceId: p.consequenceId,
        downstreamOperationIds,
        sinkTargetIds,
      }),
      toolCandidateId: p.toolCandidateId,
      handlerRef: p.handlerRef,
      consequenceRelationId: p.consequenceId,
      ...(contextBindings.length > 0 ? { contextBindings } : {}),
      downstreamOperationIds,
      sinkTargetIds,
      planes: {
        requested: 'NOT_ASSESSED',
        policyAuthorized: 'NOT_ASSESSED',
        effectivelyGranted: 'NOT_ASSESSED',
        codeCapable: toEvidenceAuthorityState(p.state, p.coverage),
        observed: 'NOT_ASSESSED',
      },
      planeJoin: 'NOT_JOINED',
      adverseEvidence: [],
      protectiveControls: [],
      limitations: p.limitations,
    };
  });
}

function producerCompletionFromCoverage(coverage: PersistedOperationCoverageIntelligence): ProducerCompletionState {
  if (coverage.extractionCompletion === 'COMPLETED') return 'COMPLETED';
  if (coverage.extractionCompletion === 'NOT_COMPLETED') return 'NOT_COMPLETED';
  return 'NOT_ASSESSED';
}

function sourceTruncationFromCoverage(coverage: PersistedOperationCoverageIntelligence): IntegrityDimensionState {
  const repo = coverage.repositoryAnalysisCoverage;
  if (!repo) return 'NOT_ASSESSED';
  if (repo.payloadLimitReached || repo.fileCountLimitReached) return 'TRUNCATED';
  return 'NOT_TRUNCATED';
}

function graphTruncationFromCoverage(): IntegrityDimensionState {
  return 'NOT_ASSESSED';
}

function freshnessFromCoverage(): IntegrityDimensionState {
  return 'NOT_ASSESSED';
}

export function buildAssuranceEvidenceBundleV1(input: BuildAssuranceEvidenceBundleInput): AssuranceEvidenceBundleV1 {
  const { output, artifactManifest, coverage, canonicalEvaluation, topologyProjectionDigest = '', reachabilityDigest = '', constellationDigest = '' } = input;
  const id = output.evaluationIdentity;

  // Fail closed on ArtifactManifest / evaluation identity mismatch.
  if (artifactManifest.evaluationId !== id.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest evaluationId mismatch');
  }
  if (artifactManifest.scanId !== id.exactScanId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest scanId mismatch');
  }
  if (
    artifactManifest.repositoryCommit !== null &&
    id.repositoryCommitSha !== null &&
    artifactManifest.repositoryCommit !== id.repositoryCommitSha
  ) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest repositoryCommit mismatch');
  }
  if (
    artifactManifest.evaluationSnapshotAt !== null &&
    id.evaluationSnapshotAt !== undefined &&
    artifactManifest.evaluationSnapshotAt !== id.evaluationSnapshotAt
  ) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest evaluationSnapshotAt mismatch');
  }

  // U5 disposition may only be bound when the canonical evaluation identity
  // proves it belongs to the exact same evaluation.
  let disposition: AssuranceDisposition | 'UNKNOWN' = 'UNKNOWN';
  let dispositionSource: AssuranceEvidenceBundleV1['dispositionSource'] = 'NOT_AVAILABLE';
  let dispositionAvailability: AssuranceEvidenceBundleV1['dispositionAvailability'] = 'NOT_BOUND';
  let dispositionMethodologyVersion: string | undefined;
  let u5DecisionBasis: AssuranceEvidenceBundleV1['u5DecisionBasis'] = { availability: 'NOT_BOUND' };
  if (canonicalEvaluation) {
    if (canonicalEvaluation.id !== id.evaluationId) {
      throw new Error('CROSS_EVALUATION_COMPOSITION: canonicalEvaluation id mismatch');
    }
    if (canonicalEvaluation.organizationId !== id.organizationId) {
      throw new Error('CROSS_EVALUATION_COMPOSITION: canonicalEvaluation organizationId mismatch');
    }
    if (canonicalEvaluation.aiSystemId !== id.aiSystemId) {
      throw new Error('CROSS_EVALUATION_COMPOSITION: canonicalEvaluation aiSystemId mismatch');
    }
    if (canonicalEvaluation.orchestratorRunId !== id.orchestratorRunId) {
      throw new Error('CROSS_EVALUATION_COMPOSITION: canonicalEvaluation orchestratorRunId mismatch');
    }
    const canonicalSnapshotAt = canonicalEvaluation.evaluationSnapshotAt instanceof Date
      ? canonicalEvaluation.evaluationSnapshotAt.toISOString()
      : canonicalEvaluation.evaluationSnapshotAt;
    if (canonicalSnapshotAt !== undefined && id.evaluationSnapshotAt !== undefined && canonicalSnapshotAt !== id.evaluationSnapshotAt) {
      throw new Error('CROSS_EVALUATION_COMPOSITION: canonicalEvaluation evaluationSnapshotAt mismatch');
    }
    disposition = canonicalEvaluation.disposition;
    dispositionSource = 'CANONICAL_U5';
    dispositionAvailability = 'BOUND';
    dispositionMethodologyVersion = canonicalEvaluation.assuranceMethodologyVersion;
    u5DecisionBasis = {
      availability: 'BOUND',
      evaluationStatus: canonicalEvaluation.evaluationStatus,
      reasonCodes: canonicalEvaluation.reasonCodes,
      claimCounts: canonicalEvaluation.claimCounts,
      claimResults: canonicalEvaluation.claimResults,
    };
  }

  const evidenceReferences = evidenceRefsFromArchetype(output);
  const actionPaths = actionPathsFromArchetype(output, coverage);
  const evidenceFrontier = output.evidenceFrontier.frontierItems.map((f) => ({
    facet: f.facet,
    subjectId: f.subjectId,
    value: f.value,
    state: toEvidenceAuthorityState(f.state, f.coverage),
    coverage: f.coverage,
    reasonCode: f.reasonCode,
    reason: f.reason,
    sourceRelationIds: f.sourceRelationIds,
  }));

  const aa = output.actionAssurance;
  const ap = output.actionProof;
  const ar = output.reachability;

  // AA-REPORTING-INTERPRETATION-2: canonical AD-3 counts over the evaluated
  // path population. Relation-grain counts; TENANT_* flags are only
  // populated on TENANT_CONTEXT relations by the canonical producer.
  const ad3 = coverage.actionContextBindingRelations ?? [];
  const tenantCtx = ad3.filter((r) => r.contextKind === 'TENANT_CONTEXT');
  const tenantBinding = {
    contextBindingRelationCount: ad3.length,
    pathsWithContextEvidence: actionPaths.filter((p) => (p.contextBindings?.length ?? 0) > 0).length,
    tenantContextPresent: tenantCtx.filter((r) => r.tenantContextPresent === true).length,
    tenantFilterBound: tenantCtx.filter((r) => r.tenantFilterBound === true).length,
    tenantSubjectBound: tenantCtx.filter((r) => r.tenantSubjectBound === true).length,
    partialOrUnknownBinding: ad3.filter((r) => r.state !== 'ESTABLISHED').length,
  };

  const bundlePayload: Omit<AssuranceEvidenceBundleV1, 'bundleDigest'> = {
    // 1.1.0: additive per-path contextBindings + tenantBinding summary.
    // Read-time projection — additive fields are backward-compatible.
    schemaVersion: 'assurance-evidence-bundle-1.1.0',
    evaluationIdentity: {
      evaluationId: id.evaluationId,
      organizationId: id.organizationId,
      aiSystemId: id.aiSystemId,
      orchestratorRunId: id.orchestratorRunId,
      exactScanId: id.exactScanId,
      repositoryCommitSha: id.repositoryCommitSha,
      evaluationSnapshotAt: id.evaluationSnapshotAt ?? null,
    },
    buildProvenance: output.buildProvenance,
    disposition,
    dispositionSource,
    dispositionAvailability,
    dispositionMethodologyVersion,
    dispositionLimitations: [
      'Disposition is bounded to the evaluated scope and available evidence.',
      'UNKNOWN or missing disposition is not a pass.',
      'The bundle never recomputes the assurance decision; it binds the canonical evaluation disposition when available.',
    ],
    u5DecisionBasis,
    actionAssurance: {
      availability: aa.availability,
      surfaces: aa.surfaces,
      frontierCount: aa.summary?.frontierCount ?? 0,
      limitations: aa.coverageLimitations ?? [],
    },
    actionProof: {
      availability: ap.availability,
      totalTraces: ap.summary?.totalTraces,
      limitations: ap.coverageLimitations ?? [],
    },
    reachability: {
      availability: ar.availability,
      agentCount: ar.summary?.agentCount ?? 0,
      relationCount: ar.summary?.relationshipCount ?? 0,
      limitations: ar.coverageLimitations ?? [],
    },
    actionPaths,
    tenantBinding,
    evidenceReferences,
    evidenceFrontier,
    evaluationIntegrity: {
      producerCompletion: producerCompletionFromCoverage(coverage),
      sourceTruncationState: sourceTruncationFromCoverage(coverage),
      graphTruncationState: graphTruncationFromCoverage(),
      freshnessState: freshnessFromCoverage(),
      analysisLimitations: output.evidenceFrontier.limitations,
      unsupportedAnalyzers: output.evidenceFrontier.ariFamilyFrontiers
        .filter((f) => f.state === 'UNSUPPORTED')
        .map((f) => f.family),
      notAssessedAnalyzers: output.evidenceFrontier.ariFamilyFrontiers
        .filter((f) => f.state === 'NOT_ANALYZED')
        .map((f) => f.family),
      mixedVersionLimitations: [],
    },
    materialChange: {
      comparability: 'NOT_EVALUATED',
      explanation: 'Material change comparison is outside the scope of a single evaluation; use the existing comparability contract.',
      limitations: ['Material change not projected from this bundle.'],
    },
    constellationAnchors: {
      topologyProjectionDigest,
      reachabilityDigest,
      constellationDigest,
    },
    limitations: [
      'This bundle is a semantic projection of one exact evaluation.',
      'CROSS_EVALUATION_COMPOSITION is invalid.',
    ],
  };

  const bundle: AssuranceEvidenceBundleV1 = {
    ...bundlePayload,
    bundleDigest: computeSemanticDigest(bundlePayload),
  };
  return bundle;
}

export interface ReportProjectionProfile {
  profileId: string;
  profileVersion: string;
  rendererId: string;
  rendererVersion: string;
}

export interface BuildReportProjectionManifestInput {
  bundle: AssuranceEvidenceBundleV1;
  artifactManifest: ArtifactManifest;
  /** Minimal artifact facts; identity is bound from the bundle. */
  projectedArtifacts: ProjectedArtifactInput[];
  profile: ReportProjectionProfile;
  projectionProfileVersion: string;
  rendererRegistryVersion: string;
  rendererRegistryAvailability?: 'QUALIFIED' | 'NOT_YET_QUALIFIED';
}

export function buildReportProjectionManifestV1(input: BuildReportProjectionManifestInput): ReportProjectionManifestV1 {
  const { bundle, artifactManifest, projectedArtifacts, profile, projectionProfileVersion, rendererRegistryVersion, rendererRegistryAvailability = 'NOT_YET_QUALIFIED' } = input;

  if (artifactManifest.evaluationId !== bundle.evaluationIdentity.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest evaluationId mismatch');
  }
  if (artifactManifest.scanId !== bundle.evaluationIdentity.exactScanId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifactManifest scanId mismatch');
  }

  const artifacts: ReportProjectionArtifactEntry[] = projectedArtifacts.map((a) => ({
    artifactType: a.artifactType,
    name: a.name,
    schemaVersion: a.schemaVersion,
    evidenceBundleDigest: bundle.bundleDigest,
    semanticRelationToEvidenceBundle: a.semanticRelationToEvidenceBundle ?? 'SAME_EVALUATION_SIBLING',
    artifactDigest: a.artifactDigest,
    profileId: a.profileId ?? profile.profileId,
    profileVersion: a.profileVersion ?? profile.profileVersion,
    rendererId: a.rendererId ?? profile.rendererId,
    rendererVersion: a.rendererVersion ?? profile.rendererVersion,
    evaluationId: bundle.evaluationIdentity.evaluationId,
    exactScanId: bundle.evaluationIdentity.exactScanId,
    repositoryCommitSha: bundle.evaluationIdentity.repositoryCommitSha,
  }));

  const manifest: Omit<ReportProjectionManifestV1, 'manifestDigest'> = {
    schemaVersion: 'report-projection-manifest-1.0.0',
    evaluationIdentity: bundle.evaluationIdentity,
    evidenceBundleDigest: bundle.bundleDigest,
    evidenceBundleSchemaVersion: bundle.schemaVersion,
    assuranceMethodologyVersion: bundle.dispositionMethodologyVersion ?? null,
    assuranceMethodologyAvailability: bundle.dispositionAvailability === 'BOUND' ? 'BOUND' : 'NOT_BOUND',
    projectionProfileVersion,
    rendererRegistryVersion,
    rendererRegistryAvailability,
    artifacts,
    limitations: [
      'Manifest binds provenance only; it does not calculate U5 or reconcile evidence.',
      'Artifact digests are over generated bytes for this profile and renderer.',
      'SAME_EVALUATION_SIBLING != DERIVED_FROM_EVIDENCE_BUNDLE.',
    ],
  };

  return {
    ...manifest,
    manifestDigest: computeSemanticDigest(manifest),
  };
}

/**
 * Verify a bundle digest by recomputing the semantic payload and comparing.
 */
export function verifyAssuranceEvidenceBundleDigest(bundle: AssuranceEvidenceBundleV1): boolean {
  const { bundleDigest, ...payload } = bundle;
  return computeSemanticDigest(payload) === bundleDigest;
}

/**
 * Fail-closed composition guard: a projected artifact must belong to exactly
 * one evaluation and one bundle digest.
 */
export function assertProjectionCompositionValid(
  bundle: AssuranceEvidenceBundleV1,
  manifest: ReportProjectionManifestV1,
  artifactEntry: ReportProjectionArtifactEntry,
): void {
  if (manifest.evaluationIdentity.evaluationId !== bundle.evaluationIdentity.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: manifest and bundle evaluation mismatch');
  }
  if (manifest.evidenceBundleDigest !== bundle.bundleDigest) {
    throw new Error('BUNDLE_DIGEST_MISMATCH: manifest does not bind this bundle');
  }
  if (artifactEntry.evidenceBundleDigest !== bundle.bundleDigest) {
    throw new Error('BUNDLE_DIGEST_MISMATCH: artifact does not bind this bundle');
  }
  if (artifactEntry.evaluationId !== bundle.evaluationIdentity.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifact evaluation mismatch');
  }
}
