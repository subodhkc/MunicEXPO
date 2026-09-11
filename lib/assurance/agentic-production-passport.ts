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

const PASSPORT_SCHEMA_VERSION = 'passport-0.2.0';

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

export interface AgenticProductionPassport {
  schemaVersion: string;
  passportId: string;
  generatedAt: string;
  evaluationIdentity: {
    organizationId: string;
    aiSystemId: string;
    evaluationId: string;
    orchestratorRunId: string;
    exactScanId: string;
    repositoryCommitSha: string | null;
  };
  buildProvenance: {
    outputGeneratorBuildIdentity: {
      commitSha: string;
      commitRef: string;
      buildTimestamp: string;
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
    memory: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] };
    rag: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] };
    mcp: { available: false; reason: string } | { available: true; tools: string[]; limitations: string[] };
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
  state: AriRelationState;
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

export function buildAgenticProductionPassport(
  output: EvaluatedAssuranceOutput,
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

  return {
    schemaVersion: PASSPORT_SCHEMA_VERSION,
    passportId: computePassportId(output),
    generatedAt: new Date().toISOString(),
    evaluationIdentity: output.evaluationIdentity,
    buildProvenance: {
      outputGeneratorBuildIdentity: output.buildProvenance.outputGeneratorBuildIdentity,
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
      limitations: ['Passport is a deterministic projection; it is not a runtime observation.'],
    },
  };
}

function determineMemoryRagMcpTruth(output: EvaluatedAssuranceOutput): {
  memory: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] };
  rag: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] };
  mcp: { available: false; reason: string } | { available: true; tools: string[]; limitations: string[] };
} {
  const ea = output.executionArchetype;
  const families = ea.coverageSummary.families ?? {};

  const memoryAccesses = ea.memoryAccessRelations ?? [];
  const memoryLineages = ea.memoryLineageRelations ?? [];
  const contextInfluences = ea.modelContextInfluenceRelations ?? [];
  const mcpRefs = ea.mcpServerRefs ?? [];

  const memoryFamily = families['memoryLineage'] ?? 'NOT_ANALYZED';
  const ragFamily = families['modelContextInfluence'] ?? 'NOT_ANALYZED';

  const memory: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] } =
    memoryAccesses.length > 0 || memoryLineages.length > 0
      ? {
          available: true,
          kinds: [
            ...new Set([
              ...memoryAccesses.map((r) => r.accessKind),
              ...memoryLineages.map((r) => r.influenceKind),
            ]),
          ].sort(),
          limitations: [
            'MEMORY_WRITE != LATER_MEMORY_INFLUENCE',
            'Static access evidence establishes code capability, not runtime execution.',
          ],
        }
      : memoryFamily === 'ANALYZED'
        ? { available: true, kinds: [], limitations: ['ANALYZED_EMPTY: memory family analyzed, no memory access/lineage relations in this snapshot.'] }
        : { available: false, reason: `memoryLineage family state is ${memoryFamily}; no exact relations bound.` };

  const rag: { available: false; reason: string } | { available: true; kinds: string[]; limitations: string[] } =
    contextInfluences.length > 0
      ? {
          available: true,
          kinds: [...new Set(contextInfluences.map((r) => r.influenceKind))].sort(),
          limitations: [
            'VECTOR_STORE_ACCESS != RAG_INFLUENCE',
            'RAG_REFERENCE != RETRIEVAL_EXECUTED',
            'Static context influence evidence is not runtime retrieval execution.',
          ],
        }
      : ragFamily === 'ANALYZED'
        ? { available: true, kinds: [], limitations: ['ANALYZED_EMPTY: modelContextInfluence family analyzed, no context-influence relations in this snapshot.'] }
        : { available: false, reason: `modelContextInfluence family state is ${ragFamily}; no exact relations bound.` };

  const mcp: { available: false; reason: string } | { available: true; tools: string[]; limitations: string[] } =
    mcpRefs.length > 0
      ? {
          available: true,
          tools: [...new Set(mcpRefs.flatMap((r) => r.refs))].sort(),
          limitations: [
            'MCP_SERVER_REF != CONNECTED_RUNTIME_MCP_SESSION',
            'DECLARED_MCP_TOOL != RUNTIME_CALL',
            'Source declaration establishes topology/capability candidates, not runtime connection.',
          ],
        }
      : { available: false, reason: 'No MCP server references found in agent candidate declarations for this snapshot.' };

  return { memory, rag, mcp };
}
