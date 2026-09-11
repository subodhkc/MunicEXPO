/**
 * Full AI / Agentic Assurance Report (OUTPUT-3).
 *
 * A deterministic report projection over the shared evaluated-assurance composer.
 * It does not create a second evidence path.
 */

import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { AriCoverageState, AriRelationState } from '@/lib/ai-security/types';

const REPORT_SCHEMA_VERSION = 'report-0.1.0';

export interface AssuranceReport {
  schemaVersion: string;
  reportId: string;
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
    schemaVersions: Record<string, string>;
  };
  sections: {
    executiveSummary: string;
    operatingModel: string;
    agentSurfaces: { agentId: string; surface: string; state: AriRelationState; limitations: string[] }[];
    capabilityExposureLadder: { stage: string; state: AriRelationState; toolName?: string; limitations: string[] }[];
    actionConsequencePaths: { toolCandidateId?: string; handlerRef?: string; stages: string[]; state: AriRelationState; limitations: string[] }[];
    humanControls: string;
    context: string;
    aiSecurityFindings: { finding: string; severity: 'INFO' | 'FRONTIER'; evidence: string }[];
    evidenceCoverage: { overall: AriCoverageState; families: { family: string; state: AriCoverageState }[] };
    runtimeProviderState: { runtime: string; provider: string };
    artifactProvenance: {
      schemaVersions: Record<string, string>;
      evaluationId: string;
      scanId: string;
      commitSha: string | null;
    };
  };
  limitations: string[];
}

export function buildAssuranceReportFromOutput(
  output: EvaluatedAssuranceOutput,
): AssuranceReport {
  const ea = output.executionArchetype;

  const agentSurfaces = ea.dimensions
    .filter((d) => d.facet === 'HUMAN_INTERACTION_PATTERN' || d.facet === 'MODALITY')
    .flatMap((d) => d.values.map((v) => ({
      agentId: v.sourceRelationIds[0] ?? 'unknown',
      surface: `${d.facet}: ${v.value}`,
      state: v.state,
      limitations: v.limitations,
    })));

  const capabilityExposureLadder = ea.consequencePathSummary.flatMap((p) =>
    p.stages.map((s) => ({
      stage: `${s.stage}${p.toolCandidateId ? ` (${p.toolCandidateId})` : ''}`,
      state: s.state as AriRelationState,
      toolName: p.toolCandidateId,
      limitations: s.limitations,
    })),
  );

  const actionConsequencePaths = ea.consequencePathSummary.map((p) => ({
    toolCandidateId: p.toolCandidateId,
    handlerRef: p.handlerRef,
    stages: p.stages.map((s) => `${s.stage} = ${s.state}`),
    state: p.state,
    limitations: p.limitations,
  }));

  const humanControl = ea.humanControlSummary
    .map((h) => `humanControl=${h.humanControlModel ?? 'n/a'}, commit=${h.consequenceCommitModel ?? 'n/a'}, state=${h.state}`)
    .join('; ') || 'No human control evidence established.';

  const context = ea.dimensions
    .filter((d) => d.facet === 'CONTEXT_INFLUENCE')
    .map((d) => d.values.map((v) => `${v.value} (${v.state})`).join(', '))
    .join('; ') || 'No context influence established.';

  const findings = output.evidenceFrontier.frontierItems.map((f) => ({
    finding: `${f.facet} = ${f.value} is ${f.state}`,
    severity: 'FRONTIER' as const,
    evidence: f.reason,
  }));

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: `report-${output.evaluationIdentity.evaluationId}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    evaluationIdentity: output.evaluationIdentity,
    buildProvenance: {
      outputGeneratorBuildIdentity: output.buildProvenance.outputGeneratorBuildIdentity,
      analyzerBuildIdentity: output.buildProvenance.analyzerBuildIdentity,
      schemaVersions: output.buildProvenance.schemaVersions,
    },
    sections: {
      executiveSummary: `Assurance report for ${output.evaluationIdentity.aiSystemId}. Semantic coverage is ${ea.coverageSummary.overall}. Output is deterministic and does not recompute evidence.`,
      operatingModel: `Interaction: ${ea.dimensions.find((d) => d.facet === 'HUMAN_INTERACTION_PATTERN')?.values[0]?.value ?? 'UNKNOWN'}; lifecycle: ${ea.dimensions.find((d) => d.facet === 'EXECUTION_LIFECYCLE')?.values[0]?.value ?? 'UNKNOWN'}.`,
      agentSurfaces,
      capabilityExposureLadder,
      actionConsequencePaths,
      humanControls: humanControl,
      context,
      aiSecurityFindings: findings,
      evidenceCoverage: {
        overall: ea.coverageSummary.overall,
        families: Object.entries(ea.coverageSummary.families ?? {}).map(([family, state]) => ({ family, state })),
      },
      runtimeProviderState: {
        runtime: 'NOT_ANALYZED',
        provider: 'NOT_ANALYZED',
      },
      artifactProvenance: {
        schemaVersions: output.buildProvenance.schemaVersions,
        evaluationId: output.evaluationIdentity.evaluationId,
        scanId: output.evaluationIdentity.exactScanId,
        commitSha: output.evaluationIdentity.repositoryCommitSha,
      },
    },
    limitations: [
      'Report is a deterministic projection over the shared composer.',
      'Unknown != failure; SOURCE_GAP != risk.',
      'Modeled commercial context is disabled for technical assurance.',
    ],
  };
}
