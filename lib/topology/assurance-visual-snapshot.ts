import type { ConstellationProjection, TopologyProjectionResult } from './types';
import type { ActionAssuranceReportSection } from '@/lib/assurance/u6-types';

export interface AssuranceVisualSnapshot {
  visualSnapshotVersion: 'assurance-visual-1.0.0';
  organizationId: string;
  aiSystemId: string;
  sourceScanId: string | null;
  sourceCommitSha: string | null;
  evaluationId: string | null;
  evaluatedBasis: string | null;
  /**
   * Canonical U5 disposition carried from the evaluated basis — historical,
   * bounded to the evaluation snapshot. Pass-through only; never computed
   * or re-derived here.
   * LOCK: EVALUATED_DISPOSITION != CURRENT_VERDICT
   */
  assuranceDisposition: string | null;
  /**
   * AA-FLAGSHIP-1: bounded Action Assurance summary carried from the
   * canonical ActionAssuranceReportSection — counts and availability only.
   * The section itself remains the canonical owner; this is a projection.
   * LOCK: SNAPSHOT_SUMMARY != SECOND_ASSURANCE_ENGINE
   */
  actionAssurance: {
    availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
    unavailableReason?: string;
    surfaceCount: number;
    agentCount: number;
    relationCount: number;
    frontierCount: number;
    coverageFamilyCount: number;
    evaluatedScanId?: string;
    evaluatedCommitSha?: string | null;
  } | null;
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
    /** Canonical Action Assurance section — carried as bounded summary only */
    actionAssurance?: ActionAssuranceReportSection | null;
  },
): AssuranceVisualSnapshot {
  const nodes = constellation?.nodes ?? [];
  const edges = constellation?.edges ?? [];
  const aa = options.actionAssurance;
  return {
    visualSnapshotVersion: 'assurance-visual-1.0.0',
    organizationId: projection.organizationId,
    aiSystemId: projection.aiSystemId,
    sourceScanId: projection.scanId ?? projection.scanProvenance?.scanId ?? null,
    sourceCommitSha: projection.scanProvenance?.commitSha ?? null,
    evaluationId: projection.evaluatedBasis?.evaluationId ?? null,
    evaluatedBasis: projection.evaluatedBasis?.state ?? null,
    assuranceDisposition: projection.evaluatedBasis?.disposition ?? null,
    actionAssurance: aa
      ? {
          availability: aa.availability,
          unavailableReason: aa.unavailableReason,
          surfaceCount: aa.summary?.surfaceCount ?? 0,
          agentCount: aa.summary?.agentCount ?? 0,
          relationCount: aa.summary?.relationCount ?? 0,
          frontierCount: aa.summary?.frontierCount ?? 0,
          coverageFamilyCount: aa.summary?.coverageFamilyCount ?? 0,
          evaluatedScanId: aa.scanId,
          evaluatedCommitSha: aa.commitSha,
        }
      : null,
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
