/**
 * Shared Evaluated Assurance Output Composer (OUTPUT-0).
 *
 * One server-side composition owner that assembles a complete evaluated-system
 * output model from an explicit AssuranceEvaluation / exact bound scan.
 *
 * LOCKS:
 *   OUTPUT_COMPOSITION != EVIDENCE_ESTABLISHMENT
 *   OUTPUT_COMPOSITION != ANALYSIS
 *   OUTPUT_COMPOSITION != U5_DISPOSITION
 *   LATEST_SCAN != EXACT_EVALUATED_SCAN
 *   CLI_ONLY_OUTPUT_LOGIC = NO
 */

import { getBuildIdentity } from '@/lib/build-identity';
import { loadEvaluatedOperationCoverage } from './u6-scan-loader';
import {
  buildExecutionArchetypeProjection,
  buildExecutionArchetypeSummary,
  type ExecutionArchetypeSummary,
} from '@/lib/ai-inventory/execution-archetype';
import type { PersistedOperationCoverageIntelligence } from '@/lib/ai-security/operation-coverage-read';
import type { AssuranceEvaluation } from './types';

const COMPOSER_SCHEMA_VERSION = 'output-0.1.0';

export interface EvaluatedAssuranceOutputIdentity {
  evaluationId: string;
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  exactScanId: string;
  repositoryCommitSha: string | null;
}

export interface EvaluatedAssuranceOutputBuildProvenance {
  applicationBuildIdentity: {
    commitSha: string;
    commitRef: string;
    buildTimestamp: string;
    packageVersion: string;
  };
  analyzerBuildIdentity: {
    available: false;
    reason: 'EXACT_ANALYZER_BUILD_IDENTITY_NOT_YET_PERSISTED';
  };
  schemaVersions: {
    composer: string;
    operationCoverage: string;
    archetype: string;
  };
}

export interface EvaluatedAssuranceOutput {
  schemaVersion: string;
  evaluationIdentity: EvaluatedAssuranceOutputIdentity;
  buildProvenance: EvaluatedAssuranceOutputBuildProvenance;
  executionArchetype: ExecutionArchetypeSummary;
  // Reserved for later modules: actionProof, reachability, actionAssurance, evidenceFrontier
  actionProof: { available: false; reason: 'NOT_YET_COMPOSED' };
  reachability: { available: false; reason: 'NOT_YET_COMPOSED' };
  actionAssurance: { available: false; reason: 'NOT_YET_COMPOSED' };
  evidenceFrontier: { available: false; reason: 'NOT_YET_COMPOSED' };
}

export type AssuranceOutputResult =
  | { status: 'AVAILABLE'; output: EvaluatedAssuranceOutput }
  | {
      status: 'UNAVAILABLE';
      reason: string;
      scanId?: string;
      commitSha?: string | null;
    };

interface ComposeInput {
  evaluation: Pick<
    AssuranceEvaluation,
    'id' | 'organizationId' | 'aiSystemId' | 'orchestratorRunId'
  >;
  coverage: PersistedOperationCoverageIntelligence;
  scanId: string;
  commitSha: string | null;
}

/**
 * Core deterministic composition from an already-exact bound scan snapshot.
 * This function does not query the database and does not perform source analysis.
 * It is the shared semantic owner used by UI/API/CLI.
 */
export function composeAssuranceOutputFromCoverage(
  input: ComposeInput,
): EvaluatedAssuranceOutput {
  const { evaluation, coverage, scanId, commitSha } = input;

  const buildIdentity = getBuildIdentity();

  const archetypeResult = buildExecutionArchetypeProjection(coverage, {
    commitSha,
    buildIdentity: undefined,
  });

  const archetypeSummary = buildExecutionArchetypeSummary(archetypeResult, coverage, {
    evaluationId: evaluation.id,
    repositoryCommit: commitSha,
    analyzerBuildIdentity: undefined,
  });

  return {
    schemaVersion: COMPOSER_SCHEMA_VERSION,
    evaluationIdentity: {
      evaluationId: evaluation.id,
      organizationId: evaluation.organizationId,
      aiSystemId: evaluation.aiSystemId,
      orchestratorRunId: evaluation.orchestratorRunId,
      exactScanId: scanId,
      repositoryCommitSha: commitSha,
    },
    buildProvenance: {
      applicationBuildIdentity: {
        commitSha: buildIdentity.commitSha,
        commitRef: buildIdentity.commitRef,
        buildTimestamp: buildIdentity.buildTimestamp,
        packageVersion: buildIdentity.packageVersion,
      },
      analyzerBuildIdentity: {
        available: false,
        reason: 'EXACT_ANALYZER_BUILD_IDENTITY_NOT_YET_PERSISTED',
      },
      schemaVersions: {
        composer: COMPOSER_SCHEMA_VERSION,
        operationCoverage: coverage.schemaVersion,
        archetype: archetypeResult.schemaVersion,
      },
    },
    executionArchetype: archetypeSummary,
    actionProof: { available: false, reason: 'NOT_YET_COMPOSED' },
    reachability: { available: false, reason: 'NOT_YET_COMPOSED' },
    actionAssurance: { available: false, reason: 'NOT_YET_COMPOSED' },
    evidenceFrontier: { available: false, reason: 'NOT_YET_COMPOSED' },
  };
}

/**
 * Shared composer entry point. Resolves the exact historical scan bound to the
 * evaluation and returns the complete output model. Never falls back to a
 * current/latest scan.
 */
export async function composeAssuranceOutput(
  evaluation: AssuranceEvaluation,
): Promise<AssuranceOutputResult> {
  const loaded = await loadEvaluatedOperationCoverage(evaluation);
  if ('availability' in loaded) {
    return {
      status: 'UNAVAILABLE',
      reason: loaded.unavailableReason,
      scanId: loaded.scanId,
      commitSha: loaded.commitSha,
    };
  }

  const output = composeAssuranceOutputFromCoverage({
    evaluation,
    coverage: loaded.data,
    scanId: loaded.scanId,
    commitSha: loaded.commitSha,
  });

  return { status: 'AVAILABLE', output };
}
