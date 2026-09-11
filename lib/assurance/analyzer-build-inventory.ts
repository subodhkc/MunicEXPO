/**
 * Analyzer build provenance inventory (Q2-H).
 *
 * Captures every exact build-identity fragment HAIEC knows for a given
 * evaluation. Separates exact analyzer build identity from provenance fragments.
 * Does not invent identity where none is persisted.
 */

import type { EvaluatedAssuranceOutput } from './assurance-output-composer';

export interface AnalyzerBuildIdentity {
  exactAnalyzerBuildIdentityAvailable: boolean;
  analyzerProvenanceFragments: 'FULL' | 'PARTIAL' | 'NONE';
  outputGenerator: {
    commitSha: string;
    commitRef: string;
    buildTimestamp: string;
    packageVersion: string;
  };
  knownFragments: {
    coverageSchemaVersion: string;
    archetypeProducerId: string;
    archetypeProducerVersion: string;
    archetypeSchemaVersion: string;
    scannerVersion: string | null;
    scanId: string;
    commitSha: string | null;
    orchestratorRunId: string;
    evaluationId: string;
  };
  unavailable: string[];
  gaps: string[];
}

export function gatherAnalyzerBuildIdentity(output: EvaluatedAssuranceOutput): AnalyzerBuildIdentity {
  const coverage = output.buildProvenance.schemaVersions.operationCoverage;
  const archetype = output.buildProvenance.schemaVersions.archetype;
  const eaProvenance = output.executionArchetype.provenance;

  const knownFragments = {
    coverageSchemaVersion: coverage,
    archetypeProducerId: eaProvenance.producerId,
    archetypeProducerVersion: eaProvenance.producerVersion,
    archetypeSchemaVersion: eaProvenance.archetypeSchemaVersion,
    scannerVersion: null,
    scanId: output.evaluationIdentity.exactScanId,
    commitSha: output.evaluationIdentity.repositoryCommitSha,
    orchestratorRunId: output.evaluationIdentity.orchestratorRunId,
    evaluationId: output.evaluationIdentity.evaluationId,
  };

  const gaps = [
    'Exact TypeScript AST/extractor build commit is not persisted into the scan snapshot.',
    'Exact Python semantic sidecar build commit is not persisted into the scan snapshot.',
    'Modal deployment image digest/version is not available in the scan snapshot.',
    'Semgrep engine version used for the scan is not captured.',
    'Remote backend container image digest is not bound to the exact scan.',
  ];

  return {
    exactAnalyzerBuildIdentityAvailable: false,
    analyzerProvenanceFragments: 'PARTIAL',
    outputGenerator: output.buildProvenance.outputGeneratorBuildIdentity,
    knownFragments,
    unavailable: output.buildProvenance.analyzerBuildIdentity.reason
      ? [output.buildProvenance.analyzerBuildIdentity.reason]
      : [],
    gaps,
  };
}
