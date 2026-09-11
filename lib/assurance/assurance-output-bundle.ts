/**
 * Single output-bundle service (Q2-F).
 *
 * One bounded owner that composes an exact evaluated output once and projects
 * all downstream artifacts deterministically.
 *
 * Invariant:
 *   COMPOSE_ONCE
 *   PROJECT_MANY
 *   NO_REANALYSIS
 *   NO_U5_RECOMPUTATION
 */

import type { AssuranceEvaluation } from './types';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import {
  composeAssuranceOutputFromCoverage,
  type EvaluatedAssuranceOutput,
} from './assurance-output-composer';
import { buildAgenticProductionPassport } from './agentic-production-passport';
import { buildAssuranceReportFromOutput } from './assurance-report-composer';
import { buildMachineReadableAssuranceOutput } from './assurance-artifact-manifest';
import { buildArtifactManifest } from './assurance-artifact-manifest';
import { buildEvaluatedTopologyProjection } from '@/lib/topology/topology-projector';
import { buildConstellationProjection } from '@/lib/topology/constellation-presentation-projection';
import { buildConstellationExport } from '@/lib/topology/constellation-export';
import type { ArtifactManifest } from './assurance-artifact-manifest';

export interface AssuranceOutputBundle {
  availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  evaluationId: string;
  exactScanId: string;
  repositoryCommitSha: string | null;
  output: EvaluatedAssuranceOutput;
  passport: ReturnType<typeof buildAgenticProductionPassport>;
  report: ReturnType<typeof buildAssuranceReportFromOutput>;
  machineJson: ReturnType<typeof buildMachineReadableAssuranceOutput>;
  constellation: ReturnType<typeof buildConstellationProjection>;
  constellationSvg: string;
  manifest: ArtifactManifest;
  reasons?: string[];
}

export interface AssuranceBundleInput {
  evaluation: Pick<AssuranceEvaluation, 'id' | 'organizationId' | 'aiSystemId' | 'orchestratorRunId'>;
  coverage: PersistedOperationCoverageIntelligence;
  scanId: string;
  commitSha: string | null;
  aiSystemName?: string;
}

export function buildAssuranceOutputBundle(input: AssuranceBundleInput): AssuranceOutputBundle {
  // Exactly one composer invocation for the entire bundle.
  const output = composeAssuranceOutputFromCoverage({
    evaluation: input.evaluation,
    coverage: input.coverage,
    scanId: input.scanId,
    commitSha: input.commitSha,
  });

  const passport = buildAgenticProductionPassport(output);
  const report = buildAssuranceReportFromOutput(output);

  const machineJson = buildMachineReadableAssuranceOutput(
    output as any,
    output.buildProvenance.outputGeneratorBuildIdentity.buildTimestamp,
  );

  const topology = buildEvaluatedTopologyProjection(input.coverage, {
    evaluationId: input.evaluation.id,
    scanId: input.scanId,
    repositoryCommitSha: input.commitSha,
    organizationId: input.evaluation.organizationId,
    aiSystemId: input.evaluation.aiSystemId,
    aiSystemName: input.aiSystemName,
  });

  const constellation = buildConstellationProjection(topology, null);
  const constellationExport = buildConstellationExport(constellation, {
    evaluationId: input.evaluation.id,
  });

  const artifacts = [
    { name: 'passport.json', artifactType: 'passport', schemaVersion: passport.schemaVersion, bytes: Buffer.from(JSON.stringify(passport)) },
    { name: 'report.json', artifactType: 'report', schemaVersion: report.schemaVersion, bytes: Buffer.from(JSON.stringify(report)) },
    { name: 'machine.json', artifactType: 'machine-readable', schemaVersion: machineJson.schemaVersion, bytes: Buffer.from(JSON.stringify(machineJson)) },
    { name: 'constellation.svg', artifactType: 'constellation-svg', schemaVersion: constellation.projectionSchemaVersion, bytes: Buffer.from(constellationExport.svg) },
    { name: 'constellation.json', artifactType: 'constellation-json', schemaVersion: constellation.projectionSchemaVersion, bytes: Buffer.from(JSON.stringify(constellation)) },
  ];

  const manifest = buildArtifactManifest(artifacts, {
    evaluationId: input.evaluation.id,
    scanId: input.scanId,
    repositoryCommit: input.commitSha,
    outputGeneratorBuildCommit: output.buildProvenance.outputGeneratorBuildIdentity.commitSha,
    analyzerBuildAvailable: output.buildProvenance.analyzerBuildIdentity.available,
    generatedTimestamp: output.buildProvenance.outputGeneratorBuildIdentity.buildTimestamp,
  });

  return {
    availability: topology.mapAvailability === 'AVAILABLE' ? 'ESTABLISHED' : 'PARTIAL',
    evaluationId: input.evaluation.id,
    exactScanId: input.scanId,
    repositoryCommitSha: input.commitSha,
    output,
    passport,
    report,
    machineJson,
    constellation,
    constellationSvg: constellationExport.svg,
    manifest,
  };
}
