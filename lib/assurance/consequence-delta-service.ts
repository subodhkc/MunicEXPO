/**
 * Consequence Delta service — canonical entry point.
 *
 * Resolves two persisted COMPLETED Assurance evaluations of the SAME AI
 * system, loads each exact evaluated operation-coverage snapshot through the
 * canonical evaluated-scan loader, qualifies scope + analyzer comparability,
 * and returns a deterministic ConsequenceDelta.
 *
 * LOCKS:
 *   NO_LATEST_FALLBACK — never substitutes current sources for evaluations.
 *   NO_STATIC_REANALYSIS — read-side only; no mutation.
 *   CROSS_ORG / CROSS_SYSTEM => FAIL CLOSED.
 *   MISSING_ANALYZER_IDENTITY != ANALYZER_MATCH — partial comparability is
 *   disclosed through comparisonContext, never silently inferred.
 */

import { prisma } from '@/lib/prisma';
import { getAssuranceEvaluationById } from './persistence';
import { loadEvaluatedOperationCoverage } from './u6-scan-loader';
import { getEvaluatedScopeByEvaluationId } from './scope-persistence';
import { composeAssuranceOutputFromCoverage } from './assurance-output-composer';
import { gatherAnalyzerBuildIdentity } from './analyzer-build-inventory';
import type { AssuranceEvaluation } from './types';
import {
  buildConsequenceDelta,
  type ConsequenceDelta,
  type ConsequenceDeltaUnavailableReason,
  type DeltaComparisonContext,
  type DeltaAnalyzerComparability,
} from './consequence-delta';

export interface BuildDeltaForEvaluationsInput {
  baselineEvaluationId: string;
  candidateEvaluationId: string;
  organizationId: string;
  aiSystemId: string;
}

function notAvailable(
  reason: ConsequenceDeltaUnavailableReason,
): ConsequenceDelta {
  return {
    schemaVersion: 'consequence-delta-1.0.0',
    deltaId: '',
    availability: 'NOT_AVAILABLE',
    unavailableReason: reason,
    items: [],
    coverage: [],
    limitations: [],
  };
}

async function loadOwnership(evaluationId: string) {
  return prisma.assurance_evaluations.findUnique({
    where: { id: evaluationId },
    select: {
      id: true,
      organizationId: true,
      aiSystemId: true,
      evaluationStatus: true,
      evaluationSnapshotAt: true,
    },
  });
}

export async function buildConsequenceDeltaForEvaluations(
  input: BuildDeltaForEvaluationsInput,
): Promise<ConsequenceDelta> {
  const {
    baselineEvaluationId,
    candidateEvaluationId,
    organizationId,
    aiSystemId,
  } = input;

  // 5/6. Reject same-evaluation and missing records.
  if (baselineEvaluationId === candidateEvaluationId) {
    return notAvailable('SAME_EVALUATION_COMPARISON');
  }

  const [baselineOwnership, candidateOwnership] = await Promise.all([
    loadOwnership(baselineEvaluationId),
    loadOwnership(candidateEvaluationId),
  ]);

  if (!baselineOwnership) return notAvailable('BASELINE_EVALUATION_NOT_FOUND');
  if (!candidateOwnership) return notAvailable('CANDIDATE_EVALUATION_NOT_FOUND');

  // 3/4/5. Org + system ownership — fail closed on any mismatch.
  if (
    baselineOwnership.organizationId !== organizationId ||
    candidateOwnership.organizationId !== organizationId
  ) {
    return notAvailable('CROSS_ORGANIZATION_COMPARISON');
  }
  if (
    baselineOwnership.aiSystemId !== aiSystemId ||
    candidateOwnership.aiSystemId !== aiSystemId ||
    baselineOwnership.aiSystemId !== candidateOwnership.aiSystemId
  ) {
    return notAvailable('CROSS_AI_SYSTEM_COMPARISON');
  }

  // 7A. Only COMPLETED evaluations are authoritative comparison inputs.
  if (baselineOwnership.evaluationStatus !== 'COMPLETED') {
    return notAvailable('BASELINE_EVALUATION_NOT_COMPLETED');
  }
  if (candidateOwnership.evaluationStatus !== 'COMPLETED') {
    return notAvailable('CANDIDATE_EVALUATION_NOT_COMPLETED');
  }

  // 7B. Directional chronology is evaluation chronology.
  if (
    !(baselineOwnership.evaluationSnapshotAt < candidateOwnership.evaluationSnapshotAt)
  ) {
    return notAvailable('INVALID_COMPARISON_ORDER');
  }

  // 7. Full reconstruction through the canonical owner (org-scoped).
  const [baseline, candidate] = await Promise.all([
    getAssuranceEvaluationById(baselineEvaluationId, organizationId),
    getAssuranceEvaluationById(candidateEvaluationId, organizationId),
  ]);
  if (!baseline) return notAvailable('BASELINE_EVALUATION_NOT_FOUND');
  if (!candidate) return notAvailable('CANDIDATE_EVALUATION_NOT_FOUND');

  // 7C. Evaluated-scope comparability through the canonical scope owner.
  const [baselineScope, candidateScope] = await Promise.all([
    getEvaluatedScopeByEvaluationId(baseline.id, organizationId).catch(() => null),
    getEvaluatedScopeByEvaluationId(candidate.id, organizationId).catch(() => null),
  ]);

  const scopeComparison: DeltaComparisonContext['scopeComparison'] = {
    state:
      baselineScope && candidateScope
        ? baselineScope.scopeDigest === candidateScope.scopeDigest ? 'SAME' : 'CHANGED'
        : 'NOT_AVAILABLE',
    baselineScopeSchemaVersion: baselineScope?.scopeSchemaVersion,
    candidateScopeSchemaVersion: candidateScope?.scopeSchemaVersion,
    baselineScopeDigest: baselineScope?.scopeDigest,
    candidateScopeDigest: candidateScope?.scopeDigest,
    limitations:
      baselineScope && candidateScope
        ? baselineScope.scopeDigest === candidateScope.scopeDigest ? [] : [
            'Evaluated scope differs between baseline and candidate; absence/addition claims are gated to comparable coverage.',
          ]
        : [
            'Evaluated scope snapshot is not persisted for one or both evaluations (legacy); scope comparability is not established.',
          ],
  };

  // 8. Exact evaluated snapshots through the canonical evaluated-scan loader.
  const [baselineCoverage, candidateCoverage] = await Promise.all([
    loadEvaluatedOperationCoverage(baseline),
    loadEvaluatedOperationCoverage(candidate),
  ]);

  if ('availability' in baselineCoverage) {
    return {
      ...notAvailable('BASELINE_SNAPSHOT_NOT_AVAILABLE'),
      limitations: [baselineCoverage.unavailableReason],
    };
  }
  if ('availability' in candidateCoverage) {
    return {
      ...notAvailable('CANDIDATE_SNAPSHOT_NOT_AVAILABLE'),
      limitations: [candidateCoverage.unavailableReason],
    };
  }

  // Analyzer build comparability through the canonical inventory owner.
  // EXACT_ANALYZER_BUILD_IDENTITY_AVAILABLE stays false while the build
  // identity is not persisted — partial comparability is disclosed, never
  // silently inferred (§57.8).
  const analyzerComparability: DeltaAnalyzerComparability = (() => {
    const baselineIdentity = gatherAnalyzerBuildIdentity(
      composeAssuranceOutputFromCoverage({
        evaluation: baseline,
        coverage: baselineCoverage.data,
        scanId: baselineCoverage.scanId,
        commitSha: baselineCoverage.commitSha,
      }),
    );
    const candidateIdentity = gatherAnalyzerBuildIdentity(
      composeAssuranceOutputFromCoverage({
        evaluation: candidate,
        coverage: candidateCoverage.data,
        scanId: candidateCoverage.scanId,
        commitSha: candidateCoverage.commitSha,
      }),
    );
    const exact =
      baselineIdentity.exactAnalyzerBuildIdentityAvailable &&
      candidateIdentity.exactAnalyzerBuildIdentityAvailable;
    const fragmentsEqual =
      baselineIdentity.knownFragments.coverageSchemaVersion ===
        candidateIdentity.knownFragments.coverageSchemaVersion &&
      baselineIdentity.knownFragments.archetypeProducerId ===
        candidateIdentity.knownFragments.archetypeProducerId &&
      baselineIdentity.knownFragments.archetypeSchemaVersion ===
        candidateIdentity.knownFragments.archetypeSchemaVersion;
    return {
      state: exact && fragmentsEqual ? 'EXACT' : 'PARTIAL',
      exactAnalyzerBuildIdentityAvailable: exact,
      knownFragments: {
        baselineCoverageSchemaVersion: baselineIdentity.knownFragments.coverageSchemaVersion,
        candidateCoverageSchemaVersion: candidateIdentity.knownFragments.coverageSchemaVersion,
        baselineArchetypeProducerId: baselineIdentity.knownFragments.archetypeProducerId,
        candidateArchetypeProducerId: candidateIdentity.knownFragments.archetypeProducerId,
        baselineArchetypeSchemaVersion: baselineIdentity.knownFragments.archetypeSchemaVersion,
        candidateArchetypeSchemaVersion: candidateIdentity.knownFragments.archetypeSchemaVersion,
      },
      limitations: [
        ...(exact
          ? []
          : [
              'Exact analyzer build identity is not persisted for one or both evaluations; analyzer equivalence is not claimed.',
              ...baselineIdentity.gaps,
            ]),
        ...(!fragmentsEqual
          ? ['Known analyzer provenance fragments differ between evaluations; comparison state is degraded.']
          : []),
      ],
    };
  })();

  const comparisonContext: DeltaComparisonContext = {
    baselineEvaluationSnapshotAt: baseline.evaluationSnapshotAt.toISOString(),
    candidateEvaluationSnapshotAt: candidate.evaluationSnapshotAt.toISOString(),
    scopeComparison,
    baselineAssuranceMethodologyVersion: baseline.assuranceMethodologyVersion,
    candidateAssuranceMethodologyVersion: candidate.assuranceMethodologyVersion,
    analyzerComparability,
  };

  const toSnapshotIdentity = (
    evaluation: AssuranceEvaluation,
    scan: { scanId: string; commitSha: string | null; data: { schemaVersion: string } },
    scope: typeof baselineScope,
  ) => ({
    evaluationId: evaluation.id,
    orchestratorRunId: evaluation.orchestratorRunId,
    scanId: scan.scanId,
    commitSha: scan.commitSha,
    operationCoverageSchemaVersion: scan.data.schemaVersion,
    evaluatedScopeSchemaVersion: scope?.scopeSchemaVersion,
    evaluatedScopeDigest: scope?.scopeDigest,
    organizationId: evaluation.organizationId,
    aiSystemId: evaluation.aiSystemId,
  });

  // 11/12. Pure deterministic Delta build — no mutation.
  return buildConsequenceDelta({
    baseline: {
      identity: toSnapshotIdentity(baseline, baselineCoverage, baselineScope),
      snapshot: baselineCoverage.data,
    },
    candidate: {
      identity: toSnapshotIdentity(candidate, candidateCoverage, candidateScope),
      snapshot: candidateCoverage.data,
    },
    comparisonContext,
    limitations: [
      ...scopeComparison.limitations,
      ...analyzerComparability.limitations,
    ],
  });
}
