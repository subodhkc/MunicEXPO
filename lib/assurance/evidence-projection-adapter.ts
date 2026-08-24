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
  return projectedEvidence.map(ev => {
    const declarations = ev.capabilityDeclarations || [];
    const capabilityIds = declarations
      .map(d => d.capabilityId)
      .filter(Boolean);
    const evaluatedRuleIds = declarations
      .map(d => d.sourceRuleId)
      .filter((id): id is string => !!id);
    const concernIds = declarations
      .map(d => d.concernId)
      .filter((id): id is string => !!id);

    const evidenceMethods = new Set(declarations.map(d => d.evidenceMethod).filter(Boolean));
    const evidenceMethod = evidenceMethods.size === 1 ? Array.from(evidenceMethods)[0] : undefined;

    const authorityClasses = new Set(declarations.map(d => d.authorityClass).filter(Boolean));
    const authorityClass = authorityClasses.size === 1 ? Array.from(authorityClasses)[0] : undefined;

    const declarationFindings = (ev.capabilityDeclarations || [])
      .map(d => ({
        ruleId: d.sourceRuleId,
        concernId: d.concernId,
        capabilityId: d.capabilityId,
      }))
      .filter(f => f.ruleId || f.concernId || f.capabilityId);

    return {
      id: ev.evidenceId,
      sourceType: ev.producerId,
      sourceId: ev.producerRunId,
      producerRunId: ev.producerRunId,
      evidenceType: ev.evidenceType,
      metadata: {
        capabilityDeclarations: ev.capabilityDeclarations,
        target: ev.target,
        limitations: ev.limitations,
      } as Record<string, unknown>,
      evidenceDate: new Date(ev.observedAt),
      status: 'active',
      contentHash: ev.contentHash,
      findings: declarationFindings,
      coverageStatus: ev.coverageStatus,
      coverageRatio: ev.coverageRatio,
      producerOutcome: ev.producerOutcome,
      capabilityIds,
      evaluatedRuleIds,
      concernIds,
      evidenceMethod,
      authorityClass,
    };
  });
}
