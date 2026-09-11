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
 *   PRODUCT_BUNDLE != DRY_RUN_PREVIEW_BUNDLE
 *   PRODUCT_BUNDLE != CALLER_SUPPLIED_COVERAGE
 */

import type { AssuranceEvaluation } from './types';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import {
  buildAssuranceOutputFromLoadedCoverage,
  composeAssuranceOutputFromCoverage,
  type EvaluatedAssuranceOutput,
} from './assurance-output-composer';
import { loadEvaluatedOperationCoverage } from './u6-scan-loader';
import { buildAgenticProductionPassport } from './agentic-production-passport';
import { buildAssuranceReportFromOutput } from './assurance-report-composer';
import { buildMachineReadableAssuranceOutput } from './assurance-artifact-manifest';
import { buildArtifactManifest } from './assurance-artifact-manifest';
import { buildEvaluatedTopologyProjection } from '@/lib/topology/topology-projector';
import { buildAgentReachabilityReadModel, type AgentReachabilityReadModel } from '@/lib/ai-inventory/agent-reachability-read-model';
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

export interface AssuranceBundleFromCoverageInput {
  evaluation: Pick<AssuranceEvaluation, 'id' | 'organizationId' | 'aiSystemId' | 'orchestratorRunId'>;
  coverage: PersistedOperationCoverageIntelligence;
  scanId: string;
  commitSha: string | null;
  aiSystemName?: string;
}

export interface AssuranceBundleResult {
  availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  bundle?: AssuranceOutputBundle;
  reason?: string;
}

function buildBundleFromOutput(
  output: EvaluatedAssuranceOutput,
  coverage: PersistedOperationCoverageIntelligence,
  aiSystemName?: string,
  readModel?: AgentReachabilityReadModel,
): AssuranceOutputBundle {
  const evaluationId = output.evaluationIdentity.evaluationId;
  const scanId = output.evaluationIdentity.exactScanId;
  const commitSha = output.evaluationIdentity.repositoryCommitSha;
  const orgId = output.evaluationIdentity.organizationId;
  const aiSystemId = output.evaluationIdentity.aiSystemId;

  const passport = buildAgenticProductionPassport(output);
  const report = buildAssuranceReportFromOutput(output);

  const machineJson = buildMachineReadableAssuranceOutput(
    output,
    output.buildProvenance.outputGeneratorBuildIdentity.buildTimestamp,
  );

  const topology = buildEvaluatedTopologyProjection(coverage, {
    evaluationId,
    scanId,
    repositoryCommitSha: commitSha,
    organizationId: orgId,
    aiSystemId,
    aiSystemName,
  });

  const reachability = readModel ?? buildAgentReachabilityReadModel(coverage, { scanId, commitSha });
  const constellation = buildConstellationProjection(topology, reachability);
  const constellationExport = buildConstellationExport(constellation, { evaluationId });

  const artifacts = [
    { name: 'passport.json', artifactType: 'passport', schemaVersion: passport.schemaVersion, bytes: Buffer.from(JSON.stringify(passport)) },
    { name: 'report.json', artifactType: 'report', schemaVersion: report.schemaVersion, bytes: Buffer.from(JSON.stringify(report)) },
    { name: 'machine.json', artifactType: 'machine-readable', schemaVersion: machineJson.schemaVersion, bytes: Buffer.from(JSON.stringify(machineJson)) },
    { name: 'constellation.svg', artifactType: 'constellation-svg', schemaVersion: constellation.projectionSchemaVersion, bytes: Buffer.from(constellationExport.svg) },
    { name: 'constellation.json', artifactType: 'constellation-json', schemaVersion: constellation.projectionSchemaVersion, bytes: Buffer.from(JSON.stringify(constellation)) },
  ];

  const manifest = buildArtifactManifest(artifacts, {
    evaluationId,
    scanId,
    repositoryCommit: commitSha,
    outputGeneratorBuildCommit: output.buildProvenance.outputGeneratorBuildIdentity.commitSha,
    analyzerBuildAvailable: output.buildProvenance.analyzerBuildIdentity.available,
    generatedTimestamp: output.buildProvenance.outputGeneratorBuildIdentity.buildTimestamp,
  });

  return {
    availability: topology.mapAvailability === 'AVAILABLE' ? 'ESTABLISHED' : 'PARTIAL',
    evaluationId,
    exactScanId: scanId,
    repositoryCommitSha: commitSha,
    output,
    passport,
    report,
    machineJson,
    constellation,
    constellationSvg: constellationExport.svg,
    manifest,
  };
}

/**
 * Dry-run / fixture projection helper.
 *
 * Accepts a caller-supplied in-memory coverage snapshot for unit tests and
 * pre-auth previews. Does NOT load a persisted evaluation and does NOT run
 * Action Proof / Reachability / Action Assurance sections.
 */
export function buildAssuranceOutputBundleFromCoverage(
  input: AssuranceBundleFromCoverageInput,
): AssuranceOutputBundle {
  const output = composeAssuranceOutputFromCoverage({
    evaluation: input.evaluation,
    coverage: input.coverage,
    scanId: input.scanId,
    commitSha: input.commitSha,
  });

  return buildBundleFromOutput(output, input.coverage, input.aiSystemName);
}

/**
 * Production exact-evaluation bundle.
 *
 * Resolves the exact historical scan via the evaluation and composes all
 * artifacts once. Fails closed if the exact snapshot cannot be loaded.
 */
export async function buildAssuranceOutputBundle(
  evaluation: AssuranceEvaluation,
  aiSystemName?: string,
): Promise<AssuranceBundleResult> {
  const loaded = await loadEvaluatedOperationCoverage(evaluation);
  if ('availability' in loaded) {
    return {
      availability: 'NOT_AVAILABLE',
      reason: `EVALUATED_SNAPSHOT_UNAVAILABLE: ${loaded.unavailableReason}`,
    };
  }

  const readModel = buildAgentReachabilityReadModel(loaded.data, {
    scanId: loaded.scanId,
    commitSha: loaded.commitSha,
  });

  const output = buildAssuranceOutputFromLoadedCoverage(evaluation, loaded, readModel);

  const bundle = buildBundleFromOutput(output, loaded.data, aiSystemName, readModel);

  return { availability: bundle.availability, bundle };
}
