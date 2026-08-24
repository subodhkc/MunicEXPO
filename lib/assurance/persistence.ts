/**
 * E1 Closure Sections 4, 13, 28 — Assurance Persistence Service
 *
 * Section 4: Methodology 1.1 AssuranceEvaluation must durably record:
 *   profileId, profileVersion, profileDigest, effective rulePackVersions,
 *   effective claimPackVersions, operatingEnvelopeId/Version/Digest,
 *   operatingEnvelopeState/approval reference.
 *
 * Section 13: Persist the effective five-plane/capability comparison result
 *   associated with methodology 1.1 evaluation.
 *
 * Section 28: Tenant safety — all records carry organizationId, no cross-org access.
 *
 * A13: Idempotency distinguishes same-input vs changed-input conflict.
 * A14: All lookup/idempotency checks include authoritative tenant ownership.
 * B31: Tenant-scoped — all records carry organizationId.
 */

import { prisma } from '@/lib/prisma';
import {
  AssuranceEvaluation,
  AssuranceEvaluationV1_1,
  ClaimEvaluationResult,
  PersistenceResult,
  PersistedFivePlaneResult,
  ASSURANCE_METHODOLOGY_VERSION_1_1,
} from './types';

/**
 * Persist an Assurance Evaluation to the database.
 *
 * A13: Idempotency/conflict semantics:
 *   - same run + same methodology + same inputHash → IDEMPOTENT (return existing)
 *   - same run + same methodology + different inputHash → CONFLICT (fail closed, do NOT overwrite)
 *   - no existing → CREATE
 *
 * Section 4: Methodology 1.1 rows record profile/envelope identities in
 * `assurance_evaluation_profile_bindings`.
 * Historical methodology 1.0 rows remain valid with null profile fields.
 */
export async function persistAssuranceEvaluation(
  evaluation: AssuranceEvaluation
): Promise<PersistenceResult> {
  // A14: Check for existing evaluation WITH tenant ownership
  const existing = await prisma.assurance_evaluations.findFirst({
    where: {
      orchestratorRunId: evaluation.orchestratorRunId,
      assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
      organizationId: evaluation.organizationId, // A14: tenant safety
    },
    select: { id: true, inputHash: true, outputHash: true },
  });

  if (existing) {
    // A13: Check inputHash to distinguish idempotent from conflict
    if (existing.inputHash === evaluation.inputHash) {
      // Same input → IDEMPOTENT
      return { status: 'IDEMPOTENT', id: existing.id };
    }
    // A13: Different input → CONFLICT (fail closed, do NOT overwrite)
    return {
      status: 'CONFLICT',
      id: existing.id,
      conflictReason: 'ASSURANCE_EVALUATION_INPUT_CONFLICT',
    };
  }

  // Create the evaluation with all related records in a transaction
  const result = await prisma.$transaction(async (tx: any) => {
    const evalRecord = await tx.assurance_evaluations.create({
      data: {
        id: evaluation.id,
        organizationId: evaluation.organizationId,
        aiSystemId: evaluation.aiSystemId,
        orchestratorRunId: evaluation.orchestratorRunId,
        pipelineAggregationId: evaluation.pipelineAggregationId,
        assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
        evaluationSnapshotAt: evaluation.evaluationSnapshotAt,
        disposition: evaluation.disposition,
        evaluationStatus: evaluation.evaluationStatus,
        claimCounts: evaluation.claimCounts as any,
        reasonCodes: evaluation.reasonCodes as any,
        evidenceSetDigest: evaluation.evidenceSetDigest,
        inputHash: evaluation.inputHash,
        outputHash: evaluation.outputHash,
      },
    });

    // Section 4: Persist 1.1 profile/envelope binding
    if (isV1_1(evaluation)) {
      const v1_1 = evaluation as AssuranceEvaluationV1_1;
      await tx.assurance_evaluation_profile_bindings.create({
        data: {
          assuranceEvaluationId: evalRecord.id,
          organizationId: evaluation.organizationId,
          profileId: v1_1.profileId,
          profileVersion: v1_1.profileVersion,
          profileDigest: v1_1.profileDigest,
          profileDigestResolved: v1_1.profileDigestResolved ?? v1_1.profileDigest ?? null,
          claimPackVersions: v1_1.claimPackVersions as any,
          rulePackVersions: v1_1.rulePackVersions as any,
          operatingEnvelopeId: v1_1.operatingEnvelopeId ?? null,
          operatingEnvelopeVersion: v1_1.operatingEnvelopeVersion ?? null,
          operatingEnvelopeDigest: v1_1.operatingEnvelopeDigest ?? null,
          operatingEnvelopeState: v1_1.operatingEnvelopeState ?? null,
          operatingEnvelopeApprovedBy: v1_1.operatingEnvelopeApprovedBy ?? null,
          operatingEnvelopeApprovalReference: v1_1.operatingEnvelopeApprovalReference ?? null,
          // Section 13: Persist five-plane comparison as concise JSON
          fivePlaneResult: buildPersistedFivePlaneResult(v1_1) as any,
          applicableClaimKeys: (v1_1.applicableClaimKeys ?? []) as any,
        },
      });
    }

    for (const claimResult of evaluation.claimResults) {
      const claimEval = await tx.control_claim_evaluations.create({
        data: {
          assuranceEvaluationId: evalRecord.id,
          organizationId: evaluation.organizationId,
          claimKey: claimResult.claimKey,
          claimVersion: claimResult.claimVersion,
          claimState: claimResult.claimState,
          reasonCodes: claimResult.reasonCodes as any,
          dimensionResult: claimResult.dimensionResult as any,
          supportingCount: claimResult.supportingCount,
          contradictingCount: claimResult.contradictingCount,
          excludedCount: claimResult.excludedCount,
          explanation: claimResult.explanation,
          evidenceSetDigest: claimResult.evidenceSet.setDigest,
        },
      });

      const evidenceSet = await tx.control_evidence_sets.create({
        data: {
          controlClaimEvaluationId: claimEval.id,
          organizationId: evaluation.organizationId,
          claimKey: claimResult.claimKey,
          claimVersion: claimResult.claimVersion,
          setDigest: claimResult.evidenceSet.setDigest,
        },
      });

      for (const member of claimResult.evidenceSet.members) {
        await tx.control_evidence_set_members.create({
          data: {
            controlEvidenceSetId: evidenceSet.id,
            organizationId: evaluation.organizationId,
            evidenceId: member.evidenceId,
            role: member.role,
            epistemicClass: member.epistemicClass,
            producerId: member.producerId,
            exclusionReason: member.exclusionReason ?? null,
            contentHash: member.contentHash ?? null,
          },
        });
      }
    }

    return evalRecord;
  });

  return { status: 'CREATED', id: result.id };
}

/**
 * Section 13: Build concise five-plane result JSON for persistence.
 */
function buildPersistedFivePlaneResult(evaluation: AssuranceEvaluationV1_1): PersistedFivePlaneResult | null {
  const comparisons = evaluation.fivePlaneComparisons;
  if (!comparisons || comparisons.length === 0) return null;

  return {
    comparisons: comparisons.map(c => ({
      capabilityKey: c.capabilityKey,
      comparisons: c.comparisons,
      mappedClaimKey: c.mappedClaimKey,
      verdict: c.verdict,
      evidenceIds: c.evidenceIds,
      planes: {
        requested: c.requested,
        policyAuthorized: c.policyAuthorized,
        effectivelyGranted: c.effectivelyGranted,
        codeCapable: c.codeCapable,
        observed: c.observed,
      },
    })),
    overallVerdict: evaluation.fivePlaneOverallVerdict ?? 'REVIEW',
  };
}

function isV1_1(evaluation: AssuranceEvaluation): boolean {
  return (evaluation as AssuranceEvaluationV1_1).assuranceMethodologyVersion === ASSURANCE_METHODOLOGY_VERSION_1_1;
}

/**
 * Retrieve an Assurance Evaluation by orchestrator run ID.
 * A14: organizationId is required for tenant safety.
 */
export async function getAssuranceEvaluation(
  orchestratorRunId: string,
  organizationId: string
): Promise<AssuranceEvaluation | null> {
  const record = await prisma.assurance_evaluations.findFirst({
    where: { orchestratorRunId, organizationId },
    include: {
      control_claim_evaluations: {
        include: {
          control_evidence_sets: {
            include: {
              control_evidence_set_members: true,
            },
          },
        },
      },
      assurance_evaluation_profile_bindings: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return null;

  return reconstructEvaluation(record);
}



/**
 * A15: Reconstruct an AssuranceEvaluation from DB records.
 */
function reconstructEvaluation(record: any): AssuranceEvaluation {
  const claimResults: ClaimEvaluationResult[] = record.control_claim_evaluations.map((ce: any) => ({
    claimKey: ce.claimKey,
    claimVersion: ce.claimVersion,
    claimState: ce.claimState,
    reasonCodes: ce.reasonCodes as string[],
    dimensionResult: ce.dimensionResult,
    evidenceSet: {
      claimKey: ce.claimKey,
      claimVersion: ce.claimVersion,
      setDigest: ce.evidenceSetDigest,
      members: ce.control_evidence_sets?.control_evidence_set_members?.map((m: any) => ({
        evidenceId: m.evidenceId,
        role: m.role,
        epistemicClass: m.epistemicClass,
        producerId: m.producerId,
        exclusionReason: m.exclusionReason ?? undefined,
        contentHash: m.contentHash ?? undefined,
      })) ?? [],
    },
    supportingCount: ce.supportingCount,
    contradictingCount: ce.contradictingCount,
    excludedCount: ce.excludedCount,
    explanation: ce.explanation,
  }));

  const base: AssuranceEvaluation = {
    id: record.id,
    organizationId: record.organizationId,
    aiSystemId: record.aiSystemId,
    orchestratorRunId: record.orchestratorRunId,
    pipelineAggregationId: record.pipelineAggregationId,
    assuranceMethodologyVersion: record.assuranceMethodologyVersion,
    evaluationSnapshotAt: record.evaluationSnapshotAt,
    disposition: record.disposition,
    evaluationStatus: record.evaluationStatus,
    claimResults,
    claimCounts: record.claimCounts,
    reasonCodes: record.reasonCodes,
    evidenceSetDigest: record.evidenceSetDigest,
    inputHash: record.inputHash,
    outputHash: record.outputHash,
    createdAt: record.createdAt,
  };

  // Section 4: Reconstruct 1.1 fields if binding exists
  const binding = record.assurance_evaluation_profile_bindings;
  if (binding && base.assuranceMethodologyVersion === ASSURANCE_METHODOLOGY_VERSION_1_1) {
    const v1_1: AssuranceEvaluationV1_1 = {
      ...base,
      assuranceMethodologyVersion: '1.1',
      profileId: binding.profileId,
      profileVersion: binding.profileVersion,
      profileDigest: binding.profileDigest,
      profileDigestResolved: binding.profileDigestResolved ?? binding.profileDigest ?? '',
      operatingEnvelopeId: binding.operatingEnvelopeId ?? undefined,
      operatingEnvelopeVersion: binding.operatingEnvelopeVersion ?? undefined,
      operatingEnvelopeDigest: binding.operatingEnvelopeDigest ?? undefined,
      operatingEnvelopeState: binding.operatingEnvelopeState ?? undefined,
      operatingEnvelopeApprovedBy: binding.operatingEnvelopeApprovedBy ?? undefined,
      operatingEnvelopeApprovalReference: binding.operatingEnvelopeApprovalReference ?? undefined,
      applicableClaimKeys: binding.applicableClaimKeys as string[] ?? [],
      claimPackVersions: binding.claimPackVersions as Record<string, string> ?? {},
      rulePackVersions: binding.rulePackVersions as Record<string, string> ?? {},
      fivePlaneOverallVerdict: (binding.fivePlaneResult as any)?.overallVerdict ?? 'REVIEW',
      fivePlaneComparisons: (binding.fivePlaneResult as any)?.comparisons ?? [],
    };
    return v1_1;
  }

  return base;
}
