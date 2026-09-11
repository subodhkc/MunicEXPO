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
import { buildActionProofReportSectionFromSnapshot } from './u6-action-proof-section';
import { buildAgentReachabilityReportSectionFromSnapshot } from './u6-agent-reachability-section';
import { buildActionAssuranceReportSectionFromSnapshot } from './u6-action-assurance-section';
import { buildAgentReachabilityReadModel } from '@/lib/ai-inventory/agent-reachability-read-model';
import type { AgentReachabilityReadModel } from '@/lib/ai-inventory/agent-reachability-read-model';
import type {
  ActionProofReportSection,
  AgentReachabilityReportSection,
  ActionAssuranceReportSection,
} from './u6-types';
import type { AriCoverageState, AriRelationState } from '@/lib/ai-security/types';
import {
  calculateRuleExecutionSummary,
  type RuleExecution,
} from '@/lib/ai-security/rule-execution-helpers';
import {
  buildScanFrameworkRelevanceForFinding,
  type ScanFrameworkProjectionEntry,
} from '@/capabilities/engine-qual/versioned-framework-mapping';
import type { FrameworkRelevanceEntry } from '@/lib/reports/base/report-types';
import type { Prisma } from '@prisma/client';

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
  /** WP-S5: Aggregate versioned framework relevance crosswalk for this evaluation. Not a compliance verdict. */
  frameworkRelevanceSummary: {
    projectionStatus: 'ASSESSED' | 'NOT_ASSESSED';
    reasonCode: string;
    frameworks: FrameworkRelevanceEntry[];
    disclaimer: string;
  };
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
): EvidenceFrontierReasonCode {
  // PROSE != STRUCTURED_REASON
  // Reason codes are derived only from structured source state/coverage.
  // UNKNOWN != SOURCE_EVIDENCE_MISSING; CANDIDATE != NO_QUALIFYING_EVIDENCE.
  if (state === 'NOT_ANALYZED' || coverage === 'NOT_ANALYZED') return 'NOT_EVALUATED';
  return 'REASON_NOT_ESTABLISHED';
}

export function buildEvidenceFrontierSection(
  archetypeSummary: ExecutionArchetypeSummary,
  coverage: PersistedOperationCoverageIntelligence,
): EvidenceFrontierSection {
  const frontierItems: EvidenceFrontierItem[] = [];

  for (const f of archetypeSummary.unresolvedFrontiers) {
    const reasonCode = reasonCodeFromState(f.state, f.coverage);

    const dim = archetypeSummary.dimensions.find((d) => d.facet === f.facet);
    const value = dim?.values.find((v) => v.value === f.value);

    frontierItems.push({
      facet: f.facet,
      subjectId: f.subjectId,
      value: f.value,
      state: f.state,
      coverage: f.coverage,
      reasonCode,
      reason: f.reason || 'No specific reason was established.',
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
    frameworkRelevanceSummary: {
      projectionStatus: 'NOT_ASSESSED',
      reasonCode: 'NO_RULE_EXECUTION_TRUTH',
      frameworks: [],
      disclaimer: 'Framework relevance requires exact persisted rule execution truth.',
    },
  };
}

export interface LoadedAssuranceCoverage {
  data: PersistedOperationCoverageIntelligence;
  scanId: string;
  commitSha: string | null;
  /** Persisted rule execution truth for this exact scan, when available. */
  rulesEvaluated?: Prisma.JsonValue;
}

function parseRulesEvaluated(rulesEvaluated: Prisma.JsonValue | null | undefined): Record<string, RuleExecution> | null {
  try {
    const parsed = typeof rulesEvaluated === 'string' ? JSON.parse(rulesEvaluated) : rulesEvaluated;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, RuleExecution>;
  } catch {
    return null;
  }
}

function toFrameworkRelevanceEntry(m: ScanFrameworkProjectionEntry): FrameworkRelevanceEntry {
  return {
    frameworkId: m.frameworkId,
    family: m.family,
    release: m.release,
    categoryId: m.categoryId,
    categoryTitle: m.categoryTitle,
    mappingBasis: m.mappingBasis,
    mappingStrength: m.mappingStrength,
    mappingQualification: m.mappingQualification,
    coverageClass: m.coverageClass,
    limitations: m.limitations,
    sourceIdentity: m.sourceIdentity,
    isCanonical: m.mappingQualification !== 'LEGACY_UNVERSIONED',
    ruleId: m.displayRuleId ?? m.haiecSubjectId,
    producerRuleId: m.producerRuleId,
  };
}

function buildFrameworkRelevanceSummary(
  rulesEvaluated: Prisma.JsonValue | undefined,
): EvaluatedAssuranceOutput['frameworkRelevanceSummary'] {
  const parsed = parseRulesEvaluated(rulesEvaluated);
  if (!parsed) {
    return {
      projectionStatus: 'NOT_ASSESSED',
      reasonCode: 'NO_RULE_EXECUTION_TRUTH',
      frameworks: [],
      disclaimer: 'Framework relevance requires exact persisted rule execution truth.',
    };
  }

  const summary = calculateRuleExecutionSummary(parsed);
  const executionTruthStatus = summary.isTrustedExecutionTruth ? 'TRUSTED' : 'UNTRUSTED_EXECUTION_TRUTH';

  const getProducerState = (record: RuleExecution): 'RUN' | 'NOT_RUN' | 'FAILED' => {
    if (record.status === 'completed') return 'RUN';
    if (record.status === 'error') return 'FAILED';
    return 'NOT_RUN';
  };

  const seen = new Set<string>();
  const frameworks: FrameworkRelevanceEntry[] = [];

  for (const ruleId of Object.keys(parsed)) {
    const record = parsed[ruleId];
    const relevance = buildScanFrameworkRelevanceForFinding(ruleId, {
      producerState: getProducerState(record),
      executionTruthStatus,
      applicability: record.applicability,
    });
    for (const entry of relevance.applicableMappings.map(toFrameworkRelevanceEntry)) {
      const key = `${entry.frameworkId}::${entry.release}::${entry.categoryId}::${entry.ruleId}`;
      if (!seen.has(key)) {
        seen.add(key);
        frameworks.push(entry);
      }
    }
  }

  return {
    projectionStatus: frameworks.length > 0 ? 'ASSESSED' : 'NOT_ASSESSED',
    reasonCode: frameworks.length > 0 ? 'QUALIFIED_SUBJECT_BINDINGS_FOUND' : 'NO_QUALIFIED_SUBJECT_BINDING',
    frameworks,
    disclaimer: 'Framework mappings indicate relevance of observed evidence to external framework categories/controls. Mapping presence does not imply control satisfaction, coverage, compliance, or certification.',
  };
}

/**
 * Build the complete EvaluatedAssuranceOutput from a single already-loaded,
 * validated coverage snapshot. No database access.
 */
export function buildAssuranceOutputFromLoadedCoverage(
  evaluation: Pick<AssuranceEvaluation, 'id' | 'organizationId' | 'aiSystemId' | 'orchestratorRunId'>,
  loaded: LoadedAssuranceCoverage,
  providedReadModel?: AgentReachabilityReadModel,
): EvaluatedAssuranceOutput {
  const base = composeAssuranceOutputFromCoverage({
    evaluation,
    coverage: loaded.data,
    scanId: loaded.scanId,
    commitSha: loaded.commitSha,
  });

  const readModel = providedReadModel ?? buildAgentReachabilityReadModel(loaded.data, {
    scanId: loaded.scanId,
    commitSha: loaded.commitSha,
  });

  const actionProof = buildActionProofReportSectionFromSnapshot(loaded.data, loaded.scanId, loaded.commitSha);
  const reachability = buildAgentReachabilityReportSectionFromSnapshot(readModel);
  const actionAssurance = buildActionAssuranceReportSectionFromSnapshot(readModel, loaded.data, loaded.scanId, loaded.commitSha);
  const frameworkRelevanceSummary = buildFrameworkRelevanceSummary(loaded.rulesEvaluated ?? null);

  return {
    ...base,
    actionProof,
    reachability,
    actionAssurance,
    frameworkRelevanceSummary,
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

  const output = buildAssuranceOutputFromLoadedCoverage(evaluation, loaded);

  return { status: 'AVAILABLE', output };
}
