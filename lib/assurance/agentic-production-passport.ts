/**
 * Agentic Production Passport (OUTPUT-2).
 *
 * A compact, deterministic projection over the shared evaluated-assurance composer.
 * It is NOT a second report truth engine.
 */

import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { AriRelationState, AriCoverageState } from '@/lib/ai-security/types';

const PASSPORT_SCHEMA_VERSION = 'passport-0.1.0';

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
    humanInteractionPattern: string;
    modality: string[];
    initiatingPrincipal: string;
    triggerMechanism: string;
    executionLifecycle: string;
    decisionRole: string;
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
    contextInfluence: string[];
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
  stage: 'Registered' | 'Model-visible' | 'Model-requested' | 'Effective dispatch' | 'Handler bound' | 'Consequence path' | 'Observed action';
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

export function buildAgenticProductionPassport(
  output: EvaluatedAssuranceOutput,
): AgenticProductionPassport {
  const ea = output.executionArchetype;

  const humanInteraction = ea.dimensions.find((d) => d.facet === 'HUMAN_INTERACTION_PATTERN')?.values[0]?.value ?? 'UNKNOWN';
  const modality = ea.dimensions.find((d) => d.facet === 'MODALITY')?.values.map((v) => v.value) ?? [];
  const initiatingPrincipal = ea.dimensions.find((d) => d.facet === 'INITIATING_PRINCIPAL')?.values[0]?.value ?? 'UNKNOWN';
  const trigger = ea.dimensions.find((d) => d.facet === 'TRIGGER_MECHANISM')?.values[0]?.value ?? 'UNKNOWN';
  const lifecycle = ea.dimensions.find((d) => d.facet === 'EXECUTION_LIFECYCLE')?.values[0]?.value ?? 'UNKNOWN';
  const decisionRole = ea.dimensions.find((d) => d.facet === 'DECISION_ROLE')?.values[0]?.value ?? 'UNKNOWN';

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
          stageName = stage.state === 'EFFECTIVE_DISPATCH' ? 'Effective dispatch' : 'Model-requested';
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

  const contextInfluence = ea.dimensions
    .filter((d) => d.facet === 'CONTEXT_INFLUENCE')
    .flatMap((d) => d.values.map((v) => v.value));

  const context = {
    contextInfluence,
    memory: { available: false, reason: 'MEMORY_EVIDENCE_NOT_EVALUATED' as const } as any,
    rag: { available: false, reason: 'RAG_EVIDENCE_NOT_EVALUATED' as const } as any,
    mcp: { available: false, reason: 'MCP_EVIDENCE_NOT_EVALUATED' as const } as any,
  };

  const ariFamilies = Object.entries(ea.coverageSummary.families ?? {}).map(([family, state]) => ({ family, state }));

  return {
    schemaVersion: PASSPORT_SCHEMA_VERSION,
    passportId: `passport-${output.evaluationIdentity.evaluationId}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    evaluationIdentity: output.evaluationIdentity,
    buildProvenance: {
      outputGeneratorBuildIdentity: output.buildProvenance.outputGeneratorBuildIdentity,
      analyzerBuildIdentity: output.buildProvenance.analyzerBuildIdentity,
    },
    operatingModel: {
      humanInteractionPattern: humanInteraction,
      modality,
      initiatingPrincipal,
      triggerMechanism: trigger,
      executionLifecycle: lifecycle,
      decisionRole,
    },
    capabilityExposureLadder,
    actionConsequencePaths,
    humanControl: ea.humanControlSummary,
    context,
    evidenceCoverage: {
      overall: ea.coverageSummary.overall,
      ariFamilies,
      frontiers: ea.unresolvedFrontiers.map((f) => ({
        facet: f.facet,
        value: f.value,
        state: f.state,
        reasonCode: 'FRONTIER',
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
