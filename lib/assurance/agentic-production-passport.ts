/**
 * Agentic Production Passport (OUTPUT-2).
 *
 * A compact, deterministic projection over the shared evaluated-assurance composer.
 * It is NOT a second report truth engine.
 *
 * PER-SUBJECT_ARCHETYPE != REPOSITORY_SINGLE_LABEL
 */

import { createHash } from 'crypto';
import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { AriRelationState, AriCoverageState } from '@/lib/ai-security/types';

const PASSPORT_SCHEMA_VERSION = 'passport-0.1.0';

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
  humanInteractionPattern: string;
  modality: string[];
  initiatingPrincipal: string;
  triggerMechanism: string;
  executionLifecycle: string;
  decisionRole: string;
  contextInfluence: string[];
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

function firstValueBySubjectAndFacet(values: { facet: string; values: { value: string }[] }[], facet: string): string {
  const dim = values.find((d) => d.facet === facet);
  return dim?.values[0]?.value ?? 'UNKNOWN';
}

function allValuesBySubjectAndFacet(values: { facet: string; values: { value: string }[] }[], facet: string): string[] {
  const dim = values.find((d) => d.facet === facet);
  return dim?.values.map((v) => v.value) ?? [];
}

function buildSubjectOperatingModels(dimensions: EvaluatedAssuranceOutput['executionArchetype']['dimensions']): SubjectOperatingModel[] {
  const bySubject = new Map<string, { subject: ArchetypeSubjectIdentity; dims: { facet: string; values: { value: string }[] }[] }>();

  for (const dim of dimensions) {
    for (const v of dim.values) {
      const key = `${v.subject.kind}:${v.subject.id}`;
      const entry = bySubject.get(key) ?? { subject: v.subject, dims: [] };
      const existing = entry.dims.find((d) => d.facet === dim.facet);
      if (existing) {
        existing.values.push({ value: v.value });
      } else {
        entry.dims.push({ facet: dim.facet, values: [{ value: v.value }] });
      }
      bySubject.set(key, entry);
    }
  }

  const models: SubjectOperatingModel[] = [];
  for (const { subject, dims } of bySubject.values()) {
    models.push({
      subject,
      humanInteractionPattern: firstValueBySubjectAndFacet(dims, 'HUMAN_INTERACTION_PATTERN'),
      modality: allValuesBySubjectAndFacet(dims, 'MODALITY'),
      initiatingPrincipal: firstValueBySubjectAndFacet(dims, 'INITIATING_PRINCIPAL'),
      triggerMechanism: firstValueBySubjectAndFacet(dims, 'TRIGGER_MECHANISM'),
      executionLifecycle: firstValueBySubjectAndFacet(dims, 'EXECUTION_LIFECYCLE'),
      decisionRole: firstValueBySubjectAndFacet(dims, 'DECISION_ROLE'),
      contextInfluence: allValuesBySubjectAndFacet(dims, 'CONTEXT_INFLUENCE'),
    });
  }

  // Deterministic order by subject key.
  return models.sort((a, b) => `${a.subject.kind}:${a.subject.id}`.localeCompare(`${b.subject.kind}:${b.subject.id}`));
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

  const subjects = buildSubjectOperatingModels(ea.dimensions);

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
      subjects,
    },
    capabilityExposureLadder,
    actionConsequencePaths,
    humanControl: ea.humanControlSummary,
    context: {
      memory: { available: false, reason: 'MEMORY_EVIDENCE_NOT_EVALUATED' as const } as any,
      rag: { available: false, reason: 'RAG_EVIDENCE_NOT_EVALUATED' as const } as any,
      mcp: { available: false, reason: 'MCP_EVIDENCE_NOT_EVALUATED' as const } as any,
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
