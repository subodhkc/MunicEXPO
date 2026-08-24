/**
 * U5 B32 / E1 A13-A15 — Assurance Persistence Service
 *
 * Persists Assurance Evaluation results to the database.
 *
 * A13: Idempotency distinguishes same-input vs changed-input conflict.
 *   - same run + same methodology + same inputHash → IDEMPOTENT
 *   - same run + same methodology + different inputHash → CONFLICT (fail closed)
 *   - Do NOT overwrite the historical evaluation.
 * A14: All lookup/idempotency checks include authoritative tenant ownership.
 * B31: Tenant-scoped — all records carry organizationId.
 */

import { prisma } from '@/lib/prisma';
import { AssuranceEvaluation, ClaimEvaluationResult, PersistenceResult } from './types';

/**
 * Persist an Assurance Evaluation to the database.
 *
 * A13: Idempotency/conflict semantics:
 *   - same run + same methodology + same inputHash → IDEMPOTENT (return existing)
 *   - same run + same methodology + different inputHash → CONFLICT (fail closed, do NOT overwrite)
 *   - no existing → CREATE
 *
 * A14: All checks include organizationId for tenant safety.
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
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return null;

  return reconstructEvaluation(record);
}

/**
 * A15: Reconstruct an AssuranceEvaluation from DB records.
 * Verifies roundtrip preserves all Evidence Set members, roles, hashes, reason codes,
 * claim states, dimension results, and overall digest.
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

  return {
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
}
