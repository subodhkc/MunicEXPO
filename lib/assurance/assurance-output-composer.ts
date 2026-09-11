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
import { buildActionProofReportSection } from './u6-action-proof-section';
import { buildAgentReachabilityReportSection } from './u6-agent-reachability-section';
import { buildActionAssuranceReportSection } from './u6-action-assurance-section';
import type {
  ActionProofReportSection,
  AgentReachabilityReportSection,
  ActionAssuranceReportSection,
} from './u6-types';
import type { AriCoverageState, AriRelationState } from '@/lib/ai-security/types';

const COMPOSER_SCHEMA_VERSION = 'output-0.2.0';

export interface EvaluatedAssuranceOutputIdentity {
  evaluationId: string;
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  exactScanId: string;
  repositoryCommitSha: string | null;
}

export interface EvaluatedAssuranceOutputBuildProvenance {
  outputGeneratorBuildIdentity: {
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

export type EvidenceFrontierReasonCode =
  | 'ANALYSIS_INCOMPLETE'
  | 'SOURCE_EVIDENCE_MISSING'
  | 'NO_QUALIFYING_EVIDENCE'
  | 'NOT_EVALUATED'
  | 'SOURCE_NOT_CONNECTED'
  | 'RUNTIME_EVIDENCE_REQUIRED'
  | 'PROVIDER_EVIDENCE_REQUIRED'
  | 'ANALYSIS_LIMITATION'
  | 'UNSUPPORTED_ANALYSIS'
  | 'NOT_APPLICABLE'
  | 'REASON_NOT_ESTABLISHED';

export interface EvidenceFrontierItem {
  facet: string;
  subjectId: string;
  value: string;
  state: AriRelationState;
  coverage: AriCoverageState;
  reasonCode: EvidenceFrontierReasonCode;
  reason: string;
  sourceRelationIds: string[];
}

export interface EvidenceFrontierSection {
  availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  frontierItems: EvidenceFrontierItem[];
  ariFamilyFrontiers: { family: string; state: AriCoverageState; reason: string }[];
  summary: {
    totalFrontiers: number;
    byState: Record<string, number>;
    byReasonCode: Record<string, number>;
  };
  limitations: string[];
}

export interface EvaluatedAssuranceOutput {
  schemaVersion: string;
  evaluationIdentity: EvaluatedAssuranceOutputIdentity;
  buildProvenance: EvaluatedAssuranceOutputBuildProvenance;
  executionArchetype: ExecutionArchetypeSummary;
  actionProof: ActionProofReportSection;
  reachability: AgentReachabilityReportSection;
  actionAssurance: ActionAssuranceReportSection;
  evidenceFrontier: EvidenceFrontierSection;
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

function reasonCodeFromState(
  state: AriRelationState,
  coverage: AriCoverageState,
  limitations: string[],
): EvidenceFrontierReasonCode {
  if (limitations.some((l) => l.includes('RUNTIME'))) return 'RUNTIME_EVIDENCE_REQUIRED';
  if (limitations.some((l) => l.includes('PROVIDER'))) return 'PROVIDER_EVIDENCE_REQUIRED';
  if (limitations.some((l) => l.includes('UNSUPPORTED'))) return 'UNSUPPORTED_ANALYSIS';
  if (state === 'PARTIAL') return 'ANALYSIS_INCOMPLETE';
  if (state === 'UNKNOWN') return 'SOURCE_EVIDENCE_MISSING';
  if (state === 'CANDIDATE') return 'NO_QUALIFYING_EVIDENCE';
  if (state === 'NOT_ANALYZED' || coverage === 'NOT_ANALYZED') return 'NOT_EVALUATED';
  if (coverage === 'PARTIAL' || coverage === 'UNKNOWN') return 'ANALYSIS_INCOMPLETE';
  return 'REASON_NOT_ESTABLISHED';
}

export function buildEvidenceFrontierSection(
  archetypeSummary: ExecutionArchetypeSummary,
  coverage: PersistedOperationCoverageIntelligence,
): EvidenceFrontierSection {
  const frontierItems: EvidenceFrontierItem[] = [];

  for (const f of archetypeSummary.unresolvedFrontiers) {
    const reasonCode = reasonCodeFromState(f.state, f.coverage, []);
    const reasonMap: Record<EvidenceFrontierReasonCode, string> = {
      ANALYSIS_INCOMPLETE: 'Evidence is partial; the analysis did not fully establish this facet.',
      SOURCE_EVIDENCE_MISSING: 'Source evidence required to establish this value is missing.',
      NO_QUALIFYING_EVIDENCE: 'No qualifying evidence supports this value.',
      NOT_EVALUATED: 'This facet was not evaluated for the exact bound scan.',
      SOURCE_NOT_CONNECTED: 'A required evidence source is not connected.',
      RUNTIME_EVIDENCE_REQUIRED: 'Runtime evidence is required to establish this value.',
      PROVIDER_EVIDENCE_REQUIRED: 'Provider-side evidence is required to establish this value.',
      ANALYSIS_LIMITATION: 'The analysis has a known limitation that prevents establishment.',
      UNSUPPORTED_ANALYSIS: 'The current analysis does not support this evidence dimension.',
      NOT_APPLICABLE: 'This item is not applicable to the evaluated scope.',
      REASON_NOT_ESTABLISHED: 'No specific reason was established.',
    };

    const dim = archetypeSummary.dimensions.find((d) => d.facet === f.facet);
    const value = dim?.values.find((v) => v.value === f.value);

    frontierItems.push({
      facet: f.facet,
      subjectId: f.subjectId,
      value: f.value,
      state: f.state,
      coverage: f.coverage,
      reasonCode,
      reason: f.reason || reasonMap[reasonCode],
      sourceRelationIds: value?.sourceRelationIds ?? [],
    });
  }

  const ariFamilyFrontiers: { family: string; state: AriCoverageState; reason: string }[] = [];
  if (coverage.ariCoverage && typeof coverage.ariCoverage === 'object' && !Array.isArray(coverage.ariCoverage)) {
    for (const [family, cov] of Object.entries(coverage.ariCoverage as Record<string, { state?: AriCoverageState } | undefined>)) {
      const state = cov?.state ?? 'UNKNOWN';
      if (state !== 'ANALYZED') {
        const reason = state === 'PARTIAL'
          ? 'ARI family coverage is partial.'
          : state === 'NOT_ANALYZED'
            ? 'ARI family was not analyzed.'
            : 'ARI family state is unresolved.';
        ariFamilyFrontiers.push({ family, state, reason });
      }
    }
  }

  const byState: Record<string, number> = {};
  const byReasonCode: Record<string, number> = {};
  for (const item of frontierItems) {
    byState[item.state] = (byState[item.state] ?? 0) + 1;
    byReasonCode[item.reasonCode] = (byReasonCode[item.reasonCode] ?? 0) + 1;
  }

  return {
    availability: frontierItems.length === 0 ? 'ESTABLISHED' : 'PARTIAL',
    frontierItems,
    ariFamilyFrontiers,
    summary: {
      totalFrontiers: frontierItems.length,
      byState,
      byReasonCode,
    },
    limitations: [
      'Evidence frontier is a deterministic projection of unestablished coverage; it is not a risk score.',
      'Unknown != failure; SOURCE_GAP != risk.',
    ],
  };
}

function notAvailableActionProof(scanId: string, commitSha: string | null): ActionProofReportSection {
  return {
    availability: 'NOT_AVAILABLE',
    unavailableReason: 'SECTION_BUILD_FAILED',
    scanId,
    commitSha,
    coverageLimitations: ['Action Proof requires a full AssuranceEvaluation binding and canonical trace builder.'],
  };
}

function notAvailableReachability(scanId: string, commitSha: string | null): AgentReachabilityReportSection {
  return {
    availability: 'NOT_AVAILABLE',
    unavailableReason: 'SECTION_BUILD_FAILED',
    scanId,
    commitSha,
  };
}

function notAvailableActionAssurance(scanId: string, commitSha: string | null): ActionAssuranceReportSection {
  return {
    availability: 'NOT_AVAILABLE',
    unavailableReason: 'SECTION_BUILD_FAILED',
    scanId,
    commitSha,
  };
}

/**
 * Core deterministic composition from an already-exact bound scan snapshot.
 * This function does not query the database and does not perform source analysis.
 * It is the shared semantic owner used by UI/API/CLI for dry-run and pre-auth preview.
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

  const evidenceFrontier = buildEvidenceFrontierSection(archetypeSummary, coverage);

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
      outputGeneratorBuildIdentity: {
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
    actionProof: notAvailableActionProof(scanId, commitSha),
    reachability: notAvailableReachability(scanId, commitSha),
    actionAssurance: notAvailableActionAssurance(scanId, commitSha),
    evidenceFrontier,
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

  const base = composeAssuranceOutputFromCoverage({
    evaluation,
    coverage: loaded.data,
    scanId: loaded.scanId,
    commitSha: loaded.commitSha,
  });

  const [actionProof, reachability, actionAssurance] = await Promise.all([
    buildActionProofReportSection(evaluation),
    buildAgentReachabilityReportSection(evaluation),
    buildActionAssuranceReportSection(evaluation),
  ]);

  const output: EvaluatedAssuranceOutput = {
    ...base,
    actionProof,
    reachability,
    actionAssurance,
  };

  return { status: 'AVAILABLE', output };
}
