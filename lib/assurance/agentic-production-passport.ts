/**
 * Agentic Production Passport (OUTPUT-2).
 *
 * A compact, deterministic projection over the shared evaluated-assurance composer.
 * It is NOT a second report truth engine.
 *
 * PER-SUBJECT_ARCHETYPE != REPOSITORY_SINGLE_LABEL
 * MULTI-VALUE_PER_SUBJECT != FIRST_VALUE_COLLAPSE
 */

import { createHash } from 'crypto';
import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { ArchetypeDimensionValue } from '@/lib/ai-inventory/execution-archetype';
import type { AriRelationState, AriCoverageState } from '@/lib/ai-security/types';
import type { ConsequenceDelta } from './consequence-delta';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';

const PASSPORT_SCHEMA_VERSION = 'passport-0.3.1';

/**
 * U6 lineage binding states. Lineage direction is strictly U5 -> U6 -> Passport:
 *   PASSPORT_INCLUDED_IN_U6_SEMANTIC_PACKAGE_DIGEST = NO
 *   PASSPORT_INCLUDED_IN_U6_RECEIPT_HASH = NO
 *   U6_DEPENDS_ON_PASSPORT = NO
 *   PACKAGE_IDENTITY_MATCH_REQUIRED = YES — a package for another org,
 *   system, evaluation, or run must never bind (fail closed, no downgrade
 *   to "partial binding").
 *   NO_LATEST_U6_FALLBACK = YES — binding requires an explicit exact
 *   packageId; an absent package is NOT_BOUND, never auto-selected.
 */
export type PassportU6BindingState =
  | 'NOT_BOUND'
  | 'BOUND_INTERNAL_CONSISTENCY'
  | 'BOUND_VERIFIED_AGAINST_HAIEC_RECORD';

/**
 * Explicit U6 package lineage envelope. References canonical U6 digests
 * verbatim; never recomputes them.
 *   PACKAGE_EXISTS != PACKAGE_VERIFIED
 *   INTERNALLY_CONSISTENT != VERIFIED_AGAINST_HAIEC_RECORD
 *   RECEIPT_AVAILABLE != SYSTEM_CERTIFIED
 */
export type PassportU6PublicationState =
  | 'PRIVATE'
  | 'PUBLIC'
  | 'REVOKED'
  | 'NOT_ASSESSED';

export interface PassportU6Lineage {
  bindingState: PassportU6BindingState;
  /**
   * U6 lifecycle truth, a separate axis from integrity verification.
   *   PACKAGE_PUBLICATION_STATE != PACKAGE_INTEGRITY_STATE
   *   REVOKED != INVALID_PACKAGE
   *   INTEGRITY_VERIFIED != CURRENTLY_PUBLIC
   * NOT_ASSESSED when no canonical persisted lifecycle evidence exists
   * (unbound or caller-supplied pure package) — never inferred.
   */
  publicationState: PassportU6PublicationState;
  packageId?: string;
  semanticPackageDigest?: string;
  semanticReportDigest?: string;
  receiptHash?: string;
  merkleRoot?: string;
  assuranceEvaluationId?: string;
  orchestratorRunId?: string;
  packageSchemaVersion?: string;
  assuranceMethodologyVersion?: string;
  limitations: string[];
}

/**
 * Thin deterministic reference to an explicitly supplied, accepted
 * Consequence Delta. Passport never recomputes Delta, never selects a
 * baseline, and never claims improved/worse/safer — Delta does not own
 * those conclusions.
 */
export interface PassportDeltaReference {
  /** Deterministic Delta identity = its semantic comparisonDigest. */
  deltaId: string;
  comparisonDigest: string;
  schemaVersion: string;
  baselineEvaluationId: string;
  targetEvaluationId: string;
  baselineScanId: string;
  targetScanId: string;
  availability: string;
  summary: {
    added: number;
    removed: number;
    expanded: number;
    narrowed: number;
    controlChanged: number;
    dependencyChanged: number;
    evidenceChanged: number;
    unresolved: number;
  };
}

export interface PassportBuildContext {
  /** Resolved U6 lineage envelope (resolved by the canonical service). */
  u6Lineage?: PassportU6Lineage;
  /**
   * Optional explicitly supplied accepted Consequence Delta. Must target
   * this passport's evaluation; identity mismatch fails closed.
   */
  consequenceDelta?: ConsequenceDelta;
}

function computePassportId(output: EvaluatedAssuranceOutput): string {
  // WALL_CLOCK_TIME != SEMANTIC_ID
  const identity = [
    PASSPORT_SCHEMA_VERSION,
    output.evaluationIdentity.organizationId,
    output.evaluationIdentity.aiSystemId,
    output.evaluationIdentity.evaluationId,
    output.evaluationIdentity.orchestratorRunId,
    output.evaluationIdentity.exactScanId,
    output.evaluationIdentity.repositoryCommitSha ?? '',
  ].join(':');
  return `passport-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

export interface ArchetypeSubjectIdentity {
  kind: string;
  id: string;
  displayName?: string;
}

export interface SubjectOperatingModel {
  subject: ArchetypeSubjectIdentity;
  humanInteractionPattern: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  modality: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  initiatingPrincipal: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  triggerMechanism: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  executionLifecycle: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  decisionRole: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
  contextInfluence: Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[];
}

export interface ContextEvidenceItem {
  kind: string;
  state?: AriRelationState;
  coverage?: AriCoverageState;
  sourceAgentId?: string;
  sourceRelationIds: string[];
  limitations: string[];
}

export interface ContextEvidence {
  coverage: AriCoverageState;
  items: ContextEvidenceItem[];
  frontier?: string;
}

export interface AgenticProductionPassport {
  schemaVersion: string;
  passportId: string;
  /**
   * The persisted evaluation boundary time — NOT a render/wall-clock
   * timestamp. Same evaluated inputs must produce identical Passport bytes.
   *   WALL_CLOCK_IN_PASSPORT_BYTES = NO
   */
  evaluationSnapshotAt: string | null;
  u6Lineage: PassportU6Lineage;
  consequenceDelta?: PassportDeltaReference;
  evaluationIdentity: {
    organizationId: string;
    aiSystemId: string;
    evaluationId: string;
    orchestratorRunId: string;
    exactScanId: string;
    repositoryCommitSha: string | null;
  };
  buildProvenance: {
    /**
     * Stable output-generator software identity only.
     *   PROCESS_START_TIME != PASSPORT_SEMANTIC_INPUT
     *   BUILD_INSTANCE_TIMESTAMP != SOURCE_BUILD_IDENTITY
     * The process/build-instance timestamp from lib/build-identity.ts is
     * intentionally excluded from canonical Passport bytes — it is not a
     * stable semantic build identifier.
     */
    outputGeneratorBuildIdentity: {
      commitSha: string;
      commitRef: string;
      packageVersion: string;
    };
    analyzerBuildIdentity: {
      available: boolean;
      reason: string;
    };
  };
  operatingModel: {
    system?: SubjectOperatingModel;
    subjects: SubjectOperatingModel[];
  };
  capabilityExposureLadder: CapabilityExposureStage[];
  actionConsequencePaths: ActionConsequencePath[];
  humanControl: {
    humanControlModel?: string;
    consequenceCommitModel?: string;
    state: AriRelationState;
    evidenceRefs: string[];
    limitations: string[];
  }[];
  context: {
    memory: ContextEvidence;
    rag: ContextEvidence;
    mcp: ContextEvidence;
  };
  evidenceCoverage: {
    overall: AriCoverageState;
    ariFamilies: { family: string; state: AriCoverageState }[];
    frontiers: { facet: string; value: string; state: AriRelationState; reasonCode: string }[];
  };
  runtimeProviderFrontiers: {
    runtimeObservation: string;
    providerEvidence: string;
    limitations: string[];
  };
  verification: {
    schemaVersions: Record<string, string>;
    crossArtifactConsistency: {
      evaluationId: string;
      scanId: string;
      commitSha: string | null;
    };
    limitations: string[];
  };
}

export interface CapabilityExposureStage {
  stage:
    | 'Registered'
    | 'Model-visible'
    | 'Model-requested'
    | 'Dispatch'
    | 'Conditional dispatch'
    | 'Effective dispatch'
    | 'Handler bound'
    | 'Consequence path'
    | 'Observed action';
  state: AriRelationState;
  relationIds: string[];
  toolName?: string;
  handlerRef?: string;
  limitations: string[];
}

export interface ActionConsequencePath {
  toolCandidateId?: string;
  handlerRef?: string;
  consequenceId: string;
  stages: { stage: string; state: string; relationId: string; limitations: string[] }[];
  state: string;
  coverage: AriCoverageState;
}

function projectDimensionValues(
  valuesByFacet: Map<string, ArchetypeDimensionValue[]>,
  facet: string,
): Pick<ArchetypeDimensionValue, 'value' | 'state' | 'coverage' | 'evidenceRefs' | 'limitations' | 'sourceRelationIds'>[] {
  const values = valuesByFacet.get(facet) ?? [];
  // Deterministic by value string then source relation id.
  return [...values].sort((a, b) => {
    const byValue = a.value.localeCompare(b.value);
    if (byValue !== 0) return byValue;
    const aId = a.sourceRelationIds[0] ?? '';
    const bId = b.sourceRelationIds[0] ?? '';
    return aId.localeCompare(bId);
  }).map((v) => ({
    value: v.value,
    state: v.state,
    coverage: v.coverage,
    evidenceRefs: v.evidenceRefs,
    limitations: v.limitations,
    sourceRelationIds: v.sourceRelationIds,
  }));
}

interface SubjectBucket {
  subject: ArchetypeSubjectIdentity;
  valuesByFacet: Map<string, ArchetypeDimensionValue[]>;
}

function buildSubjectOperatingModels(dimensions: EvaluatedAssuranceOutput['executionArchetype']['dimensions']): {
  system?: SubjectOperatingModel;
  subjects: SubjectOperatingModel[];
} {
  const bySubject = new Map<string, SubjectBucket>();

  for (const dim of dimensions) {
    for (const v of dim.values) {
      const key = `${v.subject.kind}:${v.subject.id}`;
      const bucket = bySubject.get(key) ?? { subject: v.subject, valuesByFacet: new Map<string, ArchetypeDimensionValue[]>() };
      const list = bucket.valuesByFacet.get(dim.facet) ?? [];
      list.push(v);
      bucket.valuesByFacet.set(dim.facet, list);
      bySubject.set(key, bucket);
    }
  }

  const operatingModels: SubjectOperatingModel[] = [];
  let system: SubjectOperatingModel | undefined;

  for (const { subject, valuesByFacet } of bySubject.values()) {
    const model: SubjectOperatingModel = {
      subject,
      humanInteractionPattern: projectDimensionValues(valuesByFacet, 'HUMAN_INTERACTION_PATTERN'),
      modality: projectDimensionValues(valuesByFacet, 'MODALITY'),
      initiatingPrincipal: projectDimensionValues(valuesByFacet, 'INITIATING_PRINCIPAL'),
      triggerMechanism: projectDimensionValues(valuesByFacet, 'TRIGGER_MECHANISM'),
      executionLifecycle: projectDimensionValues(valuesByFacet, 'EXECUTION_LIFECYCLE'),
      decisionRole: projectDimensionValues(valuesByFacet, 'DECISION_ROLE'),
      contextInfluence: projectDimensionValues(valuesByFacet, 'CONTEXT_INFLUENCE'),
    };
    if (subject.kind === 'AI_SYSTEM') {
      system = model;
    } else {
      operatingModels.push(model);
    }
  }

  // Deterministic order by subject key.
  operatingModels.sort((a, b) => `${a.subject.kind}:${a.subject.id}`.localeCompare(`${b.subject.kind}:${b.subject.id}`));

  return { system, subjects: operatingModels };
}

/**
 * Project an explicitly supplied accepted Delta into a thin lineage
 * reference. Fails closed when the Delta does not target this passport's
 * evaluation — DELTA_TARGET_MISMATCH is a binding error, never silently
 * attached or degraded.
 */
export function buildPassportDeltaReference(
  delta: ConsequenceDelta,
  output: EvaluatedAssuranceOutput,
): PassportDeltaReference {
  const identity = output.evaluationIdentity;
  const target = delta.candidate;
  const baseline = delta.baseline;
  if (!target || !baseline) {
    throw new Error('PASSPORT_DELTA_NOT_AVAILABLE: delta artifact is NOT_AVAILABLE');
  }
  if (
    target.evaluationId !== identity.evaluationId ||
    target.organizationId !== identity.organizationId ||
    target.aiSystemId !== identity.aiSystemId
  ) {
    throw new Error(
      'PASSPORT_DELTA_IDENTITY_MISMATCH: delta target does not share the passport evaluation/org/system identity',
    );
  }
  const s = delta.summary;
  if (!s || !delta.comparisonDigest) {
    throw new Error('PASSPORT_DELTA_NOT_AVAILABLE: delta artifact has no summary/digest');
  }
  const comparisonDigest = delta.comparisonDigest;
  return {
    deltaId: comparisonDigest,
    comparisonDigest,
    schemaVersion: delta.schemaVersion,
    baselineEvaluationId: baseline.evaluationId,
    targetEvaluationId: target.evaluationId,
    baselineScanId: baseline.scanId,
    targetScanId: target.scanId,
    availability: delta.availability,
    summary: {
      added: s.added,
      removed: s.removed,
      expanded: s.expanded,
      narrowed: s.narrowed,
      controlChanged: s.controlChanged,
      dependencyChanged: s.dependencyChanged,
      evidenceChanged: s.evidenceChanged,
      unresolved: s.unresolved,
    },
  };
}

/**
 * Canonical Passport byte owner — the ONLY serialization used when a
 * Passport artifact is hashed or packaged.
 *   PASSPORT_ARTIFACT_BYTE_OWNER = ONE
 */
export function canonicalPassportBytes(passport: AgenticProductionPassport): string {
  return canonicalSerialize(passport);
}

export function buildAgenticProductionPassport(
  output: EvaluatedAssuranceOutput,
  context?: PassportBuildContext,
): AgenticProductionPassport {
  const ea = output.executionArchetype;

  const capabilityExposureLadder: CapabilityExposureStage[] = [];
  for (const path of ea.consequencePathSummary) {
    for (const stage of path.stages) {
      let stageName: CapabilityExposureStage['stage'];
      switch (stage.stage) {
        case 'REGISTRY':
          stageName = 'Registered';
          break;
        case 'MODEL_VISIBLE':
          stageName = 'Model-visible';
          break;
        case 'DISPATCH':
          // MODEL_REQUESTED != DISPATCH
          if (stage.state === 'EFFECTIVE_DISPATCH') {
            stageName = 'Effective dispatch';
          } else if (stage.state === 'CONDITIONAL_DISPATCH') {
            stageName = 'Conditional dispatch';
          } else if (stage.state === 'CANDIDATE') {
            stageName = 'Dispatch';
          } else {
            stageName = 'Dispatch';
          }
          break;
        case 'HANDLER':
          stageName = 'Handler bound';
          break;
        case 'CONSEQUENCE':
          stageName = 'Consequence path';
          break;
        default:
          stageName = 'Consequence path';
      }
      capabilityExposureLadder.push({
        stage: stageName,
        state: stage.state as AriRelationState,
        relationIds: [stage.relationId],
        toolName: path.toolCandidateId,
        handlerRef: stage.handlerRef,
        limitations: stage.limitations,
      });
    }

    // Model-requested is a separate ladder stage and is not derived from dispatch.
    capabilityExposureLadder.push({
      stage: 'Model-requested',
      state: 'NOT_ANALYZED',
      relationIds: [],
      toolName: path.toolCandidateId,
      handlerRef: path.handlerRef,
      limitations: [
        'MODEL_REQUESTED requires an independent request-binding evidence owner; no exact owner is bound to this scan.',
      ],
    });

    capabilityExposureLadder.push({
      stage: 'Observed action',
      state: 'NOT_ANALYZED',
      relationIds: [],
      toolName: path.toolCandidateId,
      handlerRef: path.handlerRef,
      limitations: ['RUNTIME_OBSERVATION != STATIC_PATH'],
    });
  }

  const actionConsequencePaths: ActionConsequencePath[] = ea.consequencePathSummary.map((p) => ({
    toolCandidateId: p.toolCandidateId,
    handlerRef: p.handlerRef,
    consequenceId: p.consequenceId ?? 'unknown',
    stages: p.stages.map((s) => ({
      stage: s.stage,
      state: s.state as string,
      relationId: s.relationId,
      limitations: s.limitations,
    })),
    state: p.state,
    coverage: p.coverage,
  }));

  const { system, subjects } = buildSubjectOperatingModels(ea.dimensions);

  const memoryRagMcpTruth = determineMemoryRagMcpTruth(output);

  const evaluationSnapshotAt = output.evaluationIdentity.evaluationSnapshotAt ?? null;
  const u6Lineage: PassportU6Lineage = context?.u6Lineage ?? {
    bindingState: 'NOT_BOUND',
    publicationState: 'NOT_ASSESSED',
    limitations: [
      'This Passport represents the evaluated HAIEC output but is not bound to an issued U6 Decision Receipt/package.',
      'NO_PACKAGE != PACKAGE_VERIFIED; NO_PACKAGE != VERIFICATION_FAILURE; NO_PACKAGE != CERTIFICATION.',
    ],
  };
  const consequenceDelta = context?.consequenceDelta
    ? buildPassportDeltaReference(context.consequenceDelta, output)
    : undefined;

  return {
    schemaVersion: PASSPORT_SCHEMA_VERSION,
    passportId: computePassportId(output),
    evaluationSnapshotAt,
    u6Lineage,
    ...(consequenceDelta ? { consequenceDelta } : {}),
    evaluationIdentity: output.evaluationIdentity,
    buildProvenance: {
      outputGeneratorBuildIdentity: {
        commitSha: output.buildProvenance.outputGeneratorBuildIdentity.commitSha,
        commitRef: output.buildProvenance.outputGeneratorBuildIdentity.commitRef,
        packageVersion: output.buildProvenance.outputGeneratorBuildIdentity.packageVersion,
      },
      analyzerBuildIdentity: output.buildProvenance.analyzerBuildIdentity,
    },
    operatingModel: {
      system,
      subjects,
    },
    capabilityExposureLadder,
    actionConsequencePaths,
    humanControl: ea.humanControlSummary,
    context: {
      memory: memoryRagMcpTruth.memory,
      rag: memoryRagMcpTruth.rag,
      mcp: memoryRagMcpTruth.mcp,
    },
    evidenceCoverage: {
      overall: ea.coverageSummary.overall,
      ariFamilies: Object.entries(ea.coverageSummary.families ?? {}).map(([family, state]) => ({ family, state })),
      frontiers: output.evidenceFrontier.frontierItems.map((f) => ({
        facet: f.facet,
        value: f.value,
        state: f.state,
        reasonCode: f.reasonCode,
      })),
    },
    runtimeProviderFrontiers: {
      runtimeObservation: 'NOT_ANALYZED',
      providerEvidence: 'NOT_ANALYZED',
      limitations: ['RUNTIME_EVIDENCE_REQUIRED != STATIC_ANALYSIS', 'PROVIDER_EVIDENCE_REQUIRED != SOURCE_ESTABLISHED'],
    },
    verification: {
      schemaVersions: output.buildProvenance.schemaVersions,
      crossArtifactConsistency: {
        evaluationId: output.evaluationIdentity.evaluationId,
        scanId: output.evaluationIdentity.exactScanId,
        commitSha: output.evaluationIdentity.repositoryCommitSha,
      },
      limitations: [
        'Passport is a deterministic projection; it is not a runtime observation.',
        'Output-generator identity is bound by source/build identifiers. Process-instance initialization time is intentionally excluded from canonical Passport bytes.',
        'Passport is not a U6 Decision Receipt and not a U5 disposition; it does not issue, verify, or recompute either.',
        ...(evaluationSnapshotAt
          ? []
          : ['EVALUATION_SNAPSHOT_TIME_NOT_PERSISTED: this projection lacks the persisted evaluation boundary time (fixture/preview path).']),
      ],
    },
  };
}

function determineMemoryRagMcpTruth(output: EvaluatedAssuranceOutput): {
  memory: ContextEvidence;
  rag: ContextEvidence;
  mcp: ContextEvidence;
} {
  const ea = output.executionArchetype;
  const families = ea.coverageSummary.families ?? {};

  const memoryAccesses = ea.memoryAccessRelations ?? [];
  const memoryLineages = ea.memoryLineageRelations ?? [];
  const contextInfluences = ea.modelContextInfluenceRelations ?? [];
  const mcpRefs = ea.mcpServerRefs ?? [];

  const memoryFamily = families['memoryLineage'] ?? 'NOT_ANALYZED';
  const ragFamily = families['modelContextInfluence'] ?? 'NOT_ANALYZED';

  const memoryItems: ContextEvidenceItem[] = [
    ...memoryAccesses.map((r) => ({
      kind: `MEMORY_${r.accessKind}`,
      state: r.state,
      coverage: 'ANALYZED' as AriCoverageState,
      sourceAgentId: r.subject?.id,
      sourceRelationIds: [r.id],
      limitations: [
        ...r.limitations,
        'MEMORY_WRITE != LATER_MEMORY_INFLUENCE',
        'Static memory access evidence establishes code capability, not runtime execution.',
      ],
    })),
    ...memoryLineages.map((r) => ({
      kind: `MEMORY_LINEAGE_${r.influenceKind}`,
      state: r.state,
      coverage: 'ANALYZED' as AriCoverageState,
      sourceRelationIds: [r.id],
      limitations: [r.establishmentBasis, 'MEMORY_WRITE != LATER_MEMORY_INFLUENCE'].concat(r.limitations),
    })),
  ];

  const memory: ContextEvidence =
    memoryItems.length > 0
      ? { coverage: 'ANALYZED', items: memoryItems }
      : memoryFamily === 'ANALYZED'
        ? { coverage: 'ANALYZED', items: [], frontier: 'ANALYZED_EMPTY: memory lineage family analyzed with no relation instances.' }
        : { coverage: memoryFamily, items: [], frontier: `memoryLineage family coverage is ${memoryFamily}.` };

  const ragItems: ContextEvidenceItem[] = contextInfluences.map((r) => ({
    kind: `RAG_${r.influenceKind}`,
    state: r.state,
    coverage: 'ANALYZED' as AriCoverageState,
    sourceAgentId: r.modelCallId,
    sourceRelationIds: r.promptId ? [r.id, r.promptId] : [r.id],
    limitations: [
      ...r.limitations,
      'VECTOR_STORE_ACCESS != RAG_INFLUENCE',
      'RAG_REFERENCE != RETRIEVAL_EXECUTED',
      'Static context-influence evidence is not runtime retrieval execution.',
    ],
  }));

  const rag: ContextEvidence =
    ragItems.length > 0
      ? { coverage: 'ANALYZED', items: ragItems }
      : ragFamily === 'ANALYZED'
        ? { coverage: 'ANALYZED', items: [], frontier: 'ANALYZED_EMPTY: modelContextInfluence family analyzed with no relation instances.' }
        : { coverage: ragFamily, items: [], frontier: `modelContextInfluence family coverage is ${ragFamily}.` };

  const mcpItems: ContextEvidenceItem[] = mcpRefs.flatMap((r) =>
    r.refs.map((ref) => ({
      kind: 'MCP_SERVER_REF',
      state: 'CANDIDATE' as AriRelationState,
      coverage: 'ANALYZED' as AriCoverageState,
      sourceAgentId: r.agentId,
      sourceRelationIds: [r.agentId, ref],
      limitations: [
        'MCP_SERVER_REF != CONNECTED_RUNTIME_MCP_SESSION',
        'DECLARED_MCP_TOOL != RUNTIME_CALL',
        'Source declaration establishes topology/capability candidates, not runtime connection.',
      ],
    })),
  );

  const mcp: ContextEvidence =
    mcpItems.length > 0
      ? { coverage: 'ANALYZED', items: mcpItems }
      : { coverage: 'NOT_ANALYZED', items: [], frontier: 'No MCP server references found in agent candidate declarations for this snapshot.' };

  return { memory, rag, mcp };
}
