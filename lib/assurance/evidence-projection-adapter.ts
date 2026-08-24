/**
 * U4 → U5 Evidence projection adapter.
 *
 * Converts canonical DecisionEvidenceProjection[] into the ProjectedEvidence[]
 * contract required by evaluateAssurance.  This is the single source of truth
 * for the mapping so production routes and synthetic fixtures use the same
 * semantics.
 */

import { ProjectedEvidence } from './evidence-set-builder';
import { DecisionEvidenceProjection } from '../decision-pipeline/evidence-projection';

export function toAssuranceProjectedEvidence(
  projectedEvidence: DecisionEvidenceProjection[]
): ProjectedEvidence[] {
  return projectedEvidence.map(ev => ({
    id: ev.evidenceId,
    sourceType: ev.producerId,
    sourceId: ev.producerRunId,
    producerRunId: ev.producerRunId,
    evidenceType: ev.evidenceType,
    metadata: null,
    evidenceDate: new Date(ev.observedAt),
    status: 'active',
    contentHash: ev.contentHash,
    findings: ev.findingRefs,
    coverageStatus: ev.coverageStatus,
    coverageRatio: ev.coverageRatio,
    producerOutcome: ev.producerOutcome,
  }));
}
