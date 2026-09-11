/**
 * Analyzer Build Provenance Inventory — U5 disclosure.
 *
 * AEI-1: this module is now a PROJECTION of the canonical persisted
 * AnalyzerExecutionIdentity record bound to the exact historical scan
 * snapshot (ai_security_scans.operationCoverageIntelligence.
 * analyzerExecutionIdentity). It never guesses, never reconstructs from the
 * current environment, and never upgrades PARTIAL to EXACT.
 *
 *   LOCK: OUTPUT_GENERATOR_BUILD_IDENTITY != ANALYZER_BUILD_IDENTITY
 *   LOCK: CURRENT_ENVIRONMENT_IDENTITY != HISTORICAL_SCAN_IDENTITY
 *   LOCK: SOURCE_REPOSITORY_COMMIT != ANALYZER_BUILD_COMMIT
 *   LOCK: PARTIAL != EXACT
 *   LOCK: PROVENANCE_GAP != SECURITY_FINDING
 */

import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import {
  computeAnalyzerIdentityDigest,
  type AnalyzerExecutionIdentity,
  type AnalyzerIdentityCaptureState,
} from '@/lib/ai-security/analyzer-execution-identity';

export interface AnalyzerBuildIdentity {
  /**
   * Whether an exact, complete analyzer build/execution identity is
   * established for the evaluated scan — true only when the persisted
   * captureState is EXACT.
   */
  exactAnalyzerBuildIdentityAvailable: boolean;
  /**
   * Canonical digest over the executed decision-relevant analyzer identity
   * set — present only when exactAnalyzerBuildIdentityAvailable is true.
   */
  exactAnalyzerBuildIdentity?: string;
  /** The persisted aggregate capture state for this historical scan. */
  captureState: AnalyzerIdentityCaptureState;
  /** The persisted identity record verbatim, when present on the snapshot. */
  identity?: AnalyzerExecutionIdentity;
  analyzerProvenanceFragments: 'FULL' | 'PARTIAL' | 'NONE';
  /** Output-generator identity is separate — never the analyzer identity. */
  outputGenerator: {
    commitSha: string;
    commitRef: string;
    packageVersion: string;
  };
  knownFragments: {
    coverageSchemaVersion: string;
    archetypeProducerId: string;
    archetypeProducerVersion: string;
    archetypeSchemaVersion: string;
    scannerVersion?: string | null;
    semgrepVersion?: string | null;
    rulepackVersion?: string | null;
    aggregationBuildCommit?: string | null;
    scanId: string;
    repositoryCommitSha?: string | null;
    orchestratorRunId: string;
    evaluationId: string;
  };
  /** Identity fragments that remain unknown (never inferred). */
  unavailable: string[];
  gaps: string[];
}

function componentVersion(
  identity: AnalyzerExecutionIdentity | undefined,
  componentId: string,
): { productVersion?: string; engineVersion?: string; buildCommit?: string } {
  const c = identity?.components.find((x) => x.componentId === componentId);
  return {
    productVersion: c?.productVersion,
    engineVersion: c?.engineVersion,
    buildCommit: c?.buildCommit,
  };
}

/**
 * Gather the analyzer build/execution provenance projection for an evaluated
 * output. Consumes ONLY the persisted historical identity record — legacy
 * scans without a persisted record stay explicitly PARTIAL/NOT_AVAILABLE and
 * are never backfilled from current environment state.
 */
export function gatherAnalyzerBuildIdentity(
  output: EvaluatedAssuranceOutput,
): AnalyzerBuildIdentity {
  const provenance = output.buildProvenance;
  const identity = provenance.analyzerBuildIdentity.identity;
  const captureState = provenance.analyzerBuildIdentity.captureState;
  const exactAvailable = provenance.analyzerBuildIdentity.available;

  const scanner = componentVersion(identity, 'modal-static-scanner');
  const semgrep = componentVersion(identity, 'semgrep-engine');
  const rulepack = componentVersion(identity, 'static-rulepack');
  const aggregation = componentVersion(identity, 'aggregation-source-analyzers');

  const unavailable: string[] = [];
  const gaps: string[] = [];

  if (!identity) {
    // Legacy snapshot without a persisted analyzer identity record —
    // explicitly unknown, never backfilled from current environment state.
    unavailable.push(
      'ANALYZER_EXECUTION_IDENTITY_NOT_PERSISTED',
      'EXACT_TYPESCRIPT_AST_EXTRACTOR_BUILD_COMMIT',
      'EXACT_PYTHON_SEMANTIC_SIDECAR_BUILD_COMMIT',
      'MODAL_DEPLOYMENT_IMAGE_DIGEST',
      'SEMGREP_ENGINE_VERSION',
      'EXACT_REMOTE_BACKEND_CONTAINER_DIGEST',
    );
    gaps.push(
      'Analyzer execution identity is not persisted on this historical scan snapshot.',
      'Missing exact analyzer build provenance does not imply a security failure — it is a provenance boundary, not a finding.',
      'Exact analyzer build provenance cannot be reconstructed from current environment state.',
    );
  } else {
    for (const c of identity.components) {
      if (c.executionState === 'EXECUTED' && c.identityState !== 'EXACT') {
        unavailable.push(`COMPONENT_IDENTITY_NOT_EXACT:${c.componentId}`);
      }
      if (c.executionState === 'UNKNOWN') {
        unavailable.push(`COMPONENT_PARTICIPATION_UNKNOWN:${c.componentId}`);
      }
      for (const lim of c.limitations) {
        if (!unavailable.includes(lim)) unavailable.push(lim);
      }
    }
    if (identity.executionEnvironment && identity.executionEnvironment.identityState !== 'EXACT') {
      unavailable.push('REMOTE_EXECUTION_ENVIRONMENT_NOT_EXACT');
    }
    for (const lim of identity.limitations) {
      gaps.push(lim);
    }
    if (captureState !== 'EXACT') {
      gaps.push(
        'Analyzer execution identity is partially captured — see component-level identity states.',
        'Missing exact analyzer build provenance does not imply a security failure — it is a provenance boundary, not a finding.',
      );
    }
  }

  // The coverage schema + archetype producer fragments are always known for
  // a composed output — so fragments are at least PARTIAL. FULL only when
  // the persisted identity captures an exact executed set.
  const analyzerProvenanceFragments: 'FULL' | 'PARTIAL' | 'NONE' = exactAvailable
    ? 'FULL'
    : 'PARTIAL';

  return {
    exactAnalyzerBuildIdentityAvailable: exactAvailable,
    ...(exactAvailable && identity
      ? { exactAnalyzerBuildIdentity: computeAnalyzerIdentityDigest(identity) }
      : {}),
    captureState,
    ...(identity ? { identity } : {}),
    analyzerProvenanceFragments,
    outputGenerator: {
      commitSha: provenance.outputGeneratorBuildIdentity.commitSha,
      commitRef: provenance.outputGeneratorBuildIdentity.commitRef,
      packageVersion: provenance.outputGeneratorBuildIdentity.packageVersion,
    },
    knownFragments: {
      coverageSchemaVersion: provenance.schemaVersions.operationCoverage,
      archetypeProducerId: output.executionArchetype.provenance.producerId,
      archetypeProducerVersion: output.executionArchetype.provenance.producerVersion,
      archetypeSchemaVersion: output.executionArchetype.provenance.archetypeSchemaVersion,
      scannerVersion: scanner.productVersion ?? null,
      semgrepVersion: semgrep.engineVersion ?? null,
      rulepackVersion: rulepack.productVersion ?? null,
      aggregationBuildCommit: aggregation.buildCommit ?? null,
      scanId: output.evaluationIdentity.exactScanId,
      repositoryCommitSha: output.evaluationIdentity.repositoryCommitSha,
      orchestratorRunId: output.evaluationIdentity.orchestratorRunId,
      evaluationId: output.evaluationIdentity.evaluationId,
    },
    unavailable,
    gaps,
  };
}
