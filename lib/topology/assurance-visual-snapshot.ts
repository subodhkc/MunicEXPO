import type { ConstellationProjection, TopologyProjectionResult } from './types';

export interface AssuranceVisualSnapshot {
  visualSnapshotVersion: 'assurance-visual-1.0.0';
  organizationId: string;
  aiSystemId: string;
  sourceScanId: string | null;
  sourceCommitSha: string | null;
  evaluationId: string | null;
  evaluatedBasis: string | null;
  view: string;
  focusCanonicalId: string | null;
  selectedPathId: string | null;
  includedCanonicalNodeIds: string[];
  includedRelationIds: string[];
  coverage: TopologyProjectionResult['coverage'];
  limitations: string[];
  frontiers: string[];
  shown: number;
  total: number;
  truncated: boolean;
  generatedAt: string;
  projectionHash: string;
  isSample: boolean;
}

export function buildAssuranceVisualSnapshot(
  projection: TopologyProjectionResult,
  constellation: ConstellationProjection | null,
  options: {
    view: string;
    focusCanonicalId?: string | null;
    selectedPathId?: string | null;
    generatedAt?: string;
  },
): AssuranceVisualSnapshot {
  const nodes = constellation?.nodes ?? [];
  const edges = constellation?.edges ?? [];
  return {
    visualSnapshotVersion: 'assurance-visual-1.0.0',
    organizationId: projection.organizationId,
    aiSystemId: projection.aiSystemId,
    sourceScanId: projection.scanId ?? projection.scanProvenance?.scanId ?? null,
    sourceCommitSha: projection.scanProvenance?.commitSha ?? null,
    evaluationId: projection.evaluatedBasis?.evaluationId ?? null,
    evaluatedBasis: projection.evaluatedBasis?.state ?? null,
    view: options.view,
    focusCanonicalId: options.focusCanonicalId ?? null,
    selectedPathId: options.selectedPathId ?? null,
    includedCanonicalNodeIds: nodes.map((node) => node.canonicalNodeId),
    includedRelationIds: edges.map((edge) => edge.canonicalEdgeId),
    coverage: projection.coverage,
    limitations: [...projection.limitations, ...(constellation?.limitations ?? [])],
    frontiers: [...(constellation?.frontiers ?? [])].map((frontier) => frontier.reason),
    shown: nodes.length,
    total: projection.nodes.length,
    truncated: nodes.length < projection.nodes.length,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    projectionHash: projection.projectionHash,
    isSample: projection.nodes.some((node) => node.sampleContext?.isSample === true),
  };
}
